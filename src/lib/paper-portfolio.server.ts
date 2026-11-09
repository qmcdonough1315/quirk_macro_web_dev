/**
 * Paper portfolio simulator for the ETF factor model.
 *
 * Each model run date:
 *   1) Evaluate lots that have cleared the 3-month minimum hold
 *   2) Tax-loss harvest (beta-distance substitutes to avoid wash sales)
 *   3) Hold short-term winners for LTCG unless harvested losses can offset
 *   4) Dollar-cost average $1000 into the new target weights at next-session open
 *   5) Dollar-cost average $1000 into VOO on the same fill date (benchmark)
 */

import { supabase } from "./supabase";
import {
  buildBetaCache,
  chooseBetaDistanceSubstitute,
  FACTOR_PROXY_TICKERS,
  type BetaVector,
} from "./paper-portfolio-betas";
import {
  ETF_CATEGORY_PEERS,
  LONG_TERM_DAYS,
  MIN_HOLD_DAYS,
  STRATEGY_INCEPTION_DATE,
  WASH_SALE_DAYS,
  WEEKLY_CONTRIBUTION_USD,
  WEIGHT_EPS,
  categoryForTicker,
  diffDays,
  identicalSet,
  nextBusinessDayAfter,
} from "./paper-portfolio-rules";

export interface PaperWeeklyPoint {
  runDate: string;
  fillDate: string;
  contributed: number;
  strategyValue: number;
  strategyCostBasis: number;
  strategyReturnPct: number;
  vooValue: number;
  vooCostBasis: number;
  vooReturnPct: number;
  alphaPct: number;
}

export interface PaperPortfolioSnapshot {
  asOf: string;
  inceptionDate: string;
  live: boolean;
  runCount: number;
  totalContributed: number;
  strategy: {
    marketValue: number;
    costBasis: number;
    returnPct: number;
    cash: number;
  };
  voo: {
    marketValue: number;
    costBasis: number;
    returnPct: number;
    cash: number;
  };
  tax: {
    cumulativeRealizedGains: number;
    cumulativeRealizedLosses: number;
    netTaxable: number;
    cumulativeUnrealizedGains: number;
    cumulativeUnrealizedLosses: number;
  };
  openLots: number;
  recentTrades: PaperTrade[];
  weeklySeries: PaperWeeklyPoint[];
  notes: string[];
}

export interface PaperTrade {
  date: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  amount: number;
  reason: string;
  strategy: "factor" | "voo";
}

interface Lot {
  id: string;
  strategy: "factor" | "voo";
  ticker: string;
  shares: number;
  costPerShare: number;
  openedOn: string;
  runDate: string;
}

interface ClosedLot extends Lot {
  closedOn: string;
  closePrice: number;
  realizedPnl: number;
  reason: string;
}

interface SimState {
  lots: Lot[];
  closed: ClosedLot[];
  trades: PaperTrade[];
  wash: Map<string, string>;
  cumRealizedGains: number;
  cumRealizedLosses: number;
  cashFactor: number;
  cashVoo: number;
  notes: string[];
}

type WeightMap = Record<string, number>;

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

