/**
 * Fail-closed checks for requireTradingAdmin / config detection.
 * Run: bun scripts/test-trading-admin-require.mts
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

// Isolate env for each import by spawning subprocesses via bun.
async function runCase(label: string, env: Record<string, string>, expect: {
  configured: boolean;
  gateOk: boolean;
  gateCode?: string;
}) {
  const code = `
    const { isTradingAdminConfigured, requireTradingAdmin, getTradingAdminAuthState } =
      await import(${JSON.stringify(new URL("../src/lib/trading-admin.server.ts", import.meta.url).pathname)});
    const configured = isTradingAdminConfigured();
    const state = await getTradingAdminAuthState();
    const gate = await requireTradingAdmin();
    console.log(JSON.stringify({ configured, state, gate }));
  `;
  const proc = Bun.spawn({
    cmd: ["bun", "-e", code],
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    console.error(`FAIL: ${label} exited ${exitCode}\n${stderr}`);
    failed += 1;
    return;
  }
  const line = stdout.trim().split("\n").at(-1) ?? "";
  let parsed: {
    configured: boolean;
    state: { authenticated: boolean; configured: boolean };
    gate: { ok: boolean; code?: string; error?: string };
  };
  try {
    parsed = JSON.parse(line);
  } catch {
    console.error(`FAIL: ${label} bad JSON: ${stdout}\n${stderr}`);
    failed += 1;
    return;
  }
  assert(parsed.configured === expect.configured, `${label}: configured=${expect.configured}`);
  assert(parsed.state.configured === expect.configured, `${label}: state.configured`);
  assert(parsed.state.authenticated === false, `${label}: no session ⇒ not authenticated`);
  assert(parsed.gate.ok === expect.gateOk, `${label}: gate.ok=${expect.gateOk}`);
  if (expect.gateCode) {
    assert(parsed.gate.code === expect.gateCode, `${label}: gate.code=${expect.gateCode}`);
  }
}

await runCase(
  "missing password",
  { TRADING_ADMIN_PASSWORD: "", TRADING_ADMIN_SESSION_SECRET: "" },
  { configured: false, gateOk: false, gateCode: "not_configured" },
);

await runCase(
  "password set, no cookie",
  {
    TRADING_ADMIN_PASSWORD: "test-admin-desk-pass",
    TRADING_ADMIN_SESSION_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
  },
  { configured: true, gateOk: false, gateCode: "unauthorized" },
);

void require;
if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nrequireTradingAdmin fail-closed ok");
