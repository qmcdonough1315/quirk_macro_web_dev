import { supabase } from "./supabase";
import { fundName } from "./etf-names";

/**
 * Live data comes from the Supabase table `factor_predictions`, one row per
 * value:
 *   execution_date    date   model run date
 *   data_type         text   'factor_returns' | 'portfolio_weights' | portfolio stats
 *   ticker_or_factor  text   factor code, ETF ticker, or metric name
 *   value             numeric
 *
 * Rows are grouped by execution_date into one FactorBetaRow per run.
 */
export interface FactorPrediction {
  code: string;
  name: string;
  description: string;
  predicted: number;
  prior: number | null;
  confidence: number | null;
}

export interface PortfolioHolding {
  ticker: string;
  fund: string;
  expectedReturn: number | null;
  weight: number;
}

export interface FactorBetaRow {
  id: string;
  as_of_date: string;
  horizon_months: number;
  regime_summary: string;
  factors: FactorPrediction[];
  portfolio: PortfolioHolding[];
  expected_return: number | null;
  expected_vol: number | null;
  expected_sharpe: number | null;
  realized_return: number | null;
  benchmark_return: number | null;
  hit_rate: number | null;
}

/** Display metadata for the six Fama-French / Carhart factors. */
const FACTOR_META: Record<string, { code: string; name: string; description: string }> = {
  mktrf: {
    code: "Mkt-RF",
    name: "Market Risk",
    description: "Excess return of the market over the risk-free rate",
  },
  smb: { code: "SMB", name: "Size", description: "Small minus Big" },
  hml: { code: "HML", name: "Value", description: "High minus Low book-to-market" },
  rmw: {
    code: "RMW",
    name: "Profitability",
    description: "Robust minus Weak operating profitability",
  },
  cma: {
    code: "CMA",
    name: "Investment",
    description: "Conservative minus Aggressive asset growth",
  },
  wml: { code: "WML", name: "Momentum", description: "Winners minus Losers (Carhart)" },
  mom: { code: "WML", name: "Momentum", description: "Winners minus Losers (Carhart)" },
  umd: { code: "WML", name: "Momentum", description: "Winners minus Losers (Carhart)" },
};

const FACTOR_ORDER = ["Mkt-RF", "SMB", "HML", "RMW", "CMA", "WML"];

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const RETURN_KEYS = new Set([
  "expectedreturn",
  "expected3mreturn",
  "expected3monthreturn",
  "portfolioreturn",
  "portfolioexpectedreturn",
  "totalexpectedreturn",
  "expreturn",
  "return",
]);
const VOL_KEYS = new Set([
  "expectedvol",
  "expectedvolatility",
  "portfoliovolatility",
  "portfoliovol",
  "volatility",
  "vol",
  "stdev",
]);
const SHARPE_KEYS = new Set([
  "sharpe",
  "sharperatio",
  "expectedsharpe",
  "portfoliosharpe",
  "expectedsharperatio",
]);

export const mockCurrentRun: FactorBetaRow = {
  id: "mock-current",
  as_of_date: "2026-08-24",
  horizon_months: 3,
  regime_summary:
    "The model reads the current tape as a late-cycle expansion with easing financial conditions: market beta is still the dominant reward, but the premium is compressing as term-premium volatility rises. Quality is doing the heavy lifting — profitability (RMW) and conservative investment (CMA) both carry positive loadings, while size (SMB) remains a drag as balance-sheet strength concentrates in large caps. Value and momentum are converging, which historically precedes a rotation window, so the portfolio tilts toward profitable large caps with a partial momentum hedge.",
  factors: [
    {
      code: "Mkt-RF",
      name: "Market Risk",
      description: "Excess return of the market over the risk-free rate",
      predicted: 2.14,
      prior: 1.62,
      confidence: 71,
    },
    { code: "SMB", name: "Size", description: "Small minus Big", predicted: -0.87, prior: -0.42, confidence: 63 },
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
    { ticker: "QUAL", fund: fundName("QUAL"), expectedReturn: 3.42, weight: 16 },
    { ticker: "MTUM", fund: fundName("MTUM"), expectedReturn: 3.86, weight: 14 },
    { ticker: "SPLV", fund: fundName("SPLV"), expectedReturn: 1.94, weight: 12 },
    { ticker: "COWZ", fund: fundName("COWZ"), expectedReturn: 3.11, weight: 11 },
    { ticker: "VTV", fund: fundName("VTV"), expectedReturn: 2.28, weight: 10 },
    { ticker: "XLK", fund: fundName("XLK"), expectedReturn: 4.05, weight: 9 },
    { ticker: "XLV", fund: fundName("XLV"), expectedReturn: 2.02, weight: 8 },
    { ticker: "IWY", fund: fundName("IWY"), expectedReturn: 3.55, weight: 8 },
    { ticker: "IEF", fund: fundName("IEF"), expectedReturn: 0.88, weight: 7 },
    { ticker: "GLD", fund: fundName("GLD"), expectedReturn: 1.47, weight: 5 },
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
    factors: mockCurrentRun.factors.map((f) => ({ ...f, predicted: f.prior ?? f.predicted })),
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
    factors: mockCurrentRun.factors.map((f) => ({ ...f, predicted: (f.prior ?? 0) * 0.8 })),
    expected_return: 2.31,
    expected_vol: 11.4,
    expected_sharpe: 0.81,
    realized_return: 1.44,
    benchmark_return: 2.02,
    hit_rate: 50,
  },
];

