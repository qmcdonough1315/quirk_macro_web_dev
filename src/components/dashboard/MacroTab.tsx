import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  LineChart as LineChartIcon,
  Percent,
  Sparkles,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  getEconCalendar,
  getMacroRecap,
  getMacroSnapshot,
  getRatesOutlook,
} from "@/lib/market.functions";

function CurveTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2">
      <p className="label-caps mb-1.5">{label} tenor</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="flex items-center gap-2 font-mono text-xs tabular-nums">
          <span className="size-2 rounded-full" style={{ backgroundColor: entry.stroke }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto text-foreground">
            {typeof entry.value === "number" ? `${entry.value.toFixed(2)}%` : "—"}
          </span>
        </p>
      ))}
    </div>
  );
}

const bps = (n: number) => `${n > 0 ? "+" : ""}${n} bps`;
const pp = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)} pp`;

const IMPACT_BADGE: Record<string, string> = { high: "🔴", medium: "🟡", low: "🔵" };

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function MacroTab() {
  const fetchMacro = useServerFn(getMacroSnapshot);
  const { data, isPending, error } = useQuery({
    queryKey: ["macro-snapshot"],
    queryFn: () => fetchMacro(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const fetchRates = useServerFn(getRatesOutlook);
  const rates = useQuery({
    queryKey: ["rates-outlook"],
    queryFn: () => fetchRates(),
    staleTime: 60 * 60_000,
    retry: 1,
  });

  const fetchRecap = useServerFn(getMacroRecap);
  const recap = useQuery({
    queryKey: ["macro-recap", data?.updated],
    queryFn: () =>
      fetchRecap({
        data: {
          mortgageRate: data!.mortgage.latest,
          treasuryYield: data!.treasury.latest,
          gdpGrowth: data!.gdp.latest,
          corePceYoY: data!.corePce.latest,
          asOf: data!.updated,
        },
      }),
    enabled: !!data,
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });

  const fetchCalendar = useServerFn(getEconCalendar);
  const calendar = useQuery({
    queryKey: ["econ-calendar"],
    queryFn: () => fetchCalendar(),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });

  const calendarGroups = useMemo(() => {
    const map = new Map<string, NonNullable<typeof calendar.data>>();
    for (const e of calendar.data ?? []) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return Array.from(map.entries());
  }, [calendar.data]);

  const ticker = data
    ? [
        {
          label: "10Y Treasury Yield",
          value: `${data.treasury.latest.toFixed(2)}%`,
          change: bps(data.treasury.changeBps),
          up: data.treasury.changeBps >= 0,
          upIsGood: false,
        },
        {
          label: "GDP Growth · QoQ ann.",
          value: `${data.gdp.latest.toFixed(1)}%`,
          change: pp(data.gdp.changePp),
          up: data.gdp.changePp >= 0,
          upIsGood: true,
        },
        {
          label: "Core PCE · YoY",
          value: `${data.corePce.latest.toFixed(2)}%`,
          change: pp(data.corePce.changePp),
          up: data.corePce.changePp >= 0,
          upIsGood: false,
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

      {/* Top ticker */}
      <section className="panel flex flex-wrap divide-x divide-border/70">
        {isPending
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="min-w-[170px] flex-1 px-5 py-4">
                <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
                <div className="mt-2.5 h-5 w-16 animate-pulse rounded bg-secondary" />
              </div>
            ))
          : ticker.map((t) => {
              const good = t.up === t.upIsGood;
              const Icon = t.up ? ArrowUpRight : ArrowDownRight;
              return (
                <div key={t.label} className="min-w-[170px] flex-1 px-5 py-4">
                  <p className="label-caps">{t.label}</p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-display text-lg font-semibold tabular-nums tracking-tight">
                      {t.value}
                    </span>
                    <span
                      className={`flex items-center gap-0.5 font-mono text-[11px] tabular-nums ${
                        good ? "text-positive" : "text-negative"
                      }`}
                    >
                      <Icon className="size-3" />
                      {t.change}
                    </span>
                  </div>
                </div>
              );
            })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {/* Yield curve */}
        <div className="panel p-6 lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <LineChartIcon className="size-4 text-accent" />
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  Treasury Yield Curve
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Constant-maturity yields across the curve
                {rates.data?.curveDate ? ` · as of ${rates.data.curveDate}` : ""} — live from FRED.
              </p>
            </div>
            <div className="flex items-center gap-5 text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="h-0.5 w-5 rounded-full bg-chart-1" /> Today
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="h-0.5 w-5 rounded-full bg-chart-3" /> One year ago
              </span>
            </div>
          </div>

          <div className="mt-6 h-[300px] w-full">
            {rates.isPending ? (
              <div className="size-full animate-pulse rounded-lg bg-secondary/40" />
            ) : rates.error ? (
              <p className="text-sm text-muted-foreground">
                Curve unavailable: {(rates.error as Error).message}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={rates.data?.curve ?? []}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="tenor"
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
                  <Tooltip content={<CurveTooltip />} cursor={{ stroke: "var(--border)" }} />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name="Today"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="yearAgo"
                    name="One year ago"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Fed funds probabilities */}
        <div className="panel p-6">
          <div className="mb-1 flex items-center gap-2.5">
            <Percent className="size-4 text-accent" />
            <h3 className="font-display text-base font-semibold tracking-tight">
              Fed Funds Path
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Market-implied odds for the next FOMC decision
            {rates.data?.nextMeeting ? ` (${fmtDay(rates.data.nextMeeting)})` : ""} — Atlanta Fed
            market-probability methodology.
          </p>

          {rates.isPending ? (
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-secondary/40" />
              ))}
            </div>
          ) : rates.error ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Probabilities unavailable: {(rates.error as Error).message}
            </p>
          ) : rates.data ? (
            <>
              <div className="mt-5 space-y-3">
                {rates.data.probabilities.map((p) => (
                  <div key={p.label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">{p.label}</span>
                      <span className="font-mono tabular-nums text-foreground">
                        {p.probability.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.max(1, p.probability)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Effective fed funds</dt>
                  <dd className="font-mono tabular-nums">{rates.data.fedFunds.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Implied 12M rate</dt>
                  <dd className="font-mono tabular-nums">{rates.data.impliedRate.toFixed(2)}%</dd>
                </div>
              </dl>
            </>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Past Week Recap */}
        <div className="panel p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <Sparkles className="size-4 text-accent" />
            <h3 className="font-display text-base font-semibold tracking-tight">
              Past Week Recap
            </h3>
            <span className="ml-auto rounded-md bg-accent/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-accent">
              AI summary
            </span>
          </div>
          {recap.isPending ? (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 animate-pulse rounded bg-secondary"
                  style={{ width: `${92 - i * 7}%` }}
                />
              ))}
            </div>
          ) : recap.error ? (
            <p className="text-sm text-muted-foreground">
              Recap unavailable: {(recap.error as Error).message}
            </p>
          ) : recap.data ? (
            <>
              <p className="font-display text-lg font-semibold leading-snug tracking-tight">
                {recap.data.headline}
              </p>
              <ul className="mt-4 space-y-3">
                {recap.data.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        {/* Upcoming 7-day calendar */}
        <div className="panel p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <CalendarDays className="size-4 text-accent" />
            <h3 className="font-display text-base font-semibold tracking-tight">
              Upcoming 7-Day Calendar
            </h3>
            <span className="ml-auto rounded-md bg-secondary px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Consensus vs. prior
            </span>
          </div>
          {calendar.isPending ? (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary/40" />
              ))}
            </div>
          ) : calendar.error ? (
            <p className="text-sm text-muted-foreground">
              Calendar unavailable: {(calendar.error as Error).message}
            </p>
          ) : calendarGroups.length ? (
            <div className="space-y-4">
              {calendarGroups.map(([date, events]) => (
                <div key={date}>
                  <p className="label-caps mb-2">{fmtDay(date)}</p>
                  <div className="space-y-2">
                    {events.map((e, i) => (
                      <div
                        key={`${e.title}-${i}`}
                        className="flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/30 px-3.5 py-2.5"
                      >
                        <span className="text-sm leading-none" title={`${e.impact} impact`}>
                          {IMPACT_BADGE[e.impact] ?? "⚪"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {e.time} · {e.category}
                          </p>
                        </div>
                        <div className="shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                          <p>
                            <span className="text-foreground">{e.consensus}</span> cons
                          </p>
                          <p>{e.prior} prior</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No major releases scheduled over the next 7 days.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
