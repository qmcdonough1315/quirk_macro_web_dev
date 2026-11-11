/**
 * Reads the paper book published by ETF_Quant_Model.
 * The ledger itself runs in that repo and upserts `paper_portfolio` rows.
 */

import { supabase } from "./supabase";
import { STRATEGY_INCEPTION_DATE } from "./paper-portfolio-rules";

export interface PaperWeeklyPoint {
  runDate: string;
  fillDate: string;
  contributed: number;
  strategyValue: number;
  strategyCostBasis: number;
  strategyReturnPct: number;
  vooValue: number;
  vooCostBasis: number;
  vooReturnPct: number;
  alphaPct: number;
}

export interface PaperTrade {
  date: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  amount: number;
  reason: string;
  strategy: "factor" | "voo";
}

export interface PaperPortfolioSnapshot {
  asOf: string;
  inceptionDate: string;
  live: boolean;
  runCount: number;
  totalContributed: number;
  strategy: {
    marketValue: number;
    costBasis: number;
    returnPct: number;
    cash: number;
  };
  voo: {
    marketValue: number;
    costBasis: number;
    returnPct: number;
    cash: number;
  };
  tax: {
    cumulativeRealizedGains: number;
    cumulativeRealizedLosses: number;
    netTaxable: number;
    cumulativeUnrealizedGains: number;
    cumulativeUnrealizedLosses: number;
  };
  openLots: number;
  recentTrades: PaperTrade[];
  weeklySeries: PaperWeeklyPoint[];
  notes: string[];
}

const UNAVAILABLE =
  "The paper book is published by the weekly model job and is not available yet.";

function emptySnapshot(note: string): PaperPortfolioSnapshot {
  return {
    asOf: new Date().toISOString().slice(0, 10),
    inceptionDate: STRATEGY_INCEPTION_DATE,
    live: false,
    runCount: 0,
    totalContributed: 0,
    strategy: { marketValue: 0, costBasis: 0, returnPct: 0, cash: 0 },
    voo: { marketValue: 0, costBasis: 0, returnPct: 0, cash: 0 },
    tax: {
      cumulativeRealizedGains: 0,
      cumulativeRealizedLosses: 0,
      netTaxable: 0,
      cumulativeUnrealizedGains: 0,
      cumulativeUnrealizedLosses: 0,
    },
    openLots: 0,
    recentTrades: [],
    weeklySeries: [],
    notes: [note],
  };
}

function num(map: Map<string, number>, key: string): number {
  return map.get(key) ?? 0;
}

export async function readPublishedPaperPortfolio(): Promise<PaperPortfolioSnapshot> {
  const { data, error } = await supabase
    .from("paper_portfolio")
    .select("execution_date, ticker_or_factor, value")
    .eq("data_type", "paper_summary")
    .order("execution_date", { ascending: true })
    .limit(2000);

  if (error || !data?.length) return emptySnapshot(UNAVAILABLE);

  const byDate = new Map<string, Map<string, number>>();
  for (const row of data) {
    const date = String(row.execution_date ?? "").slice(0, 10);
    const key = String(row.ticker_or_factor ?? "");
    const value = Number(row.value);
    if (!date || !key || !Number.isFinite(value)) continue;
    const bucket = byDate.get(date) ?? new Map<string, number>();
    bucket.set(key, value);
    byDate.set(date, bucket);
  }

  const dates = Array.from(byDate.keys()).sort();
  const latestDate = dates.at(-1);
  const latest = latestDate ? byDate.get(latestDate) : undefined;
  if (!latestDate || !latest) return emptySnapshot(UNAVAILABLE);

  const weeklySeries: PaperWeeklyPoint[] = dates.map((date) => {
    const row = byDate.get(date)!;
    const strategyReturn = num(row, "strategy_return_pct");
    const vooReturn = num(row, "voo_return_pct");
    return {
      runDate: date,
      fillDate: date,
      contributed: num(row, "total_contributed"),
      strategyValue: num(row, "strategy_value"),
      strategyCostBasis: num(row, "strategy_cost_basis"),
      strategyReturnPct: strategyReturn,
      vooValue: num(row, "voo_value"),
      vooCostBasis: num(row, "voo_cost_basis"),
      vooReturnPct: vooReturn,
      alphaPct: strategyReturn - vooReturn,
    };
  });

  return {
    asOf: latestDate,
    inceptionDate: STRATEGY_INCEPTION_DATE,
    live: true,
    runCount: dates.length,
    totalContributed: num(latest, "total_contributed"),
    strategy: {
      marketValue: num(latest, "strategy_value"),
      costBasis: num(latest, "strategy_cost_basis"),
      returnPct: num(latest, "strategy_return_pct"),
      cash: 0,
    },
    voo: {
      marketValue: num(latest, "voo_value"),
      costBasis: num(latest, "voo_cost_basis"),
      returnPct: num(latest, "voo_return_pct"),
      cash: 0,
    },
    tax: {
      cumulativeRealizedGains: num(latest, "cum_realized_gains"),
      cumulativeRealizedLosses: num(latest, "cum_realized_losses"),
      netTaxable: num(latest, "net_taxable"),
      cumulativeUnrealizedGains: num(latest, "cum_unrealized_gains"),
      cumulativeUnrealizedLosses: num(latest, "cum_unrealized_losses"),
    },
    openLots: num(latest, "open_factor_lots"),
    recentTrades: [],
    weeklySeries,
    notes: [],
  };
}
