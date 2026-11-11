/**
 * Options fills feed: spread grouping, defined-risk BP, and FIFO premium.
 */
import assert from "node:assert/strict";

import { cashPartitions } from "../src/lib/capital-book";
import {
  buildOptionsFeed,
  parseOcc,
  settleOptionFills,
  type OptionFillInput,
  type OptionLegInput,
} from "../src/lib/options-fills";

const near = (actual: number, expected: number, label: string) => {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
};

const occ = parseOcc("SPY251219P00500000");
assert.ok(occ);
assert.equal(occ.underlying, "SPY");
assert.equal(occ.expiry, "2025-12-19");
assert.equal(occ.right, "P");
assert.equal(occ.strike, 500);
assert.equal(parseOcc("SPY"), null);

const bullPut: OptionLegInput[] = [
  {
    symbol: "SPY251219P00500000",
    qty: 1,
    side: "short",
    avgEntryPrice: 1.5,
    currentPrice: 0.8,
    unrealizedPl: 70,
    delta: -0.3,
  },
  {
    symbol: "SPY251219P00495000",
    qty: 1,
    side: "long",
    avgEntryPrice: 0.4,
    currentPrice: 0.2,
    unrealizedPl: -20,
    delta: -0.1,
  },
];

const bull = buildOptionsFeed({ positions: bullPut, fills: [] });
assert.equal(bull.spreads.length, 1);
assert.equal(bull.spreads[0].structure, "Bull put");
assert.equal(bull.spreads[0].contracts, 1);
near(bull.spreads[0].netCredit, 110, "bull credit");
near(bull.spreads[0].markCredit, 60, "bull mark");
near(bull.spreads[0].unrealizedPl, 50, "bull unrealized");
near(bull.unrealizedPl, 50, "book unrealized");
near(bull.maxLoss ?? NaN, 390, "bull max loss");
near(bull.bpUsed ?? NaN, 390, "bull bp");
near(bull.betaWeightedDelta ?? NaN, 20, "bull beta");
assert.equal(bull.realizedPl, null);
assert.equal(bull.undefinedRisk, false);

const twoLot = bullPut.map((leg) => ({
  ...leg,
  qty: 2,
  unrealizedPl: leg.unrealizedPl * 2,
}));
const doubled = buildOptionsFeed({ positions: twoLot, fills: [] });
assert.equal(doubled.spreads.length, 1);
assert.equal(doubled.spreads[0].contracts, 2);
near(doubled.bpUsed ?? NaN, 780, "two-lot bp");
near(doubled.betaWeightedDelta ?? NaN, 40, "two-lot beta");

const condor = buildOptionsFeed({
  positions: [
    ...bullPut,
    {
      symbol: "SPY251219C00510000",
      qty: 1,
      side: "short",
      avgEntryPrice: 1.2,
      currentPrice: 0.5,
      unrealizedPl: 70,
      delta: 0.25,
    },
    {
      symbol: "SPY251219C00515000",
      qty: 1,
      side: "long",
      avgEntryPrice: 0.3,
      currentPrice: 0.1,
      unrealizedPl: -20,
      delta: 0.1,
    },
  ],
  fills: [],
});
assert.equal(condor.spreads.length, 1);
assert.equal(condor.spreads[0].structure, "Iron condor");
near(condor.spreads[0].netCredit, 200, "condor credit");
near(condor.maxLoss ?? NaN, 300, "condor max loss");
near(condor.bpUsed ?? NaN, 300, "condor bp");
near(condor.betaWeightedDelta ?? NaN, 5, "condor beta");
near(condor.unrealizedPl, 100, "condor unrealized");

const fly = buildOptionsFeed({
  positions: [
    {
      symbol: "SPY251219P00495000",
      qty: 1,
      side: "long",
      avgEntryPrice: 0.4,
      currentPrice: 0.2,
      unrealizedPl: -20,
      delta: -0.1,
    },
    {
      symbol: "SPY251219P00500000",
      qty: 2,
      side: "short",
      avgEntryPrice: 1.5,
      currentPrice: 0.8,
      unrealizedPl: 140,
      delta: -0.3,
    },
    {
      symbol: "SPY251219P00505000",
      qty: 1,
      side: "long",
      avgEntryPrice: 0.3,
      currentPrice: 0.15,
      unrealizedPl: -15,
      delta: -0.05,
    },
  ],
  fills: [],
});
assert.equal(fly.spreads.length, 1);
assert.equal(fly.spreads[0].structure, "Butterfly");
near(fly.spreads[0].netCredit, 230, "fly credit");
near(fly.maxLoss ?? NaN, 270, "fly max loss");
near(fly.unrealizedPl, 105, "fly unrealized");
const body = fly.spreads[0].legs.find((leg) => leg.strike === 500);
assert.equal(body?.qty, -2);

