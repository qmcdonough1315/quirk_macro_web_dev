/**
 * Simulate evaluateExits lot ordering with the shared comparator.
 * Confirms week-12 high-basis QQQ is sold before week-1 low-basis QQQ.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const { compareLotsLeastGainFirst, MIN_HOLD_DAYS, LONG_TERM_DAYS, WEIGHT_EPS } = await import(
  pathToFileURL(join(root, "../src/lib/paper-portfolio-rules.ts")).href,
);

function diffDays(a, b) {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.floor(ms / 86_400_000);
}

function evaluateExitsOrdered(lots, asOf, currentWeights, px) {
  const sold = [];
  const candidates = lots.filter((lot) => diffDays(lot.openedOn, asOf) >= MIN_HOLD_DAYS);
  candidates.sort((a, b) => compareLotsLeastGainFirst(a, b, px, px));
  let offset = 500; // harvested losses available
  for (const lot of candidates) {
    const pnl = lot.shares * px - lot.shares * lot.costPerShare;
    const still = (currentWeights[lot.ticker] ?? 0) > WEIGHT_EPS;
    const age = diffDays(lot.openedOn, asOf);
    if (pnl < 0) {
      if (!still) sold.push({ id: lot.id, reason: "tlh" });
      continue;
    }
    if (age < LONG_TERM_DAYS) {
      if (!still && pnl > 0 && offset >= pnl) {
        sold.push({ id: lot.id, reason: "offset" });
        offset -= pnl;
      }
      continue;
    }
    if (!still) sold.push({ id: lot.id, reason: "ltcg" });
  }
  return sold;
}

const lots = [
  {
    id: "w1-low-basis",
    ticker: "QQQ",
    shares: 10,
    costPerShare: 100,
    openedOn: "2025-09-22", // long-term by 2026-12-22
  },
  {
    id: "w12-high-basis",
    ticker: "QQQ",
    shares: 10,
    costPerShare: 200,
    openedOn: "2026-09-21", // STCG on 2026-12-22 but past min hold
  },
];

const sold = evaluateExitsOrdered(lots, "2026-12-22", {}, 220);
// High-basis STCG has smaller gain ($200) and is considered first; offset $500 covers it.
// Low-basis LTCG gain is $1200 — sold after as LTCG when not allocated.
assert.equal(sold[0].id, "w12-high-basis");
assert.equal(sold[0].reason, "offset");
assert.equal(sold[1].id, "w1-low-basis");
assert.equal(sold[1].reason, "ltcg");

console.log("hifo-exit-order ok");
