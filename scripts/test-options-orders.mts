/**
 * Defined-risk options order builder: strike pick, credit limit, mleg payload.
 */
import assert from "node:assert/strict";

import {
  buildMlegPayload,
  creditLimitPrice,
  proposeDefinedRiskTrade,
  selectContractsForPricing,
  type OptionContractQuote,
} from "../src/lib/options-orders";

const asOf = new Date(Date.UTC(2026, 2, 11)); // 2026-03-11 → ~35 DTE to 2026-04-17

function contract(
  partial: Omit<OptionContractQuote, "tradable" | "bid" | "ask" | "mid" | "delta"> &
    Partial<Pick<OptionContractQuote, "tradable" | "bid" | "ask" | "mid" | "delta">>,
): OptionContractQuote {
  return {
    tradable: true,
    bid: null,
    ask: null,
    mid: null,
    delta: null,
    ...partial,
  };
}

const chain: OptionContractQuote[] = [
  // Puts around SPY 500
  contract({
    symbol: "SPY260417P00480000",
    underlying: "SPY",
    expirationDate: "2026-04-17",
    strikePrice: 480,
    type: "put",
    mid: 2.1,
    delta: -0.12,
  }),
  contract({
    symbol: "SPY260417P00475000",
    underlying: "SPY",
    expirationDate: "2026-04-17",
    strikePrice: 475,
    type: "put",
    mid: 1.4,
    delta: -0.08,
  }),
  contract({
    symbol: "SPY260417P00470000",
    underlying: "SPY",
    expirationDate: "2026-04-17",
    strikePrice: 470,
    type: "put",
    mid: 0.9,
    delta: -0.05,
  }),
  contract({
    symbol: "SPY260417P00485000",
    underlying: "SPY",
    expirationDate: "2026-04-17",
    strikePrice: 485,
    type: "put",
    mid: 3.2,
    delta: -0.25,
  }),
  // Calls
  contract({
    symbol: "SPY260417C00520000",
    underlying: "SPY",
    expirationDate: "2026-04-17",
    strikePrice: 520,
    type: "call",
    mid: 2.8,
    delta: 0.25,
  }),
  contract({
    symbol: "SPY260417C00525000",
    underlying: "SPY",
    expirationDate: "2026-04-17",
    strikePrice: 525,
    type: "call",
    mid: 1.7,
    delta: 0.15,
  }),
  contract({
    symbol: "SPY260417C00530000",
    underlying: "SPY",
    expirationDate: "2026-04-17",
    strikePrice: 530,
    type: "call",
    mid: 1.0,
    delta: 0.1,
  }),
  contract({
    symbol: "SPY260417C00535000",
    underlying: "SPY",
    expirationDate: "2026-04-17",
    strikePrice: 535,
    type: "call",
    mid: 0.6,
    delta: 0.06,
  }),
];

assert.equal(creditLimitPrice(1.25), -1.15);

const bull = proposeDefinedRiskTrade({
  ticker: "SPY",
  compositeScore: 0.9,
  ivRank: 55,
  underlyingPrice: 500,
  contracts: chain,
  asOf,
  capitalBudgetUsd: 2000,
});
assert.equal(bull.ok, true);
if (!bull.ok) throw new Error("expected bull proposal");
assert.equal(bull.structure, "bull_put_spread");
assert.equal(bull.legs.length, 2);
assert.equal(bull.legs[0]?.side, "sell");
assert.equal(bull.legs[0]?.strike, 485);
assert.equal(bull.legs[1]?.side, "buy");
assert.equal(bull.legs[1]?.strike, 480);
assert.ok(bull.creditPerShare > 0);
assert.ok(bull.limitPrice < 0);
assert.ok(bull.qty >= 1);

const payload = buildMlegPayload(bull);
assert.equal(payload.order_class, "mleg");
assert.equal(payload.legs.length, 2);
assert.ok(Number(payload.limit_price) < 0);

const bear = proposeDefinedRiskTrade({
  ticker: "SPY",
  compositeScore: -0.8,
  ivRank: 62,
  underlyingPrice: 500,
  contracts: chain,
  asOf,
  capitalBudgetUsd: 2000,
});
assert.equal(bear.ok, true);
if (!bear.ok) throw new Error("expected bear proposal");
assert.equal(bear.structure, "bear_call_spread");
assert.equal(bear.legs[0]?.right, "C");
assert.equal(bear.legs[0]?.side, "sell");

const condor = proposeDefinedRiskTrade({
  ticker: "SPY",
  compositeScore: 0.1,
  ivRank: 48,
  underlyingPrice: 500,
  contracts: chain,
  asOf,
  capitalBudgetUsd: 2000,
});
assert.equal(condor.ok, true);
if (!condor.ok) throw new Error("expected condor proposal");
assert.equal(condor.structure, "iron_condor");
assert.equal(condor.legs.length, 4);

const skip = proposeDefinedRiskTrade({
  ticker: "QQQ",
  compositeScore: 0.7,
  ivRank: 22,
  underlyingPrice: 500,
  contracts: chain.map((c) => ({ ...c, underlying: "QQQ", symbol: c.symbol.replace("SPY", "QQQ") })),
  asOf,
});
assert.equal(skip.ok, false);
if (skip.ok) throw new Error("expected skip");
assert.equal(skip.structure, "skip_low_iv");

const narrowed = selectContractsForPricing(chain, 500, 30, 45, asOf);
assert.ok(narrowed.length > 0);
assert.ok(narrowed.every((c) => c.expirationDate === "2026-04-17"));

console.log("ok");
