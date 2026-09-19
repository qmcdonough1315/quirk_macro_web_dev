import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { generateRegimeSummary } from "./factor-ai.server";

const finiteNumber = z.number().finite();
const nullableFiniteNumber = finiteNumber.nullable();

const regimeInputSchema = z
  .object({
    asOfDate: z.string().trim().min(4).max(32),
    factors: z
      .array(
        z
          .object({
            code: z.string().trim().min(1).max(16),
            name: z.string().trim().min(1).max(64),
            predicted: finiteNumber,
          })
          .strict(),
      )
      .max(12),
    holdings: z
      .array(
        z
          .object({
            ticker: z.string().trim().min(1).max(12),
            weight: finiteNumber,
          })
          .strict(),
      )
      .max(30),
    expectedReturn: nullableFiniteNumber,
    expectedVol: nullableFiniteNumber,
    expectedSharpe: nullableFiniteNumber,
  })
  .strict();

export const getRegimeSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => regimeInputSchema.parse(input))
  .handler(async ({ data }) => {
    return await generateRegimeSummary(data);
  });
