import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { averageZipRows, fetchCityRows, fetchZipRow } from "@/lib/supabase";

export default defineTool({
  name: "get_local_housing_market",
  title: "Get local housing market",
  description:
    "Housing and neighborhood metrics for a US ZIP code or city: median home price, median rent, price-to-rent and price-to-income ratios, price per square foot, days on market, active and new listings, share of price cuts, median household income, median age, owner occupancy and average commute. City lookups average across every ZIP in the city.",
  inputSchema: {
    location: z
      .string()
      .min(2)
      .describe("A 5-digit US ZIP code (e.g. 20007) or a city name (e.g. Washington, DC)"),
  },
  handler: async ({ location }) => {
    const term = location.trim();
    const isZip = /^\d{5}$/.test(term);

    let row;
    let scope: string;
    if (isZip) {
      row = await fetchZipRow(term);
      scope = `ZIP ${term}`;
    } else {
      const rows = await fetchCityRows(term);
      if (!rows.length) {
        return {
          content: [{ type: "text", text: `No housing data found for "${term}".` }],
          isError: true,
        };
      }
      row = rows.length === 1 ? rows[0]! : averageZipRows(rows);
      scope = `${rows[0]!.city ?? term}${rows[0]!.state ? `, ${rows[0]!.state}` : ""} (average of ${rows.length} ZIP codes)`;
    }

    const payload = { scope, ...row };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
});
