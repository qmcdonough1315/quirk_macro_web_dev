import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { generateDriveByVibe } from "./zip.server";

const metricValue = z.union([
  z.number().finite(),
  z.string().max(64),
  z.null(),
  z.undefined(),
]);

const vibeInputSchema = z
  .object({
    zip: z.string().trim().regex(/^\d{5}$/, "ZIP must be 5 digits"),
    city: z.string().trim().max(64).nullable().optional(),
    state: z.string().trim().max(32).nullable().optional(),
    metrics: z.record(z.string().max(48), metricValue).refine(
      (value) => Object.keys(value).length <= 40,
      "Too many metrics",
    ),
  })
  .strict();

export const getDriveByVibe = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => vibeInputSchema.parse(input))
  .handler(async ({ data }) => {
    return await generateDriveByVibe(data);
  });
