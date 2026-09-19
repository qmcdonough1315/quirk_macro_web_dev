# Switch AI commentary to Gemini, add caching, refresh the About tab

## AI model change

Every AI-written section on the site currently runs on an OpenAI model. All five move to Gemini 3.6 Flash:

- Drive-By Vibe (Local Market Explorer)
- Area/market commentary and the Past Week Recap (Get Your Macros)
- Economic calendar write-up
- Regime summary (ETF Model)

You don't need to paste a Gemini key. Gemini 3.6 Flash is already available through the AI access your app has built in, so the calls just switch model — no new key to store, no extra Google billing account. I have not saved the key you sent; since it was shared in chat, it's worth revoking it in Google AI Studio.

## When AI is unavailable

Anywhere AI text is shown, a failed or empty response now shows exactly:

"commentary unavailable at the moment, check back soon!"

This replaces the current behaviour, which either errors out or silently substitutes a machine-written sentence.

## Caching for faster loads

Two layers:

1. Server-side: each AI write-up is cached by the data it describes (run date, ZIP, week). Repeat visitors reuse the stored text instead of paying for a fresh generation, so the page paints immediately. Cache lives in memory with a time limit per section: regime summary 24h, macro recap 6h, calendar 6h, ZIP vibe 24h.
2. Browser-side: keep already-fetched tab data warm while you move between tabs, so switching back is instant instead of re-fetching.

Result: the first visit after new data lands does the real work; every visit after that is near-instant.

## About tab

- Remove the red check markers from "Why I Built QuirkMacro" — the four points stay, just clean text blocks with headings.
- Add a third tile, "Delivery Pipeline", listing:
  1. Exploring further data sources to integrate
  2. Building more customized dashboards to personalize the view by individual preference
  3. Adding a profile feature to save personal preferences
  4. Updating and refining the Housing Market Explorer for better geographic awareness

Layout becomes the existing two tiles on top and the Delivery Pipeline tile spanning beneath them, with the contact badges below.

## Technical notes

- `src/lib/zip.server.ts`, `src/lib/factor-ai.server.ts`, `src/lib/market.server.ts` (3 call sites): model string `openai/gpt-5-mini` → `google/gemini-3.6-flash`, same `/v1/chat/completions` gateway endpoint and `LOVABLE_API_KEY` header. No new secret.
- Failure handling: gateway non-2xx, network error, or empty content returns the fixed unavailable string. Per `ai-gateway-error-semantics`, 429/5xx get one bounded retry; 400/401/402/403 are terminal and return the message immediately. The existing generated fallback sentence in `factor-ai.server.ts` is removed so the message is consistent everywhere.
- The vibe check returns structured JSON; on failure its narrative fields carry the unavailable message rather than throwing, so the surrounding stats keep rendering.
- Server cache: small TTL map in a shared `src/lib/ai-cache.server.ts`, keyed per feature + input hash. Worker memory is per-isolate, so it's a best-effort warm cache, not a store.
- Client cache: raise `staleTime`/`gcTime` on the AI-backed queries in `MacroTab`, `FactorBetaTab`, `LocalTab` to match the server TTLs.
- `src/components/dashboard/AboutTab.tsx`: drop the `CheckCircle2`/`PiggyBank`/`Database` bullet icons from the first tile, add the Delivery Pipeline card.
