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
            Combined book vs peer on each frozen window. Options column shows sleeve return when IV
            history covers the window; otherwise <span className="font-mono">uncovered</span> and
            the combined book uses 100% ETF.
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
          <div className="mt-4 space-y-4 text-sm text-muted-foreground">
            <p>
              Live paper since inception lives on Summary / ETF Model. This tab is the{" "}
              <em>historical</em> walk-forward pack across frozen market regimes.
            </p>

            <div>
              <p className="font-display text-xs font-semibold tracking-tight text-foreground">
                Column headers
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>
                  <span className="text-foreground">Period / Story</span> — frozen window id and
                  what market regime it stresses.
                </li>
                <li>
                  <span className="text-foreground">Combined</span> — total return of the $100k
                  research book over that window.
                </li>
                <li>
                  <span className="text-foreground">vs peer</span> — excess total return vs{" "}
                  <span className="font-mono text-foreground">{peer}</span> on the same 3M clock.
                </li>
                <li>
                  <span className="text-foreground">Sharpe</span> — annualized Sharpe of the
                  combined period returns (rf ≈ 3%).
                </li>
                <li>
                  <span className="text-foreground">MDD</span> — max drawdown: worst peak-to-trough
                  drop on compounded wealth.
                </li>
                <li>
                  <span className="text-foreground">Hit vs peer</span> — share of holding windows
                  where the combined book beat the peer.
                </li>
                <li>
                  <span className="text-foreground">Options</span> — options-book return when IV
                  history covers the window; otherwise{" "}
                  <span className="font-mono text-foreground">uncovered</span>.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-display text-xs font-semibold tracking-tight text-foreground">
                Scenarios
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>
                  <span className="font-mono text-foreground">FULL</span> — headline span after most
                  modern ETF listings.
                </li>
                <li>
                  <span className="font-mono text-foreground">COVID</span> — 2020 crash and rebound.
                </li>
                <li>
                  <span className="font-mono text-foreground">BEAR_22</span> — 2022 inflation / rates
                  bear.
                </li>
                <li>
                  <span className="font-mono text-foreground">BULL_23_24</span> — narrow leadership /
                  calmer vol regime.
                </li>
                <li>
                  <span className="font-mono text-foreground">HOLD_OUT</span> — locked report card;
                  do not tune model knobs on it after freeze.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-display text-xs font-semibold tracking-tight text-foreground">
                Book construction
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>
                  When IV history covers the window, Combined is 50% ETF sleeve + 50% options book
                  (margin reserve counted inside the options book).
                </li>
                <li>
                  When a period has <strong>no usable IV overlap</strong>, we do not invent IV and
                  we do not force cash drag — Combined assumes <strong>100% invested in the ETF
                  sleeve</strong>, and Options is labeled{" "}
                  <span className="font-mono text-foreground">uncovered</span>.
                </li>
              </ul>
            </div>
          </div>
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
