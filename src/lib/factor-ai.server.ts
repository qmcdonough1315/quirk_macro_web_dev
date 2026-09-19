import { COMMENTARY_CACHE_TTL_MS, getEasternRefreshWindow } from "./ai-refresh";
import { AI_UNAVAILABLE, generateAiTextResult } from "./ai.server";

export interface RegimeInput {
  asOfDate: string;
  factors: { code: string; name: string; predicted: number }[];
  holdings: { ticker: string; weight: number }[];
  expectedReturn: number | null;
  expectedVol: number | null;
  expectedSharpe: number | null;
}

export interface RegimeSummaryResult {
  summary: string;
  available: boolean;
  retryable: boolean;
}

/** Three-sentence regime read generated from this run's own numbers. */
export async function generateRegimeSummary(input: RegimeInput): Promise<RegimeSummaryResult> {
  const refreshWindow = getEasternRefreshWindow();
  const context = JSON.stringify({
    as_of_date: input.asOfDate,
    predicted_3m_factor_excess_returns_pct: Object.fromEntries(
      input.factors.map((f) => [f.code, Number(f.predicted.toFixed(3))]),
    ),
    portfolio_weights_pct: Object.fromEntries(
      input.holdings.map((h) => [h.ticker, Number(h.weight.toFixed(2))]),
    ),
    portfolio_expected_return_pct:
      input.expectedReturn === null ? null : Number(input.expectedReturn.toFixed(2)),
    portfolio_expected_vol_pct:
      input.expectedVol === null ? null : Number(input.expectedVol.toFixed(2)),
    portfolio_sharpe:
      input.expectedSharpe === null ? null : Number(input.expectedSharpe.toFixed(2)),
  });

  const result = await generateAiTextResult(
    [
      {
        role: "system",
        content:
          "You are a quantitative factor strategist. Write exactly three sentences, plain prose, no markdown, no bullet points. Interpret the current macroeconomic regime strictly from the supplied Fama-French and Carhart factor forecasts, the resulting portfolio, and current macroeconomic trends. Cite at most four figures, each rounded to one decimal place (Sharpe to two), and never print long decimals. Do not invent data points, do not invent outside events, do not give investment advice.",
      },
      { role: "user", content: `Model run data: ${context}` },
    ],
    {
      cacheKey: `regime:${refreshWindow}:${input.asOfDate}`,
      ttlMs: COMMENTARY_CACHE_TTL_MS,
    },
  );

  return {
    summary: result.text ?? AI_UNAVAILABLE,
    available: Boolean(result.text),
    retryable: result.retryable,
  };
}
