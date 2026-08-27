import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Crown, Landmark, PiggyBank, Trophy, Wallet } from "lucide-react";

import { fetchCashManagerYields, type CashFund } from "@/lib/cash-manager";
import { getRatesOutlook } from "@/lib/market.functions";

const pct = (n: number, digits = 2) => `${n.toFixed(digits)}%`;

const CATEGORY_TINT: Record<string, string> = {
  "Short Treasury": "bg-accent/12 text-accent ring-accent/30",
  "Government Money Market": "bg-positive/10 text-positive ring-positive/30",
  "Prime Money Market": "bg-warning/10 text-warning ring-warning/30",
  "Floating Rate Treasury": "bg-secondary text-foreground ring-border",
};

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  loading,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  note: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20 p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-accent" />
        <p className="label-caps">{label}</p>
      </div>
      {loading ? (
        <div className="mt-3 h-9 w-24 animate-pulse rounded bg-secondary/60" />
      ) : (
        <p className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function LeaderboardRow({ fund, rank, isTop }: { fund: CashFund; rank: number; isTop: boolean }) {
  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
      <td className="py-3.5 pr-4">
        <span
          className={`inline-flex size-7 items-center justify-center rounded-md font-mono text-xs tabular-nums ${
            rank === 1
              ? "bg-accent/15 text-accent ring-1 ring-accent/40"
              : "bg-secondary/60 text-muted-foreground"
          }`}
        >
          {rank}
        </span>
      </td>
      <td className="py-3.5 pr-4">
        <span className="font-mono text-sm font-semibold text-foreground">{fund.ticker}</span>
        {isTop ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent ring-1 ring-accent/30">
            <Crown className="size-3" /> Top yield
          </span>
        ) : null}
      </td>
      <td className="py-3.5 pr-4 text-sm text-muted-foreground">{fund.fund_name}</td>
      <td className="py-3.5 pr-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
            CATEGORY_TINT[fund.category] ?? "bg-secondary text-muted-foreground ring-border"
          }`}
        >
          {fund.category}
        </span>
      </td>
      <td className="py-3.5 pr-4 text-right">
        <span className="font-mono text-sm font-semibold tabular-nums text-positive">
          {pct(fund.sec_yield_30d)}
        </span>
      </td>
      <td className="py-3.5 pr-4 text-right font-mono text-sm tabular-nums text-muted-foreground">
        {pct(fund.expense_ratio, 2)}
      </td>
      <td className="py-3.5 pr-4 text-sm text-muted-foreground">{fund.distribution_frequency}</td>
      <td className="py-3.5 text-right">
        <a
          href={fund.detail_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/50 hover:text-accent"
        >
          Trade <ArrowUpRight className="size-3.5" />
        </a>
      </td>
    </tr>
  );
}

export function CashManagerTab() {
  const yields = useQuery({
    queryKey: ["cash-manager-yields"],
    queryFn: fetchCashManagerYields,
    staleTime: 30 * 60_000,
  });

  const fetchRates = useServerFn(getRatesOutlook);
  const rates = useQuery({
    queryKey: ["rates-outlook"],
    queryFn: () => fetchRates(),
    staleTime: 60 * 60_000,
    retry: 1,
  });

  const funds = yields.data?.funds ?? [];
  const top = funds[0];
  const avgExpense = funds.length
    ? funds.reduce((s, f) => s + f.expense_ratio, 0) / funds.length
    : 0;
  const tbill3m = rates.data?.curve.find((c) => c.tenor === "3M")?.current;
  const loading = yields.isPending;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={Trophy}
          label="Highest 30-Day SEC Yield"
          value={top ? pct(top.sec_yield_30d) : "—"}
          note={top ? `${top.ticker} · ${top.fund_name}` : "Awaiting data"}
          loading={loading}
        />
        <MetricCard
          icon={PiggyBank}
          label="Avg. Expense Ratio"
          value={funds.length ? pct(avgExpense) : "—"}
          note={`Across ${funds.length} tracked funds`}
          loading={loading}
        />
        <MetricCard
          icon={Landmark}
          label="Benchmark · 3-Month T-Bill"
          value={tbill3m !== undefined ? pct(tbill3m) : "—"}
          note={
            rates.data?.curveDate
              ? `Live from FRED · as of ${rates.data.curveDate}`
              : rates.isPending
                ? "Loading FRED benchmark"
                : "FRED benchmark unavailable"
          }
          loading={rates.isPending}
        />
      </div>

      <section className="panel p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <Wallet className="size-4 text-accent" />
          <h2 className="font-display text-base font-semibold tracking-tight">
            Cash Yield Leaderboard — Short-Term Treasury &amp; Money Market Funds
          </h2>
          <span className="label-caps ml-auto">
            {loading
              ? "Loading"
              : yields.data?.live
                ? `Live · ${yields.data.asOf}`
                : `Placeholder data · ${yields.data?.asOf ?? ""}`}
          </span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary/40" />
            ))}
          </div>
        ) : funds.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps py-2.5 pr-4">Rank</th>
                  <th className="label-caps py-2.5 pr-4">Ticker</th>
                  <th className="label-caps py-2.5 pr-4">Fund name</th>
                  <th className="label-caps py-2.5 pr-4">Category</th>
                  <th className="label-caps py-2.5 pr-4 text-right">30-Day SEC Yield</th>
                  <th className="label-caps py-2.5 pr-4 text-right">Expense ratio</th>
                  <th className="label-caps py-2.5 pr-4">Distributions</th>
                  <th className="label-caps py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((fund, i) => (
                  <LeaderboardRow
                    key={fund.id}
                    fund={fund}
                    rank={i + 1}
                    isTop={i === 0}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-secondary/10 px-6 py-12 text-center">
            <Wallet className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">No yield data yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The cash_manager_yields table is empty — rows populate weekly via the external
              Python script.
            </p>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        30-Day SEC Yield is a standardized, net-of-expenses yield measure. Yields fluctuate and past
        performance does not guarantee future results. Not investment advice.
      </p>
    </div>
  );
}
