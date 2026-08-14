import { useState } from "react";
import { Building2, MapPin, Search, Sparkles, TrendingUp } from "lucide-react";

import { Gauge } from "./Gauge";
import { localMarket } from "@/lib/macro-data";

export function LocalTab() {
  const [query, setQuery] = useState("20007");

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a ZIP code, city, or town…"
            aria-label="Search a ZIP code, city, or town"
            className="h-12 w-full rounded-lg border border-input bg-secondary/40 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-secondary/70"
          />
        </div>
        <button
          type="submit"
          className="h-12 rounded-lg bg-accent px-7 font-display text-sm font-semibold tracking-tight text-accent-foreground transition-opacity hover:opacity-90"
        >
          Analyze Market
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm text-foreground">
          <MapPin className="size-3.5 text-accent" />
          {localMarket.zip} · {localMarket.name}
        </span>
        <span className="label-caps">Last updated Aug 14, 2026</span>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-6 lg:col-span-2">
          <div className="mb-5 flex items-center gap-2.5">
            <Building2 className="size-4 text-accent" />
            <h3 className="font-display text-base font-semibold tracking-tight">Key Stats</h3>
          </div>
          <dl className="grid gap-5 sm:grid-cols-3">
            {localMarket.stats.map((s) => (
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
            {localMarket.rental.map((r) => (
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
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            {localMarket.narrative.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {localMarket.tags.map((t) => (
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
            value={localMarket.affordability}
            leftLabel="Buyer Market"
            rightLabel="Seller Market"
            verdict="Strong Seller Market"
            caption="Affordability is severely stretched for median-income households."
          />
          <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
            {localMarket.affordabilityNotes.map((n) => (
              <div key={n.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{n.label}</dt>
                <dd className="font-mono tabular-nums text-foreground">{n.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
