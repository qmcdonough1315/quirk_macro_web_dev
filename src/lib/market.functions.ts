import { createServerFn } from "@tanstack/react-start";

import { fetchMacroSnapshot, fetchRatesOutlook } from "./market.server";

export const getMacroSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchMacroSnapshot();
});

export const getRatesOutlook = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchRatesOutlook();
});
