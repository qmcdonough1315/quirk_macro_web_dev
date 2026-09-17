import { defineTool } from "@lovable.dev/mcp-js";

import { fetchMacroSnapshot } from "@/lib/market.server";

export default defineTool({
  name: "get_macro_snapshot",
  title: "Get macro snapshot",
  description:
    "Current US macro indicators tracked by Quirk Macro: 30-year fixed mortgage rate, 10-year Treasury yield, the mortgage/Treasury spread, real GDP growth (QoQ annualized) and Core PCE inflation (YoY), plus the trailing 12-month monthly series.",
  inputSchema: {},
  handler: async () => {
    const snap = await fetchMacroSnapshot();
    const payload = {
      as_of: snap.updated,
      mortgage_30y_pct: snap.mortgage.latest,
      mortgage_as_of: snap.mortgage.latestDate,
      treasury_10y_pct: snap.treasury.latest,
      treasury_as_of: snap.treasury.latestDate,
      spread_bps: snap.spreadBps,
      spread_change_bps: snap.spreadChangeBps,
      gdp_growth_qoq_annualized_pct: snap.gdp.latest,
      gdp_as_of: snap.gdp.latestDate,
      core_pce_yoy_pct: snap.corePce.latest,
      core_pce_as_of: snap.corePce.latestDate,
      trailing_12m: snap.series,
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
});