async function fetchYahooOpens(tickers: string[], startISO: string, endISO: string) {
  const start = Math.floor(Date.parse(`${startISO}T00:00:00Z`) / 1000) - 86_400;
  const end = Math.floor(Date.parse(`${endISO}T23:59:59Z`) / 1000) + 86_400;
  const out = new Map<string, Map<string, { open: number; close: number }>>();

  // Cap concurrency to keep Yahoo happy.
  const queue = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const workers = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const ticker = queue[cursor++]!;
      try {
        const url =
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
          `?interval=1d&period1=${start}&period2=${end}&events=div%7Csplit`;
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 quirk-macro-paper-portfolio",
            Accept: "application/json",
          },
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          chart?: {
            result?: Array<{
              timestamp?: number[];
              indicators?: {
                quote?: Array<{ open?: (number | null)[]; close?: (number | null)[] }>;
              };
            }>;
          };
        };
        const result = json.chart?.result?.[0];
        const ts = result?.timestamp ?? [];
        const opens = result?.indicators?.quote?.[0]?.open ?? [];
        const closes = result?.indicators?.quote?.[0]?.close ?? [];
        const series = new Map<string, { open: number; close: number }>();
        for (let i = 0; i < ts.length; i++) {
          const open = opens[i];
          const close = closes[i];
          if (typeof open !== "number" || !Number.isFinite(open) || open <= 0) continue;
          const closePx =
            typeof close === "number" && Number.isFinite(close) && close > 0 ? close : open;
          const date = new Date(ts[i]! * 1000).toISOString().slice(0, 10);
          series.set(date, { open, close: closePx });
        }
        if (series.size) out.set(ticker, series);
      } catch {
        // Skip missing tickers; allocation residual stays in cash.
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

function priceOnOrBefore(
  series: Map<string, { open: number; close: number }> | undefined,
  date: string,
  field: "open" | "close",
): number | null {
  if (!series || !series.size) return null;
  if (series.has(date)) return series.get(date)![field];
  let best: string | null = null;
  for (const d of series.keys()) {
    if (d <= date && (best === null || d > best)) best = d;
  }
  return best ? series.get(best)![field] : null;
}

function normalizeWeights(raw: WeightMap): WeightMap {
  const cleaned: WeightMap = {};
  let sum = 0;
  for (const [ticker, w] of Object.entries(raw)) {
    if (w > WEIGHT_EPS) {
      cleaned[ticker.toUpperCase()] = w;
      sum += w;
    }
  }
  if (sum <= 0) return {};
  for (const t of Object.keys(cleaned)) cleaned[t] = cleaned[t]! / sum;
  return cleaned;
}

async function loadHistoricalWeights(): Promise<{ date: string; weights: WeightMap }[]> {
  const { data, error } = await supabase
    .from("factor_predictions")
    .select("execution_date, data_type, ticker_or_factor, value")
    .eq("data_type", "portfolio_weights")
    .order("execution_date", { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);

  const byDate = new Map<string, WeightMap>();
  for (const row of data ?? []) {
    const date = String(row.execution_date ?? "").slice(0, 10);
    const ticker = String(row.ticker_or_factor ?? "")
      .trim()
      .toUpperCase();
    const value = toNumber(row.value);
    if (!date || !ticker || value === null) continue;
    const bucket = byDate.get(date) ?? {};
    bucket[ticker] = value;
    byDate.set(date, bucket);
  }

  return (
    Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, weights]) => ({ date, weights: normalizeWeights(weights) }))
      .filter((r) => Object.keys(r.weights).length > 0)
      // Catch-up starts with the 9/20/2026 model run and continues forward.
      .filter((r) => r.date >= STRATEGY_INCEPTION_DATE)
  );
}

function availableLossOffset(state: SimState): number {
  return Math.max(0, state.cumRealizedLosses - state.cumRealizedGains);
}

function recordSale(state: SimState, lot: Lot, closeDate: string, price: number, reason: string) {
  const proceeds = lot.shares * price;
  const cost = lot.shares * lot.costPerShare;
  const pnl = proceeds - cost;
  state.lots = state.lots.filter((l) => l.id !== lot.id);
  state.closed.push({
    ...lot,
    closedOn: closeDate,
    closePrice: price,
    realizedPnl: pnl,
    reason,
  });
  state.trades.push({
    date: closeDate,
    ticker: lot.ticker,
    side: "sell",
    shares: lot.shares,
    price,
    amount: proceeds,
    reason,
    strategy: lot.strategy,
  });
  if (pnl >= 0) state.cumRealizedGains += pnl;
  else state.cumRealizedLosses += -pnl;
  if (pnl < 0) state.wash.set(lot.ticker, closeDate);
  return proceeds;
}

function isWashRestricted(state: SimState, ticker: string, asOf: string): boolean {
  for (const banned of identicalSet(ticker)) {
    const soldOn = state.wash.get(banned);
    if (!soldOn) continue;
    if (diffDays(soldOn, asOf) < WASH_SALE_DAYS) return true;
  }
  return false;
}

function substituteCandidateUniverse(soldTicker: string, prices: PriceMapLike): string[] {
  const out = new Set<string>();
  const category = categoryForTicker(soldTicker);
  for (const peer of category ? (ETF_CATEGORY_PEERS[category] ?? []) : []) out.add(peer);
  // Broaden search to every priced ETF we already downloaded.
  for (const ticker of prices.keys()) out.add(ticker);
  out.delete(soldTicker);
  return [...out];
}

type PriceMapLike = Map<string, Map<string, { open: number; close: number }>>;

