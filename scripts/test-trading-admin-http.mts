/**
 * End-to-end HTTP checks against the running vite server.
 * Requires: TRADING_ADMIN_PASSWORD=test-admin-desk-pass on the server.
 * Run: bun scripts/test-trading-admin-http.mts
 */
import { toJSONAsync, fromCrossJSON } from "seroval";

const BASE = process.env["APP_ORIGIN"] ?? "http://127.0.0.1:3000";
const PASSWORD = "test-admin-desk-pass";

const IDS = {
  getSession:
    "eyJmaWxlIjoiL3NyYy9saWIvdHJhZGluZy1hZG1pbi5mdW5jdGlvbnMudHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0IjoiZ2V0VHJhZGluZ0FkbWluU2Vzc2lvbl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0",
  login:
    "eyJmaWxlIjoiL3NyYy9saWIvdHJhZGluZy1hZG1pbi5mdW5jdGlvbnMudHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0IjoibG9naW5UcmFkaW5nQWRtaW5EZXNrX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  logout:
    "eyJmaWxlIjoiL3NyYy9saWIvdHJhZGluZy1hZG1pbi5mdW5jdGlvbnMudHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0IjoibG9nb3V0VHJhZGluZ0FkbWluRGVza19jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0",
  placeOptions:
    "eyJmaWxlIjoiL3NyYy9saWIvYWxwYWNhLmZ1bmN0aW9ucy50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJwbGFjZUFscGFjYU9wdGlvbnNPcmRlcl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0",
  placeEtf:
    "eyJmaWxlIjoiL3NyYy9saWIvYWxwYWNhLmZ1bmN0aW9ucy50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJwbGFjZUFscGFjYUV0ZkJ1eV9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0",
};

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

function cookieJar(res: Response, jar: Map<string, string>) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const part = line.split(";")[0] ?? "";
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function callFn(
  id: string,
  method: "GET" | "POST",
  data: unknown,
  jar: Map<string, string>,
): Promise<{ status: number; body: unknown; text: string }> {
  const url = `${BASE}/_serverFn/${id}`;
  const headers: Record<string, string> = {
    "x-tsr-serverFn": "true",
    accept: "application/json",
    origin: BASE,
    "sec-fetch-site": "same-origin",
  };
  const cookie = cookieHeader(jar);
  if (cookie) headers["cookie"] = cookie;

  let res: Response;
  if (method === "GET") {
    const payload =
      data === undefined
        ? undefined
        : encodeURIComponent(JSON.stringify(await toJSONAsync({ data })));
    const full = payload ? `${url}?payload=${payload}` : url;
    res = await fetch(full, { method: "GET", headers });
  } else {
    const body =
      data === undefined
        ? undefined
        : JSON.stringify(await toJSONAsync({ data }));
    // Omit content-type when there is no body — empty application/json
    // makes the server fail with "Unexpected end of JSON input".
    if (body != null) headers["content-type"] = "application/json";
    res = await fetch(url, { method: "POST", headers, body });
  }
  cookieJar(res, jar);
  const text = await res.text();
  let body: unknown = text;
  try {
    const json = JSON.parse(text);
    body = fromCrossJSON(json, { refs: new Map() });
  } catch {
    /* keep text */
  }
  return { status: res.status, body, text };
}

function extractResult(body: unknown): unknown {
  if (body && typeof body === "object" && "result" in (body as object)) {
    return (body as { result: unknown }).result;
  }
  return body;
}

const jar = new Map<string, string>();

const session0 = await callFn(IDS.getSession, "GET", undefined, jar);
const s0 = extractResult(session0.body) as {
  authenticated?: boolean;
  configured?: boolean;
};
assert(session0.status === 200, "getSession status 200");
assert(s0?.configured === true, "admin password configured on server");
assert(s0?.authenticated === false, "starts locked");

const placeBlocked = await callFn(
  IDS.placeOptions,
  "POST",
  {
    confirm: true,
    qty: 1,
    limitPrice: -0.5,
    legs: [
      { symbol: "SPY250620P00500000", side: "sell", positionIntent: "sell_to_open" },
      { symbol: "SPY250620P00490000", side: "buy", positionIntent: "buy_to_open" },
    ],
  },
  jar,
);
const place0 = extractResult(placeBlocked.body) as {
  ok?: boolean;
  error?: string;
};
assert(placeBlocked.status === 200, "placeOptions returns 200 (app-level deny)");
assert(place0?.ok === false, "placeOptions denied without auth");
assert(
  typeof place0?.error === "string" && /admin authentication required/i.test(place0.error),
  `placeOptions error mentions admin auth (got: ${place0?.error})`,
);

const etfBlocked = await callFn(
  IDS.placeEtf,
  "POST",
  { confirm: true, symbol: "VOO", notional: 100 },
  jar,
);
const etf0 = extractResult(etfBlocked.body) as { ok?: boolean; error?: string };
assert(etf0?.ok === false, "placeEtf denied without auth");
assert(
  typeof etf0?.error === "string" && /admin authentication required/i.test(etf0.error),
  `placeEtf error mentions admin auth (got: ${etf0?.error})`,
);

const badLogin = await callFn(IDS.login, "POST", { password: "wrong-password" }, jar);
const bad = extractResult(badLogin.body) as { ok?: boolean; authenticated?: boolean };
assert(bad?.ok === false, "bad password rejected");
assert(bad?.authenticated !== true, "bad password does not authenticate");

const goodLogin = await callFn(IDS.login, "POST", { password: PASSWORD }, jar);
const good = extractResult(goodLogin.body) as {
  ok?: boolean;
  authenticated?: boolean;
  error?: string;
};
assert(good?.ok === true, `login ok (error=${good?.error ?? "none"})`);
assert(good?.authenticated === true, "login authenticates");
assert([...jar.keys()].some((k) => k.includes("trading") || k.includes("qm_")), `session cookie set (${[...jar.keys()].join(",")})`);

const session1 = await callFn(IDS.getSession, "GET", undefined, jar);
const s1 = extractResult(session1.body) as { authenticated?: boolean };
assert(s1?.authenticated === true, "getSession sees unlocked admin");

const placeAuthed = await callFn(
  IDS.placeOptions,
  "POST",
  {
    confirm: true,
    qty: 1,
    limitPrice: -0.5,
    legs: [
      { symbol: "SPY250620P00500000", side: "sell", positionIntent: "sell_to_open" },
      { symbol: "SPY250620P00490000", side: "buy", positionIntent: "buy_to_open" },
    ],
  },
  jar,
);
const place1 = extractResult(placeAuthed.body) as { ok?: boolean; error?: string };
assert(
  !(typeof place1?.error === "string" && /admin authentication required/i.test(place1.error)),
  `authed place is not blocked by admin gate (got: ${place1?.error ?? "ok/other"})`,
);

const logout = await callFn(IDS.logout, "POST", undefined, jar);
const out = extractResult(logout.body) as { authenticated?: boolean };
assert(out?.authenticated === false, "logout clears auth");

const session2 = await callFn(IDS.getSession, "GET", undefined, jar);
const s2 = extractResult(session2.body) as { authenticated?: boolean };
assert(s2?.authenticated === false, "getSession locked after logout");

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\ntrading-admin HTTP gate ok");
