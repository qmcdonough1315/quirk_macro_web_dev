import assert from "node:assert/strict";

import { classifyAlpacaConnection, alpacaStatusLabel } from "../src/lib/alpaca-status";

assert.equal(classifyAlpacaConnection({ live: true, notes: [] }), "live");
assert.equal(
  classifyAlpacaConnection({
    live: false,
    notes: ["Alpaca credentials missing. Set ALPACA_API_KEY_ID..."],
  }),
  "missing",
);
assert.equal(
  classifyAlpacaConnection({
    live: false,
    notes: ['Alpaca 401: {"message": "unauthorized."}'],
  }),
  "unauthorized",
);
assert.equal(
  classifyAlpacaConnection({ live: false, notes: ["Alpaca 500: boom"] }),
  "error",
);
assert.equal(alpacaStatusLabel("unauthorized"), "Alpaca paper · unauthorized");
console.log("ok");
