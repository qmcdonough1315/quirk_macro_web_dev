import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  ChevronDown,
  History,
  PieChart,
  Sigma,
} from "lucide-react";

import {
  fetchFactorBetaData,
  type FactorBetaRow,
  type PortfolioHolding,
} from "@/lib/factor-beta";

const pct = (n: number, digits = 2) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

function DeltaBadge({ value }: { value: number }) {
  const good = value >= 0;
  const Icon = good ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs tabular-nums ${
        good ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
      }`}
    >
      <Icon className="size-3.5" />
      {pct(value)}
    </span>
  );
}

function HoldingsTable({ holdings }: { holdings: PortfolioHolding[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="label-caps py-2.5 pr-4">Ticker</th>
            <th className="label-caps py-2.5 pr-4">Fund name</th>
            <th className="label-caps py-2.5 pr-4 text-right">Exp. return</th>
            <th className="label-caps py-2.5 text-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.ticker} className="border-b border-border/50 last:border-0">
              <td className="py-3 pr-4 font-mono text-sm font-medium text-foreground">{h.ticker}</td>
              <td className="py-3 pr-4 text-muted-foreground">{h.fund}</td>
              <td className="py-3 pr-4 text-right font-mono tabular-nums">
                <span className={h.expectedReturn >= 0 ? "text-positive" : "text-negative"}>
                  {pct(h.expectedReturn)}
                </span>
              </td>
              <td className="py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-accent/70"
                      style={{ width: `${Math.min(100, h.weight * 5)}%` }}
                    />
                  </span>
                  <span className="w-12 font-mono tabular-nums text-foreground">
                    {h.weight.toFixed(1)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviousRunCard({ run }: { run: FactorBetaRow }) {
  const [open, setOpen] = useState(false);
  const alpha =
    run.realized_return !== null && run.benchmark_return !== null
      ? run.realized_return - run.benchmark_return
      : null;

  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-4 px-4 py-3 text-left"
      >
        <span className="font-mono text-sm tabular-nums text-foreground">{run.as_of_date}</span>
        <span className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span>
            Predicted{" "}
            <span className="font-mono text-foreground">{pct(run.expected_return)}</span>
          </span>
          <span>
            Realized{" "}
            <span className="font-mono text-foreground">
              {run.realized_return === null ? "—" : pct(run.realized_return)}
            </span>
          </span>
          <span>
            Benchmark{" "}
            <span className="font-mono text-foreground">
              {run.benchmark_return === null ? "—" : pct(run.benchmark_return)}
            </span>
          </span>
          <span>
            Hit rate{" "}
            <span className="font-mono text-foreground">
              {run.hit_rate === null ? "—" : `${run.hit_rate.toFixed(0)}%`}
            </span>
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {alpha !== null ? <DeltaBadge value={alpha} /> : null}
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open ? (
        <div className="border-t border-border/70 px-4 py-4">
          <p className="mb-4 text-sm text-muted-foreground">{run.regime_summary}</p>
          <HoldingsTable holdings={run.portfolio} />
        </div>
      ) : null}
    </div>
  );
}

export function FactorBetaTab() {
  const { data, isPending } = useQuery({
    queryKey: ["factor-beta-predictions"],
    queryFn: fetchFactorBetaData,
    staleTime: 5 * 60_000,
  });

  const current = data?.current;
  const stats = current
    ? [
        { label: "Total expected return", value: pct(current.expected_return), tone: "signed" },
        { label: "Expected volatility", value: `${current.expected_vol.toFixed(1)}%`, tone: "flat" },
        { label: "Expected Sharpe ratio", value: current.expected_sharpe.toFixed(2), tone: "flat" },
        { label: "Hold period", value: `${current.horizon_months} months`, tone: "flat" },
      ]
    : [];

  return (
    <div className="relative space-y-6 pb-16">
      <section className="panel p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <Brain className="size-4 text-accent" />
          <h2 className="font-display text-base font-semibold tracking-tight">
            Current Regime Read — Fama-French &amp; Carhart
          </h2>
          <span className="label-caps ml-auto">
            {isPending ? "Loading" : data?.live ? "Live model run" : "Placeholder run"}
            {current ? ` · ${current.as_of_date}` : ""}
          </span>
        </div>
        {isPending ? (
          <div className="h-20 animate-pulse rounded-lg bg-secondary/40" />
        ) : (
          <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
            {current?.regime_summary}
          </p>
        )}
      </section>

      <section className="panel p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <Sigma className="size-4 text-accent" />
          <h2 className="font-display text-base font-semibold tracking-tight">
            Predicted 3-Month Factor Excess Returns
          </h2>
        </div>
        {isPending ? (
          <div className="h-56 animate-pulse rounded-lg bg-secondary/40" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps py-2.5 pr-4">Factor</th>
                  <th className="label-caps py-2.5 pr-4">Definition</th>
                  <th className="label-caps py-2.5 pr-4 text-right">Predicted</th>
                  <th className="label-caps py-2.5 pr-4 text-right">Prior run</th>
                  <th className="label-caps py-2.5 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {(current?.factors ?? []).map((f) => (
                  <tr key={f.code} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pr-4">
                      <span className="font-display font-medium text-foreground">{f.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{f.code}</span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{f.description}</td>
                    <td className="py-3 pr-4 text-right">
                      <DeltaBadge value={f.predicted} />
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-muted-foreground">
                      {pct(f.prior)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                          <span
                            className="block h-full rounded-full bg-accent/70"
                            style={{ width: `${f.confidence}%` }}
                          />
                        </span>
                        <span className="w-9 font-mono tabular-nums text-foreground">
                          {f.confidence}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <PieChart className="size-4 text-accent" />
          <h2 className="font-display text-base font-semibold tracking-tight">
            10-ETF Factor Portfolio — 3-Month Hold
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isPending
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary/40" />
              ))
            : stats.map((s) => (
                <div key={s.label} className="rounded-lg border border-border/70 bg-secondary/20 p-4">
                  <p className="label-caps">{s.label}</p>
                  <p
                    className={`mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight ${
                      s.tone === "signed" ? "text-positive" : "text-foreground"
                    }`}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
        </div>

        <div className="mt-6">
          {isPending ? (
            <div className="h-72 animate-pulse rounded-lg bg-secondary/40" />
          ) : (
            <HoldingsTable holdings={current?.portfolio ?? []} />
          )}
        </div>
      </section>

      <section className="panel p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <History className="size-4 text-accent" />
          <h2 className="font-display text-base font-semibold tracking-tight">
            Previous Week Performance &amp; Asset Selections
          </h2>
        </div>
        {isPending ? (
          <div className="h-24 animate-pulse rounded-lg bg-secondary/40" />
        ) : data?.previous.length ? (
          <div className="space-y-3">
            {data.previous.map((run) => (
              <PreviousRunCard key={run.id} run={run} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No prior model runs recorded yet.
          </p>
        )}
      </section>

      <p className="pointer-events-none sticky bottom-4 z-10 ml-auto w-fit rounded-md border border-border/70 bg-background/85 px-3 py-2 text-right text-xs text-muted-foreground backdrop-blur">
        Disclaimer: Not Investment Advice. For informational and educational purposes only.
      </p>
    </div>
  );
}