function chooseSubstitute(
  soldTicker: string,
  asOf: string,
  state: SimState,
  prices: PriceMapLike,
  currentWeights: WeightMap,
  betas: Map<string, BetaVector>,
): string | null {
  const banned = identicalSet(soldTicker);
  const candidates = substituteCandidateUniverse(soldTicker, prices);

  const pick = chooseBetaDistanceSubstitute({
    soldTicker,
    candidates,
    betas,
    isEligible: (ticker) => {
      if (banned.has(ticker)) return false;
      if (isWashRestricted(state, ticker, asOf)) return false;
      if (priceOnOrBefore(prices.get(ticker), asOf, "open") == null) return false;
      // Soft-skip names already near the single-name cap in the live target book.
      if ((currentWeights[ticker] ?? 0) > 0.11) return false;
      return true;
    },
  });
  if (pick) {
    state.notes.push(
      `TLH beta-distance: ${soldTicker} → ${pick.ticker} (d=${pick.distance.toFixed(3)})`,
    );
    return pick.ticker;
  }

  // Fallback: nearest beta ignoring the 11% soft skip, then category peer order.
  const relaxed = chooseBetaDistanceSubstitute({
    soldTicker,
    candidates,
    betas,
    isEligible: (ticker) => {
      if (banned.has(ticker)) return false;
      if (isWashRestricted(state, ticker, asOf)) return false;
      return priceOnOrBefore(prices.get(ticker), asOf, "open") != null;
    },
  });
  if (relaxed) {
    state.notes.push(
      `TLH beta-distance (relaxed): ${soldTicker} → ${relaxed.ticker} (d=${relaxed.distance.toFixed(3)})`,
    );
    return relaxed.ticker;
  }

  const category = categoryForTicker(soldTicker);
  for (const peer of category ? (ETF_CATEGORY_PEERS[category] ?? []) : []) {
    if (banned.has(peer) || peer === soldTicker) continue;
    if (isWashRestricted(state, peer, asOf)) continue;
    if (priceOnOrBefore(prices.get(peer), asOf, "open") == null) continue;
    state.notes.push(`TLH category fallback: ${soldTicker} → ${peer}`);
    return peer;
  }
  return null;
}

function buy(
  state: SimState,
  strategy: "factor" | "voo",
  ticker: string,
  dollars: number,
  date: string,
  runDate: string,
  price: number,
  reason: string,
) {
  if (dollars <= 0 || price <= 0) return 0;
  const shares = dollars / price;
  const lot: Lot = {
    id: `${strategy}-${ticker}-${date}-${state.lots.length}-${Math.random().toString(36).slice(2, 7)}`,
    strategy,
    ticker,
    shares,
    costPerShare: price,
    openedOn: date,
    runDate,
  };
  state.lots.push(lot);
  state.trades.push({
    date,
    ticker,
    side: "buy",
    shares,
    price,
    amount: dollars,
    reason,
    strategy,
  });
  return dollars;
}

function evaluateExits(
  state: SimState,
  asOf: string,
  currentWeights: WeightMap,
  prices: Map<string, Map<string, { open: number; close: number }>>,
  betas: Map<string, BetaVector>,
) {
  const candidates = state.lots.filter(
    (lot) => lot.strategy === "factor" && diffDays(lot.openedOn, asOf) >= MIN_HOLD_DAYS,
  );

  for (const lot of candidates) {
    const px = priceOnOrBefore(prices.get(lot.ticker), asOf, "open");
    if (px == null) continue;
    const mtm = lot.shares * px;
    const cost = lot.shares * lot.costPerShare;
    const pnl = mtm - cost;
    const stillAllocated = (currentWeights[lot.ticker] ?? 0) > WEIGHT_EPS;
    const age = diffDays(lot.openedOn, asOf);

    if (pnl < 0) {
      if (!stillAllocated) {
        recordSale(state, lot, asOf, px, "tlh_exit_no_allocation");
        continue;
      }
      // Still want the factor exposure: harvest and rotate to nearest beta peer.
      const sub = chooseSubstitute(lot.ticker, asOf, state, prices, currentWeights, betas);
      const proceeds = recordSale(state, lot, asOf, px, "tlh_rotate");
      if (sub) {
        const subPx = priceOnOrBefore(prices.get(sub), asOf, "open");
        if (subPx != null) {
          buy(
            state,
            "factor",
            sub,
            proceeds,
            asOf,
            lot.runDate,
            subPx,
            `tlh_substitute_for_${lot.ticker}`,
          );
        } else {
          state.cashFactor += proceeds;
          state.notes.push(`TLH proceeds for ${lot.ticker} held as cash (no priced substitute).`);
        }
      } else {
        state.cashFactor += proceeds;
        state.notes.push(`TLH proceeds for ${lot.ticker} held as cash (no eligible substitute).`);
      }
      continue;
    }

    // Winner
    if (age < LONG_TERM_DAYS) {
      const offset = availableLossOffset(state);
      if (!stillAllocated && pnl > 0 && offset >= pnl) {
        recordSale(state, lot, asOf, px, "gain_offset_by_harvested_losses");
      }
      // else hold for long-term capital gains treatment
      continue;
    }

    // Long-term winner: exit only if the model no longer wants the name.
    if (!stillAllocated) {
      recordSale(state, lot, asOf, px, "ltcg_exit_no_allocation");
    }
  }
}

