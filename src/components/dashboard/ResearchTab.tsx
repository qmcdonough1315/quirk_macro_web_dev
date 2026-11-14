import { FlaskConical, Info } from "lucide-react";

import {
  getWalkforwardResearchCard,
  isSampleCard,
  num,
  pct,
  toneForSigned,
  usd,
  type ResearchPeriod,
} from "@/lib/walkforward-research";

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "positive" | "negative" | "muted";
}) {
  const valueClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
      <p className="label-caps">{label}</p>
      <p
        className={`mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function optionsCell(period: ResearchPeriod): string {
  const opt = period.options;
  if (!opt) return "—";
  if (opt.status === "uncovered" || opt.status === "skipped" || opt.status === "error") {
    return opt.status;
  }
  if (opt.status === "sample") return "sample";
  return pct(opt.total_return);
}

export function ResearchTab() {
  const card = getWalkforwardResearchCard();
  const sample = isSampleCard(card);
  const a = card.assumptions;
  const peer = a.headline_peer ?? "VOO_JEPI_50_50";
  const periods = card.periods.filter((p) => !p.error);

  const headline =
    periods.find((p) => p.period_id === "FULL") ?? periods[0] ?? null;
  const vsPeer = headline?.combined?.excess_total_vs_benchmark ?? null;

  return (
    <div className="space-y-8">
      <section className="panel space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent/12 ring-1 ring-accent/30">
            <FlaskConical className="size-5 text-accent" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Walk-forward research card
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Expected performance across frozen market windows for a{" "}
              {usd(a.total_capital_usd)} book at{" "}
              {Math.round((a.etf_weight ?? 0.5) * 100)}/
              {Math.round((a.options_weight ?? 0.5) * 100)} ETF model / options book
              (margin reserve counted inside the options book). Headline peer:{" "}
              <span className="font-mono text-foreground">{peer}</span>.
            </p>
          </div>
        </div>

        {sample ? (
          <div className="flex gap-2 rounded-lg border border-amber-600/50 bg-amber-500/15 px-3 py-2 text-sm text-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <p>
              Showing a <strong>schema sample</strong> with illustrative numbers. Replace{" "}
              <code className="font-mono text-xs">src/data/walkforward-period-matrix.json</code>{" "}
              with output from{" "}
              <code className="font-mono text-xs">scripts/run_walkforward_period_pack.py</code>{" "}
              for live research results.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Book"
            value={usd(a.total_capital_usd)}
            note={`${Math.round((a.etf_weight ?? 0.5) * 100)}/${Math.round((a.options_weight ?? 0.5) * 100)} ETF / options`}
          />
          <Metric
            label="ETF costs"
            value={`${a.etf_cost_bps_one_way ?? "—"} bps`}
            note={`${a.rebalance_step_months ?? 3}M step · ${a.weighting ?? "Target_Weight"}`}
          />
          <Metric
            label={headline ? `${headline.period_id} combined` : "Combined"}
            value={pct(headline?.combined?.total_return)}
            tone={toneForSigned(headline?.combined?.total_return)}
            note={headline?.label ?? undefined}
          />
          <Metric
            label={`vs ${peer}`}
            value={pct(vsPeer)}
            tone={toneForSigned(vsPeer)}
            note="Excess total return on headline window"
          />
        </div>

        {a.note ? <p className="text-xs text-muted-foreground">{a.note}</p> : null}
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="border-b border-border/70 px-5 py-4 sm:px-6">
          <h3 className="font-display text-sm font-semibold tracking-tight">
            Period matrix
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Combined book vs peer on each frozen window. Options column shows sleeve return when
            IV history covers the window; otherwise uncovered / cash-drag.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left">
                <th className="label-caps px-5 py-3 sm:px-6">Period</th>
                <th className="label-caps py-3 pr-4">Story</th>
                <th className="label-caps py-3 pr-4 text-right">Combined</th>
                <th className="label-caps py-3 pr-4 text-right">vs peer</th>
                <th className="label-caps py-3 pr-4 text-right">Sharpe</th>
                <th className="label-caps py-3 pr-4 text-right">MDD</th>
                <th className="label-caps py-3 pr-4 text-right">Hit vs peer</th>
                <th className="label-caps py-3 pr-5 text-right sm:pr-6">Options</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const comb = p.combined;
                const excess = comb?.excess_total_vs_benchmark ?? null;
                return (
                  <tr key={p.period_id} className="border-b border-border/40 last:border-0">
                    <td className="px-5 py-3.5 font-mono text-xs sm:px-6">{p.period_id}</td>
                    <td className="max-w-[220px] py-3.5 pr-4 text-muted-foreground">
                      {p.label}
                      {!p.tune ? (
                        <span className="ml-2 rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground">
                          locked
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={`py-3.5 pr-4 text-right font-mono tabular-nums ${
                        toneForSigned(comb?.total_return) === "positive"
                          ? "text-positive"
                          : toneForSigned(comb?.total_return) === "negative"
                            ? "text-negative"
                            : ""
                      }`}
                    >
                      {pct(comb?.total_return)}
                    </td>
                    <td
                      className={`py-3.5 pr-4 text-right font-mono tabular-nums ${
                        toneForSigned(excess) === "positive"
                          ? "text-positive"
                          : toneForSigned(excess) === "negative"
                            ? "text-negative"
                            : ""
                      }`}
                    >
                      {pct(excess)}
                    </td>
                    <td className="py-3.5 pr-4 text-right font-mono tabular-nums">
                      {num(comb?.sharpe)}
                    </td>
                    <td className="py-3.5 pr-4 text-right font-mono tabular-nums text-muted-foreground">
                      {pct(comb?.max_drawdown)}
                    </td>
                    <td className="py-3.5 pr-4 text-right font-mono tabular-nums">
                      {pct(comb?.hit_rate_vs_benchmark, 0)}
                    </td>
                    <td className="py-3.5 pr-5 text-right font-mono tabular-nums text-muted-foreground sm:pr-6">
                      {optionsCell(p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="font-display text-sm font-semibold tracking-tight">Benchmarks</h3>
          <ul className="mt-4 space-y-3">
            {Object.entries(card.benchmarks).map(([id, spec]) => (
              <li key={id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-mono text-xs text-foreground">{id}</p>
                  <p className="text-muted-foreground">{spec.label}</p>
                </div>
                <span className="label-caps shrink-0 text-muted-foreground">{spec.role}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5">
          <h3 className="font-display text-sm font-semibold tracking-tight">
            How to read this
          </h3>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Live paper since inception lives on Summary / ETF Model. This tab is the{" "}
              <em>historical</em> walk-forward pack across market regimes.
            </li>
            <li>
              Combined return is 50% ETF sleeve + 50% options book on the same calendar windows.
            </li>
            <li>
              When options IV history does not cover a stress window, the options leg is treated as
              idle cash (0%) and labeled uncovered — we do not invent IV.
            </li>
            <li>
              <span className="font-mono text-foreground">HOLD_OUT</span> is locked for reporting;
              do not tune model knobs on it after freeze.
            </li>
          </ul>
          {card.generated_at ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Generated {card.generated_at}
              {card.run_id ? ` · run ${card.run_id}` : ""}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
