import { defineTool } from "@lovable.dev/mcp-js";

import { fetchFactorBetaData } from "@/lib/factor-beta";

export default defineTool({
  name: "get_etf_factor_model",
  title: "Get ETF factor model",
  description:
    "Latest run of the Fama-French / Carhart factor model: predicted 3-month factor excess returns (Mkt-RF, SMB, HML, RMW, CMA, WML), the 10-ETF target portfolio with weights and per-fund expected returns, and portfolio expected return, volatility and Sharpe ratio. Informational only, not investment advice.",
  inputSchema: {},
  handler: async () => {
    const data = await fetchFactorBetaData();
    const run = data.current;
    const payload = {
      as_of: run.as_of_date,
      live: data.live,
      horizon_months: run.horizon_months,
      factors: run.factors.map((f) => ({
        code: f.code,
        name: f.name,
        predicted_excess_return_pct: f.predicted,
      })),
      portfolio: run.portfolio.map((h) => ({
        ticker: h.ticker,
        fund_name: h.fund,
        weight_pct: h.weight,
        expected_return_pct: h.expectedReturn,
      })),
      portfolio_expected_return_pct: run.expected_return,
      portfolio_expected_volatility_pct: run.expected_vol,
      portfolio_expected_sharpe: run.expected_sharpe,
      disclaimer: "For informational and educational purposes only. Not investment advice.",
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
});
