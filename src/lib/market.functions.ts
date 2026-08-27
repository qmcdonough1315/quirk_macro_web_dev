import { createServerFn } from "@tanstack/react-start";

import {
  buildLocalMarket,
  fetchMacroSnapshot,
  generateEconCalendar,
  generateMacroRecap,
  fetchRatesOutlook,
  type MacroContextInput,
} from "./market.server";

export const getMacroSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchMacroSnapshot();
});

export const getLocalMarket = createServerFn({ method: "POST" })
  .inputValidator((input: { zip: string }) => ({ zip: String(input?.zip ?? "").trim() }))
  .handler(async ({ data }) => {
    return await buildLocalMarket(data.zip);
  });

export const getMacroRecap = createServerFn({ method: "POST" })
  .inputValidator((input: MacroContextInput) => input ?? {})
  .handler(async ({ data }) => {
    return await generateMacroRecap(data);
  });

export const getEconCalendar = createServerFn({ method: "GET" }).handler(async () => {
  return await generateEconCalendar();
});

export const getRatesOutlook = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchRatesOutlook();
});
