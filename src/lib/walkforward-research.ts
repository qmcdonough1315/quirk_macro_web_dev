/**
 * Walk-forward research card types + formatters.
 * Data: src/data/walkforward-period-matrix.json (from ETF_Quant_Model period pack).
 */
import matrix from "@/data/walkforward-period-matrix.json";

export type ResearchMetrics = {
  n_periods?: number | null;
  final_value?: number | null;
  total_return?: number | null;
  ann_vol?: number | null;
  sharpe?: number | null;
  max_drawdown?: number | null;
  hit_rate_vs_benchmark?: number | null;
  excess_total_vs_benchmark?: number | null;
  avg_turnover?: number | null;
  total_costs?: number | null;
  cost_bps_one_way?: number | null;
  status?: string | null;
  n_trades?: number | null;
  note?: string | null;
  etf_weight?: number | null;
  options_weight?: number | null;
  coverage?: number | null;
};

export type ResearchPeriod = {
  period_id: string;
  label?: string | null;
  start?: string | null;
  end?: string | null;
  tune?: boolean;
  coverage?: number | null;
  sample?: boolean;
  etf?: ResearchMetrics | null;
  options?: ResearchMetrics | null;
  combined?: ResearchMetrics | null;
  benchmarks?: Record<string, ResearchMetrics> | null;
  error?: string | null;
};

export type ResearchCard = {
  schema_version: number;
  generated_at?: string;
  run_id?: string;
  assumptions: {
    total_capital_usd: number;
    etf_weight: number;
    options_weight: number;
    etf_capital_usd?: number;
    options_book_usd?: number;
    options_book_includes_cash_reserve?: boolean;
    etf_cost_bps_one_way?: number;
    rebalance_step_months?: number;
    risk_free_rate?: number;
    weighting?: string;
    headline_peer?: string;
    note?: string;
    sample?: boolean;
  };
  benchmarks: Record<
    string,
    { label: string; weights: Record<string, number>; role: string }
  >;
  periods: ResearchPeriod[];
};

export function getWalkforwardResearchCard(): ResearchCard {
  return matrix as ResearchCard;
}

export function isSampleCard(card: ResearchCard): boolean {
  if (card.assumptions?.sample) return true;
  return card.periods.some((p) => p.sample || p.options?.status === "sample");
}

export const pct = (n: number | null | undefined, digits = 2) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
};

export const num = (n: number | null | undefined, digits = 2) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
};

export const usd = (n: number | null | undefined) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
};

export function toneForSigned(
  n: number | null | undefined,
): "positive" | "negative" | "muted" {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return "muted";
  return n > 0 ? "positive" : "negative";
}
