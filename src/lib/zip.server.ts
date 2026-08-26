/** Server-only helper: AI "Drive-By Vibe" narrative for a ZIP row. */

export interface VibeInput {
  zip: string;
  city?: string | null;
  state?: string | null;
  metrics: Record<string, number | string | null | undefined>;
}

export interface VibeResult {
  /** One punchy summary sentence */
  vibe: string;
  /** 1-3 word classification, e.g. "Dense Urban" */
  settingLabel: string;
  /** Suburban / urban / rural feel */
  setting: string;
  /** Income, age, trajectory & growth */
  demographics: string;
  /** Lifestyle, commute, schools/family environment */
  context: string;
  tags: string[];
}

export async function generateDriveByVibe(input: VibeInput): Promise<VibeResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI key is not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "system",
          content: [
            'You are a sharp local housing analyst writing the "Drive-By Vibe Check" for an institutional housing dashboard. Respond ONLY with strict JSON:',
            '{"vibe":string,"settingLabel":string,"setting":string,"demographics":string,"context":string,"tags":[string]}',
            '- "vibe": ONE punchy sentence capturing the overall feel of the area.',
            '- "settingLabel": 1-3 words classifying the setting (e.g. "Dense Urban", "Inner Suburb", "Exurban / Rural"), inferred from owner occupancy %, price per sqft, and listing density.',
            '- "setting": 1-2 sentences on the urban/suburban/rural feel — housing stock, density, streetscape — grounded in owner_occupancy_pct and price_per_sqft.',
            '- "demographics": 1-2 sentences on household income, median age, and the area\'s trajectory (wealth signal, growth / net-migration momentum) inferred from median_household_income, median_age, price_to_income_ratio, and market pace.',
            '- "context": 1-2 sentences on lifestyle, commute (reference avg_commute_mins), and the general school / family environment.',
            '- "tags": 4 short descriptors (1-2 words each).',
            "Ground every claim in the numbers provided. Never invent specific school names, employers, or statistics not implied by the metrics.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `ZIP ${input.zip}${input.city ? `, ${input.city}` : ""}${
            input.state ? `, ${input.state}` : ""
          }. Metrics: ${JSON.stringify(input.metrics)}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`AI vibe check failed (${res.status})`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI vibe check returned an unexpected response");
  const parsed = JSON.parse(match[0]) as Partial<VibeResult>;
  return {
    vibe: parsed.vibe ?? "",
    settingLabel: parsed.settingLabel ?? "Mixed Setting",
    setting: parsed.setting ?? "",
    demographics: parsed.demographics ?? "",
    context: parsed.context ?? "",
    tags: (parsed.tags ?? []).slice(0, 4),
  };
}
