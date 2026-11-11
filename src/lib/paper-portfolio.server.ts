/**
 * Paper portfolio simulator for the ETF factor model.
 *
 * Each model run date:
 *   1) Evaluate lots that have cleared the 3-month minimum hold
 *   2) Tax-loss harvest (with factor-peer substitutes to avoid wash sales)
 *   3) Hold short-term winners for LTCG unless harvested losses can offset
 *   4) Dollar-cost average WEEKLY_CONTRIBUTION_USD ($50k/13) into target weights
 *   5) Dollar-cost average the same amount into VOO on the same fill date
 *   6) Rebalance a second sleeve into the passive asset mix at that week's
 *      category weights (VOO, IJH, IJR, VEA, BND, TLT, PDBC)
 *   7) Reinvest dividends into the same ETF at the ex-date close, and apply splits
 *      to share count and cost with no tax event
 *   8) When selling, order lots least-gain / highest-basis first (HIFO)
 */

import { supabase } from "./supabase";
import {
  ASSET_MIX_PROXIES,
  ETF_CATEGORY_PEERS,
  ETF_TARGET_CAPITAL_USD,
  LONG_TERM_DAYS,
  MIN_HOLD_DAYS,
  STRATEGY_INCEPTION_DATE,
  WASH_SALE_DAYS,
  WEEKLY_CONTRIBUTION_USD,
  WEIGHT_EPS,
  assetMixWeights,
  categoryForTicker,
  compareLotsLeastGainFirst,
  diffDays,
  etfFloatRemainingUsd,
  identicalSet,
  nextBusinessDayAfter,
  taxLedgerTrades,
} from "./paper-portfolio-rules";

export type SleeveId = "factor" | "voo" | "mix";

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
  mixValue: number;
  mixCostBasis: number;
  mixReturnPct: number;
  mixAlphaPct: number;
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
  mix: {
    marketValue: number;
    costBasis: number;
    returnPct: number;
    cash: number;
  };
  tax: {
    factor: SleeveTaxPosition;
    voo: SleeveTaxPosition;
    mix: SleeveTaxPosition;
  };
  openLots: number;
  recentTrades: PaperTrade[];
  weeklySeries: PaperWeeklyPoint[];
  notes: string[];
  /** Undeployed portion of the $50k ETF target still parked for future DCA weeks. */
  etfFloatRemaining: number;
  etfTargetCapital: number;
  weeklyContribution: number;
}

export interface SleeveTaxPosition {
  realizedGains: number;
  realizedLosses: number;
  netRealized: number;
  unrealizedGains: number;
  unrealizedLosses: number;
  netUnrealized: number;
  distributions: number;
}

export function zeroSleeveTax(): SleeveTaxPosition {
  return {
    realizedGains: 0,
    realizedLosses: 0,
    netRealized: 0,
    unrealizedGains: 0,
    unrealizedLosses: 0,
    netUnrealized: 0,
    distributions: 0,
  };
}

export interface PaperTrade {
  date: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  amount: number;
  reason: string;
  strategy: SleeveId;
}

interface Lot {
  id: string;
  strategy: SleeveId;
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
  cashMix: number;
  /** Dividend cash waiting to be reinvested in the same ticker, keyed by ticker. */
  dripFactor: Record<string, number>;
  dripVoo: Record<string, number>;
  dripMix: Record<string, number>;
  distributionsFactor: number;
  distributionsVoo: number;
  distributionsMix: number;
  notes: string[];
}

type WeightMap = Record<string, number>;

interface QuoteBar {
  open: number;
  close: number;
}

interface DividendEvent {
  date: string;
  amount: number;
}

interface SplitEvent {
  date: string;
  ratio: number;
}

interface DividendCredit {
  strategy: SleeveId;
  ticker: string;
  dollars: number;
}

export interface MarketData {
  bars: Map<string, Map<string, QuoteBar>>;
  dividends: Map<string, DividendEvent[]>;
  splits: Map<string, SplitEvent[]>;
}

function emptyMarket(): MarketData {
  return { bars: new Map(), dividends: new Map(), splits: new Map() };
}

function isoDateFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function parseSplitRatio(raw: {
  numerator?: number;
  denominator?: number;
  splitRatio?: number | string;
}): number | null {
  if (typeof raw.splitRatio === "number" && Number.isFinite(raw.splitRatio) && raw.splitRatio > 0) {
    return raw.splitRatio;
  }
  if (typeof raw.splitRatio === "string" && raw.splitRatio.includes(":")) {
    const [num, den] = raw.splitRatio.split(":").map((part) => Number(part));
    if (num !== undefined && den !== undefined && num > 0 && den > 0) return num / den;
  }
  if (
    typeof raw.numerator === "number" &&
    typeof raw.denominator === "number" &&
    raw.numerator > 0 &&
    raw.denominator > 0
  ) {
    return raw.numerator / raw.denominator;
  }
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

async function fetchYahooOpens(
  tickers: string[],
  startISO: string,
  endISO: string,
): Promise<MarketData> {
  const start = Math.floor(Date.parse(`${startISO}T00:00:00Z`) / 1000) - 86_400;
  const end = Math.floor(Date.parse(`${endISO}T23:59:59Z`) / 1000) + 86_400;
  const market = emptyMarket();

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
              events?: {
                dividends?: Record<string, { amount?: number; date?: number }>;
                splits?: Record<
                  string,
                  {
                    numerator?: number;
                    denominator?: number;
                    splitRatio?: number | string;
                    date?: number;
                  }
                >;
              };
            }>;
          };
        };
        const result = json.chart?.result?.[0];
        const ts = result?.timestamp ?? [];
        const opens = result?.indicators?.quote?.[0]?.open ?? [];
        const closes = result?.indicators?.quote?.[0]?.close ?? [];
        const series = new Map<string, QuoteBar>();
        for (let i = 0; i < ts.length; i++) {
          const open = opens[i];
          const close = closes[i];
          if (typeof open !== "number" || !Number.isFinite(open) || open <= 0) continue;
          const closePx =
            typeof close === "number" && Number.isFinite(close) && close > 0 ? close : open;
          const date = new Date(ts[i]! * 1000).toISOString().slice(0, 10);
          series.set(date, { open, close: closePx });
        }
        if (series.size) market.bars.set(ticker, series);

        const dividends: DividendEvent[] = [];
        for (const event of Object.values(result?.events?.dividends ?? {})) {
          const amount = event.amount;
          const when = event.date;
          if (typeof amount !== "number" || amount <= 0 || typeof when !== "number") continue;
          dividends.push({ date: isoDateFromUnix(when), amount });
        }
        if (dividends.length) {
          dividends.sort((a, b) => (a.date < b.date ? -1 : 1));
          market.dividends.set(ticker, dividends);
        }

        const splits: SplitEvent[] = [];
        for (const event of Object.values(result?.events?.splits ?? {})) {
          const ratio = parseSplitRatio(event);
          const when = event.date;
          if (ratio == null || ratio === 1 || typeof when !== "number") continue;
          splits.push({ date: isoDateFromUnix(when), ratio });
        }
        if (splits.length) {
          splits.sort((a, b) => (a.date < b.date ? -1 : 1));
          market.splits.set(ticker, splits);
        }
      } catch {
        // Skip missing tickers; allocation residual stays in cash.
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return market;
}

