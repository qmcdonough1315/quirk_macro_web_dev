/**
 * Place-time guards for Alpaca defined-risk mleg credit orders.
 * Pure (no network) — keep aligned with desk rules in OPTIONS_BOOK.md.
 */

import { createHash } from "node:crypto";

import { parseOcc, type ParsedOcc } from "./options-fills";

export type PlaceLegInput = {
  symbol: string;
  side: "buy" | "sell";
  positionIntent: "buy_to_open" | "sell_to_open";
  ratioQty?: number;
};

export type QuoteSides = {
  bid: number | null;
  ask: number | null;
};

export type GuardOk = { ok: true };
export type GuardErr = { ok: false; error: string };
export type GuardResult = GuardOk | GuardErr;

const WIDTH_EPS = 0.01;
/** Reject limits that ask for more credit than conservative live book × this. */
export const LIMIT_VS_CREDIT_MAX_RATIO = 1.05;

function fail(error: string): GuardErr {
  return { ok: false, error };
}

export function assertLegCount(legs: PlaceLegInput[]): GuardResult {
  const n = legs.length;
  if (n !== 2 && n !== 4) {
    return fail(`mleg orders need exactly 2 or 4 legs (got ${n}).`);
  }
  return { ok: true };
}

export function assertSideIntentConsistency(legs: PlaceLegInput[]): GuardResult {
  for (const leg of legs) {
    const buyOk = leg.side === "buy" && leg.positionIntent === "buy_to_open";
    const sellOk = leg.side === "sell" && leg.positionIntent === "sell_to_open";
    if (!buyOk && !sellOk) {
      return fail(
        `Leg ${leg.symbol}: side=${leg.side} incompatible with positionIntent=${leg.positionIntent}.`,
      );
    }
  }
  return { ok: true };
}

type ParsedLeg = PlaceLegInput & { parsed: ParsedOcc; ratio: number };

function parseLegs(legs: PlaceLegInput[]): { ok: true; legs: ParsedLeg[] } | GuardErr {
  const out: ParsedLeg[] = [];
  for (const leg of legs) {
    const parsed = parseOcc(leg.symbol);
    if (!parsed) return fail(`Invalid OCC symbol: ${leg.symbol}`);
    const ratio = leg.ratioQty ?? 1;
    if (!(Number.isInteger(ratio) && ratio > 0)) {
      return fail(`Invalid ratioQty on ${leg.symbol}.`);
    }
    out.push({ ...leg, parsed, ratio });
  }
  return { ok: true, legs: out };
}

function assertCommonUnderlyingExpiry(legs: ParsedLeg[]): GuardResult {
  const u0 = legs[0]!.parsed.underlying;
  const e0 = legs[0]!.parsed.expiry;
  const r0 = legs[0]!.ratio;
  for (const leg of legs) {
    if (leg.parsed.underlying !== u0) {
      return fail("All legs must share the same underlying.");
    }
    if (leg.parsed.expiry !== e0) {
      return fail("All legs must share the same expiration.");
    }
    if (leg.ratio !== r0) {
      return fail("All legs must share the same ratio_qty.");
    }
  }
  return { ok: true };
}

function assertVerticalGeometry(short: ParsedLeg, long: ParsedLeg, label: string): GuardResult {
  if (short.side !== "sell" || long.side !== "buy") {
    return fail(`${label}: need one sell and one buy.`);
  }
  if (short.parsed.right !== long.parsed.right) {
    return fail(`${label}: short/long rights must match.`);
  }
  if (short.parsed.right === "P") {
    if (!(short.parsed.strike > long.parsed.strike)) {
      return fail(`${label}: bull put needs short strike > long strike.`);
    }
  } else if (!(short.parsed.strike < long.parsed.strike)) {
    return fail(`${label}: bear call needs short strike < long strike.`);
  }
  return { ok: true };
}

/**
 * Defined-risk only: 2-leg vertical or 4-leg iron condor (put vertical + call vertical).
 */
export function assertDefinedRiskMleg(legs: PlaceLegInput[]): GuardResult {
  const count = assertLegCount(legs);
  if (!count.ok) return count;
  const intent = assertSideIntentConsistency(legs);
  if (!intent.ok) return intent;

  const parsed = parseLegs(legs);
  if (!parsed.ok) return parsed;
  const common = assertCommonUnderlyingExpiry(parsed.legs);
  if (!common.ok) return common;

  const sells = parsed.legs.filter((l) => l.side === "sell");
  const buys = parsed.legs.filter((l) => l.side === "buy");
  if (sells.length !== buys.length) {
    return fail("Defined-risk mleg needs equal buy and sell legs.");
  }

  if (parsed.legs.length === 2) {
    return assertVerticalGeometry(sells[0]!, buys[0]!, "Vertical");
  }

  // Iron condor: one put vertical + one call vertical
  const putSells = sells.filter((l) => l.parsed.right === "P");
  const putBuys = buys.filter((l) => l.parsed.right === "P");
  const callSells = sells.filter((l) => l.parsed.right === "C");
  const callBuys = buys.filter((l) => l.parsed.right === "C");
  if (putSells.length !== 1 || putBuys.length !== 1 || callSells.length !== 1 || callBuys.length !== 1) {
    return fail("Iron condor needs one short/long put and one short/long call.");
  }
  const putGeom = assertVerticalGeometry(putSells[0]!, putBuys[0]!, "IC put vertical");
  if (!putGeom.ok) return putGeom;
  return assertVerticalGeometry(callSells[0]!, callBuys[0]!, "IC call vertical");
}