export interface FactorBetaData {
  current: FactorBetaRow;
  previous: FactorBetaRow[];
  live: boolean;
}

interface RawRow {
  execution_date: string;
  data_type: string;
  ticker_or_factor: string;
  value: number | string | null;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Values stored as fractions (0.0759) are rescaled to percents (7.59). */
function scaleFactor(values: number[]): number {
  const max = Math.max(0, ...values.map((v) => Math.abs(v)));
  return max > 0 && max < 1 ? 100 : 1;
}

function buildRun(date: string, rows: RawRow[]): FactorBetaRow {
  const factorRows = rows.filter((r) => normKey(r.data_type) === "factorreturns");
  const weightRows = rows.filter((r) => normKey(r.data_type) === "portfolioweights");
  const otherRows = rows.filter(
    (r) => !["factorreturns", "portfolioweights"].includes(normKey(r.data_type)),
  );

  const fScale = scaleFactor(
    factorRows.map((r) => toNumber(r.value)).filter((n): n is number => n !== null),
  );

  const factorMap = new Map<string, FactorPrediction>();
  for (const r of factorRows) {
    const meta = FACTOR_META[normKey(r.ticker_or_factor)];
    const value = toNumber(r.value);
    if (value === null) continue;
    const code = meta?.code ?? r.ticker_or_factor;
    factorMap.set(code, {
      code,
      name: meta?.name ?? r.ticker_or_factor,
      description: meta?.description ?? "",
      predicted: value * fScale,
      prior: null,
      confidence: null,
    });
  }
  const factors = Array.from(factorMap.values()).sort((a, b) => {
    const ai = FACTOR_ORDER.indexOf(a.code);
    const bi = FACTOR_ORDER.indexOf(b.code);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const rawWeights = weightRows
    .map((r) => ({ ticker: r.ticker_or_factor.trim().toUpperCase(), value: toNumber(r.value) }))
    .filter((w): w is { ticker: string; value: number } => w.value !== null);
  const weightSum = rawWeights.reduce((s, w) => s + Math.abs(w.value), 0);
  const wScale = weightSum > 0 && weightSum <= 1.5 ? 100 : 1;
  const portfolio: PortfolioHolding[] = rawWeights
    .map((w) => ({
      ticker: w.ticker,
      fund: fundName(w.ticker),
      expectedReturn: null,
      weight: w.value * wScale,
    }))
    .sort((a, b) => b.weight - a.weight);

  let expected_return: number | null = null;
  let expected_vol: number | null = null;
  let expected_sharpe: number | null = null;
  for (const r of otherRows) {
    const key = normKey(r.ticker_or_factor);
    const typeKey = normKey(r.data_type);
    const value = toNumber(r.value);
    if (value === null) continue;
    if (RETURN_KEYS.has(key) || RETURN_KEYS.has(typeKey)) expected_return = value;
    else if (VOL_KEYS.has(key) || VOL_KEYS.has(typeKey)) expected_vol = value;
    else if (SHARPE_KEYS.has(key) || SHARPE_KEYS.has(typeKey)) expected_sharpe = value;
  }
  if (expected_return !== null && Math.abs(expected_return) < 1) expected_return *= 100;
  if (expected_vol !== null && Math.abs(expected_vol) < 1) expected_vol *= 100;

  return {
    id: date,
    as_of_date: date,
    horizon_months: 3,
    regime_summary: "",
    factors,
    portfolio,
    expected_return,
    expected_vol,
    expected_sharpe,
    realized_return: null,
    benchmark_return: null,
    hit_rate: null,
  };
}

/**
 * Reads the last 3 months of runs from `factor_predictions`, newest first.
 * Falls back to modeled placeholder data while the table is empty.
 */
export async function fetchFactorBetaData(): Promise<FactorBetaData> {
  try {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const cutoffISO = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("factor_predictions")
      .select("execution_date, data_type, ticker_or_factor, value")
      .gte("execution_date", cutoffISO)
      .order("execution_date", { ascending: false })
      .limit(5000);
    if (error || !data?.length) throw new Error(error?.message ?? "empty");

    const groups = new Map<string, RawRow[]>();
    for (const r of data as unknown as RawRow[]) {
      const date = String(r.execution_date ?? "").slice(0, 10);
      if (!date) continue;
      const bucket = groups.get(date);
      if (bucket) bucket.push(r);
      else groups.set(date, [r]);
    }

    const dates = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1));
    const runs = dates.map((d) => buildRun(d, groups.get(d)!));
    if (!runs.length) throw new Error("empty");

    // Prior-run comparison for the factor table.
    for (let i = 0; i < runs.length - 1; i++) {
      const prev = runs[i + 1]!;
      for (const f of runs[i]!.factors) {
        const match = prev.factors.find((p) => p.code === f.code);
        f.prior = match ? match.predicted : null;
      }
    }

    return { current: runs[0]!, previous: runs.slice(1), live: true };
  } catch {
    return { current: mockCurrentRun, previous: mockPreviousRuns, live: false };
  }
}