function priceOnOrBefore(
  series: Map<string, QuoteBar> | undefined,
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

function chooseSubstitute(
  soldTicker: string,
  asOf: string,
  state: SimState,
  prices: Map<string, Map<string, QuoteBar>>,
  currentWeights: WeightMap,
): string | null {
  const category = categoryForTicker(soldTicker);
  const peers = category ? (ETF_CATEGORY_PEERS[category] ?? []) : [];
  const banned = identicalSet(soldTicker);
  for (const peer of peers) {
    if (banned.has(peer)) continue;
    if (peer === soldTicker) continue;
    if (isWashRestricted(state, peer, asOf)) continue;
    // Prefer names the live model is not already maxing, but allow any priced peer.
    if (priceOnOrBefore(prices.get(peer), asOf, "open") == null) continue;
    if ((currentWeights[peer] ?? 0) > 0.11) continue;
    return peer;
  }
  // Fallback: any priced peer ignoring the 11% soft skip.
  for (const peer of peers) {
    if (banned.has(peer)) continue;
    if (isWashRestricted(state, peer, asOf)) continue;
    if (priceOnOrBefore(prices.get(peer), asOf, "open") == null) continue;
    return peer;
  }
  return null;
}

function buy(
  state: SimState,
  strategy: SleeveId,
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
  prices: Map<string, Map<string, QuoteBar>>,
) {
  const priced = new Map<string, number>();
  const candidates = state.lots.filter((lot) => {
    if (lot.strategy !== "factor") return false;
    if (diffDays(lot.openedOn, asOf) < MIN_HOLD_DAYS) return false;
    const px = priceOnOrBefore(prices.get(lot.ticker), asOf, "open");
    if (px == null) return false;
    priced.set(lot.ticker, px);
    return true;
  });

  // Least unrealized gain / highest cost basis first when reallocating.
  candidates.sort((a, b) =>
    compareLotsLeastGainFirst(a, b, priced.get(a.ticker)!, priced.get(b.ticker)!),
  );

  for (const lot of candidates) {
    // Lot may already have been closed earlier in this pass.
    if (!state.lots.some((open) => open.id === lot.id)) continue;
    const px = priced.get(lot.ticker) ?? priceOnOrBefore(prices.get(lot.ticker), asOf, "open");
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
      // Still want the factor/sleeve exposure: harvest and rotate into a peer.
      const sub = chooseSubstitute(lot.ticker, asOf, state, prices, currentWeights);
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

    // Winner — prefer holding STCG lots; if we must sell, least-gain lots go first.
    if (age < LONG_TERM_DAYS) {
      const offset = availableLossOffset(state);
      if (!stillAllocated && pnl > 0 && offset >= pnl) {
        recordSale(state, lot, asOf, px, "gain_offset_by_harvested_losses");
      }
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
  prices: Map<string, Map<string, QuoteBar>>,
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

  deployAssetMix(state, runDate, fillDate, weights, prices);
}

function mixShares(state: SimState, ticker: string): number {
  let shares = 0;
  for (const lot of state.lots) {
    if (lot.strategy === "mix" && lot.ticker === ticker) shares += lot.shares;
  }
  return shares;
}

/** Sell mix-sleeve shares without touching the factor wash-sale book. */
function sellMixShares(
  state: SimState,
  ticker: string,
  sharesToSell: number,
  date: string,
  price: number,
  reason: string,
): number {
  let left = sharesToSell;
  let proceeds = 0;
  const lots = state.lots
    .filter((lot) => lot.strategy === "mix" && lot.ticker === ticker)
    .sort((a, b) => compareLotsLeastGainFirst(a, b, price, price));
  for (const lot of lots) {
    if (left <= 1e-8) break;
    const qty = Math.min(lot.shares, left);
    const part = qty * price;
    const pnl = part - qty * lot.costPerShare;
    if (qty >= lot.shares - 1e-8) {
      state.lots = state.lots.filter((open) => open.id !== lot.id);
      state.closed.push({
        ...lot,
        closedOn: date,
        closePrice: price,
        realizedPnl: pnl,
        reason,
      });
    } else {
      lot.shares -= qty;
      state.closed.push({
        ...lot,
        id: `${lot.id}-sell-${date}-${state.closed.length}`,
        shares: qty,
        closedOn: date,
        closePrice: price,
        realizedPnl: pnl,
        reason,
      });
    }
    state.trades.push({
      date,
      ticker,
      side: "sell",
      shares: qty,
      price,
      amount: part,
      reason,
      strategy: "mix",
    });
    proceeds += part;
    left -= qty;
  }
  return proceeds;
}

/**
 * Rebalance the passive mix to this week's collapsed category weights, then
 * invest the new weekly contribution. Sells happen before buys so the sleeve matches the mix.
 */
function deployAssetMix(
  state: SimState,
  runDate: string,
  fillDate: string,
  weights: WeightMap,
  prices: Map<string, Map<string, QuoteBar>>,
) {
  const targets = assetMixWeights(weights);
  const names = new Set<string>([...ASSET_MIX_PROXIES]);
  for (const lot of state.lots) {
    if (lot.strategy === "mix") names.add(lot.ticker);
  }

  const opens = new Map<string, number | null>();
  const values = new Map<string, number>();
  let nav = state.cashMix + WEEKLY_CONTRIBUTION_USD;
  for (const ticker of names) {
    const open = priceOnOrBefore(prices.get(ticker), fillDate, "open");
    opens.set(ticker, open);
    const shares = mixShares(state, ticker);
    const value = open != null ? shares * open : 0;
    values.set(ticker, value);
    nav += value;
  }

  let cash = state.cashMix + WEEKLY_CONTRIBUTION_USD;
  state.cashMix = 0;

  for (const ticker of names) {
    const open = opens.get(ticker);
    const current = values.get(ticker) ?? 0;
    const target = nav * ((targets as Partial<Record<string, number>>)[ticker] ?? 0);
    if (open == null || current <= target + 1) continue;
    const shares = (current - target) / open;
    const proceeds = sellMixShares(state, ticker, shares, fillDate, open, "mix_rebalance");
    cash += proceeds;
    values.set(ticker, current - proceeds);
  }

  for (const proxy of ASSET_MIX_PROXIES) {
    const open = opens.get(proxy);
    const current = values.get(proxy) ?? 0;
    const target = nav * (targets[proxy] ?? 0);
    if (open == null || target <= current + 1) continue;
    const spend = Math.min(target - current, cash);
    if (spend <= 1) continue;
    buy(state, "mix", proxy, spend, fillDate, runDate, open, "weekly_mix_dca");
    cash -= spend;
  }

  state.cashMix = cash;
}

function dripBook(state: SimState, strategy: SleeveId): Record<string, number> {
  if (strategy === "voo") return state.dripVoo;
  if (strategy === "mix") return state.dripMix;
  return state.dripFactor;
}

function dripCashTotal(book: Record<string, number>): number {
  return Object.values(book).reduce((sum, value) => sum + value, 0);
}

function applySplits(state: SimState, market: MarketData, date: string) {
  for (const [ticker, events] of market.splits) {
    for (const split of events) {
      if (split.date !== date || split.ratio <= 0 || split.ratio === 1) continue;
      for (const lot of state.lots) {
        if (lot.ticker !== ticker || lot.openedOn >= date) continue;
        lot.shares *= split.ratio;
        lot.costPerShare /= split.ratio;
      }
    }
  }
}

/** Lots opened before the ex-date earn the distribution, including a lot sold at that morning's open. */
function dividendEntitlements(state: SimState, market: MarketData, date: string): DividendCredit[] {
  const credits: DividendCredit[] = [];
  for (const [ticker, events] of market.dividends) {
    for (const dividend of events) {
      if (dividend.date !== date || dividend.amount <= 0) continue;
      const shares: Record<SleeveId, number> = { factor: 0, voo: 0, mix: 0 };
      for (const lot of state.lots) {
        if (lot.ticker !== ticker || lot.openedOn >= date) continue;
        shares[lot.strategy] += lot.shares;
      }
      for (const strategy of ["factor", "voo", "mix"] as const) {
        if (shares[strategy] > 0) {
          credits.push({ strategy, ticker, dollars: shares[strategy] * dividend.amount });
        }
      }
    }
  }
  return credits;
}

function creditDividends(state: SimState, credits: DividendCredit[]) {
  for (const credit of credits) {
    if (credit.dollars <= 0) continue;
    const book = dripBook(state, credit.strategy);
    book[credit.ticker] = (book[credit.ticker] ?? 0) + credit.dollars;
    if (credit.strategy === "voo") state.distributionsVoo += credit.dollars;
    else if (credit.strategy === "mix") state.distributionsMix += credit.dollars;
    else state.distributionsFactor += credit.dollars;
  }
}

function deployDripCash(state: SimState, market: MarketData, date: string) {
  for (const strategy of ["factor", "voo", "mix"] as const) {
    const book = dripBook(state, strategy);
    for (const ticker of Object.keys(book)) {
      const dollars = book[ticker] ?? 0;
      if (dollars <= 0) continue;
      if (isWashRestricted(state, ticker, date)) continue;
      const closePx = market.bars.get(ticker)?.get(date)?.close;
      if (closePx == null || closePx <= 0) continue;
      buy(state, strategy, ticker, dollars, date, date, closePx, "dividend_reinvest");
      book[ticker] = 0;
    }
  }
}

function sessionDates(
  market: MarketData,
  fromExclusive: string,
  through: string,
  forceDate?: string,
): string[] {
  const dates = new Set<string>();
  if (forceDate && forceDate > fromExclusive && forceDate <= through) dates.add(forceDate);
  for (const series of market.bars.values()) {
    for (const date of series.keys()) {
      if (date > fromExclusive && date <= through) dates.add(date);
    }
  }
  for (const events of market.dividends.values()) {
    for (const event of events) {
      if (event.date > fromExclusive && event.date <= through) dates.add(event.date);
    }
  }
  for (const events of market.splits.values()) {
    for (const event of events) {
      if (event.date > fromExclusive && event.date <= through) dates.add(event.date);
    }
  }
  return [...dates].sort();
}

function expireWash(state: SimState, date: string) {
  for (const [ticker, soldOn] of [...state.wash.entries()]) {
    if (diffDays(soldOn, date) >= WASH_SALE_DAYS) state.wash.delete(ticker);
  }
}

function walkSessions(
  state: SimState,
  market: MarketData,
  fromExclusive: string,
  through: string,
  fill: { runDate: string; fillDate: string; weights: WeightMap } | null,
) {
  for (const date of sessionDates(market, fromExclusive, through, fill?.fillDate)) {
    expireWash(state, date);
    applySplits(state, market, date);
    const entitled = dividendEntitlements(state, market, date);
    if (fill && date === fill.fillDate) {
      evaluateExits(state, date, fill.weights, market.bars);
      deployContribution(state, fill.runDate, date, fill.weights, market.bars);
    }
    creditDividends(state, entitled);
    deployDripCash(state, market, date);
  }
}

function markToMarket(state: SimState, asOf: string, bars: Map<string, Map<string, QuoteBar>>) {
  const factorDrip = dripCashTotal(state.dripFactor);
  const vooDrip = dripCashTotal(state.dripVoo);
  const mixDrip = dripCashTotal(state.dripMix);
  let stratMv = state.cashFactor + factorDrip;
  let stratCost = state.cashFactor + factorDrip;
  let vooMv = state.cashVoo + vooDrip;
  let vooCost = state.cashVoo + vooDrip;
  let mixMv = state.cashMix + mixDrip;
  let mixCost = state.cashMix + mixDrip;
  let factorUnrealizedGain = 0;
  let factorUnrealizedLoss = 0;
  let vooUnrealizedGain = 0;
  let vooUnrealizedLoss = 0;
  let mixUnrealizedGain = 0;
  let mixUnrealizedLoss = 0;

  for (const lot of state.lots) {
    const px =
      priceOnOrBefore(bars.get(lot.ticker), asOf, "close") ??
      priceOnOrBefore(bars.get(lot.ticker), asOf, "open");
    const cost = lot.shares * lot.costPerShare;
    const mtm = px != null ? lot.shares * px : cost;
    const pnl = mtm - cost;
    if (lot.strategy === "voo") {
      vooMv += mtm;
      vooCost += cost;
      if (pnl >= 0) vooUnrealizedGain += pnl;
      else vooUnrealizedLoss += -pnl;
    } else if (lot.strategy === "mix") {
      mixMv += mtm;
      mixCost += cost;
      if (pnl >= 0) mixUnrealizedGain += pnl;
      else mixUnrealizedLoss += -pnl;
    } else {
      stratMv += mtm;
      stratCost += cost;
      if (pnl >= 0) factorUnrealizedGain += pnl;
      else factorUnrealizedLoss += -pnl;
    }
  }

  return {
    stratMv,
    stratCost,
    vooMv,
    vooCost,
    mixMv,
    mixCost,
    factorUnrealizedGain,
    factorUnrealizedLoss,
    vooUnrealizedGain,
    vooUnrealizedLoss,
    mixUnrealizedGain,
    mixUnrealizedLoss,
  };
}

function realizedFor(state: SimState, strategy: SleeveId) {
  let gains = 0;
  let losses = 0;
  for (const lot of state.closed) {
    if (lot.strategy !== strategy) continue;
    const pnl = lot.realizedPnl ?? 0;
    if (pnl >= 0) gains += pnl;
    else losses += -pnl;
  }
  return { gains, losses, net: gains - losses };
}

function sleeveTax(
  state: SimState,
  strategy: SleeveId,
  unrealizedGains: number,
  unrealizedLosses: number,
): SleeveTaxPosition {
  const realized = realizedFor(state, strategy);
  return {
    realizedGains: realized.gains,
    realizedLosses: realized.losses,
    netRealized: realized.net,
    unrealizedGains,
    unrealizedLosses,
    netUnrealized: unrealizedGains - unrealizedLosses,
    distributions:
      strategy === "voo"
        ? state.distributionsVoo
        : strategy === "mix"
          ? state.distributionsMix
          : state.distributionsFactor,
  };
}

function summarize(
  state: SimState,
  asOf: string,
  runCount: number,
  bars: Map<string, Map<string, QuoteBar>>,
  weeklySeries: PaperWeeklyPoint[],
): PaperPortfolioSnapshot {
  const mtm = markToMarket(state, asOf, bars);
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
      cash: state.cashFactor + dripCashTotal(state.dripFactor),
    },
    voo: {
      marketValue: mtm.vooMv,
      costBasis: mtm.vooCost,
      returnPct: totalContributed > 0 ? (mtm.vooMv / totalContributed - 1) * 100 : 0,
      cash: state.cashVoo + dripCashTotal(state.dripVoo),
    },
    mix: {
      marketValue: mtm.mixMv,
      costBasis: mtm.mixCost,
      returnPct: totalContributed > 0 ? (mtm.mixMv / totalContributed - 1) * 100 : 0,
      cash: state.cashMix + dripCashTotal(state.dripMix),
    },
    tax: {
      factor: sleeveTax(state, "factor", mtm.factorUnrealizedGain, mtm.factorUnrealizedLoss),
      voo: sleeveTax(state, "voo", mtm.vooUnrealizedGain, mtm.vooUnrealizedLoss),
      mix: sleeveTax(state, "mix", mtm.mixUnrealizedGain, mtm.mixUnrealizedLoss),
    },
    openLots: state.lots.filter((l) => l.strategy === "factor").length,
    recentTrades: taxLedgerTrades(state.trades),
    weeklySeries,
    notes: state.notes.slice(-8),
    etfFloatRemaining: etfFloatRemainingUsd(runCount),
    etfTargetCapital: ETF_TARGET_CAPITAL_USD,
    weeklyContribution: WEEKLY_CONTRIBUTION_USD,
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
    mix: { marketValue: 0, costBasis: 0, returnPct: 0, cash: 0 },
    tax: {
      factor: zeroSleeveTax(),
      voo: zeroSleeveTax(),
      mix: zeroSleeveTax(),
    },
    openLots: 0,
    recentTrades: [],
    weeklySeries: [],
    notes,
    etfFloatRemaining: ETF_TARGET_CAPITAL_USD,
    etfTargetCapital: ETF_TARGET_CAPITAL_USD,
    weeklyContribution: WEEKLY_CONTRIBUTION_USD,
  };
}

export async function simulatePaperPortfolio(): Promise<PaperPortfolioSnapshot> {
  const history = await loadHistoricalWeights();
  if (!history.length) {
    return emptySnapshot([
      `No portfolio_weights rows on/after ${STRATEGY_INCEPTION_DATE} in factor_predictions.`,
    ]);
  }

  const tickers = new Set<string>(ASSET_MIX_PROXIES);
  for (const run of history) {
    for (const t of Object.keys(run.weights)) tickers.add(t);
    for (const peers of Object.values(ETF_CATEGORY_PEERS)) {
      for (const p of peers.slice(0, 6)) tickers.add(p);
    }
  }

  const start = history[0]!.date;
  const end = new Date().toISOString().slice(0, 10);
  const market = await fetchYahooOpens([...tickers], start, end);
  return simulateLoadedBook(history, market, end);
}

export function simulateLoadedBook(
  history: { date: string; weights: WeightMap }[],
  market: MarketData,
  asOf: string,
): PaperPortfolioSnapshot {
  const state: SimState = {
    lots: [],
    closed: [],
    trades: [],
    wash: new Map(),
    cumRealizedGains: 0,
    cumRealizedLosses: 0,
    cashFactor: 0,
    cashVoo: 0,
    cashMix: 0,
    dripFactor: {},
    dripVoo: {},
    dripMix: {},
    distributionsFactor: 0,
    distributionsVoo: 0,
    distributionsMix: 0,
    notes: [`Catch-up replay from model inception ${STRATEGY_INCEPTION_DATE} through ${asOf}.`],
  };

  const weeklySeries: PaperWeeklyPoint[] = [];
  let cursor = "0000-00-00";

  for (let i = 0; i < history.length; i++) {
    const run = history[i]!;
    const fillDate = nextBusinessDayAfter(run.date);
    walkSessions(state, market, cursor, fillDate, {
      runDate: run.date,
      fillDate,
      weights: run.weights,
    });
    cursor = fillDate;

    const contributed = (i + 1) * WEEKLY_CONTRIBUTION_USD;
    const mtm = markToMarket(state, fillDate, market.bars);
    const strategyReturnPct = contributed > 0 ? (mtm.stratMv / contributed - 1) * 100 : 0;
    const vooReturnPct = contributed > 0 ? (mtm.vooMv / contributed - 1) * 100 : 0;
    const mixReturnPct = contributed > 0 ? (mtm.mixMv / contributed - 1) * 100 : 0;
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
      mixValue: mtm.mixMv,
      mixCostBasis: mtm.mixCost,
      mixReturnPct,
      mixAlphaPct: strategyReturnPct - mixReturnPct,
    });
  }

  if (asOf > cursor) walkSessions(state, market, cursor, asOf, null);
  return summarize(state, asOf, history.length, market.bars, weeklySeries);
}
