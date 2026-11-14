/**
 * Pure defined-risk options order construction.
 * Maps a factor×IVR signal + option chain → Alpaca mleg credit payload.
 * No network I/O — keep aligned with ETF_Quant_Model/modules/options_orders.py.
 */

import {
  OPTIONS_PAPER_CAPITAL_USD,
  buildOptionsSignal,
  maxNameMarginUsd,
  sizeSpreadContracts,
  type OptionsSignal,
  type OptionsStructure,
} from "./options-sleeve-rules";

export interface OptionContractQuote {
  symbol: string;
  underlying: string;
  expirationDate: string;
  strikePrice: number;
  type: "call" | "put";
  mid: number | null;
  bid: number | null;
  ask: number | null;
  delta: number | null;
  tradable: boolean;
}

export interface OrderLegSpec {
  symbol: string;
  side: "buy" | "sell";
  positionIntent: "buy_to_open" | "sell_to_open";
  ratioQty: number;
  strike: number;
  right: "C" | "P";
  mid: number | null;
  delta: number | null;
}

export interface TradeProposal {
  ok: true;
  ticker: string;
  structure: Exclude<OptionsStructure, "skip_low_iv">;
  signal: OptionsSignal;
  expirationDate: string;
  dte: number;
  qty: number;
  legs: OrderLegSpec[];
  creditPerShare: number;
  limitPrice: number;
  width: number;
  maxLossPerContract: number;
  estimatedBp: number;
  underlyingPrice: number;
  notes: string[];
}

export interface TradeProposalSkip {
  ok: false;
  ticker: string;
  structure: OptionsStructure;
  signal: OptionsSignal;
  reason: string;
}

export type TradeProposalResult = TradeProposal | TradeProposalSkip;

export interface MlegOrderPayload {
  order_class: "mleg";
  qty: string;
  type: "limit";
  limit_price: string;
  time_in_force: "day";
  client_order_id?: string;
  legs: Array<{
    symbol: string;
    ratio_qty: string;
    side: "buy" | "sell";
    position_intent: "buy_to_open" | "sell_to_open";
  }>;
}

export interface ProposeTradeInput {
  ticker: string;
  compositeScore: number;
  ivRank: number;
  underlyingPrice: number;
  contracts: OptionContractQuote[];
  asOf?: Date;
  capitalBudgetUsd?: number;
  fillCreditFraction?: number;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
}

function daysBetween(a: Date, b: Date): number {
  const ms = parseYmd(b.toISOString().slice(0, 10)).getTime() - parseYmd(a.toISOString().slice(0, 10)).getTime();
  return Math.round(ms / 86_400_000);
}

