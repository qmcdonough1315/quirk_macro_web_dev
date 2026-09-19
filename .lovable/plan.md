# Fixing the two security warnings

## 1. Limit what the AI write-ups will accept

Right now two behind-the-scenes requests — the ETF regime write-up and the housing
"Drive-By Vibe" — accept whatever data is sent to them and pass it straight to Google
Gemini. Someone could send a huge or junk payload repeatedly and run up your Gemini bill.

The fix: check and cap the incoming data before any AI call happens.

- ETF request: a valid date, at most 12 factor entries and 30 holdings, short codes and
  tickers, numeric values only, nothing extra accepted.
- Housing request: a 5-digit ZIP, short city/state values, at most 40 metric entries with
  short keys and values, nothing extra accepted.
- Anything that fails these checks is rejected immediately with a clear message, and no
  request is sent to Google.
- A total size ceiling on the assembled prompt as a final backstop.

Nothing changes for normal visitors — real dashboard data sits far inside these limits.

## 2. Agent (MCP) access stays open

You chose to keep the agent tools open with no sign-in. That matches what they do: the four
tools return the same public dashboard numbers any visitor already sees, they are read-only,
and they use the public data key — no personal data, no writes. I will record that decision
against the warning so it stops being flagged, with a note explaining why it is acceptable.

If you ever add per-user data to the app, this should be revisited and sign-in added.

## Technical notes

- Replace the identity `.inputValidator` in `src/lib/factor-ai.functions.ts` and
  `src/lib/zip.functions.ts` with zod schemas (`.strict()`, `.max()` on arrays and strings,
  finite-number checks), keeping the inferred types aligned with `RegimeInput` / `VibeInput`.
- Add a serialized-context size guard in `factor-ai.server.ts` and `zip.server.ts` before
  `generateAiTextResult`.
- Cache keys, Eastern refresh windows, and the "commentary unavailable at the moment, check
  back soon!" fallback all stay as they are.
- Mark `ai_fn_no_validation` fixed after the change; mark `app_mcp_public_unauthenticated`
  accepted as a deliberate public read-only surface.

## Verification

Typecheck and build, then confirm on the running app that the ETF regime write-up and a ZIP
Drive-By Vibe still generate normally, and that an oversized payload is rejected without
reaching Google.
