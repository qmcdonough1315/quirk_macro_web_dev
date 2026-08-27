import { supabase } from "./supabase";

/**
 * Shape of a row in the Supabase table `factor_beta_predictions`.
 * One row = one weekly model run, populated by external Python scripts.
 *
 * Suggested columns:
 *   id                uuid / bigint  primary key
 *   as_of_date        date           run date
 *   horizon_months    int            default 3
 *   regime_summary    text           3-sentence AI regime narrative
 *   factors           jsonb          FactorPrediction[]
 *   portfolio         jsonb          PortfolioHolding[]
 *   expected_return   numeric        portfolio total expected return (%)
 *   expected_vol      numeric        annualized expected volatility (%)
 *   expected_sharpe   numeric
 *   realized_return   numeric | null filled after the hold period
 *   benchmark_return  numeric | null e.g. SPY over the same window
 *   hit_rate          numeric | null share of factor calls directionally right
 */
export interface FactorPrediction {
  code: string;
  name: string;
  description: string;
  predicted: number;
  prior: number;
  confidence: number;
}

export interface PortfolioHolding {
  ticker: string;
  fund: string;
  expectedReturn: number;
  weight: number;
}

export interface FactorBetaRow {
  id: string;
  as_of_date: string;
  horizon_months: number;
  regime_summary: string;
  factors: FactorPrediction[];
  portfolio: PortfolioHolding[];
  expected_return: number;
  expected_vol: number;
  expected_sharpe: number;
  realized_return: number | null;
  benchmark_return: number | null;
  hit_rate: number | null;
}

export const mockCurrentRun: FactorBetaRow = {
  id: "mock-current",
  as_of_date: "2026-08-24",
  horizon_months: 3,
  regime_summary:
    "The model reads the current tape as a late-cycle expansion with easing financial conditions: market beta is still the dominant reward, but the premium is compressing as term-premium volatility rises. Quality is doing the heavy lifting — profitability (RMW) and conservative investment (CMA) both carry positive loadings, while size (SMB) remains a drag as balance-sheet strength concentrates in large caps. Value and momentum are converging, which historically precedes a rotation window, so the portfolio tilts toward profitable large caps with a partial momentum hedge.",
  factors: [
    {
      code: "Mkt-Rf",
      name: "Market Risk",
      description: "Excess return of the market over the risk-free rate",
      predicted: 2.14,
      prior: 1.62,
      confidence: 71,
    },
    {
      code: "SMB",
      name: "Size",
      description: "Small minus Big",
      predicted: -0.87,
      prior: -0.42,
      confidence: 63,
    },
    {
      code: "HML",
      name: "Value",
      description: "High minus Low book-to-market",
      predicted: 0.46,
      prior: 0.94,
      confidence: 48,
    },
    {
      code: "RMW",
      name: "Profitability",
      description: "Robust minus Weak operating profitability",
      predicted: 1.38,
      prior: 1.05,
      confidence: 74,
    },
    {
      code: "CMA",
      name: "Investment",
      description: "Conservative minus Aggressive asset growth",
      predicted: 0.72,
      prior: 0.33,
      confidence: 58,
    },
    {
      code: "WML",
      name: "Momentum",
      description: "Winners minus Losers (Carhart)",
      predicted: 1.91,
      prior: 2.47,
      confidence: 66,
    },
  ],
  portfolio: [
    { ticker: "QUAL", fund: "iShares MSCI USA Quality Factor ETF", expectedReturn: 3.42, weight: 16 },
    { ticker: "MTUM", fund: "iShares MSCI USA Momentum Factor ETF", expectedReturn: 3.86, weight: 14 },
    { ticker: "SPLV", fund: "Invesco S&P 500 Low Volatility ETF", expectedReturn: 1.94, weight: 12 },
    { ticker: "COWZ", fund: "Pacer US Cash Cows 100 ETF", expectedReturn: 3.11, weight: 11 },
    { ticker: "VTV", fund: "Vanguard Value ETF", expectedReturn: 2.28, weight: 10 },
    { ticker: "XLK", fund: "Technology Select Sector SPDR Fund", expectedReturn: 4.05, weight: 9 },
    { ticker: "XLV", fund: "Health Care Select Sector SPDR Fund", expectedReturn: 2.02, weight: 8 },
    { ticker: "IWY", fund: "iShares Russell Top 200 Growth ETF", expectedReturn: 3.55, weight: 8 },
    { ticker: "IEF", fund: "iShares 7-10 Year Treasury Bond ETF", expectedReturn: 0.88, weight: 7 },
    { ticker: "GLD", fund: "SPDR Gold Shares", expectedReturn: 1.47, weight: 5 },
  ],
  expected_return: 2.87,
  expected_vol: 9.6,
  expected_sharpe: 1.14,
  realized_return: null,
  benchmark_return: null,
  hit_rate: null,
};

