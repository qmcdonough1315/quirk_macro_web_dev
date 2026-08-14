import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";

import { fetchZipRow, searchZips, type ZipRow } from "@/lib/supabase";
import { getDriveByVibe } from "@/lib/zip.functions";

const SAMPLE_ZIPS = ["20007", "78704", "90210"];

const usd = (n: number | null | undefined, digits = 0) =>
  typeof n === "number" && Number.isFinite(n)
    ? `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`
    : "—";

const num = (n: number | null | undefined, digits = 1, suffix = "") =>
  typeof n === "number" && Number.isFinite(n)
    ? `${n.toLocaleString("en-US", { maximumFractionDigits: digits })}${suffix}`
    : "—";

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/30 p-4">
      <p className="label-caps">{label}</p>
      <p className="mt-2 font-display text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function LocalTab() {
  const [query, setQuery] = useState("");
  const [zip, setZip] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["zip-suggest", query],
    queryFn: () => searchZips(query),
    enabled: query.trim().length >= 2 && query.trim() !== zip,
  });

  const {
    data: row,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["zip-row", zip],
    queryFn: () => fetchZipRow(zip!),
    enabled: !!zip,
    retry: false,
  });

  const fetchVibe = useServerFn(getDriveByVibe);
  const vibe = useMutation({ mutationFn: fetchVibe });

  const metrics = useMemo(() => {
    if (!row) return null;
    const { zip_code: _z, city: _c, state: _s, ...rest } = row;
    return rest as Record<string, number | null>;
  }, [row]);

  useEffect(() => {
    if (row && metrics) {
      vibe.mutate({
        data: { zip: row.zip_code, city: row.city, state: row.state, metrics },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.zip_code]);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setQuery(v);
    setOpen(false);
    setZip(v);
  };

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Geolocation isn't available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
          );
          const json = (await res.json()) as { address?: { postcode?: string } };
          const code = json.address?.postcode?.slice(0, 5);
          if (code) submit(code);
          else setGeoError("Couldn't determine a ZIP code from your location.");
        } catch {
          setGeoError("Location lookup failed — try typing a ZIP code.");
        }
      },
      () => setGeoError("Location permission denied."),
    );
  };

  const dom = row?.median_days_on_market ?? null;
  const hot = typeof dom === "number" && dom < 20;

  return (
    <div className="space-y-6">
      {/* Hero / search */}
      <section className="panel p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          ZIP Code Explorer
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Search any ZIP code for housing costs, market speed, and neighborhood pulse.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
          className="mt-5 flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Enter a 5-digit ZIP code…"
              aria-label="Search a ZIP code"
              inputMode="numeric"
              autoComplete="off"
              className="h-12 w-full rounded-lg border border-input bg-secondary/40 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-secondary/70"
            />
            {open && suggestions.length > 0 ? (
              <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.zip_code}>
                    <button
                      type="button"
                      onMouseDown={() => submit(s.zip_code)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-secondary/70"
                    >
                      <MapPin className="size-3.5 text-accent" />
                      <span className="font-mono tabular-nums">{s.zip_code}</span>
                      <span className="text-muted-foreground">
                        {[s.city, s.state].filter(Boolean).join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={isFetching}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-7 font-display text-sm font-semibold tracking-tight text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : null}
            {isFetching ? "Loading…" : "Explore"}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={useMyLocation}
            className="flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs text-foreground transition-colors hover:border-accent/60 hover:text-accent"
          >
            <LocateFixed className="size-3.5" />
            Use my location
          </button>
          {SAMPLE_ZIPS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => submit(z)}
              className="rounded-full border border-border px-3.5 py-1.5 font-mono text-xs tabular-nums text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
            >
              {z}
            </button>
          ))}
        </div>
        {geoError ? <p className="mt-3 text-xs text-negative">{geoError}</p> : null}
      </section>

      {error ? (
        <div className="panel flex items-start gap-3 border-negative/40 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 text-negative" />
          <p className="text-muted-foreground">{(error as Error).message}</p>
        </div>
      ) : null}

      {isFetching && !row ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="panel h-56 animate-pulse" />
          <div className="panel h-56 animate-pulse" />
          <div className="panel h-56 animate-pulse" />
        </div>
      ) : null}

      {row ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {[row.city, row.state].filter(Boolean).join(", ") || "Unknown area"}
              </h3>
              <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
                ZIP {row.zip_code}
              </p>
            </div>
            {typeof dom === "number" ? (
              <span
                className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium ${
                  hot
                    ? "bg-positive/12 text-positive ring-1 ring-positive/30"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                <Clock className="size-3.5" />
                {hot ? "Hot market" : "Steady pace"} · {num(dom, 0)} days on market
              </span>
            ) : null}
          </div>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-6">
              <h4 className="mb-4 font-display text-base font-semibold tracking-tight">
                💰 Housing &amp; Rent
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Median Home Price" value={usd(row.median_home_price)} />
                <Metric label="Median Rent" value={usd(row.median_rent)} detail="per month" />
                <Metric label="Price / Sq Ft" value={usd(row.price_per_sqft)} />
                <Metric
                  label="Price-to-Rent"
                  value={num(row.price_to_rent_ratio, 1, "×")}
                  detail={`Price-to-income ${num(row.price_to_income_ratio, 1, "×")}`}
                />
              </div>
            </div>

            <div className="panel p-6">
              <h4 className="mb-4 font-display text-base font-semibold tracking-tight">
                ⚡ Market Speed &amp; Inventory
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Days on Market"
                  value={num(dom, 0)}
                  detail={hot ? "Hot · under 20 days" : "Typical pace"}
                />
                <Metric
                  label="Active Listings"
                  value={num(row.active_listing_count, 0)}
                  detail={`Redfin ${num(row.redfin_active_listings, 0)}`}
                />
                <Metric label="New Listings" value={num(row.new_listing_count, 0)} />
                <Metric label="% Price Cuts" value={num(row.price_reduced_share, 1, "%")} />
              </div>
            </div>

            <div className="panel p-6">
              <h4 className="mb-4 font-display text-base font-semibold tracking-tight">
                👥 Neighborhood Pulse
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Median Income" value={usd(row.median_household_income)} />
                <Metric label="Median Age" value={num(row.median_age, 1)} />
                <Metric
                  label="Owner Occupancy"
                  value={num(row.owner_occupancy_pct, 1, "%")}
                  detail={
                    typeof row.owner_occupancy_pct === "number"
                      ? `${num(100 - row.owner_occupancy_pct, 1, "%")} renters`
                      : undefined
                  }
                />
                <Metric label="Avg Commute" value={num(row.avg_commute_mins, 0, " min")} />
              </div>
            </div>
          </section>

          <section className="panel p-6">
            <div className="mb-4 flex items-center gap-2.5">
              <Sparkles className="size-4 text-accent" />
              <h4 className="font-display text-base font-semibold tracking-tight">
                Drive-By Vibe Check
              </h4>
              <span className="ml-auto rounded-md bg-accent/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-accent">
                AI narrative
              </span>
            </div>
            {vibe.isPending ? (
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-secondary" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-secondary" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
              </div>
            ) : vibe.error ? (
              <p className="text-sm text-muted-foreground">{(vibe.error as Error).message}</p>
            ) : vibe.data ? (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">{vibe.data.vibe}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {vibe.data.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-border px-3 py-1 text-xs text-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}

      {!row && !isFetching && !error ? (
        <div className="panel p-10 text-center">
          <MapPin className="mx-auto size-5 text-accent" />
          <p className="mt-3 font-display text-base font-semibold tracking-tight">
            Search a ZIP code to explore the neighborhood
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Metrics come from your ZIP dataset; the vibe check is AI-generated.
          </p>
        </div>
      ) : null}
    </div>
  );
}
