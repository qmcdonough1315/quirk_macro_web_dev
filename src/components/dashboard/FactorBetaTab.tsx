import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  ChevronDown,
  History,
  Landmark,
  PieChart,
  Scale,
  Sigma,
} from "lucide-react";

import { fetchFactorBetaData, type FactorBetaRow, type PortfolioHolding } from "@/lib/factor-beta";
import { getPaperPortfolio, type PaperPortfolioSnapshot } from "@/lib/paper-portfolio.functions";
import { WEEKLY_CONTRIBUTION_USD } from "@/lib/paper-portfolio-rules";
import { RegimeRead } from "@/components/dashboard/RegimeRead";

const pct = (n: number | null | undefined, digits = 2) =>
  typeof n === "number" && Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(digits)}%` : "—";

const plain = (n: number | null | undefined, digits = 2, suffix = "") =>
  typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(digits)}${suffix}` : "—";

const usd = (n: number | null | undefined, digits = 0) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";

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
  const showReturn = holdings.some((h) => typeof h.expectedReturn === "number");
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="label-caps py-2.5 pr-4">Ticker</th>
            <th className="label-caps py-2.5 pr-4">Fund name</th>
            {showReturn ? <th className="label-caps py-2.5 pr-4 text-right">Exp. return</th> : null}
            <th className="label-caps py-2.5 text-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.ticker} className="border-b border-border/50 last:border-0">
              <td className="py-3 pr-4 font-mono text-sm font-medium text-foreground">
                {h.ticker}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">{h.fund || "—"}</td>
              {showReturn ? (
                <td className="py-3 pr-4 text-right font-mono tabular-nums">
                  <span
                    className={(h.expectedReturn ?? 0) >= 0 ? "text-positive" : "text-negative"}
                  >
                    {pct(h.expectedReturn)}
                  </span>
                </td>
              ) : null}
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
            Predicted <span className="font-mono text-foreground">{pct(run.expected_return)}</span>
          </span>
          {run.realized_return !== null ? (
            <span>
              Realized <span className="font-mono text-foreground">{pct(run.realized_return)}</span>
            </span>
          ) : null}
          {run.benchmark_return !== null ? (
            <span>
              Benchmark{" "}
              <span className="font-mono text-foreground">{pct(run.benchmark_return)}</span>
            </span>
          ) : null}
          {run.hit_rate !== null ? (
            <span>
              Hit rate <span className="font-mono text-foreground">{run.hit_rate.toFixed(0)}%</span>
            </span>
          ) : null}
          <span>
            Holdings <span className="font-mono text-foreground">{run.portfolio.length}</span>
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
          {run.regime_summary ? (
            <p className="mb-4 text-sm text-muted-foreground">{run.regime_summary}</p>
          ) : null}
          {run.factors.length ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {run.factors.map((f) => (
                <span
                  key={f.code}
                  className="rounded-md border border-border/70 px-2 py-1 font-mono text-xs tabular-nums"
                >
                  <span className="text-muted-foreground">{f.code}</span>{" "}
                  <span className={f.predicted >= 0 ? "text-positive" : "text-negative"}>
                    {pct(f.predicted)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <HoldingsTable holdings={run.portfolio} />
        </div>
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone = "flat",
}: {
  label: string;
  value: string;
  tone?: "flat" | "signed" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "signed"
          ? "text-positive"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
      <p className="label-caps">{label}</p>
      <p
        className={`mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function PaperPortfolioPanels({
  paper,
  isPending,
}: {
  paper: PaperPortfolioSnapshot | undefined;
  isPending: boolean;
}) {
  const strategyTone =
    (paper?.strategy.returnPct ?? 0) >= 0 ? ("positive" as const) : ("negative" as const);
  const vooTone = (paper?.voo.returnPct ?? 0) >= 0 ? ("positive" as const) : ("negative" as const);
  const netTax = paper?.tax.netTaxable ?? 0;

  return (
    <>
      <section className="panel p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <Landmark className="size-4 text-accent" />
          <h2 className="font-display text-base font-semibold tracking-tight">
            Paper Strategy — ${WEEKLY_CONTRIBUTION_USD.toLocaleString()} Weekly DCA
          </h2>
          <span className="label-caps ml-auto">
            {isPending
              ? "Loading"
              : paper?.live
                ? `Simulated · ${paper.runCount} runs · as of ${paper.asOf}`
                : "Awaiting model history"}
          </span>
        </div>
        <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
          Each model run allocates ${WEEKLY_CONTRIBUTION_USD.toLocaleString()} at the next session
          open using that week&apos;s target weights, held at least three months with tax-aware
          exits. The VOO sleeve invests the same cash on the same dates for comparison.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="label-caps mb-3">Factor strategy</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {isPending ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary/40" />
                ))
              ) : (
                <>
                  <MetricTile
                    label="Cumulative return"
                    value={pct(paper?.strategy.returnPct)}
                    tone={strategyTone}
                  />
                  <MetricTile label="Portfolio value" value={usd(paper?.strategy.marketValue)} />
                  <MetricTile label="Cost basis" value={usd(paper?.strategy.costBasis)} />
                </>
              )}
            </div>
          </div>
          <div>
            <p className="label-caps mb-3">VOO benchmark DCA</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {isPending ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary/40" />
                ))
              ) : (
                <>
                  <MetricTile
                    label="Cumulative return"
                    value={pct(paper?.voo.returnPct)}
                    tone={vooTone}
                  />
                  <MetricTile label="Portfolio value" value={usd(paper?.voo.marketValue)} />
                  <MetricTile label="Cost basis" value={usd(paper?.voo.costBasis)} />
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <Scale className="size-4 text-accent" />
          <h2 className="font-display text-base font-semibold tracking-tight">Tax Lot Ledger</h2>
          <span className="label-caps ml-auto">
            {paper ? `${paper.openLots} open factor lots` : "—"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {isPending ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary/40" />
            ))
          ) : (
            <>
              <MetricTile
                label="Cum. realized gains"
                value={usd(paper?.tax.cumulativeRealizedGains)}
                tone="positive"
              />
              <MetricTile
                label="Cum. realized losses"
                value={usd(paper?.tax.cumulativeRealizedLosses)}
                tone="negative"
              />
              <MetricTile
                label="Net taxable"
                value={usd(netTax)}
                tone={netTax >= 0 ? "positive" : "negative"}
              />
              <MetricTile
                label="Cum. unrealized gains"
                value={usd(paper?.tax.cumulativeUnrealizedGains)}
                tone="positive"
              />
              <MetricTile
                label="Cum. unrealized losses"
                value={usd(paper?.tax.cumulativeUnrealizedLosses)}
                tone="negative"
              />
            </>
          )}
        </div>
        {!isPending && paper?.recentTrades?.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps py-2.5 pr-4">Date</th>
                  <th className="label-caps py-2.5 pr-4">Side</th>
                  <th className="label-caps py-2.5 pr-4">Ticker</th>
                  <th className="label-caps py-2.5 pr-4 text-right">Shares</th>
                  <th className="label-caps py-2.5 pr-4 text-right">Price</th>
                  <th className="label-caps py-2.5 text-right">Reason</th>
                </tr>
              </thead>
              <tbody>
                {paper.recentTrades.map((t, i) => (
                  <tr
                    key={`${t.date}-${t.ticker}-${i}`}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">{t.date}</td>
                    <td className="py-2.5 pr-4 uppercase tracking-wide text-muted-foreground">
                      {t.side}
                    </td>
                    <td className="py-2.5 pr-4 font-mono font-medium">{t.ticker}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                      {t.shares.toFixed(3)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                      {usd(t.price, 2)}
                    </td>
                    <td className="py-2.5 text-right text-xs text-muted-foreground">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}

export function FactorBetaTab() {
  const { data, isPending } = useQuery({
    queryKey: ["factor-predictions"],
    queryFn: fetchFactorBetaData,
    staleTime: 5 * 60_000,
  });

  const fetchPaper = useServerFn(getPaperPortfolio);
  const { data: paper, isPending: paperPending } = useQuery({
    queryKey: ["paper-portfolio"],
    queryFn: () => fetchPaper(),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const current = data?.current;

  const showPrior = (current?.factors ?? []).some((f) => f.prior !== null);
  const showConfidence = (current?.factors ?? []).some((f) => f.confidence !== null);

  const stats = current
    ? [
        { label: "Total expected return", value: pct(current.expected_return), tone: "signed" },
        { label: "Expected volatility", value: plain(current.expected_vol, 1, "%"), tone: "flat" },
        { label: "Expected Sharpe ratio", value: plain(current.expected_sharpe), tone: "flat" },
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
        <RegimeRead />
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
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps py-2.5 pr-4">Factor</th>
                  <th className="label-caps py-2.5 pr-4">Definition</th>
                  <th className="label-caps py-2.5 pr-4 text-right">Predicted</th>
                  {showPrior ? (
                    <th className="label-caps py-2.5 pr-4 text-right">Prior run</th>
                  ) : null}
                  {showConfidence ? (
                    <th className="label-caps py-2.5 text-right">Confidence</th>
                  ) : null}
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
                    {showPrior ? (
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-muted-foreground">
                        {pct(f.prior)}
                      </td>
                    ) : null}
                    {showConfidence ? (
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                            <span
                              className="block h-full rounded-full bg-accent/70"
                              style={{ width: `${f.confidence ?? 0}%` }}
                            />
                          </span>
                          <span className="w-9 font-mono tabular-nums text-foreground">
                            {f.confidence === null ? "—" : `${f.confidence}%`}
                          </span>
                        </div>
                      </td>
                    ) : null}
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
            Factor Portfolio — 3-Month Hold
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isPending
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary/40" />
              ))
            : stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-border/70 bg-secondary/20 p-4"
                >
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

      <PaperPortfolioPanels paper={paper} isPending={paperPending} />

      <section className="panel p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <History className="size-4 text-accent" />
          <h2 className="font-display text-base font-semibold tracking-tight">
            Previous Week Performance &amp; Asset Selections
          </h2>
          <span className="label-caps ml-auto">Trailing 3 months</span>
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
          <p className="text-sm text-muted-foreground">No prior model runs recorded yet.</p>
        )}
      </section>

      <p className="pointer-events-none sticky bottom-4 z-10 ml-auto w-fit rounded-md border border-border/70 bg-background/85 px-3 py-2 text-right text-xs text-muted-foreground backdrop-blur">
        Disclaimer: Not Investment Advice. For informational and educational purposes only.
      </p>
    </div>
  );
}
