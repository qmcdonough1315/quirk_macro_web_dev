import { createServerFn } from "@tanstack/react-start";

import {
  simulatePaperPortfolio,
  zeroSleeveTax,
  type PaperPortfolioSnapshot,
  type PaperWeeklyPoint,
  type SleeveTaxPosition,
} from "./paper-portfolio.server";
import {
  ETF_TARGET_CAPITAL_USD,
  STRATEGY_INCEPTION_DATE,
  WEEKLY_CONTRIBUTION_USD,
} from "./paper-portfolio-rules";

export type { PaperPortfolioSnapshot, PaperWeeklyPoint, SleeveTaxPosition };

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
        mix: { marketValue: 0, costBasis: 0, returnPct: 0, cash: 0 },
        tax: {
          factor: zeroSleeveTax(),
          voo: zeroSleeveTax(),
          mix: zeroSleeveTax(),
        },
        openLots: 0,
        recentTrades: [],
        weeklySeries: [],
        notes: [message],
        etfFloatRemaining: ETF_TARGET_CAPITAL_USD,
        etfTargetCapital: ETF_TARGET_CAPITAL_USD,
        weeklyContribution: WEEKLY_CONTRIBUTION_USD,
      };
    }
  },
);