function deployContribution(
  state: SimState,
  runDate: string,
  fillDate: string,
  weights: WeightMap,
  prices: Map<string, Map<string, { open: number; close: number }>>,
) {
  let remaining = WEEKLY_CONTRIBUTION_USD + state.cashFactor;
  state.cashFactor = 0;
  for (const [ticker, weight] of Object.entries(weights)) {
    if (isWashRestricted(state, ticker, fillDate)) {
      state.notes.push(`Skipped ${ticker} on ${fillDate} (wash-sale window).`);
      continue;
    }
    const px = priceOnOrBefore(prices.get(ticker), fillDate, "open");
    if (px == null) continue;
    const dollars = WEEKLY_CONTRIBUTION_USD * weight;
    const spent = Math.min(dollars, remaining);
    if (spent <= 0) continue;
    buy(state, "factor", ticker, spent, fillDate, runDate, px, "weekly_dca");
    remaining -= spent;
  }
  state.cashFactor += remaining;

  // VOO benchmark sleeve
  const vooCash = WEEKLY_CONTRIBUTION_USD + state.cashVoo;
  state.cashVoo = 0;
  const vooPx = priceOnOrBefore(prices.get("VOO"), fillDate, "open");
  if (vooPx != null) {
    buy(state, "voo", "VOO", vooCash, fillDate, runDate, vooPx, "weekly_voo_dca");
    state.cashVoo = 0;
  } else {
    state.cashVoo = vooCash;
    state.notes.push(`VOO cash uninvested on ${fillDate} (missing open).`);
  }
}

function markToMarket(
  state: SimState,
  asOf: string,
  prices: Map<string, Map<string, { open: number; close: number }>>,
) {
  let stratMv = state.cashFactor;
  let stratCost = 0;
  let vooMv = state.cashVoo;
  let vooCost = 0;
  let uGain = 0;
  let uLoss = 0;

  for (const lot of state.lots) {
    const px =
      priceOnOrBefore(prices.get(lot.ticker), asOf, "close") ??
      priceOnOrBefore(prices.get(lot.ticker), asOf, "open");
    const cost = lot.shares * lot.costPerShare;
    const mtm = px != null ? lot.shares * px : cost;
    const pnl = mtm - cost;
    if (pnl >= 0) uGain += pnl;
    else uLoss += -pnl;
    if (lot.strategy === "voo") {
      vooMv += mtm;
      vooCost += cost;
    } else {
      stratMv += mtm;
      stratCost += cost;
    }
  }

  return {
    stratMv,
    stratCost: stratCost + state.cashFactor,
    vooMv,
    vooCost: vooCost + state.cashVoo,
    uGain,
    uLoss,
  };
}

function summarize(
  state: SimState,
  asOf: string,
  runCount: number,
  prices: Map<string, Map<string, { open: number; close: number }>>,
  weeklySeries: PaperWeeklyPoint[],
): PaperPortfolioSnapshot {
  const mtm = markToMarket(state, asOf, prices);
  const totalContributed = runCount * WEEKLY_CONTRIBUTION_USD;

  return {
    asOf,
    inceptionDate: STRATEGY_INCEPTION_DATE,
    live: true,
    runCount,
    totalContributed,
    strategy: {
      marketValue: mtm.stratMv,
      costBasis: mtm.stratCost,
      returnPct: totalContributed > 0 ? (mtm.stratMv / totalContributed - 1) * 100 : 0,
      cash: state.cashFactor,
    },
    voo: {
      marketValue: mtm.vooMv,
      costBasis: mtm.vooCost,
      returnPct: totalContributed > 0 ? (mtm.vooMv / totalContributed - 1) * 100 : 0,
      cash: state.cashVoo,
    },
    tax: {
      cumulativeRealizedGains: state.cumRealizedGains,
      cumulativeRealizedLosses: state.cumRealizedLosses,
      netTaxable: state.cumRealizedGains - state.cumRealizedLosses,
      cumulativeUnrealizedGains: mtm.uGain,
      cumulativeUnrealizedLosses: mtm.uLoss,
    },
    openLots: state.lots.filter((l) => l.strategy === "factor").length,
    recentTrades: state.trades.slice(-12).reverse(),
    weeklySeries,
    notes: state.notes.slice(-8),
  };
}

