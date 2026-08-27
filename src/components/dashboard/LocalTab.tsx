import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Building2,
  Clock,
  Flame,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";

import {
  averageZipRows,
  fetchCityRows,
  fetchZipRow,
  searchLocations,
  type ZipRow,
} from "@/lib/supabase";
import { getDriveByVibe } from "@/lib/zip.functions";
import { getHotProperties } from "@/lib/hot.functions";

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

type LookupResult = { kind: "zip"; row: ZipRow } | { kind: "city"; rows: ZipRow[] };

export function LocalTab() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["loc-suggest", query],
    queryFn: () => searchLocations(query),
    enabled:
      query.trim().length >= 2 &&
      !(result?.kind === "zip" && query.trim() === result.row.zip_code),
  });

  const lookup = useMutation({
    mutationFn: async (value: string): Promise<LookupResult> => {
      const v = value.trim();
      if (!v) throw new Error("Enter a ZIP code or city name");
      if (/^\d{5}$/.test(v)) return { kind: "zip", row: await fetchZipRow(v) };
      const rows = await fetchCityRows(v);
      if (!rows.length) throw new Error(`No data found for "${v}"`);
      if (rows.length === 1) return { kind: "zip", row: rows[0]! };
      return { kind: "city", rows };
    },
    onSuccess: (res) => {
      setResult(res);
      setSelectedZip(null);
      setError(null);
    },
    onError: (e) => {
      setError((e as Error).message);
      setResult(null);
    },
  });

  /** The row currently shown: exact ZIP, chosen ZIP within a city, or city average. */
  const row = useMemo(() => {
    if (!result) return null;
    if (result.kind === "zip") return result.row;
    if (selectedZip) return result.rows.find((r) => r.zip_code === selectedZip) ?? null;
    return averageZipRows(result.rows);
  }, [result, selectedZip]);

  const isAverage = result?.kind === "city" && !selectedZip;
  const activeZip = result
    ? result.kind === "zip"
      ? result.row.zip_code
      : (selectedZip ?? result.rows[0]!.zip_code)
    : null;

  const metrics = useMemo(() => {
    if (!row) return null;
    const { zip_code: _z, city: _c, state: _s, ...rest } = row;
    return rest as Record<string, number | null>;
  }, [row]);

  const fetchVibe = useServerFn(getDriveByVibe);
  const vibe = useMutation({ mutationFn: fetchVibe });

  useEffect(() => {
    if (row && metrics && activeZip) {
      vibe.mutate({
        data: { zip: activeZip, city: row.city, state: row.state, metrics },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  const fetchHot = useServerFn(getHotProperties);
  const hot = useQuery({
    queryKey: ["hot-properties", activeZip],
    queryFn: () =>
      fetchHot({
        data: {
          zip: activeZip!,
          medianPrice: row?.median_home_price ?? null,
          medianRent: row?.median_rent ?? null,
          dom: row?.median_days_on_market ?? null,
        },
      }),
    enabled: !!activeZip && !!row,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setQuery(v);
    setOpen(false);
    lookup.mutate(v);
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
  const hotMarket = typeof dom === "number" && dom < 20;
  const isFetching = lookup.isPending;

  return (
    <div className="space-y-6">
      {/* Hero / search */}
      <section className="panel p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Local Market Explorer
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Search any 5-digit ZIP code or city name for housing costs, market speed, and
          neighborhood pulse.
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
              placeholder="Enter a ZIP code or city — e.g. 20007 or Georgetown…"
              aria-label="Search a ZIP code or city"
              autoComplete="off"
              className="h-12 w-full rounded-lg border border-input bg-secondary/40 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-secondary/70"
            />
            {open && suggestions.length > 0 ? (
              <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                {suggestions.map((s) =>
                  s.kind === "zip" ? (
                    <li key={`z-${s.zip_code}`}>
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
                  ) : (
                    <li key={`c-${s.city}-${s.state ?? ""}`}>
                      <button
                        type="button"
                        onMouseDown={() => submit(s.city)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-secondary/70"
                      >
                        <Building2 className="size-3.5 text-accent" />
                        <span>{[s.city, s.state].filter(Boolean).join(", ")}</span>
                        <span className="ml-auto rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {s.zipCount} ZIP{s.zipCount === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  ),
                )}
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
          <p className="text-muted-foreground">{error}</p>
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
                {isAverage
                  ? `City average · ${result?.kind === "city" ? result.rows.length : 0} ZIPs`
                  : `ZIP ${row.zip_code}`}
              </p>
            </div>
            {typeof dom === "number" ? (
              <span
                className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium ${
                  hotMarket
                    ? "bg-positive/12 text-positive ring-1 ring-positive/30"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                <Clock className="size-3.5" />
                {hotMarket ? "Hot market" : "Steady pace"} · {num(dom, 0)} days on market
              </span>
            ) : null}
          </div>

          {result?.kind === "city" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-caps mr-1">View:</span>
              <button
                type="button"
                onClick={() => setSelectedZip(null)}
                className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                  isAverage
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted-foreground hover:border-accent/60 hover:text-accent"
                }`}
              >
                All {row.city} (avg)
              </button>
              {result.rows.map((r) => (
                <button
                  key={r.zip_code}
                  type="button"
                  onClick={() => setSelectedZip(r.zip_code)}
                  className={`rounded-full px-3.5 py-1.5 font-mono text-xs tabular-nums transition-colors ${
                    selectedZip === r.zip_code
                      ? "bg-accent text-accent-foreground"
                      : "border border-border text-muted-foreground hover:border-accent/60 hover:text-accent"
                  }`}
                >
                  {r.zip_code}
                </button>
              ))}
            </div>
          ) : null}

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
                  detail={hotMarket ? "Hot · under 20 days" : "Typical pace"}
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
                <p className="text-sm font-medium leading-relaxed text-foreground">
                  {vibe.data.vibe}
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border/70 bg-secondary/30 p-4">
                    <p className="label-caps">Neighborhood Setting</p>
                    <p className="mt-2 inline-block rounded-md bg-accent/10 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
                      {vibe.data.settingLabel}
                    </p>
                    <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                      {vibe.data.setting}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-secondary/30 p-4">
                    <p className="label-caps">Demographics &amp; Trajectory</p>
                    <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                      {vibe.data.demographics}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-secondary/30 p-4">
                    <p className="label-caps">Local Context</p>
                    <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                      {vibe.data.context}
                    </p>
                  </div>
                </div>
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

          <section className="panel p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2.5">
              <Flame className="size-4 text-accent" />
              <h4 className="font-display text-base font-semibold tracking-tight">
                Hot Properties
              </h4>
              <span className="rounded-md bg-negative/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-negative">
                High 24h activity
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {hot.data?.source === "live" ? "Live listings · RentCast" : "ZIP " + activeZip}
              </span>
            </div>
            {hot.isPending ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-36 animate-pulse rounded-lg bg-secondary/40" />
                ))}
              </div>
            ) : hot.error ? (
              <p className="text-sm text-muted-foreground">{(hot.error as Error).message}</p>
            ) : hot.data ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {hot.data.properties.map((p) => (
                    <a
                      key={p.id}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-border/70 bg-secondary/30 p-4 transition-colors hover:border-accent/40 hover:bg-secondary/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-lg font-semibold tabular-nums tracking-tight">
                          {usd(p.price)}
                        </p>
                        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-accent">
                          {p.badge}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-sm text-foreground" title={p.address}>
                        {p.address}
                      </p>
                      <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
                        {[
                          p.beds != null ? `${p.beds} bd` : null,
                          p.baths != null ? `${p.baths} ba` : null,
                          p.sqft != null ? `${p.sqft.toLocaleString("en-US")} sqft` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {p.views24h != null
                          ? `🔥 ${p.views24h} views · last 24h`
                          : p.daysOnMarket != null
                            ? `Listed ${p.daysOnMarket}d ago`
                            : "Active listing"}
                      </p>
                      <p className="mt-2 text-[11px] text-accent">View listing ↗</p>
                    </a>
                  ))}
                </div>
                {hot.data.source === "sample" ? (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Sample listing cards shown — the live property feed is unavailable right now
                    (rate limit or inactive subscription).
                  </p>
                ) : null}
              </>
            ) : null}
          </section>
        </>
      ) : null}

      {!row && !isFetching && !error ? (
        <div className="panel p-10 text-center">
          <MapPin className="mx-auto size-5 text-accent" />
          <p className="mt-3 font-display text-base font-semibold tracking-tight">
            Search a ZIP code or city to explore the neighborhood
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Metrics come from your ZIP dataset; the vibe check is AI-generated.
          </p>
        </div>
      ) : null}
    </div>
  );
}
