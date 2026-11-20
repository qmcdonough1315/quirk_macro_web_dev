/**
 * Lightweight node tests for ETF DCA allocate / payload / lot mapping.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const etfUrl = pathToFileURL(join(root, "../src/lib/etf-orders.ts")).href;
const paperUrl = pathToFileURL(join(root, "../src/lib/paper-portfolio-rules.ts")).href;

const etf = await import(etfUrl);
const paper = await import(paperUrl);

const buys = etf.allocateWeeklyDca({ SPY: 0.6, QQQ: 0.4 }, { weeklyContribution: 1000 });
assert.equal(buys.length, 2);
assert.equal(buys[0].ticker, "SPY");
assert.ok(Math.abs(buys[0].notional - 600) < 1e-9);
assert.equal(buys[1].ticker, "QQQ");
assert.ok(Math.abs(buys[1].notional - 400) < 1e-9);

const norm = etf.normalizeWeights({ XLK: 40, XLF: 60 });
assert.ok(Math.abs(norm.XLK - 0.4) < 1e-9);

const proposal = etf.proposeWeeklyEtfBuys(
  { XLK: 40, XLF: 60 },
  { weeklyContribution: paper.WEEKLY_CONTRIBUTION_USD, includeVoo: true },
);
assert.equal(proposal.dcaWeeks, 13);
assert.ok(proposal.vooBuy);
assert.equal(proposal.vooBuy.ticker, "VOO");
assert.equal(proposal.buys[0].order.side, "buy");
assert.equal(proposal.buys[0].order.type, "market");

const lot = etf.lotFromAlpacaFill({
  ticker: "xlk",
  shares: 1.25,
  price: 200,
  filledAt: "2026-11-12T15:30:00Z",
  orderId: "ord-1",
});
assert.equal(lot.ticker, "XLK");
assert.equal(lot.openedOn, "2026-11-12");
assert.equal(lot.source, "alpaca_fill");
assert.equal(lot.status, "open");

// Idempotent client_order_id: stable format under Alpaca's 48-char cap
const id1 = etf.buildEtfClientOrderId({
  strategy: "factor",
  runDate: "2026-11-19",
  symbol: "spy",
});
const id2 = etf.buildEtfClientOrderId({
  strategy: "factor",
  runDate: "2026-11-19T15:00:00Z",
  symbol: "SPY",
});
const id3 = etf.buildEtfClientOrderId({
  strategy: "voo",
  runDate: "2026-11-19",
  symbol: "VOO",
});
assert.equal(id1, "etf-factor-2026-11-19-SPY");
assert.equal(id1, id2, "client_order_id stable across symbol/runDate normalization");
assert.equal(id3, "etf-voo-2026-11-19-VOO");
assert.notEqual(id1, id3, "client_order_id changes with strategy/symbol");
assert.ok(id1.length <= etf.ETF_CLIENT_ORDER_ID_MAX, "client_order_id length ok");

const withId = etf.buildEquityBuyPayload("SPY", 100, { clientOrderId: id1 });
assert.equal(withId.client_order_id, id1);

// Duplicate handling mirrors options mleg: recognize Alpaca conflict strings
assert.equal(
  etf.isDuplicateClientOrderIdError("client_order_id already exists"),
  true,
);
assert.equal(etf.isDuplicateClientOrderIdError("duplicate order"), true);
assert.equal(etf.isDuplicateClientOrderIdError("insufficient buying power"), false);

// HIFO path unchanged — still sorts high basis first
const low = { costPerShare: 100, shares: 10, openedOn: "2026-09-21" };
const high = { costPerShare: 200, shares: 10, openedOn: "2026-12-07" };
const ordered = [low, high].sort((a, b) => paper.compareLotsLeastGainFirst(a, b, 220, 220));
assert.equal(ordered[0], high);

console.log("etf-orders tests ok");