export const mockPreviousRuns: FactorBetaRow[] = [
  {
    ...mockCurrentRun,
    id: "mock-prev-1",
    as_of_date: "2026-08-17",
    regime_summary:
      "Prior run leaned into momentum and quality as disinflation held; size stayed negative and value was flat.",
    factors: mockCurrentRun.factors.map((f) => ({ ...f, predicted: f.prior })),
    portfolio: [
      { ticker: "MTUM", fund: "iShares MSCI USA Momentum Factor ETF", expectedReturn: 4.12, weight: 16 },
      { ticker: "QUAL", fund: "iShares MSCI USA Quality Factor ETF", expectedReturn: 3.18, weight: 14 },
      { ticker: "XLK", fund: "Technology Select Sector SPDR Fund", expectedReturn: 4.44, weight: 12 },
      { ticker: "COWZ", fund: "Pacer US Cash Cows 100 ETF", expectedReturn: 2.86, weight: 11 },
      { ticker: "SPLV", fund: "Invesco S&P 500 Low Volatility ETF", expectedReturn: 1.72, weight: 10 },
      { ticker: "VTV", fund: "Vanguard Value ETF", expectedReturn: 2.05, weight: 9 },
      { ticker: "IWY", fund: "iShares Russell Top 200 Growth ETF", expectedReturn: 3.61, weight: 9 },
      { ticker: "XLV", fund: "Health Care Select Sector SPDR Fund", expectedReturn: 1.88, weight: 8 },
      { ticker: "IEF", fund: "iShares 7-10 Year Treasury Bond ETF", expectedReturn: 0.74, weight: 6 },
      { ticker: "GLD", fund: "SPDR Gold Shares", expectedReturn: 1.29, weight: 5 },
    ],
    expected_return: 2.64,
    expected_vol: 10.1,
    expected_sharpe: 1.02,
    realized_return: 3.12,
    benchmark_return: 2.41,
    hit_rate: 66.7,
  },
  {
    ...mockCurrentRun,
    id: "mock-prev-2",
    as_of_date: "2026-08-10",
    regime_summary:
      "Risk-on regime with a widening market premium; the model overweighted beta and under-hedged duration.",
    factors: mockCurrentRun.factors.map((f) => ({ ...f, predicted: f.prior * 0.8 })),
    portfolio: mockCurrentRun.portfolio.map((h) => ({ ...h, expectedReturn: h.expectedReturn * 0.9 })),
    expected_return: 2.31,
    expected_vol: 11.4,
    expected_sharpe: 0.81,
    realized_return: 1.44,
    benchmark_return: 2.02,
    hit_rate: 50,
  },
];

function coerce(row: Record<string, unknown>): FactorBetaRow {
  const asArray = <T,>(v: unknown): T[] => {
    if (Array.isArray(v)) return v as T[];
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(row["id"] ?? crypto.randomUUID()),
    as_of_date: String(row["as_of_date"] ?? ""),
    horizon_months: Number(row["horizon_months"] ?? 3),
    regime_summary: String(row["regime_summary"] ?? ""),
    factors: asArray<FactorPrediction>(row["factors"]),
    portfolio: asArray<PortfolioHolding>(row["portfolio"]),
    expected_return: Number(row["expected_return"] ?? 0),
    expected_vol: Number(row["expected_vol"] ?? 0),
    expected_sharpe: Number(row["expected_sharpe"] ?? 0),
    realized_return: num(row["realized_return"]),
    benchmark_return: num(row["benchmark_return"]),
    hit_rate: num(row["hit_rate"]),
  };
}

export interface FactorBetaData {
  current: FactorBetaRow;
  previous: FactorBetaRow[];
  live: boolean;
}

/**
 * Reads the latest runs from `factor_beta_predictions`. Falls back to modeled
 * placeholder data while the table is empty or not yet provisioned.
 */
export async function fetchFactorBetaData(): Promise<FactorBetaData> {
  try {
    const { data, error } = await supabase
      .from("factor_beta_predictions")
      .select("*")
      .order("as_of_date", { ascending: false })
      .limit(5);
    if (error || !data?.length) throw new Error(error?.message ?? "empty");
    const rows = (data as Record<string, unknown>[]).map(coerce);
    return { current: rows[0]!, previous: rows.slice(1), live: true };
  } catch {
    return { current: mockCurrentRun, previous: mockPreviousRuns, live: false };
  }
}