const closed: OptionFillInput[] = [
  {
    id: "a",
    symbol: "SPY251219P00500000",
    side: "sell",
    qty: 1,
    price: 1.5,
    transactionTime: "2026-11-01T15:00:00Z",
  },
  {
    id: "b",
    symbol: "SPY251219P00500000",
    side: "buy",
    qty: 1,
    price: 0.5,
    transactionTime: "2026-11-02T15:00:00Z",
  },
];
const flat = buildOptionsFeed({ positions: [], fills: closed });
near(flat.realizedPl ?? NaN, 100, "closed premium");
near(flat.bpUsed ?? NaN, 0, "flat bp");
near(flat.betaWeightedDelta ?? NaN, 0, "flat beta");
assert.equal(flat.spreads.length, 0);

const stillOpen = settleOptionFills([closed[0]]);
near(stillOpen.realized, 0, "open fill not realized");
assert.equal(stillOpen.openQty.get("SPY251219P00500000"), -1);

const partial = settleOptionFills([
  { ...closed[0], qty: 2 },
  { ...closed[1], qty: 1, price: 0.4 },
]);
near(partial.realized, 110, "partial close");
assert.equal(partial.openQty.get("SPY251219P00500000"), -1);

const naked = buildOptionsFeed({
  positions: [bullPut[0]],
  fills: [closed[0]],
});
assert.equal(naked.spreads[0].structure, "Short put");
assert.equal(naked.bpUsed, null);
assert.equal(naked.maxLoss, null);
assert.equal(naked.undefinedRisk, true);
near(naked.realizedPl ?? NaN, 0, "open short realized");

const debit = buildOptionsFeed({
  positions: [
    {
      symbol: "QQQ260116C00500000",
      qty: 1,
      side: "long",
      avgEntryPrice: 3,
      currentPrice: 3.4,
      unrealizedPl: 40,
      delta: 0.55,
    },
    {
      symbol: "QQQ260116C00505000",
      qty: 1,
      side: "short",
      avgEntryPrice: 1.2,
      currentPrice: 1.4,
      unrealizedPl: -20,
      delta: 0.35,
    },
  ],
  fills: [],
});
assert.equal(debit.spreads[0].structure, "Bull call");
near(debit.spreads[0].netCredit, -180, "debit credit");
near(debit.maxLoss ?? NaN, 180, "debit max loss");
near(debit.bpUsed ?? NaN, 0, "debit bp");
near(debit.betaWeightedDelta ?? NaN, 23, "qqq beta");

const noGreek = buildOptionsFeed({
  positions: bullPut.map((leg) => ({ ...leg, delta: null })),
  fills: [],
});
assert.equal(noGreek.betaWeightedDelta, null);
near(noGreek.bpUsed ?? NaN, 390, "bp without greeks");

const separate = buildOptionsFeed({
  positions: [
    ...bullPut,
    {
      symbol: "IWM251219P00200000",
      qty: 1,
      side: "long",
      avgEntryPrice: 1,
      currentPrice: 1.1,
      unrealizedPl: 10,
      delta: -0.4,
    },
  ],
  fills: [],
});
assert.equal(separate.spreads.length, 2);
assert.ok(separate.spreads.some((spread) => spread.structure === "Bull put"));
assert.ok(separate.spreads.some((spread) => spread.structure === "Long put"));

assert.equal(buildOptionsFeed({ positions: bullPut, fills: null }).realizedPl, null);

const unknown = cashPartitions({ etfFloatRemaining: 1000, optionsBpUsed: null });
assert.equal(unknown.optionsBpUsedUsd, null);
assert.equal(unknown.freeCollateralUsd, null);
const known = cashPartitions({ etfFloatRemaining: 1000, optionsBpUsed: 390 });
assert.equal(known.optionsBpUsedUsd, 390);
assert.equal(known.freeCollateralUsd, 25_000 - 390);
assert.equal(cashPartitions({ etfFloatRemaining: 0 }).optionsBpUsedUsd, null);

console.log("options fills tests ok");
