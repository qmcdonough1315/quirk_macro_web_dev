/** Server-only helper: AI "Drive-By Vibe" narrative for a ZIP row. */

export interface VibeInput {
  zip: string;
  city?: string | null;
  state?: string | null;
  metrics: Record<string, number | string | null | undefined>;
}

export async function generateDriveByVibe(input: VibeInput): Promise<{ vibe: string; tags: string[] }> {
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
          content:
            'You are a sharp local housing analyst. Respond ONLY with strict JSON: {"vibe":string,"tags":[string]}. "vibe" is EXACTLY 3 sentences describing the neighborhood vibe for someone driving through — pace of the market, who lives there, and affordability/lifestyle feel. Ground every claim in the numbers provided. "tags": 4 short descriptors (1-2 words each).',
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
  const parsed = JSON.parse(match[0]) as { vibe?: string; tags?: string[] };
  return { vibe: parsed.vibe ?? "", tags: (parsed.tags ?? []).slice(0, 4) };
}
