import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Building2,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { Gauge } from "./Gauge";
import { getLocalMarket } from "@/lib/market.functions";

function verdictFor(score: number) {
  if (score >= 70) return "Strong Seller Market";
  if (score >= 55) return "Seller-Leaning Market";
  if (score >= 45) return "Balanced Market";
  if (score >= 30) return "Buyer-Leaning Market";
  return "Strong Buyer Market";
}

export function LocalTab() {
  const [query, setQuery] = useState("20007");
  const fetchLocal = useServerFn(getLocalMarket);
  const { mutate, data, error, isPending } = useMutation({
    mutationFn: (zip: string) => fetchLocal({ data: { zip } }),
  });

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutate(query);
        }}
        className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a 5-digit ZIP code…"
            aria-label="Search a ZIP code"
            inputMode="numeric"
            className="h-12 w-full rounded-lg border border-input bg-secondary/40 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-secondary/70"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-7 font-display text-sm font-semibold tracking-tight text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {isPending ? "Analyzing…" : "Analyze Market"}
        </button>
      </form>

      {error ? (
        <div className="panel flex items-start gap-3 border-negative/40 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 text-negative" />
          <p className="text-muted-foreground">{(error as Error).message}</p>
        </div>
      ) : null}

      {!data && !isPending && !error ? (
        <div className="panel p-10 text-center">
          <MapPin className="mx-auto size-5 text-accent" />
          <p className="mt-3 font-display text-base font-semibold tracking-tight">
            Search a ZIP code to run a live market analysis
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Pricing and rental metrics come from RentCast; the area profile is AI-generated.
          </p>
        </div>
      ) : null}

      {isPending ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="panel h-64 animate-pulse lg:col-span-2" />
          <div className="panel h-64 animate-pulse" />
        </div>
      ) : null}

      {data ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm text-foreground">
              <MapPin className="size-3.5 text-accent" />
              {data.zip} · {data.name}
            </span>
            <span className="label-caps">Live · RentCast + FRED</span>
          </div>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-6 lg:col-span-2">
              <div className="mb-5 flex items-center gap-2.5">
                <Building2 className="size-4 text-accent" />
                <h3 className="font-display text-base font-semibold tracking-tight">Key Stats</h3>
              </div>
              <dl className="grid gap-5 sm:grid-cols-3">
                {data.stats.map((s) => (
                  <div key={s.label}>
                    <dt className="label-caps">{s.label}</dt>
                    <dd className="mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight">
                      {s.value}
                    </dd>
                    <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                ))}
              </dl>
            </div>

            <div className="panel p-6">
              <div className="mb-5 flex items-center gap-2.5">
                <TrendingUp className="size-4 text-accent" />
                <h3 className="font-display text-base font-semibold tracking-tight">
                  Rental &amp; Yield Metrics
                </h3>
              </div>
              <ul className="space-y-5">
                {data.rental.map((r) => (
                  <li key={r.label} className="border-b border-border pb-4 last:border-0 last:pb-0">
                    <p className="label-caps">{r.label}</p>
                    <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight">
                      {r.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-6 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2.5">
                <Sparkles className="size-4 text-accent" />
                <h3 className="font-display text-base font-semibold tracking-tight">
                  Area Profile &amp; Local Vibe
                </h3>
                <span className="ml-auto rounded-md bg-accent/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-accent">
                  AI narrative
                </span>
              </div>
              <ul className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                {data.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                {data.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-border px-3 py-1 text-xs text-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="panel p-6">
              <h3 className="mb-5 font-display text-base font-semibold tracking-tight">
                Local Affordability Scorecard
              </h3>
              <Gauge
                value={data.affordability}
                leftLabel="Buyer Market"
                rightLabel="Seller Market"
                verdict={verdictFor(data.affordability)}
                caption="Scored from days on market and price momentum in this ZIP."
              />
              <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
                {data.affordabilityNotes.map((n) => (
                  <div key={n.label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">{n.label}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{n.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
