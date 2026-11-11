import { defineMcp } from "@lovable.dev/mcp-js";

import cashYieldsTool from "./tools/cash-yields";
import factorModelTool from "./tools/factor-model";
import macroSnapshotTool from "./tools/macro-snapshot";

export default defineMcp({
  name: "quirk-macro-mcp",
  title: "Quirk Macro Analytics",
  version: "0.1.0",
  instructions:
    "Read-only access to the Quirk Macro Analytics dashboard. Use `get_macro_snapshot` for US rates, growth and inflation, including the 30-year mortgage; `get_etf_factor_model` for the latest Fama-French/Carhart factor run and target ETF portfolio; `get_cash_yields` for the short-duration cash fund leaderboard. All figures are informational only and are not investment advice.",
  tools: [macroSnapshotTool, factorModelTool, cashYieldsTool],
});
