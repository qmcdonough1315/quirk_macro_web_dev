import { supabase } from "./supabase";

/**
 * Reads two Supabase tables, populated weekly by an external Python script:
 *
 *   cash_yield_matrix    top-10 funds: ticker, fund name, category,
 *                        30-day SEC yield, expense ratio, distribution schedule
 *   cash_engine_summary  average yield across the top 10, average expense ratio,
 *                        benchmark 3-month T-bill
 *
 * Column names are matched defensively (normalized key lookup) and both tables
 * store whole percentages (4.45 means 4.45%), so values are read as-is.
 */
export interface CashFund {
  id: string;
  as_of_date: string;
  ticker: string;
  fund_name: string;
  category: string;
  sec_yield_30d: number;
  expense_ratio: number;
  distribution_frequency: string;
  detail_url: string;
}

export interface CashSummary {
  avg_yield: number | null;
  avg_expense_ratio: number | null;
  benchmark_3m_tbill: number | null;
}

export interface CashEngineData {
  funds: CashFund[];
  summary: CashSummary | null;
  live: boolean;
  asOf: string | null;
}

const FALLBACK_URL = (ticker: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(ticker + " fund")}`;

export const mockCashFunds: CashFund[] = [
  {
    id: "mock-1",
    as_of_date: "2026-08-21",
    ticker: "SGOV",
    fund_name: "iShares 0-3 Month Treasury Bond ETF",
    category: "Short Treasury",
    sec_yield_30d: 5.21,
    expense_ratio: 0.09,
    distribution_frequency: "Monthly",
    detail_url: "https://www.ishares.com/us/products/314116/",
  },
  {
    id: "mock-2",
    as_of_date: "2026-08-21",
    ticker: "SPAXX",
    fund_name: "Fidelity Government Money Market Fund",
    category: "Government Money Market",
    sec_yield_30d: 4.98,
    expense_ratio: 0.42,
    distribution_frequency: "Accrued daily",
    detail_url: "https://fundresearch.fidelity.com/mutual-funds/summary/31617H102",
  },
  {
    id: "mock-3",
    as_of_date: "2026-08-21",
    ticker: "VMFXX",
    fund_name: "Vanguard Federal Money Market Fund",
    category: "Government Money Market",
    sec_yield_30d: 5.02,
    expense_ratio: 0.11,
    distribution_frequency: "Accrued daily",
    detail_url: "https://investor.vanguard.com/investment-products/mutual-funds/profile/vmfxx",
  },
  {
    id: "mock-4",
    as_of_date: "2026-08-21",
    ticker: "BIL",
    fund_name: "SPDR Bloomberg 1-3 Month T-Bill ETF",
    category: "Short Treasury",
    sec_yield_30d: 5.14,
    expense_ratio: 0.135,
    distribution_frequency: "Monthly",
    detail_url: "https://www.ssga.com/us/en/intermediary/etfs/bil",
  },
  {
    id: "mock-5",
    as_of_date: "2026-08-21",
    ticker: "TFLO",
    fund_name: "iShares Treasury Floating Rate Bond ETF",
    category: "Floating Rate Treasury",
    sec_yield_30d: 5.24,
    expense_ratio: 0.15,
    distribution_frequency: "Monthly",
    detail_url: "https://www.ishares.com/us/products/261688/",
  },
  {
    id: "mock-6",
    as_of_date: "2026-08-21",
    ticker: "SWVXX",
    fund_name: "Schwab Value Advantage Money Fund",
    category: "Prime Money Market",
    sec_yield_30d: 5.11,
    expense_ratio: 0.34,
    distribution_frequency: "Accrued daily",
    detail_url: "https://www.schwabassetmanagement.com/products/swvxx",
  },
  {
    id: "mock-7",
    as_of_date: "2026-08-21",
    ticker: "USFR",
    fund_name: "WisdomTree Floating Rate Treasury Fund",
    category: "Floating Rate Treasury",
    sec_yield_30d: 5.19,
    expense_ratio: 0.15,
    distribution_frequency: "Monthly",
    detail_url: "https://www.wisdomtree.com/investments/etfs/fixed-income/usfr",
  },
  {
    id: "mock-8",
    as_of_date: "2026-08-21",
    ticker: "SPRXX",
    fund_name: "Fidelity Money Market Fund",
    category: "Prime Money Market",
    sec_yield_30d: 4.94,
    expense_ratio: 0.42,
    distribution_frequency: "Accrued daily",
    detail_url: "https://fundresearch.fidelity.com/mutual-funds/summary/31617H201",
  },
];

/** Lowercase + strip everything non-alphanumeric for forgiving key matching. */
const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

function lookup(row: Record<string, unknown>, variants: string[]): unknown {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) map.set(normKey(k), v);
  for (const v of variants) {
    const hit = map.get(normKey(v));
    if (hit !== undefined && hit !== null && hit !== "") return hit;
  }
  return undefined;
}

const toNum = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[%$,]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The tables store whole percentages (a 0.08 expense ratio means 0.08%), so no
 * fraction scaling is applied — guessing at units would misread small values.
 */
const toPct = (v: unknown): number | null => toNum(v);

const DATE_KEYS = [
  "as_of_date",
  "asof",
  "asofdate",
  "snapshot_date",
  "date",
  "run_date",
  "updated_at",
  "created_at",
];

/** Newest snapshot stamp as YYYY-MM-DD; ISO timestamps are truncated to the date. */
const getDate = (row: Record<string, unknown>) =>
  String(lookup(row, DATE_KEYS) ?? "").slice(0, 10);

function coerceFund(row: Record<string, unknown>): CashFund {
  const ticker = String(lookup(row, ["ticker", "symbol", "fund_ticker"]) ?? "").toUpperCase();
  return {
    id: String(lookup(row, ["id"]) ?? `${ticker}-${crypto.randomUUID()}`),
    as_of_date: getDate(row),
    ticker,
    fund_name: String(lookup(row, ["fund_name", "fundname", "name"]) ?? ticker),
    category: String(lookup(row, ["category", "fund_category", "type"]) ?? "—"),
    sec_yield_30d:
      toPct(
        lookup(row, [
          "sec_yield",
          "sec_yield_30d",
          "yield_30d_sec",
          "secyield30d",
          "yield_30d",
          "yield",
        ]),
      ) ?? 0,
    expense_ratio:
      toPct(lookup(row, ["expense_ratio", "expenseratio", "net_expense_ratio", "expense"])) ?? 0,
    distribution_frequency: String(
      lookup(row, ["distribution_frequency", "distribution_schedule", "distributions"]) ?? "—",
    ),
    detail_url: String(lookup(row, ["detail_url", "url", "link"]) ?? FALLBACK_URL(ticker)),
  };
}

function coerceSummary(row: Record<string, unknown>): CashSummary {
  return {
    avg_yield: toPct(
      lookup(row, [
        "avg_yield",
        "average_yield",
        "avgyield",
        "avg_sec_yield",
        "average_sec_yield",
      ]),
    ),
    avg_expense_ratio: toPct(
      lookup(row, [
        "avg_expense",
        "avg_expense_ratio",
        "average_expense_ratio",
        "avgexpense",
        "avgexpenseratio",
      ]),
    ),
    benchmark_3m_tbill: toPct(
      lookup(row, [
        "fred_3m_tbill",
        "fred_3m_tbill_yield",
        "benchmark_3m_tbill",
        "tbill_3m",
        "tbill3m",
        "3m_tbill",
        "benchmark",
      ]),
    ),
  };
}

/** Keep the newest row per ticker by snapshot date (script may append duplicates). */
function dedupe(funds: CashFund[]): CashFund[] {
  const byTicker = new Map<string, CashFund>();
  for (const f of funds) {
    const prev = byTicker.get(f.ticker);
    if (!prev || f.as_of_date >= prev.as_of_date) byTicker.set(f.ticker, f);
  }
  return Array.from(byTicker.values());
}

export async function fetchCashManagerYields(): Promise<CashEngineData> {
  try {
    const [fundRes, summaryRes] = await Promise.all([
      supabase.from("cash_yield_matrix").select("*"),
      supabase.from("cash_engine_summary").select("*"),
    ]);
    if (fundRes.error) throw new Error(fundRes.error.message);

    const fundRows = (fundRes.data ?? []) as Record<string, unknown>[];
    if (!fundRows.length) throw new Error("empty");

    const funds = dedupe(fundRows.map(coerceFund)).sort(
      (a, b) => b.sec_yield_30d - a.sec_yield_30d,
    );

    const summaryRows = ((summaryRes.data ?? []) as Record<string, unknown>[]).sort((a, b) =>
      getDate(b).localeCompare(getDate(a)),
    );
    const summary = summaryRows.length ? coerceSummary(summaryRows[0]!) : null;

    const asOf =
      funds.map((f) => f.as_of_date).sort().at(-1) ||
      (summaryRows.length ? getDate(summaryRows[0]!) : null);

    return { funds, summary, live: true, asOf: asOf || null };
  } catch {
    const funds = [...mockCashFunds].sort((a, b) => b.sec_yield_30d - a.sec_yield_30d);
    return { funds, summary: null, live: false, asOf: mockCashFunds[0]!.as_of_date };
  }
}
