/**
 * Pure place-guard unit checks (no network).
 * Run: bun scripts/test-mleg-place-guards.mts
 */
import {
  assertDefinedRiskMleg,
  assertLegCount,
  buildClientOrderId,
  conservativeCreditFromQuotes,
  packageStrikeWidth,
  validateLimitVsConservativeCredit,
  validateLimitVsWidth,
  validateMlegPlaceBasics,
} from "../src/lib/mleg-place-guards.ts";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

// OCC: SPY 2025-06-20 put 500 / 490
const shortPut = "SPY250620P00500000";
const longPut = "SPY250620P00490000";
const shortCall = "SPY250620C00510000";
const longCall = "SPY250620C00520000";

const vertical = [
  { symbol: shortPut, side: "sell" as const, positionIntent: "sell_to_open" as const },
  { symbol: longPut, side: "buy" as const, positionIntent: "buy_to_open" as const },
];

assert(assertLegCount([{ ...vertical[0]! }]).ok === false, "1 leg rejected");
assert(assertLegCount(vertical).ok === true, "2 legs ok");
assert(assertDefinedRiskMleg(vertical).ok === true, "bull put defined-risk ok");

const nakedTwoShorts = [
  { symbol: shortPut, side: "sell" as const, positionIntent: "sell_to_open" as const },
  { symbol: shortCall, side: "sell" as const, positionIntent: "sell_to_open" as const },
];
assert(assertDefinedRiskMleg(nakedTwoShorts).ok === false, "two shorts rejected");

const invertedPut = [
  { symbol: longPut, side: "sell" as const, positionIntent: "sell_to_open" as const },
  { symbol: shortPut, side: "buy" as const, positionIntent: "buy_to_open" as const },
];
assert(assertDefinedRiskMleg(invertedPut).ok === false, "inverted put wing rejected");

const ic = [
  { symbol: shortPut, side: "sell" as const, positionIntent: "sell_to_open" as const },
  { symbol: longPut, side: "buy" as const, positionIntent: "buy_to_open" as const },
  { symbol: shortCall, side: "sell" as const, positionIntent: "sell_to_open" as const },
  { symbol: longCall, side: "buy" as const, positionIntent: "buy_to_open" as const },
];
assert(assertDefinedRiskMleg(ic).ok === true, "iron condor ok");
assert(assertLegCount([...ic, vertical[0]!]).ok === false, "5 legs rejected");

const width = packageStrikeWidth(vertical);
assert(width === 10, `vertical width 10 (got ${width})`);
assert(validateLimitVsWidth(-9.5, 10).ok === true, "limit within width");
assert(validateLimitVsWidth(-10, 10).ok === false, "limit == width rejected (eps)");
assert(validateLimitVsWidth(-11, 10).ok === false, "limit beyond width rejected");

const quotes = new Map([
  [shortPut, { bid: 1.2, ask: 1.3 }],
  [longPut, { bid: 0.4, ask: 0.5 }],
]);
const credit = conservativeCreditFromQuotes(vertical, quotes);
assert(credit != null && Math.abs(credit - (1.2 - 0.5)) < 1e-9, `conservative credit 0.7 (got ${credit})`);
assert(validateLimitVsConservativeCredit(-0.7, credit!).ok === true, "limit at conservative ok");
assert(validateLimitVsConservativeCredit(-0.8, credit!).ok === false, "limit richer than 1.05× rejected");

const basics = validateMlegPlaceBasics(vertical, -0.5);
assert(basics.ok === true, "basics pass for sane vertical");
assert(validateMlegPlaceBasics(vertical, -15).ok === false, "basics fail rich vs width");

const id1 = buildClientOrderId({
  ticker: "SPY",
  structure: "bull_put_spread",
  qty: 1,
  limitPrice: -0.5,
  legs: vertical,
  asOf: "2026-11-14",
});
const id2 = buildClientOrderId({
  ticker: "SPY",
  structure: "bull_put_spread",
  qty: 1,
  limitPrice: -0.5,
  legs: vertical,
  asOf: "2026-11-14",
});
const id3 = buildClientOrderId({
  ticker: "SPY",
  structure: "bull_put_spread",
  qty: 1,
  limitPrice: -0.55,
  legs: vertical,
  asOf: "2026-11-14",
});
assert(id1 === id2, "client_order_id stable");
assert(id1 !== id3, "client_order_id changes with limit");
assert(id1.startsWith("qm_") && id1.length <= 48, "client_order_id length ok");

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nmleg place guards ok");
