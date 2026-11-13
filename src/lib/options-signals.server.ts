/**
 * Live options-desk inputs from Supabase.
 * IV Rank: option_iv_rank_latest
 * Composite: factor_predictions data_type=options_composite (latest run)
 * Never fabricates missing values.
 */

import { supabase } from "./supabase";
import {
  PHASE1_OPTIONABLE_ETFS,
  buildOptionsSignal,
  type OptionsSignal,
} from "./options-sleeve-rules";

export interface LiveIvRankRow {
  ticker: string;
  ivRank: number;
  asOfDate: string;
  currentIv: number | null;
  nObs: number | null;
  source: string | null;
}

export interface LiveOptionsSignal {
  ticker: string;
  compositeScore: number | null;
  ivRank: number | null;
  ivAsOf: string | null;
  compositeAsOf: string | null;
  signal: OptionsSignal | null;
  ready: boolean;
  skipReason: string | null;
}

export interface LiveOptionsSignalBoard {
  live: boolean;
  asOf: string;
  rows: LiveOptionsSignal[];
  ivRanks: LiveIvRankRow[];
  notes: string[];
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchLiveIvRanks(
  tickers: readonly string[] = PHASE1_OPTIONABLE_ETFS,
): Promise<{ rows: LiveIvRankRow[]; notes: string[] }> {
  const notes: string[] = [];
  const wanted = new Set(tickers.map((t) => t.toUpperCase()));
  const { data, error } = await supabase.from("option_iv_rank_latest").select(
    "ticker, iv_rank, as_of_date, current_iv, n_obs, source",
  );
  if (error) {
    return { rows: [], notes: [`IV Rank view unavailable: ${error.message}`] };
  }
  const rows: LiveIvRankRow[] = [];
  for (const raw of data ?? []) {
    const ticker = String(raw.ticker ?? "").toUpperCase();
    if (!wanted.has(ticker)) continue;
    const ivRank = num(raw.iv_rank);
    if (ivRank == null) continue;
    rows.push({
      ticker,
      ivRank,
      asOfDate: String(raw.as_of_date ?? ""),
      currentIv: num(raw.current_iv),
      nObs: num(raw.n_obs),
      source: raw.source == null ? null : String(raw.source),
    });
  }
  if (!rows.length) notes.push("No live IV Rank rows for Phase 1 underlyings.");
  return { rows, notes };
}

export async function fetchLatestOptionsComposites(
  tickers: readonly string[] = PHASE1_OPTIONABLE_ETFS,
): Promise<{
  byTicker: Map<string, { score: number; asOf: string }>;
  notes: string[];
}> {
  const notes: string[] = [];
  const wanted = new Set(tickers.map((t) => t.toUpperCase()));
  const { data, error } = await supabase
    .from("factor_predictions")
    .select("execution_date, ticker_or_factor, value")
    .eq("data_type", "options_composite")
    .order("execution_date", { ascending: false })
    .limit(500);
  if (error) {
    return {
      byTicker: new Map(),
      notes: [`options_composite unavailable: ${error.message}`],
    };
  }
  if (!data?.length) {
    return {
      byTicker: new Map(),
      notes: [
        "No options_composite rows yet — run the weekly ETF_Quant_Model export after merging the composite plumbing.",
      ],
    };
  }
  const latestDate = String(data[0]?.execution_date ?? "").slice(0, 10);
  const byTicker = new Map<string, { score: number; asOf: string }>();
  for (const raw of data) {
    const asOf = String(raw.execution_date ?? "").slice(0, 10);
    if (asOf !== latestDate) continue;
    const ticker = String(raw.ticker_or_factor ?? "").toUpperCase();
    if (!wanted.has(ticker)) continue;
    const score = num(raw.value);
    if (score == null) continue;
    byTicker.set(ticker, { score, asOf });
  }
  if (!byTicker.size) {
    notes.push(`options_composite run ${latestDate} has no Phase 1 tickers.`);
  }
  return { byTicker, notes };
}

export async function buildLiveOptionsSignalBoard(
  tickers: readonly string[] = PHASE1_OPTIONABLE_ETFS,
): Promise<LiveOptionsSignalBoard> {
  const notes: string[] = [];
  const [iv, composites] = await Promise.all([
    fetchLiveIvRanks(tickers),
    fetchLatestOptionsComposites(tickers),
  ]);
  notes.push(...iv.notes, ...composites.notes);

  const ivByTicker = new Map(iv.rows.map((r) => [r.ticker, r]));
  const rows: LiveOptionsSignal[] = tickers.map((raw) => {
    const ticker = raw.toUpperCase();
    const ivRow = ivByTicker.get(ticker);
    const comp = composites.byTicker.get(ticker);
    if (!ivRow) {
      return {
        ticker,
        compositeScore: comp?.score ?? null,
        ivRank: null,
        ivAsOf: null,
        compositeAsOf: comp?.asOf ?? null,
        signal: null,
        ready: false,
        skipReason: "Live IV Rank missing.",
      };
    }
    if (!comp) {
      return {
        ticker,
        compositeScore: null,
        ivRank: ivRow.ivRank,
        ivAsOf: ivRow.asOfDate,
        compositeAsOf: null,
        signal: null,
        ready: false,
        skipReason: "Live options_composite missing.",
      };
    }
    const signal = buildOptionsSignal(ticker, comp.score, ivRow.ivRank);
    return {
      ticker,
      compositeScore: comp.score,
      ivRank: ivRow.ivRank,
      ivAsOf: ivRow.asOfDate,
      compositeAsOf: comp.asOf,
      signal,
      ready: signal.structure !== "skip_low_iv",
      skipReason: signal.structure === "skip_low_iv" ? signal.rationale : null,
    };
  });

  const readyCount = rows.filter((r) => r.ready).length;
  notes.unshift(
    `Live board: ${readyCount} ready of ${rows.length} Phase 1 names (IVR live=${iv.rows.length}, composites=${composites.byTicker.size}).`,
  );

  return {
    live: iv.rows.length > 0,
    asOf: new Date().toISOString(),
    rows,
    ivRanks: iv.rows,
    notes,
  };
}

export function readySignalsForPropose(board: LiveOptionsSignalBoard): Array<{
  ticker: string;
  compositeScore: number;
  ivRank: number;
}> {
  return board.rows
    .filter(
      (r) =>
        r.ready &&
        r.compositeScore != null &&
        r.ivRank != null &&
        Number.isFinite(r.compositeScore) &&
        Number.isFinite(r.ivRank),
    )
    .map((r) => ({
      ticker: r.ticker,
      compositeScore: r.compositeScore as number,
      ivRank: r.ivRank as number,
    }));
}
