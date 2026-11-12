/**
 * Pure ETF DCA order construction for Alpaca paper equity buys.
 * Maps target weights → weekly notional buys for the $50k / 13-week ladder.
 * No network I/O — keep aligned with ETF_Quant_Model/modules/etf_orders.py.
 */

import {
  DCA_WEEKS,
  ETF_TARGET_CAPITAL_USD,
  WEEKLY_CONTRIBUTION_USD,
  WEIGHT_EPS,
} from "./paper-portfolio-rules";

/** Alpaca fractional notional buys typically require >= $1. */
export const MIN_NOTIONAL_USD = 1;

export interface EtfBuyAllocation {
  ticker: string;
  weight: number; // fraction 0–1
  notional: number;
  reason: "weekly_dca" | "weekly_voo_dca";
}

export interface EquityBuyPayload {
  symbol: string;
  notional: string;
  side: "buy";
  type: "market";
  time_in_force: "day";
}

export interface EtfBuyProposalRow {
  ticker: string;
  weight: number;
  notional: number;
  reason: "weekly_dca" | "weekly_voo_dca";
  order: EquityBuyPayload;
}

export interface WeeklyEtfBuyProposal {
  weeklyContribution: number;
  etfTargetCapital: number;
  dcaWeeks: number;
  buys: EtfBuyProposalRow[];
  vooBuy: EtfBuyProposalRow | null;
  deployedNotional: number;
  undeployedNotional: number;
}

export interface PaperLotFromFill {
  id: string;
  strategy: "factor" | "voo";
  ticker: string;
  shares: number;
  costPerShare: number;
  openedOn: string;
  runDate: string;
  status: "open";
  source: "alpaca_fill";
  orderId: string | null;
  reason: string;
}

/** Accept fraction (sum≈1) or percent (sum≈100) maps; drop non-positive / tiny weights. */
export function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const cleaned: Record<string, number> = {};
  for (const [rawTicker, rawW] of Object.entries(weights)) {
    const ticker = rawTicker.trim().toUpperCase();
    const w = Number(rawW);
    if (!ticker || !Number.isFinite(w) || w <= WEIGHT_EPS) continue;
    cleaned[ticker] = w;
  }
  const total = Object.values(cleaned).reduce((s, w) => s + w, 0);
  if (!(total > 0)) return {};
  const scale = total > 1.5 ? 100 : 1;
  const scaled: Record<string, number> = {};
  for (const [t, w] of Object.entries(cleaned)) {
    const frac = w / scale;
    if (frac > WEIGHT_EPS) scaled[t] = frac;
  }
  const renorm = Object.values(scaled).reduce((s, w) => s + w, 0);
  if (!(renorm > 0)) return {};
  const out: Record<string, number> = {};
  for (const [t, w] of Object.entries(scaled)) out[t] = w / renorm;
  return out;
}

export function allocateWeeklyDca(
  weights: Record<string, number>,
  opts?: {
    weeklyContribution?: number;
    minNotional?: number;
    reason?: "weekly_dca" | "weekly_voo_dca";
  },
): EtfBuyAllocation[] {
  const weekly = opts?.weeklyContribution ?? WEEKLY_CONTRIBUTION_USD;
  const minNotional = opts?.minNotional ?? MIN_NOTIONAL_USD;
  const reason = opts?.reason ?? "weekly_dca";
  if (!(weekly > 0)) return [];
  const norm = normalizeWeights(weights);
  return Object.entries(norm)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([ticker, weight]) => {
      const notional = Math.round(weekly * weight * 100) / 100;
      return { ticker, weight, notional, reason } satisfies EtfBuyAllocation;
    })
    .filter((b) => b.notional >= minNotional);
}

export function buildEquityBuyPayload(ticker: string, notional: number): EquityBuyPayload {
  if (!(notional >= MIN_NOTIONAL_USD)) {
    throw new Error(`notional must be >= ${MIN_NOTIONAL_USD}`);
  }
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) throw new Error("ticker required");
  return {
    symbol,
    notional: notional.toFixed(2),
    side: "buy",
    type: "market",
    time_in_force: "day",
  };
}

export function proposeWeeklyEtfBuys(
  weights: Record<string, number>,
  opts?: { weeklyContribution?: number; includeVoo?: boolean },
): WeeklyEtfBuyProposal {
  const weekly = opts?.weeklyContribution ?? WEEKLY_CONTRIBUTION_USD;
  const factor = allocateWeeklyDca(weights, { weeklyContribution: weekly });
  const buys: EtfBuyProposalRow[] = factor.map((b) => ({
    ...b,
    order: buildEquityBuyPayload(b.ticker, b.notional),
  }));
  let vooBuy: EtfBuyProposalRow | null = null;
  if (opts?.includeVoo && weekly >= MIN_NOTIONAL_USD) {
    const notional = Math.round(weekly * 100) / 100;
    vooBuy = {
      ticker: "VOO",
      weight: 1,
      notional,
      reason: "weekly_voo_dca",
      order: buildEquityBuyPayload("VOO", notional),
    };
  }
  const deployedNotional = Math.round(buys.reduce((s, b) => s + b.notional, 0) * 100) / 100;
  return {
    weeklyContribution: weekly,
    etfTargetCapital: ETF_TARGET_CAPITAL_USD,
    dcaWeeks: DCA_WEEKS,
    buys,
    vooBuy,
    deployedNotional,
    undeployedNotional: Math.round(Math.max(0, weekly - deployedNotional) * 100) / 100,
  };
}

export function lotFromAlpacaFill(input: {
  ticker: string;
  shares: number;
  price: number;
  filledAt?: string | null;
  orderId?: string | null;
  strategy?: "factor" | "voo";
  reason?: string;
  runDate?: string | null;
}): PaperLotFromFill {
  if (!(input.shares > 0) || !(input.price > 0)) {
    throw new Error("shares and price must be positive");
  }
  const openedRaw = input.filledAt ?? new Date().toISOString();
  const openedOn = openedRaw.slice(0, 10);
  return {
    id: input.orderId ?? `lot-${openedOn}-${input.ticker}`,
    strategy: input.strategy ?? "factor",
    ticker: input.ticker.trim().toUpperCase(),
    shares: input.shares,
    costPerShare: input.price,
    openedOn,
    runDate: input.runDate ?? openedOn,
    status: "open",
    source: "alpaca_fill",
    orderId: input.orderId ?? null,
    reason: input.reason ?? "weekly_dca",
  };
}
