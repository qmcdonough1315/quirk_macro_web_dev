export interface RegimeInput {
  asOfDate: string;
  factors: { code: string; name: string; predicted: number }[];
  holdings: { ticker: string; weight: number }[];
  expectedReturn: number | null;
  expectedVol: number | null;
  expectedSharpe: number | null;
}

function fallbackSummary(input: RegimeInput): string {
  const sorted = [...input.factors].sort((a, b) => b.predicted - a.predicted);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const top3 = input.holdings.slice(0, 3).map((h) => h.ticker).join(", ");
  const parts = [
    top && bottom
      ? `The ${input.asOfDate} run leans hardest on ${top.name} (${top.predicted.toFixed(2)}%) and reads ${bottom.name} as the biggest drag (${bottom.predicted.toFixed(2)}%).`
      : `Model run dated ${input.asOfDate}.`,
    input.expectedReturn !== null
      ? `The resulting 3-month portfolio targets ${input.expectedReturn.toFixed(2)}% expected return${
          input.expectedVol !== null ? ` against ${input.expectedVol.toFixed(1)}% expected volatility` : ""
        }${input.expectedSharpe !== null ? `, a Sharpe of ${input.expectedSharpe.toFixed(2)}` : ""}.`
      : "Portfolio statistics were not reported for this run.",
    top3 ? `Largest allocations are ${top3}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

/** Three-sentence regime read generated from this run's own numbers. */
export async function generateRegimeSummary(input: RegimeInput): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return fallbackSummary(input);

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

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a quantitative factor strategist. Write exactly three sentences, plain prose, no markdown, no bullet points. Interpret the current macroeconomic regime strictly from the supplied Fama-French and Carhart factor forecasts and the resulting portfolio. Cite at most four figures, each rounded to one decimal place (Sharpe to two), and never print long decimals. Do not invent data points, do not cite outside events, do not give investment advice.",
          },
          { role: "user", content: `Model run data: ${context}` },
        ],
      }),
    });
    if (!res.ok) return fallbackSummary(input);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    return text || fallbackSummary(input);
  } catch {
    return fallbackSummary(input);
  }
}
