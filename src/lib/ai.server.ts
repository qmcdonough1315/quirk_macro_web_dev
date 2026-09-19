/** Server-only: shared Lovable AI Gateway text helper (Gemini) + in-memory response cache. */

export const AI_UNAVAILABLE = "commentary unavailable at the moment, check back soon!";

export const AI_TEXT_MODEL = "google/gemini-3.6-flash";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CacheEntry {
  value: string;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

function readCache(key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: string, ttlMs: number) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGateway(apiKey: string, messages: AiMessage[]): Promise<string | null> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: AI_TEXT_MODEL, messages }),
  });

  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    const body = await res.text().catch(() => "");
    console.error(`AI gateway error [${res.status}]: ${body.slice(0, 500)}`);
    if (retryable) throw new Error(`retryable:${res.status}`);
    return null;
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = (json.choices?.[0]?.message?.content ?? "").trim();
  return text || null;
}

/**
 * Runs a Gemini text completion through the Lovable AI Gateway.
 * Returns `null` when the model is unavailable — callers surface AI_UNAVAILABLE.
 * Successful results are cached in memory when `cacheKey` is supplied.
 */
export async function generateAiText(
  messages: AiMessage[],
  options: { cacheKey?: string; ttlMs?: number } = {},
): Promise<string | null> {
  const { cacheKey, ttlMs = 6 * 60 * 60_000 } = options;
  if (cacheKey) {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    console.error("LOVABLE_API_KEY is not configured");
    return null;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callGateway(apiKey, messages);
      if (text && cacheKey) writeCache(cacheKey, text, ttlMs);
      return text;
    } catch (error) {
      const retryable = error instanceof Error && error.message.startsWith("retryable:");
      if (!retryable || attempt === 1) {
        if (!retryable) console.error("AI gateway request failed", error);
        return null;
      }
      await sleep(800);
    }
  }
  return null;
}

/** Extracts the first JSON object/array from a model response. */
export function parseJsonBlock<T>(raw: string, kind: "object" | "array" = "object"): T | null {
  const match = raw.match(kind === "array" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

/** Stable short hash for cache keys built from variable context strings. */
export function hashKey(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
