import { defineTool } from "@lovable.dev/mcp-js";

import { fetchCashManagerYields } from "@/lib/cash-manager";

export default defineTool({
  name: "get_cash_yields",
  title: "Get cash yield leaderboard",
  description:
    "Short-duration Treasury funds and money market funds ranked by 30-day SEC yield, with expense ratios and distribution schedules, plus the average yield, average expense ratio and 3-month T-bill benchmark. All percentages are whole numbers (4.45 means 4.45%).",
  inputSchema: {},
  handler: async () => {
    const data = await fetchCashManagerYields();
    const payload = {
      as_of: data.asOf,
      live: data.live,
      average_sec_yield_pct: data.summary?.avg_yield ?? null,
      average_expense_ratio_pct: data.summary?.avg_expense_ratio ?? null,
      benchmark_3m_tbill_pct: data.summary?.benchmark_3m_tbill ?? null,
      funds: data.funds.map((f) => ({
        ticker: f.ticker,
        fund_name: f.fund_name,
        category: f.category,
        sec_yield_30d_pct: f.sec_yield_30d,
        expense_ratio_pct: f.expense_ratio,
        distribution_frequency: f.distribution_frequency,
      })),
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
});
