import { createClient } from "@supabase/supabase-js";

const viteEnv =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : ({} as Record<string, string | undefined>);

const SUPABASE_URL =
  viteEnv["VITE_SUPABASE_URL"] || "https://obzcegbzpxtxkhfhyoxa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  viteEnv["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  "sb_publishable_qcT-ZWx8B1EOJozZQBskAg_LsH1kChw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
