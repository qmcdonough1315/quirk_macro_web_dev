/**
 * Pure helpers for Yahoo chart cache keys + missing-price desk copy.
 */
import assert from "node:assert/strict";

import {
  missingPricesNote,
  yahooChartCacheKey,
} from "../src/lib/paper-portfolio.server";

assert.equal(yahooChartCacheKey("spy", 100, 200), "SPY|100|200");
assert.equal(yahooChartCacheKey("SPY", 100, 200), "SPY|100|200");
assert.notEqual(yahooChartCacheKey("SPY", 100, 200), yahooChartCacheKey("SPY", 100, 201));

assert.equal(missingPricesNote([]), null);
assert.equal(
  missingPricesNote([
    { ticker: "QQQ", reason: "HTTP 429" },
    { ticker: "SPY", reason: "empty chart result" },
  ]),
  "Prices missing for QQQ, SPY; their allocation is shown as cash",
);
assert.equal(
  missingPricesNote([
    { ticker: "SPY", reason: "HTTP 500" },
    { ticker: "SPY", reason: "fetch exception" },
  ]),
  "Prices missing for SPY; their allocation is shown as cash",
);

console.log("paper yahoo cache helpers ok");
