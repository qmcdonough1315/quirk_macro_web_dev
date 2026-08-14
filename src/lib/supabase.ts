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

export async function searchZips(term: string) {
  const q = term.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("zip_data")
    .select("zip_code, city, state")
    .ilike("zip_code", `${q}%`)
    .order("zip_code")
    .limit(6);
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<ZipRow, "zip_code" | "city" | "state">[];
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
