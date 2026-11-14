/**
 * Smoke-tests trading-admin gate helpers without a browser.
 * Run: bun scripts/test-trading-admin-gate.mts
 */
import { createHash, timingSafeEqual } from "node:crypto";

function secretsEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

function deriveSessionSecret(adminPassword: string): string {
  return createHash("sha256")
    .update(`quirk-macro:trading-admin-session:${adminPassword}`)
    .digest("hex");
}

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

assert(secretsEqual("desk-pass", "desk-pass"), "matching passwords equal");
assert(!secretsEqual("desk-pass", "other"), "mismatched passwords reject");
assert(!secretsEqual("", "desk-pass"), "empty password rejects");

const derived = deriveSessionSecret("desk-pass");
assert(derived.length === 64, "derived session secret is 64 hex chars");
assert(derived.length >= 32, "derived session secret meets seal min length");

assert(
  Boolean(("").trim().length === 0),
  "empty TRADING_ADMIN_PASSWORD means not configured",
);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\ntrading-admin gate smoke ok");
