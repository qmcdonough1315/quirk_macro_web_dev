import { supabase } from "./supabase";

/**
 * Shape of a row in the Supabase table `cash_manager_yields`.
 * Populated weekly by an external Python script (GitHub-hosted).
 *
 * Suggested columns:
 *   id                      uuid / bigint  primary key
 *   as_of_date              date           snapshot date
 *   ticker                  text
 *   fund_name               text
 *   category                text           e.g. "Short Treasury", "Prime Money Market"
 *   sec_yield_30d           numeric        30-Day SEC Yield (%)
 *   expense_ratio           numeric        (%)
 *   distribution_frequency  text           e.g. "Monthly", "Accrued daily"
 *   detail_url              text           link to issuer / fund detail page
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

export interface CashManagerData {
  funds: CashFund[];
  live: boolean;
  asOf: string | null;
}

function coerce(row: Record<string, unknown>): CashFund {
  const ticker = String(row["ticker"] ?? "");
  return {
    id: String(row["id"] ?? crypto.randomUUID()),
    as_of_date: String(row["as_of_date"] ?? ""),
    ticker,
    fund_name: String(row["fund_name"] ?? ticker),
    category: String(row["category"] ?? "—"),
    sec_yield_30d: Number(row["sec_yield_30d"] ?? 0),
    expense_ratio: Number(row["expense_ratio"] ?? 0),
    distribution_frequency: String(row["distribution_frequency"] ?? "—"),
    detail_url: String(row["detail_url"] ?? FALLBACK_URL(ticker)),
  };
}

/**
 * Reads the latest snapshot from `cash_manager_yields`, ranked by 30-Day SEC
 * Yield. Falls back to placeholder data while the table is empty.
 */
export async function fetchCashManagerYields(): Promise<CashManagerData> {
  try {
    const { data: latest } = await supabase
      .from("cash_manager_yields")
      .select("as_of_date")
      .order("as_of_date", { ascending: false })
      .limit(1);
    const asOf = latest?.[0]?.["as_of_date"] as string | undefined;
    if (!asOf) throw new Error("empty");

    const { data, error } = await supabase
      .from("cash_manager_yields")
      .select("*")
      .eq("as_of_date", asOf)
      .order("sec_yield_30d", { ascending: false });
    if (error || !data?.length) throw new Error(error?.message ?? "empty");

    return {
      funds: (data as Record<string, unknown>[]).map(coerce),
      live: true,
      asOf,
    };
  } catch {
    const funds = [...mockCashFunds].sort((a, b) => b.sec_yield_30d - a.sec_yield_30d);
    return { funds, live: false, asOf: mockCashFunds[0]!.as_of_date };
  }
}
