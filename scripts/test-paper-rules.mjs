/**
 * Lightweight node tests for paper DCA + HIFO + options rules (no test runner deps).
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const rulesUrl = pathToFileURL(join(root, "../src/lib/paper-portfolio-rules.ts")).href;
const optionsUrl = pathToFileURL(join(root, "../src/lib/options-sleeve-rules.ts")).href;

const paper = await import(rulesUrl);
const options = await import(optionsUrl);

assert.equal(paper.DCA_WEEKS, 13);
assert.equal(paper.ETF_TARGET_CAPITAL_USD, 50_000);
assert.ok(Math.abs(paper.WEEKLY_CONTRIBUTION_USD - 50_000 / 13) < 1e-9);
assert.equal(paper.etfFloatRemainingUsd(0), 50_000);
assert.ok(Math.abs(paper.etfFloatRemainingUsd(8) - (50_000 - 8 * (50_000 / 13))) < 1e-6);
assert.equal(paper.etfFloatRemainingUsd(13), 0);

const low = { costPerShare: 100, shares: 10, openedOn: "2026-09-21" };
const high = { costPerShare: 200, shares: 10, openedOn: "2026-12-07" };
const ordered = [low, high].sort((a, b) => paper.compareLotsLeastGainFirst(a, b, 220, 220));
assert.equal(ordered[0], high);
assert.equal(ordered[1], low);

const spy = options.buildOptionsSignal("SPY", 0.9, 55);
assert.equal(spy.structure, "bull_put_spread");
const skip = options.buildOptionsSignal("QQQ", 0.7, 22);
assert.equal(skip.structure, "skip_low_iv");
assert.equal(options.sizeSpreadContracts(1, 5, 2000), 5);

console.log("paper-rules tests ok");
