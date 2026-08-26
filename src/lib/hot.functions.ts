import { createServerFn } from "@tanstack/react-start";

import { getHotListings, type HotContext } from "./hot.server";

export const getHotProperties = createServerFn({ method: "POST" })
  .inputValidator((input: { zip: string } & HotContext) => ({
    zip: String(input?.zip ?? "").trim(),
    medianPrice: input?.medianPrice ?? null,
    medianRent: input?.medianRent ?? null,
    dom: input?.dom ?? null,
  }))
  .handler(async ({ data }) => {
    if (!/^\d{5}$/.test(data.zip)) throw new Error("A 5-digit ZIP code is required");
    return await getHotListings(data.zip, data);
  });