/** Max vertical width across the package (IC → max of the two wings). */
export function packageStrikeWidth(legs: PlaceLegInput[]): number | null {
  const parsed = parseLegs(legs);
  if (!parsed.ok) return null;
  const sells = parsed.legs.filter((l) => l.side === "sell");
  const buys = parsed.legs.filter((l) => l.side === "buy");
  if (!sells.length || !buys.length) return null;

  const widths: number[] = [];
  for (const right of ["P", "C"] as const) {
    const short = sells.find((l) => l.parsed.right === right);
    const long = buys.find((l) => l.parsed.right === right);
    if (short && long) {
      widths.push(Math.abs(short.parsed.strike - long.parsed.strike));
    }
  }
  if (!widths.length) {
    // 2-leg already matched above; fallback absolute max sell-buy distance
    let max = 0;
    for (const s of sells) {
      for (const b of buys) {
        max = Math.max(max, Math.abs(s.parsed.strike - b.parsed.strike));
      }
    }
    return max > 0 ? max : null;
  }
  return Math.max(...widths);
}

export function validateLimitVsWidth(limitPrice: number, width: number): GuardResult {
  if (!(limitPrice < 0)) {
    return fail("Credit spreads require a negative limit_price (Alpaca credit convention).");
  }
  if (!(width > WIDTH_EPS)) {
    return fail("Could not determine a positive strike width for limit cap.");
  }
  const credit = Math.abs(limitPrice);
  const maxCredit = width - WIDTH_EPS;
  if (credit > maxCredit + 1e-9) {
    return fail(
      `limit_price |${credit.toFixed(2)}| exceeds strike width ${width.toFixed(2)} (max ${maxCredit.toFixed(2)}).`,
    );
  }
  return { ok: true };
}

/**
 * Conservative package credit (sell@bid, buy@ask). Null if any side missing.
 */
export function conservativeCreditFromQuotes(
  legs: PlaceLegInput[],
  quotes: Map<string, QuoteSides>,
): number | null {
  let credit = 0;
  for (const leg of legs) {
    const q = quotes.get(leg.symbol.toUpperCase());
    if (!q) return null;
    if (leg.side === "sell") {
      if (q.bid == null || !(q.bid > 0)) return null;
      credit += q.bid;
    } else {
      if (q.ask == null || !(q.ask > 0)) return null;
      credit -= q.ask;
    }
  }
  return credit;
}

export function validateLimitVsConservativeCredit(
  limitPrice: number,
  conservativeCredit: number,
  maxRatio = LIMIT_VS_CREDIT_MAX_RATIO,
): GuardResult {
  if (!(conservativeCredit > 0)) {
    return fail("Live conservative credit is non-positive — refusing place.");
  }
  if (!(limitPrice < 0)) {
    return fail("Credit spreads require a negative limit_price (Alpaca credit convention).");
  }
  const want = Math.abs(limitPrice);
  const cap = conservativeCredit * maxRatio;
  if (want > cap + 1e-9) {
    return fail(
      `limit_price |${want.toFixed(2)}| exceeds live conservative credit ${conservativeCredit.toFixed(2)} × ${maxRatio} (= ${cap.toFixed(2)}).`,
    );
  }
  return { ok: true };
}

export function buildClientOrderId(input: {
  ticker?: string;
  structure?: string;
  qty: number;
  limitPrice: number;
  legs: PlaceLegInput[];
  /** YYYY-MM-DD or ISO date; defaults to UTC today */
  asOf?: string;
}): string {
  const day = (input.asOf ?? new Date().toISOString()).slice(0, 10);
  const legsKey = input.legs
    .map((l) => `${l.side}:${l.symbol.toUpperCase()}:${l.ratioQty ?? 1}`)
    .sort()
    .join(",");
  const raw = [
    input.ticker?.toUpperCase() ?? "",
    input.structure ?? "",
    String(input.qty),
    input.limitPrice.toFixed(2),
    legsKey,
    day,
  ].join("|");
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 24);
  // Alpaca client_order_id max length is typically 48; keep under that.
  return `qm_${hash}`;
}

/** Run all structural + economic guards that do not need live quotes. */
export function validateMlegPlaceBasics(
  legs: PlaceLegInput[],
  limitPrice: number,
): GuardResult & { width?: number } {
  const structure = assertDefinedRiskMleg(legs);
  if (!structure.ok) return structure;
  const width = packageStrikeWidth(legs);
  if (width == null) return fail("Unable to compute strike width.");
  const vsWidth = validateLimitVsWidth(limitPrice, width);
  if (!vsWidth.ok) return vsWidth;
  return { ok: true, width };
}
