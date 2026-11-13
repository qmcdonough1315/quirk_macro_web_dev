import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Shield, Target, Waves } from "lucide-react";

import { getLiveOptionsSignalBoard } from "@/lib/alpaca.functions";
import {
  CASH_MARGIN_RESERVE_USD,
  OPTIONS_DTE_MAX,
  OPTIONS_DTE_MIN,
  OPTIONS_IVR_MIN,
  OPTIONS_IVR_PREFERRED,
  OPTIONS_PAPER_CAPITAL_USD,
  OPTIONS_PROFIT_TAKE_PCT,
  OPTIONS_STOP_MULTIPLE,
  PHASE1_OPTIONABLE_ETFS,
  maxNameMarginUsd,
  maxSectorMarginUsd,
} from "@/lib/options-sleeve-rules";

const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export function OptionsSleevePanel() {
  const boardFn = useServerFn(getLiveOptionsSignalBoard);
  const board = useQuery({
    queryKey: ["options-live-signal-board"],
    queryFn: () => boardFn(),
    staleTime: 60_000,
    retry: 1,
  });

  return (
    <section className="panel p-6">
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <Waves className="size-4 text-accent" />
        <h2 className="font-display text-base font-semibold tracking-tight">
          Options / Vol Sleeve — {usd(OPTIONS_PAPER_CAPITAL_USD)} Paper
        </h2>
        <span className="label-caps ml-auto">Phase 1 · rich IVR only · skip cheap</span>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
        Separate from the long-only ETF book. Live IV Rank from{" "}
        <span className="font-mono text-[11px]">option_iv_rank_latest</span> plus published{" "}
        <span className="font-mono text-[11px]">options_composite</span> pick structures. Missing
        inputs stay blank — no demo scores. {usd(CASH_MARGIN_RESERVE_USD)} cash-engine reserve
        covers margin stress; options buying power stays ≤ {usd(OPTIONS_PAPER_CAPITAL_USD)}.
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
          <div className="flex items-center gap-2">
            <Target className="size-3.5 text-accent" />
            <p className="label-caps">Name / sector caps</p>
          </div>
          <p className="mt-2 font-display text-xl font-semibold tabular-nums">
            {usd(maxNameMarginUsd())} / {usd(maxSectorMarginUsd())}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Max margin per name / sector</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
          <div className="flex items-center gap-2">
            <Shield className="size-3.5 text-accent" />
            <p className="label-caps">IV / DTE gates</p>
          </div>
          <p className="mt-2 font-display text-xl font-semibold tabular-nums">
            IVR ≥ {OPTIONS_IVR_MIN}% · {OPTIONS_DTE_MIN}–{OPTIONS_DTE_MAX} DTE
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Prefer IVR &gt; {OPTIONS_IVR_PREFERRED}%
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
          <div className="flex items-center gap-2">
            <Waves className="size-3.5 text-accent" />
            <p className="label-caps">Exits</p>
          </div>
          <p className="mt-2 font-display text-xl font-semibold tabular-nums">
            {(OPTIONS_PROFIT_TAKE_PCT * 100).toFixed(0)}% TP · {OPTIONS_STOP_MULTIPLE}× stop
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Of credit received; no naked shorts</p>
        </div>
      </div>

      <p className="label-caps mb-2">Phase 1 underlyings</p>
      <p className="mb-5 font-mono text-xs text-muted-foreground">
        {PHASE1_OPTIONABLE_ETFS.join(" · ")}
      </p>

      <p className="label-caps mb-2">Live signal board</p>
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border/70 bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Ticker</th>
              <th className="px-3 py-2.5 font-medium text-right">Score</th>
              <th className="px-3 py-2.5 font-medium text-right">IVR</th>
              <th className="px-3 py-2.5 font-medium">Structure</th>
              <th className="px-3 py-2.5 font-medium">Rationale</th>
            </tr>
          </thead>
          <tbody>
            {board.isPending ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground">
                  Loading live board…
                </td>
              </tr>
            ) : (board.data?.rows.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground">
                  Live board unavailable.
                </td>
              </tr>
            ) : (
              board.data!.rows.map((row) => (
                <tr key={row.ticker} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2.5 font-mono font-semibold">{row.ticker}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {row.compositeScore == null ? "—" : row.compositeScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {row.ivRank == null ? "—" : `${row.ivRank.toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {row.signal?.structure ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.signal?.rationale ?? row.skipReason ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {board.data?.notes?.length ? (
        <p className="mt-3 text-xs text-muted-foreground">{board.data.notes.join(" · ")}</p>
      ) : null}
    </section>
  );
}
