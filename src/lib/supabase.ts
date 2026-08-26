import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://obzcegbzpxtxkhfhyoxa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qcT-ZWx8B1EOJozZQBskAg_LsH1kChw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface ZipRow {
  zip_code: string;
  city: string | null;
  state: string | null;
  median_home_price: number | null;
  median_rent: number | null;
  price_to_rent_ratio: number | null;
  price_to_income_ratio: number | null;
  price_per_sqft: number | null;
  median_days_on_market: number | null;
  active_listing_count: number | null;
  redfin_active_listings: number | null;
  new_listing_count: number | null;
  price_reduced_share: number | null;
  median_household_income: number | null;
  median_age: number | null;
  owner_occupancy_pct: number | null;
  avg_commute_mins: number | null;
}

export type LocationSuggestion =
  | { kind: "zip"; zip_code: string; city: string | null; state: string | null }
  | { kind: "city"; city: string; state: string | null; zipCount: number };

/** Strip ilike-pattern metacharacters so user input can't break the query. */
const clean = (s: string) => s.replace(/[%_,()"]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Dual search: all-digit input searches ZIP prefixes; anything else searches
 * city names (city / city_search) and groups matches into city suggestions.
 */
export async function searchLocations(term: string): Promise<LocationSuggestion[]> {
  const q = clean(term);
  if (!q) return [];

  if (/^\d{1,5}$/.test(q)) {
    const { data, error } = await supabase
      .from("zip_data")
      .select("zip_code, city, state")
      .ilike("zip_code", `${q}%`)
      .order("zip_code")
      .limit(6);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      kind: "zip" as const,
      zip_code: r.zip_code as string,
      city: (r.city as string | null) ?? null,
      state: (r.state as string | null) ?? null,
    }));
  }

  type CityHit = { zip_code: string; city: string | null; state: string | null };

  let rows: CityHit[];
  const primary = await supabase
    .from("zip_data")
    .select("zip_code, city, state")
    .or(`city.ilike.%${q}%,city_search.ilike.%${q}%`)
    .order("city")
    .limit(80);
  if (primary.error) {
    // city_search column may not exist — fall back to city only
    const retry = await supabase
      .from("zip_data")
      .select("zip_code, city, state")
      .ilike("city", `%${q}%`)
      .order("city")
      .limit(80);
    if (retry.error) throw new Error(retry.error.message);
    rows = (retry.data ?? []) as unknown as CityHit[];
  } else {
    rows = (primary.data ?? []) as unknown as CityHit[];
  }

  const groups = new Map<string, LocationSuggestion & { kind: "city" }>();
  for (const r of rows) {
    if (!r.city) continue;
    const key = `${r.city}|${r.state ?? ""}`;
    const existing = groups.get(key);
    if (existing) existing.zipCount += 1;
    else groups.set(key, { kind: "city", city: r.city, state: r.state ?? null, zipCount: 1 });
  }
  return Array.from(groups.values()).slice(0, 6);
}

export async function fetchZipRow(zip: string): Promise<ZipRow> {
  const { data, error } = await supabase
    .from("zip_data")
    .select("*")
    .eq("zip_code", zip.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No data found for ZIP ${zip}`);
  return data as ZipRow;
}

/** Fetch every ZIP row belonging to a city (exact match first, then fuzzy). */
export async function fetchCityRows(city: string): Promise<ZipRow[]> {
  const q = clean(city);
  if (!q) return [];
  const exact = await supabase
    .from("zip_data")
    .select("*")
    .ilike("city", q)
    .order("zip_code")
    .limit(150);
  if (exact.error) throw new Error(exact.error.message);
  if (exact.data?.length) return exact.data as ZipRow[];

  const fuzzy = await supabase
    .from("zip_data")
    .select("*")
    .ilike("city", `%${q}%`)
    .order("zip_code")
    .limit(150);
  if (fuzzy.error) throw new Error(fuzzy.error.message);
  return (fuzzy.data ?? []) as ZipRow[];
}

const NUMERIC_KEYS = [
  "median_home_price",
  "median_rent",
  "price_to_rent_ratio",
  "price_to_income_ratio",
  "price_per_sqft",
  "median_days_on_market",
  "active_listing_count",
  "redfin_active_listings",
  "new_listing_count",
  "price_reduced_share",
  "median_household_income",
  "median_age",
  "owner_occupancy_pct",
  "avg_commute_mins",
] as const;

/** Average numeric metrics across all ZIP rows of a city. */
export function averageZipRows(rows: ZipRow[]): ZipRow {
  const first = rows[0]!;
  const avg: Record<string, number | string | null> = {
    zip_code: "avg",
    city: first.city,
    state: first.state,
  };
  for (const key of NUMERIC_KEYS) {
    const values = rows
      .map((r) => r[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    avg[key] = values.length
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : null;
  }
  return avg as unknown as ZipRow;
}
