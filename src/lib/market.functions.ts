import { createServerFn } from "@tanstack/react-start";

import { buildLocalMarket, fetchMacroSnapshot } from "./market.server";

export const getMacroSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchMacroSnapshot();
});

export const getLocalMarket = createServerFn({ method: "POST" })
  .inputValidator((input: { zip: string }) => ({ zip: String(input?.zip ?? "").trim() }))
  .handler(async ({ data }) => {
    return await buildLocalMarket(data.zip);
  });
