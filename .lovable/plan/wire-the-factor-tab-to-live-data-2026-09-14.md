# Wire the Factor tab to live data

Replace the placeholder numbers on the Factor Beta Predictions tab with rows read from your `factor_predictions` table, and generate the regime write-up with AI from those same numbers.

## What you'll see

- The date tag in the top-right of the tab shows the newest run date found in the table.
- The factor table's "Predicted" column fills from the newest run: green with an up arrow for positive, red for negative.
- The 10-ETF portfolio table lists each ticker with its weight as a percentage, with a fund name filled in from a built-in list of common ETFs (ticker only if it isn't in the list).
- The four metric tiles (expected return, volatility, Sharpe, hold period) come from the run's own numbers.
- "Previous Week Performance & Asset Selections" lists every earlier run date from the last 3 months, each expanding to that run's factor calls and holdings. Older runs stay in your table but aren't shown.
- Until the table has rows, the tab keeps showing the current sample run and labels itself "Placeholder run", so nothing looks broken.

## AI regime summary

A short three-sentence read of the current regime, written by AI from the newest run's own factor values, weights, and portfolio stats — no outside data. It's generated on the server, cached per run date so it isn't re-written on every page view, and falls back to a plain generated sentence if the AI call fails.

## Technical notes

- `src/lib/factor-beta.ts`: replace the `factor_beta_predictions` query with `factor_predictions`. One query pulls all rows from the last 3 months ordered by `execution_date` desc; rows are grouped in memory by `execution_date`, and each group is assembled by `data_type`:
  - `factor_returns` → factor rows, matching `ticker_or_factor` against `Mkt_RF`/`Mkt-RF`, `SMB`, `HML`, `RMW`, `CMA`, `WML` (case- and separator-insensitive) to keep display names and descriptions.
  - `portfolio_weights` → holdings, `ticker_or_factor` → ticker, `value` → weight.
  - portfolio stats (expected 3-month return, volatility, Sharpe) read from whatever `data_type`/`ticker_or_factor` naming your script uses; the reader accepts several common spellings (e.g. `expected_return`, `portfolio_return`, `volatility`, `sharpe`) so it works without a schema change.
  - Newest group = current run; the rest = history.
- Ticker→fund-name map lives in `src/lib/etf-names.ts`.
- New `src/lib/factor-ai.functions.ts` server function calls Lovable AI (`openai/gpt-6-astra`, streamed server-side) with the run's numbers and returns the three-sentence summary; `FactorBetaTab` fetches it with TanStack Query keyed on the run date.
- `FactorBetaTab.tsx` changes are display-only: header date tag, weight formatting to one decimal, fund-name lookup, and hiding the "prior run" / realized / benchmark / hit-rate figures when the data doesn't provide them.
- Nothing is deleted from the table; the 3-month window is a read filter.

## Not included

Realized results and benchmark comparison for past runs need the Alpaca connection you mentioned — that's a separate step once you want it wired in.
