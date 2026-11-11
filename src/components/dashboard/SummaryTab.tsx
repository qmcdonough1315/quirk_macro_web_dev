import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Landmark, LayoutDashboard, PiggyBank, Scale, Waves } from "lucide-react";

import { getAlpacaPaperLedger } from "@/lib/alpaca.functions";
import { fetchCashManagerYields } from "@/lib/cash-manager";
import {
  CASH_MARGIN_RESERVE_USD,
  DCA_WEEKS,
  ETF_TARGET_CAPITAL_USD,
  OPTIONS_PAPER_CAPITAL_USD,
  TOTAL_PAPER_BOOK_USD,
  WEEKLY_CONTRIBUTION_USD,
  cashPartitions,
} from "@/lib/capital-book";
import { getPaperPortfolio, type PaperPortfolioSnapshot } from "@/lib/paper-portfolio.functions";
import { STRATEGY_INCEPTION_DATE, annualizedAlphaPct } from "@/lib/paper-portfolio-rules";

const usd = (n: number | null | undefined, digits = 0) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";

const pct = (n: number | null | undefined, digits = 2) =>
  typeof n === "number" && Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(digits)}%` : "—";

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "positive" | "negative" | "muted" | undefined;
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

function SleeveCard({
  icon: Icon,
  title,
  onOpen,
  children,
}: {
  icon: typeof Landmark;
  title: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <section className="panel flex h-full flex-col p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <Icon className="size-4 text-accent" />
        <h3 className="font-display text-sm font-semibold tracking-tight">{title}</h3>
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent/50 hover:text-accent"
        >
          Open <ArrowUpRight className="size-3.5" />
        </button>
      </div>
      <div className="grid flex-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function alphaTone(n: number | null): "positive" | "negative" | "muted" {
  if (n === null) return "muted";
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "muted";
}

export function SummaryTab() {
  const navigate = useNavigate({ from: "/" });
  const fetchPaper = useServerFn(getPaperPortfolio);
  const paper = useQuery({
    queryKey: ["paper-portfolio"],
    queryFn: () => fetchPaper(),
    staleTime: 5 * 60_000,
  });
  const yields = useQuery({
    queryKey: ["cash-manager-yields"],
    queryFn: fetchCashManagerYields,
    staleTime: 30 * 60_000,
  });
  const fetchAlpaca = useServerFn(getAlpacaPaperLedger);
  const alpaca = useQuery({
    queryKey: ["alpaca-paper-ledger"],
    queryFn: () => fetchAlpaca(),
    staleTime: 60_000,
    retry: 1,
  });

  const snap = paper.data as PaperPortfolioSnapshot | undefined;
  const loading = paper.isPending;
  const runCount = snap?.runCount ?? 0;
  const etfFloat = snap?.etfFloatRemaining ?? ETF_TARGET_CAPITAL_USD;
  const alpacaLive = Boolean(alpaca.data?.live);
  const feed = alpacaLive ? (alpaca.data?.optionsFeed ?? null) : null;
  const partitions = cashPartitions({
    etfFloatRemaining: etfFloat,
    optionsBpUsed: feed ? feed.bpUsed : null,
  });

  const contributions =
    snap?.live && snap.weeklySeries.length
      ? snap.weeklySeries.map((row) => ({
          date: row.fillDate,
          amount: WEEKLY_CONTRIBUTION_USD,
        }))
      : null;
  const vsVoo =
    contributions && snap
      ? annualizedAlphaPct({
          contributions,
          asOf: snap.asOf,
          factorValue: snap.strategy.marketValue,
          benchmarkValue: snap.voo.marketValue,
        })
      : null;
  const vsMix =
    contributions && snap
      ? annualizedAlphaPct({
          contributions,
          asOf: snap.asOf,
          factorValue: snap.strategy.marketValue,
          benchmarkValue: snap.mix.marketValue,
        })
      : null;

  const etfMv = snap?.strategy.marketValue ?? null;
  const etfCost = snap?.strategy.costBasis ?? null;
  const etfUnreal = snap?.tax.factor.netUnrealized ?? null;
  const etfRealized = snap?.tax.factor.netRealized ?? null;
  const etfReturn = snap?.strategy.returnPct ?? null;

  // Prefer Alpaca equity when live; otherwise modeled ETF + cash sleeves.
  // Do not double-count options capital as a separate invested asset beyond cash/Alpaca equity.
  const bookNav =
    alpacaLive && alpaca.data?.account
      ? alpaca.data.account.equity
      : (etfMv ?? 0) + CASH_MARGIN_RESERVE_USD + etfFloat + OPTIONS_PAPER_CAPITAL_USD;
  const deployedEtf = snap?.totalContributed ?? 0;
  const topYield = yields.data?.funds[0];
  const avgYield = yields.data?.summary?.avg_yield ?? topYield?.sec_yield_30d ?? null;

  const since = new Date(`${STRATEGY_INCEPTION_DATE}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const go = (tab: "factors" | "options" | "cash") => {
    void navigate({ search: { tab } });
  };

  const optionCell = (value: number | null | undefined, format: (n: number) => string) => {
    if (alpaca.isPending) return "…";
    if (!alpacaLive || value == null || !Number.isFinite(value)) return "Not live";
    return format(value);
  };
  const pnlTone = (value: number | null | undefined): "positive" | "negative" | "muted" => {
    if (!alpacaLive || value == null || !Number.isFinite(value) || value === 0) return "muted";
    return value > 0 ? "positive" : "negative";
  };
  const betaText = (value: number | null | undefined) =>
    optionCell(value, (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`);
  const headroomText = optionCell(partitions.freeCollateralUsd, (n) => usd(n));
  const headroomNote =
    partitions.optionsBpUsedUsd == null
      ? "Defined-risk buying power is not live"
      : `${usd(partitions.optionsBpUsedUsd)} BP used of ${usd(CASH_MARGIN_RESERVE_USD)} reserve`;

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <LayoutDashboard className="size-4 text-accent" />
          <h2 className="font-display text-base font-semibold tracking-tight">
            Book Overview — {usd(TOTAL_PAPER_BOOK_USD)} Paper
          </h2>
          <span className="label-caps ml-auto">
            {loading
              ? "Loading"
              : [
                  snap?.live ? `${runCount} ETF runs · since ${since}` : "Awaiting ETF history",
                  alpacaLive ? "Alpaca paper live" : "Alpaca awaiting secrets",
                ].join(" · ")}
          </span>
        </div>
        <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
          Consolidated view of the ETF model, options book, and cash reserve. When Alpaca paper is
          connected, Book NAV uses Alpaca equity; ETF sleeve metrics still come from the factor DCA
          ledger. Detail tables live on sleeve tabs.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary/40" />
            ))
          ) : (
            <>
              <Metric
                label="Book NAV (modeled)"
                value={usd(bookNav)}
                note={
                  alpacaLive
                    ? "Alpaca equity"
                    : "ETF MV + cash reserve + ETF float + options capital"
                }
              />
              <Metric
                label="ETF deployed"
                value={usd(deployedEtf)}
                note={`Week ${Math.min(runCount, DCA_WEEKS)}/${DCA_WEEKS} · target ${usd(ETF_TARGET_CAPITAL_USD)}`}
              />
              <Metric
                label="ETF float remaining"
                value={usd(etfFloat)}
                note="Parked for future DCA weeks"
              />
              <Metric
                label="Margin headroom"
                value={headroomText}
                note={headroomNote}
                tone={partitions.freeCollateralUsd == null ? "muted" : "positive"}
              />
            </>
          )}
        </div>

        <div className="mt-4 border-t border-border/70 pt-4">
          <p className="label-caps mb-3">Options risk strip</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric
              label="BP used"
              value={optionCell(feed?.bpUsed, (n) => usd(n))}
              note="Defined-risk margin"
              tone={feed?.bpUsed == null ? "muted" : undefined}
            />
            <Metric
              label="Headroom"
              value={headroomText}
              tone={partitions.freeCollateralUsd == null ? "muted" : "positive"}
            />
            <Metric
              label="Open P&L"
              value={optionCell(feed?.unrealizedPl, (n) => usd(n, 2))}
              tone={pnlTone(feed?.unrealizedPl)}
            />
            <Metric
              label="Realized premium"
              value={optionCell(feed?.realizedPl, (n) => usd(n, 2))}
              tone={pnlTone(feed?.realizedPl)}
            />
            <Metric
              label="β-weighted Δ"
              value={betaText(feed?.betaWeightedDelta)}
              note="SPY-equivalent shares"
              tone="muted"
            />
            <Metric
              label="Max loss"
              value={optionCell(feed?.maxLoss, (n) => usd(n))}
              tone={feed?.maxLoss == null ? "muted" : undefined}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <SleeveCard icon={Landmark} title="ETF Model · $50k ladder" onOpen={() => go("factors")}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-secondary/40" />
            ))
          ) : (
            <>
              <Metric label="Market value" value={usd(etfMv)} />
              <Metric label="Cost basis" value={usd(etfCost)} />
              <Metric
                label="Unrealized"
                value={usd(etfUnreal)}
                tone={etfUnreal == null ? "muted" : etfUnreal >= 0 ? "positive" : "negative"}
              />
              <Metric
                label="Realized (net)"
                value={usd(etfRealized)}
                tone={etfRealized == null ? "muted" : etfRealized >= 0 ? "positive" : "negative"}
              />
              <Metric
                label="Cumulative return"
                value={pct(etfReturn)}
                tone={etfReturn == null ? "muted" : etfReturn >= 0 ? "positive" : "negative"}
              />
              <Metric label="α vs VOO (ann.)" value={pct(vsVoo, 1)} tone={alphaTone(vsVoo)} />
              <Metric label="α vs mix (ann.)" value={pct(vsMix, 1)} tone={alphaTone(vsMix)} />
              <Metric
                label="Weekly DCA"
                value={usd(WEEKLY_CONTRIBUTION_USD, 0)}
                note="1/13 of $50k target"
              />
            </>
          )}
        </SleeveCard>

        <SleeveCard icon={Waves} title="Options Book · $25k" onOpen={() => go("options")}>
          <Metric
            label="BP used"
            value={optionCell(feed?.bpUsed, (n) => usd(n))}
            note={alpacaLive ? `${feed?.spreads.length ?? 0} open spreads` : "Add Alpaca secrets"}
            tone={feed?.bpUsed == null ? "muted" : undefined}
          />
          <Metric
            label="Open options P&L"
            value={optionCell(feed?.unrealizedPl, (n) => usd(n, 2))}
            note={alpacaLive ? `${feed?.openLegCount ?? 0} option legs` : "Awaiting Alpaca"}
            tone={pnlTone(feed?.unrealizedPl)}
          />
          <Metric
            label="Realized premium"
            value={optionCell(feed?.realizedPl, (n) => usd(n, 2))}
            note="Closed option fills"
            tone={pnlTone(feed?.realizedPl)}
          />
          <Metric
            label="β-weighted Δ"
            value={betaText(feed?.betaWeightedDelta)}
            note="SPY-equivalent shares"
            tone="muted"
          />
          <Metric
            label="Max loss"
            value={optionCell(feed?.maxLoss, (n) => usd(n))}
            note="Defined-risk spreads"
            tone={feed?.maxLoss == null ? "muted" : undefined}
          />
          <Metric
            label="Capital allocated"
            value={usd(OPTIONS_PAPER_CAPITAL_USD)}
            note="Defined-risk BP ceiling"
          />
        </SleeveCard>

        <SleeveCard icon={PiggyBank} title="Cash Engine · collateral" onOpen={() => go("cash")}>
          <Metric
            label="Pledged reserve"
            value={usd(partitions.pledgedReserveUsd)}
            note="Options margin floor"
          />
          <Metric
            label="Free collateral"
            value={headroomText}
            tone={partitions.freeCollateralUsd == null ? "muted" : "positive"}
          />
          <Metric
            label="ETF DCA float"
            value={usd(partitions.etfFloatUsd)}
            note="Earmarked · not options margin"
          />
          <Metric
            label="Top / avg yield"
            value={
              topYield
                ? `${topYield.ticker} ${avgYield != null ? pct(avgYield).replace("+", "") : "—"}`
                : "—"
            }
            note={yields.data?.live ? `As of ${yields.data.asOf}` : "Awaiting yield matrix"}
          />
        </SleeveCard>
      </div>

      <section className="panel p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <Scale className="size-4 text-accent" />
          <h3 className="font-display text-sm font-semibold tracking-tight">Accounting notes</h3>
        </div>
        <ul className="max-w-4xl space-y-1.5 text-sm text-muted-foreground">
          <li>
            Book NAV counts cash once: the {usd(CASH_MARGIN_RESERVE_USD)} reserve is not added again
            as options market value. Options capital ({usd(OPTIONS_PAPER_CAPITAL_USD)}) sits in cash
            until spreads are on.
          </li>
          <li>
            ETF alpha vs VOO / asset-mix is sleeve-only — options P&amp;L is never blended into
            those figures.
          </li>
          <li>
            Options cells stay &quot;Not live&quot; until Alpaca secrets are set, or when an
            unpaired short leaves buying power and max loss undefined. A live book with no option
            positions is flat: those cells are $0, not a missing feed. Buying power used is
            defined-risk margin (credit-spread max loss). β-weighted delta needs a greek on every
            open leg.
          </li>
          <li>
            Committed capital target remains {usd(TOTAL_PAPER_BOOK_USD)}; during the DCA ramp, ETF
            float decays by ~{usd(WEEKLY_CONTRIBUTION_USD)} each week.
          </li>
        </ul>
      </section>
    </div>
  );
}
