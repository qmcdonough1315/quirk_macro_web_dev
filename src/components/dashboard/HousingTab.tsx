import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Droplets,
  Gauge as GaugeIcon,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Gauge } from "./Gauge";
import { IndicatorList } from "./IndicatorList";
import { getMacroSnapshot } from "@/lib/market.functions";
import {
  lendingConditions,
  liquidityIndicators,
  marketBalanceScore,
  type KeyMetric,
} from "@/lib/macro-data";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2">
      <p className="label-caps mb-1.5">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="flex items-center gap-2 font-mono text-xs tabular-nums">
          <span className="size-2 rounded-full" style={{ backgroundColor: entry.stroke }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto text-foreground">{entry.value.toFixed(2)}%</span>
        </p>
      ))}
    </div>
  );
}

const bps = (n: number) => `${n > 0 ? "+" : ""}${n} bps`;

export function HousingTab() {
  const fetchMacro = useServerFn(getMacroSnapshot);
  const { data, isPending, error } = useQuery({
    queryKey: ["macro-snapshot"],
    queryFn: () => fetchMacro(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const metrics: KeyMetric[] = data
    ? [
        {
          label: "30Y Fixed Mortgage",
          value: `${data.mortgage.latest.toFixed(2)}%`,
          change: bps(data.mortgage.changeBps),
          trend: data.mortgage.changeBps >= 0 ? "up" : "down",
          note: `As of ${data.mortgage.latestDate} · FRED MORTGAGE30US`,
          upIsGood: false,
        },
        {
          label: "10Y Treasury Yield",
          value: `${data.treasury.latest.toFixed(2)}%`,
          change: bps(data.treasury.changeBps),
          trend: data.treasury.changeBps >= 0 ? "up" : "down",
          note: `As of ${data.treasury.latestDate} · FRED DGS10`,
          upIsGood: false,
        },
        {
          label: "Primary / Secondary Spread",
          value: `${data.spreadBps} bps`,
          change: bps(data.spreadChangeBps),
          trend: data.spreadChangeBps >= 0 ? "up" : "down",
          note: "30Y mortgage less 10Y Treasury",
          upIsGood: false,
        },
        {
          label: "FHFA HPI · QoQ",
          value: "+1.24%",
          change: "+0.31 pp",
          trend: "up",
          note: "Q2 2026 · seasonally adjusted",
          upIsGood: true,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {error ? (
        <div className="panel flex items-start gap-3 border-negative/40 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 text-negative" />
          <p className="text-muted-foreground">
            Couldn&apos;t load live FRED data: {(error as Error).message}
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="panel h-[132px] animate-pulse p-5" />
            ))
          : metrics.map((metric) => {
              const good = metric.trend === "up" ? metric.upIsGood : !metric.upIsGood;
              const Icon = metric.trend === "up" ? ArrowUpRight : ArrowDownRight;
              return (
                <div key={metric.label} className="panel p-5">
                  <p className="label-caps">{metric.label}</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <span className="font-display text-3xl font-semibold tracking-tight tabular-nums">
                      {metric.value}
                    </span>
                    <span
                      className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs tabular-nums ${
                        good ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {metric.change}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{metric.note}</p>
                </div>
              );
            })}
      </section>

      <section className="panel p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Rates &amp; Yields — Trailing 12 Months
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              10-Year Treasury constant maturity vs. Freddie Mac weekly 30-year fixed survey — live
              from FRED.
            </p>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-0.5 w-5 rounded-full bg-chart-1" /> 10Y Treasury
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-0.5 w-5 rounded-full bg-chart-2" /> 30Y Mortgage
            </span>
          </div>
        </div>

        <div className="mt-6 h-[340px] w-full">
          {isPending ? (
            <div className="size-full animate-pulse rounded-lg bg-secondary/40" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.series ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
                <Legend content={() => null} />
                <Line
                  type="monotone"
                  dataKey="treasury"
                  name="10Y Treasury"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="mortgage"
                  name="30Y Mortgage"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <Banknote className="size-4 text-accent" />
            <h3 className="font-display text-base font-semibold tracking-tight">
              Lending &amp; Credit Conditions
            </h3>
          </div>
          <IndicatorList items={lendingConditions} />
        </div>

        <div className="panel p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <Droplets className="size-4 text-accent" />
            <h3 className="font-display text-base font-semibold tracking-tight">
              Liquidity Indicators
            </h3>
          </div>
          <IndicatorList items={liquidityIndicators} />
        </div>

        <div className="panel flex flex-col p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <GaugeIcon className="size-4 text-accent" />
            <h3 className="font-display text-base font-semibold tracking-tight">
              Buyer vs. Seller Advantage
            </h3>
          </div>
          <Gauge
            value={marketBalanceScore}
            leftLabel="Strong Buyer"
            rightLabel="Strong Seller"
            verdict="Moderate Seller Market"
            caption="Tight inventory offsets softening demand nationally."
          />
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-5 text-sm">
            {[
              ["Months of supply", "3.4"],
              ["Median days on market", "34"],
              ["Share above list", "26%"],
              ["Active inventory YoY", "+8.2%"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-mono tabular-nums text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
