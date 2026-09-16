# Cash Management live data + mobile subtab fix

## 1. Cash Management tab reads your two new tables

Today the tab reads `cash_manager_yields` and falls back to placeholder funds. It will
instead read:

- `cash_yield_matrix` — the top 10 funds: ticker, fund name, category, 30-day SEC yield,
  expense ratio, distribution schedule.
- `cash_engine_summary` — average yield of the top 10, average expense ratio, benchmark
  3-month T-bill.

Behavior:

- Leaderboard rows come from the fund table, ranked by 30-day SEC yield (highest first).
- The three tiles on top read from the summary table: highest/average yield, average
  expense ratio, and the benchmark 3-month T-bill. If the summary row has no T-bill value,
  the tile keeps using the live FRED benchmark it shows today.
- The "as of" label uses the newest snapshot date found; the tab shows a "Live" label when
  real rows are present and keeps the existing placeholder data (clearly labeled) while
  the tables are still empty.
- Both tables currently return no rows to the site, so on first load you may still see the
  placeholder set until your weekly script populates them (or until read access is opened).
  I will confirm which of the two it is after wiring and tell you.
- The "Currently under construction" banner stays until you say otherwise.

## 2. Phone users can't open the Housing / Wealth Management subtabs

The two parent tabs open their menus on mouse hover only, which never happens on a phone,
so the subtabs are unreachable. Fix:

- Tapping a parent tab opens its menu; tapping again (or tapping elsewhere, or picking a
  subtab) closes it. Mouse hover keeps working on desktop.
- The subtab strip under the active section scrolls sideways on narrow screens so all
  entries stay reachable, and tap targets get comfortable sizing.
- The top navigation row wraps/scrolls cleanly at phone width.

## Technical notes

- New reader `src/lib/cash-manager.ts`: query `cash_yield_matrix` and
  `cash_engine_summary` via the existing publishable Supabase client. Column names are
  matched defensively (normalized key lookup across likely variants such as
  `sec_yield_30d` / `yield_30d_sec`, `expense_ratio`, `distribution_frequency` /
  `distribution_schedule`, `avg_yield` / `average_yield`, `benchmark_3m_tbill`), the same
  approach used in `src/lib/factor-beta.ts`. Fractions (<1) are scaled to percent.
  Dedupe by ticker keeping the newest snapshot date.
- `CashManagerTab.tsx`: tiles bind to the summary record with FRED as the T-bill fallback;
  table binding otherwise unchanged.
- `src/routes/index.tsx`: add open-menu state per group, `onClick` toggle plus
  `onMouseEnter`/`onMouseLeave` for pointer devices, outside-click and Escape close, and
  `overflow-x-auto` on the nav and subtab rows.
- Verify with Playwright at a 390px-wide viewport that tapping each parent tab opens its
  menu and selecting a subtab switches content.