function emptySnapshot(notes: string[]): PaperPortfolioSnapshot {
  return {
    asOf: new Date().toISOString().slice(0, 10),
    inceptionDate: STRATEGY_INCEPTION_DATE,
    live: false,
    runCount: 0,
    totalContributed: 0,
    strategy: { marketValue: 0, costBasis: 0, returnPct: 0, cash: 0 },
    voo: { marketValue: 0, costBasis: 0, returnPct: 0, cash: 0 },
    tax: {
      cumulativeRealizedGains: 0,
      cumulativeRealizedLosses: 0,
      netTaxable: 0,
      cumulativeUnrealizedGains: 0,
      cumulativeUnrealizedLosses: 0,
    },
    openLots: 0,
    recentTrades: [],
    weeklySeries: [],
    notes,
  };
}

export async function simulatePaperPortfolio(): Promise<PaperPortfolioSnapshot> {
  const history = await loadHistoricalWeights();
  if (!history.length) {
    return emptySnapshot([
      `No portfolio_weights rows on/after ${STRATEGY_INCEPTION_DATE} in factor_predictions.`,
    ]);
  }

  const tickers = new Set<string>(["VOO", ...FACTOR_PROXY_TICKERS]);
  for (const run of history) {
    for (const t of Object.keys(run.weights)) tickers.add(t);
    for (const peers of Object.values(ETF_CATEGORY_PEERS)) {
      for (const p of peers) tickers.add(p);
    }
  }

  const start = history[0]!.date;
  const end = new Date().toISOString().slice(0, 10);
  // Extra history before inception so beta OLS has a full lookback window.
  const betaWarmStart = "2025-01-01";
  const prices = await fetchYahooOpens(
    [...tickers],
    betaWarmStart < start ? betaWarmStart : start,
    end,
  );

  const state: SimState = {
    lots: [],
    closed: [],
    trades: [],
    wash: new Map(),
    cumRealizedGains: 0,
    cumRealizedLosses: 0,
    cashFactor: 0,
    cashVoo: 0,
    notes: [
      `Catch-up replay from model inception ${STRATEGY_INCEPTION_DATE} through ${end}.`,
      "TLH substitutes ranked by Euclidean distance in estimated factor-beta space.",
    ],
  };

  const weeklySeries: PaperWeeklyPoint[] = [];
  let betaCache = new Map<string, BetaVector>();
  let betaCacheAsOf = "";

  for (let i = 0; i < history.length; i++) {
    const run = history[i]!;
    const fillDate = nextBusinessDayAfter(run.date);
    // Drop expired wash-sale restrictions.
    for (const [ticker, soldOn] of [...state.wash.entries()]) {
      if (diffDays(soldOn, fillDate) >= WASH_SALE_DAYS) state.wash.delete(ticker);
    }
    if (betaCacheAsOf !== fillDate) {
      const held = state.lots.map((l) => l.ticker);
      const weighted = Object.keys(run.weights);
      const peerPool = Object.values(ETF_CATEGORY_PEERS).flat();
      betaCache = buildBetaCache(
        [...new Set([...held, ...weighted, ...peerPool, ...FACTOR_PROXY_TICKERS])],
        prices,
        fillDate,
      );
      betaCacheAsOf = fillDate;
    }
    evaluateExits(state, fillDate, run.weights, prices, betaCache);
    deployContribution(state, run.date, fillDate, run.weights, prices);

    const contributed = (i + 1) * WEEKLY_CONTRIBUTION_USD;
    const mtm = markToMarket(state, fillDate, prices);
    const strategyReturnPct = contributed > 0 ? (mtm.stratMv / contributed - 1) * 100 : 0;
    const vooReturnPct = contributed > 0 ? (mtm.vooMv / contributed - 1) * 100 : 0;
    weeklySeries.push({
      runDate: run.date,
      fillDate,
      contributed,
      strategyValue: mtm.stratMv,
      strategyCostBasis: mtm.stratCost,
      strategyReturnPct,
      vooValue: mtm.vooMv,
      vooCostBasis: mtm.vooCost,
      vooReturnPct,
      alphaPct: strategyReturnPct - vooReturnPct,
    });
  }

  return summarize(state, end, history.length, prices, weeklySeries);
}
