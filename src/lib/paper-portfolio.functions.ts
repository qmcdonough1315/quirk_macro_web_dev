import { createServerFn } from "@tanstack/react-start";

import {
  readPublishedPaperPortfolio,
  type PaperPortfolioSnapshot,
  type PaperWeeklyPoint,
} from "./paper-portfolio.server";

export type { PaperPortfolioSnapshot, PaperWeeklyPoint };

export const getPaperPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaperPortfolioSnapshot> => {
    return await readPublishedPaperPortfolio();
  },
);
