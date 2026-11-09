# ETF_Quant_Model sync payload

Cursor could not push to `qmcdonough1315/ETF_Quant_Model` (403).
Copy these files onto that repository (preserving `modules/` paths), then open a PR.

Also included for the paper-trading / tax workstream:
- `PAPER_PORTFOLIO.md` — strategy rules
- `supabase_paper_portfolio.sql` — Supabase DDL (run once)
- `modules/paper_portfolio.py` — weekly ledger step wired from `main.py`

The Quirk Macro Factor tab already replays `$1000` weekly DCA + TLH from historical `portfolio_weights` via `src/lib/paper-portfolio.server.ts`, so the dashboard works before the model repo is updated.
