import { createServerFn } from "@tanstack/react-start";

import {
  simulatePaperPortfolio,
  type PaperPortfolioSnapshot,
  type PaperWeeklyPoint,
} from "./paper-portfolio.server";
import { STRATEGY_INCEPTION_DATE } from "./paper-portfolio-rules";

export type { PaperPortfolioSnapshot, PaperWeeklyPoint };

export const getPaperPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaperPortfolioSnapshot> => {
    try {
      return await simulatePaperPortfolio();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Paper portfolio simulation failed";
      return {
        asOf: new Date().toISOString().slice(0, 10),
        inceptionDate: STRATEGY_INCEPTION_DATE,
        live: false,
        runCount: 0,
        totalContributed: 0,
        strategy: { marketValue: 0, costBasis: 0, returnPct: 0, cash: 0 },
        voo: { marketValue: 0, costBasis: 0, returnPct: 0, cash: 0 },
        tax: {
          cumulativeRealizedGains: 0,
          cumulativeRealizedLosses: 0,
          netTaxable: 0,
          cumulativeUnrealizedGains: 0,
          cumulativeUnrealizedLosses: 0,
        },
        openLots: 0,
        recentTrades: [],
        weeklySeries: [],
        notes: [message],
      };
    }
  },
);
