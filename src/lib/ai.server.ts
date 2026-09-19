/** Server-only: direct Google Gemini text helper + in-memory response cache. */

import { AI_UNAVAILABLE_MESSAGE } from "./ai-messages";

export const AI_UNAVAILABLE = AI_UNAVAILABLE_MESSAGE;

export const AI_TEXT_MODEL = "gemini-3.6-flash";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CacheEntry {
  value: string;
  expires: number;
}

export interface AiTextResult {
  text: string | null;
  retryable: boolean;
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

async function callGemini(apiKey: string, messages: AiMessage[]): Promise<AiTextResult> {
  const systemInstruction = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${AI_TEXT_MODEL}:generateContent`,
    {
    method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(systemInstruction
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
        contents,
      }),
    },
  );

  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    const body = await res.text().catch(() => "");
    console.error(`Gemini API error [${res.status}]: ${body.slice(0, 500)}`);
    if (retryable) throw new Error(`retryable:${res.status}`);
    return { text: null, retryable: false };
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  return { text: text || null, retryable: !text };
}

/**
 * Runs a text completion directly through the Google Gemini API.
 * Returns `null` when the model is unavailable — callers surface AI_UNAVAILABLE.
 * Successful results are cached in memory when `cacheKey` is supplied.
 */
export async function generateAiText(
  messages: AiMessage[],
  options: { cacheKey?: string; ttlMs?: number } = {},
): Promise<string | null> {
  return (await generateAiTextResult(messages, options)).text;
}

/** Also reports whether a failed request is safe to try once more. */
export async function generateAiTextResult(
  messages: AiMessage[],
  options: { cacheKey?: string; ttlMs?: number } = {},
): Promise<AiTextResult> {
  const { cacheKey, ttlMs = 6 * 60 * 60_000 } = options;
  if (cacheKey) {
    const cached = readCache(cacheKey);
    if (cached) return { text: cached, retryable: false };
  }

  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not configured");
    return { text: null, retryable: false };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callGemini(apiKey, messages);
      if (result.text && cacheKey) writeCache(cacheKey, result.text, ttlMs);
      return result;
    } catch (error) {
      const retryable = error instanceof Error && error.message.startsWith("retryable:");
      if (!retryable || attempt === 1) {
        if (!retryable) console.error("Gemini API request failed", error);
        return { text: null, retryable };
      }
      await sleep(800);
    }
  }
  return { text: null, retryable: true };
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
