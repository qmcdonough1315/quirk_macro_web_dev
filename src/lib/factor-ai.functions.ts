import { createServerFn } from "@tanstack/react-start";

import { generateRegimeSummary, type RegimeInput } from "./factor-ai.server";

export const getRegimeSummary = createServerFn({ method: "POST" })
  .inputValidator((input: RegimeInput) => input)
  .handler(async ({ data }) => {
    return await generateRegimeSummary(data);
  });