function todayUtc(asOf?: Date): Date {
  const d = asOf ?? new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Keep only the expiry in the DTE window and a bounded OTM put/call ladder.
 * Used before quote/greeks enrichment so we do not snapshot an entire ETF chain.
 */
export function selectContractsForPricing(
  contracts: OptionContractQuote[],
  spot: number,
  dteMin: number,
  dteMax: number,
  asOf?: Date,
): OptionContractQuote[] {
  if (!(spot > 0) || !contracts.length) return [];
  const expiry = pickExpiration(contracts, dteMin, dteMax, asOf ?? new Date());
  if (!expiry) return [];
  const dated = contracts.filter((c) => c.expirationDate === expiry.expirationDate && c.tradable);
  const width = preferredWidth(dated[0]?.underlying ?? "", spot);
  // Cover ~25Δ / 18Δ shorts plus defined-risk wings without pulling the whole chain.
  const band = Math.max(width * 12, spot * 0.18);

  const otmPuts = dated
    .filter((c) => c.type === "put" && c.strikePrice < spot && spot - c.strikePrice <= band)
    .sort((a, b) => b.strikePrice - a.strikePrice)
    .slice(0, 40);
  const otmCalls = dated
    .filter((c) => c.type === "call" && c.strikePrice > spot && c.strikePrice - spot <= band)
    .sort((a, b) => a.strikePrice - b.strikePrice)
    .slice(0, 40);

  const selected = [...otmPuts, ...otmCalls];
  return selected.length ? selected : dated.slice(0, 80);
}

function midOf(c: OptionContractQuote): number | null {
  if (c.mid != null && Number.isFinite(c.mid) && c.mid > 0) return c.mid;
  if (c.bid != null && c.ask != null && c.bid > 0 && c.ask > 0) return (c.bid + c.ask) / 2;
  if (c.bid != null && c.bid > 0) return c.bid;
  if (c.ask != null && c.ask > 0) return c.ask;
  return null;
}

function preferredWidth(underlying: string, spot: number): number {
  const u = underlying.toUpperCase();
  if (u === "SPY" || u === "QQQ" || u === "IWM") return 5;
  if (spot >= 80) return 3;
  if (spot >= 40) return 2;
  return 1;
}

function pickExpiration(
  contracts: OptionContractQuote[],
  dteMin: number,
  dteMax: number,
  asOf: Date,
): { expirationDate: string; dte: number } | null {
  const today = todayUtc(asOf);
  const byExp = new Map<string, number>();
  for (const c of contracts) {
    if (!c.tradable) continue;
    const dte = daysBetween(today, parseYmd(c.expirationDate));
    if (dte < dteMin || dte > dteMax) continue;
    byExp.set(c.expirationDate, dte);
  }
  if (!byExp.size) return null;
  const target = (dteMin + dteMax) / 2;
  let best: { expirationDate: string; dte: number } | null = null;
  for (const [expirationDate, dte] of byExp) {
    if (!best || Math.abs(dte - target) < Math.abs(best.dte - target)) {
      best = { expirationDate, dte };
    }
  }
  return best;
}

function closestByDelta(
  candidates: OptionContractQuote[],
  targetAbsDelta: number,
): OptionContractQuote | null {
  let best: OptionContractQuote | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (c.delta == null || !Number.isFinite(c.delta)) continue;
    const dist = Math.abs(Math.abs(c.delta) - targetAbsDelta);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

function closestByStrike(
  candidates: OptionContractQuote[],
  targetStrike: number,
): OptionContractQuote | null {
  let best: OptionContractQuote | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(c.strikePrice - targetStrike);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

function pickWing(
  chain: OptionContractQuote[],
  shortStrike: number,
  right: "call" | "put",
  width: number,
): OptionContractQuote | null {
  const target = right === "put" ? shortStrike - width : shortStrike + width;
  const side = chain
    .filter((c) => c.type === right)
    .filter((c) => (right === "put" ? c.strikePrice < shortStrike : c.strikePrice > shortStrike));
  if (!side.length) return null;
  return closestByStrike(side, target);
}

function pickShort(
  chain: OptionContractQuote[],
  right: "call" | "put",
  spot: number,
  targetAbsDelta: number,
): OptionContractQuote | null {
  const otm =
    right === "put"
      ? chain.filter((c) => c.type === "put" && c.strikePrice < spot)
      : chain.filter((c) => c.type === "call" && c.strikePrice > spot);
  if (!otm.length) return null;
  const byDelta = closestByDelta(otm, targetAbsDelta);
  if (byDelta) return byDelta;
  // ~25Δ proxy ≈ 4–5% OTM for 30–45 DTE liquid ETFs; ~18Δ ≈ 6–7% OTM.
  const otmPct = targetAbsDelta >= 0.22 ? 0.045 : 0.065;
  const targetStrike = right === "put" ? spot * (1 - otmPct) : spot * (1 + otmPct);
  return closestByStrike(otm, targetStrike);
}

function legSpec(
  contract: OptionContractQuote,
  side: "buy" | "sell",
): OrderLegSpec {
  return {
    symbol: contract.symbol,
    side,
    positionIntent: side === "buy" ? "buy_to_open" : "sell_to_open",
    ratioQty: 1,
    strike: contract.strikePrice,
    right: contract.type === "put" ? "P" : "C",
    mid: midOf(contract),
    delta: contract.delta,
  };
}

function creditFromLegs(legs: OrderLegSpec[]): number | null {
  let credit = 0;
  for (const leg of legs) {
    if (leg.mid == null || !Number.isFinite(leg.mid)) return null;
    credit += leg.side === "sell" ? leg.mid : -leg.mid;
  }
  return credit;
}

function roundPrice(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Alpaca mleg convention: positive limit = debit, negative = credit.
 * Soften credit slightly so paper fills are more likely than mid+.
 */
export function creditLimitPrice(creditPerShare: number, fillFraction = 0.92): number {
  if (!(creditPerShare > 0)) return 0;
  const softened = creditPerShare * Math.min(Math.max(fillFraction, 0.5), 1);
  return -roundPrice(Math.max(softened, 0.01));
}

export function buildMlegPayload(proposal: TradeProposal): MlegOrderPayload {
  return {
    order_class: "mleg",
    qty: String(proposal.qty),
    type: "limit",
    limit_price: String(proposal.limitPrice),
    time_in_force: "day",
    legs: proposal.legs.map((leg) => ({
      symbol: leg.symbol,
      ratio_qty: String(leg.ratioQty),
      side: leg.side,
      position_intent: leg.positionIntent,
    })),
  };
}

export function proposeDefinedRiskTrade(input: ProposeTradeInput): TradeProposalResult {
  const signal = buildOptionsSignal(input.ticker, input.compositeScore, input.ivRank);
  if (signal.structure === "skip_low_iv") {
    return {
      ok: false,
      ticker: signal.ticker,
      structure: signal.structure,
      signal,
      reason: signal.rationale,
    };
  }

  const asOf = input.asOf ?? new Date();
  const underlying = signal.ticker.toUpperCase();
  const spot = input.underlyingPrice;
  if (!(spot > 0)) {
    return {
      ok: false,
      ticker: underlying,
      structure: signal.structure,
      signal,
      reason: "Underlying price unavailable.",
    };
  }

  const chain = input.contracts.filter(
    (c) => c.underlying.toUpperCase() === underlying && c.tradable && c.strikePrice > 0,
  );
  const expiry = pickExpiration(chain, signal.dteMin, signal.dteMax, asOf);
  if (!expiry) {
    return {
      ok: false,
      ticker: underlying,
      structure: signal.structure,
      signal,
      reason: `No contracts in ${signal.dteMin}–${signal.dteMax} DTE window.`,
    };
  }

  const dated = chain.filter((c) => c.expirationDate === expiry.expirationDate);
  const width = preferredWidth(underlying, spot);
  const notes: string[] = [];
  const legs: OrderLegSpec[] = [];

  if (signal.structure === "bull_put_spread" || signal.structure === "iron_condor") {
    const shortPut = pickShort(dated, "put", spot, signal.shortDelta);
    if (!shortPut) {
      return {
        ok: false,
        ticker: underlying,
        structure: signal.structure,
        signal,
        reason: "No OTM short put candidate.",
      };
    }
    const longPut = pickWing(dated, shortPut.strikePrice, "put", width);
    if (!longPut) {
      return {
        ok: false,
        ticker: underlying,
        structure: signal.structure,
        signal,
        reason: "No long put wing for defined risk.",
      };
    }
    legs.push(legSpec(shortPut, "sell"), legSpec(longPut, "buy"));
    if (shortPut.delta == null) notes.push("Put short strike via OTM % proxy (no delta).");
  }

  if (signal.structure === "bear_call_spread" || signal.structure === "iron_condor") {
    const shortCall = pickShort(
      dated,
      "call",
      spot,
      signal.structure === "iron_condor" ? (signal.wingDelta ?? signal.shortDelta) : signal.shortDelta,
    );
    if (!shortCall) {
      return {
        ok: false,
        ticker: underlying,
        structure: signal.structure,
        signal,
        reason: "No OTM short call candidate.",
      };
    }
    const longCall = pickWing(dated, shortCall.strikePrice, "call", width);
    if (!longCall) {
      return {
        ok: false,
        ticker: underlying,
        structure: signal.structure,
        signal,
        reason: "No long call wing for defined risk.",
      };
    }
    legs.push(legSpec(shortCall, "sell"), legSpec(longCall, "buy"));
    if (shortCall.delta == null) notes.push("Call short strike via OTM % proxy (no delta).");
  }

  const credit = creditFromLegs(legs);
  if (credit == null || credit <= 0) {
    return {
      ok: false,
      ticker: underlying,
      structure: signal.structure,
      signal,
      reason:
        credit == null
          ? "Missing bid/ask mids for credit estimate."
          : "Estimated net debit — refusing non-credit structure.",
    };
  }

  const actualWidth = (() => {
    const puts = legs.filter((l) => l.right === "P");
    const calls = legs.filter((l) => l.right === "C");
    const widths: number[] = [];
    if (puts.length >= 2) {
      widths.push(Math.abs(puts[0]!.strike - puts[1]!.strike));
    }
    if (calls.length >= 2) {
      widths.push(Math.abs(calls[0]!.strike - calls[1]!.strike));
    }
    return widths.length ? Math.max(...widths) : width;
  })();

  const budget = input.capitalBudgetUsd ?? Math.min(maxNameMarginUsd(), OPTIONS_PAPER_CAPITAL_USD);
  let qty = sizeSpreadContracts(credit, actualWidth, budget);
  if (qty < 1) {
    return {
      ok: false,
      ticker: underlying,
      structure: signal.structure,
      signal,
      reason: `Max loss exceeds capital budget (${budget.toFixed(0)}).`,
    };
  }
  qty = Math.min(qty, 5);

  const fillFraction = input.fillCreditFraction ?? 0.92;
  const limitPrice = creditLimitPrice(credit, fillFraction);
  const maxLossPerContract = Math.max(actualWidth - credit, 0) * 100;
  const estimatedBp = maxLossPerContract * qty;

  return {
    ok: true,
    ticker: underlying,
    structure: signal.structure,
    signal,
    expirationDate: expiry.expirationDate,
    dte: expiry.dte,
    qty,
    legs,
    creditPerShare: roundPrice(credit),
    limitPrice,
    width: actualWidth,
    maxLossPerContract: roundPrice(maxLossPerContract),
    estimatedBp: roundPrice(estimatedBp),
    underlyingPrice: spot,
    notes,
  };
}
