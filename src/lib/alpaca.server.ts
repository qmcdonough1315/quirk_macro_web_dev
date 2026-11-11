/**
 * Alpaca paper Trading API client (server-only).
 *
 * Credentials from env (never commit):
 *   ALPACA_API_KEY_ID
 *   ALPACA_API_SECRET_KEY
 * Optional:
 *   ALPACA_API_BASE_URL  (default https://paper-api.alpaca.markets)
 *   ALPACA_DATA_BASE_URL (default https://data.alpaca.markets)
 */

import {
  buildOptionsFeed,
  parseOcc,
  type OptionFillInput,
  type OptionsFillsFeed,
} from "./options-fills";

export type { OptionsFillsFeed, OpenSpread } from "./options-fills";

export const DEFAULT_ALPACA_PAPER_BASE = "https://paper-api.alpaca.markets";
const DEFAULT_ALPACA_DATA_BASE = "https://data.alpaca.markets";

export interface AlpacaAccountSnapshot {
  id: string;
  status: string;
  currency: string;
  cash: number;
  portfolioValue: number;
  equity: number;
  lastEquity: number;
  longMarketValue: number;
  shortMarketValue: number;
  buyingPower: number;
  optionsBuyingPower: number;
  optionsApprovedLevel: number | null;
  optionsTradingLevel: number | null;
  patternDayTrader: boolean;
  tradingBlocked: boolean;
  accountBlocked: boolean;
  multiplier: string;
}

export interface AlpacaPosition {
  assetId: string;
  symbol: string;
  assetClass: string;
  qty: number;
  qtyAvailable: number;
  side: "long" | "short";
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  currentPrice: number;
  avgEntryPrice: number;
  changeToday: number;
}

export interface AlpacaPaperLedger {
  live: boolean;
  asOf: string;
  baseUrl: string;
  account: AlpacaAccountSnapshot | null;
  positions: AlpacaPosition[];
  equityPositions: AlpacaPosition[];
  optionPositions: AlpacaPosition[];
  optionsFeed: OptionsFillsFeed | null;
  notes: string[];
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

function credentials() {
  const keyId = (process.env["ALPACA_API_KEY_ID"] || process.env["APCA_API_KEY_ID"] || "").trim();
  const secret = (
    process.env["ALPACA_API_SECRET_KEY"] ||
    process.env["APCA_API_SECRET_KEY"] ||
    ""
  ).trim();
  const rawBase = (
    process.env["ALPACA_API_BASE_URL"] ||
    process.env["APCA_API_BASE_URL"] ||
    DEFAULT_ALPACA_PAPER_BASE
  ).trim();
  const baseUrl = rawBase.replace(/\/v2\/?$/, "").replace(/\/$/, "");
  const dataBase = (process.env["ALPACA_DATA_BASE_URL"] || DEFAULT_ALPACA_DATA_BASE)
    .trim()
    .replace(/\/$/, "");
  return { keyId, secret, baseUrl, dataBase };
}

async function alpacaFetch<T>(
  url: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { keyId, secret } = credentials();
  if (!keyId || !secret) {
    return {
      ok: false,
      error:
        "Alpaca credentials missing. Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in Cursor secrets.",
    };
  }

  try {
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": keyId,
        "APCA-API-SECRET-KEY": secret,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Alpaca ${res.status}: ${body.slice(0, 240) || res.statusText}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Alpaca request failed",
    };
  }
}

async function alpacaGet<T>(
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { baseUrl } = credentials();
  const url = `${baseUrl}/v2${path.startsWith("/") ? path : `/${path}`}`;
  return alpacaFetch<T>(url);
}

function mapAccount(raw: Record<string, unknown>): AlpacaAccountSnapshot {
  const optionsBp = raw["options_buying_power"] ?? raw["buying_power"];
  const approved = raw["options_approved_level"];
  const trading = raw["options_trading_level"];
  return {
    id: str(raw["id"]),
    status: str(raw["status"]),
    currency: str(raw["currency"], "USD"),
    cash: num(raw["cash"]),
    portfolioValue: num(raw["portfolio_value"]),
    equity: num(raw["equity"]),
    lastEquity: num(raw["last_equity"]),
    longMarketValue: num(raw["long_market_value"]),
    shortMarketValue: num(raw["short_market_value"]),
    buyingPower: num(raw["buying_power"]),
    optionsBuyingPower: num(optionsBp),
    optionsApprovedLevel: approved == null ? null : num(approved),
    optionsTradingLevel: trading == null ? null : num(trading),
    patternDayTrader: Boolean(raw["pattern_day_trader"]),
    tradingBlocked: Boolean(raw["trading_blocked"]),
    accountBlocked: Boolean(raw["account_blocked"]),
    multiplier: str(raw["multiplier"], "1"),
  };
}

function mapPosition(raw: Record<string, unknown>): AlpacaPosition {
  const assetClass = str(raw["asset_class"], "us_equity");
  const plpc = num(raw["unrealized_plpc"]);
  return {
    assetId: str(raw["asset_id"]),
    symbol: str(raw["symbol"]).toUpperCase(),
    assetClass,
    qty: num(raw["qty"]),
    qtyAvailable: num(raw["qty_available"] ?? raw["qty"]),
    side: str(raw["side"], "long") === "short" ? "short" : "long",
    marketValue: num(raw["market_value"]),
    costBasis: num(raw["cost_basis"]),
    unrealizedPl: num(raw["unrealized_pl"]),
    unrealizedPlpc: Math.abs(plpc) <= 1 ? plpc * 100 : plpc,
    currentPrice: num(raw["current_price"]),
    avgEntryPrice: num(raw["avg_entry_price"]),
    changeToday: num(raw["change_today"]),
  };
}

function isOptionPosition(p: AlpacaPosition): boolean {
  if (p.assetClass.toLowerCase().includes("option")) return true;
  return /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(p.symbol);
}

export function emptyAlpacaLedger(notes: string[]): AlpacaPaperLedger {
  return {
    live: false,
    asOf: new Date().toISOString(),
    baseUrl: credentials().baseUrl,
    account: null,
    positions: [],
    equityPositions: [],
    optionPositions: [],
    optionsFeed: null,
    notes,
  };
}

async function fetchOptionFills(): Promise<{
  fills: OptionFillInput[] | null;
  note: string | null;
}> {
  const fills: OptionFillInput[] = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({
      activity_types: "FILL",
      page_size: "100",
      direction: "asc",
    });
    if (pageToken) query.set("page_token", pageToken);
    const res = await alpacaGet<unknown>(`/account/activities?${query}`);
    if (!res.ok) return { fills: null, note: res.error };
    if (!Array.isArray(res.data))
      return { fills: null, note: "Alpaca fill history was not a list." };
    const rows = res.data as Record<string, unknown>[];
    for (const raw of rows) {
      const symbol = str(raw["symbol"]).toUpperCase();
      if (!parseOcc(symbol)) continue;
      fills.push({
        id: str(raw["id"]),
        symbol,
        side: str(raw["side"], "buy"),
        qty: num(raw["qty"]),
        price: num(raw["price"]),
        transactionTime: str(raw["transaction_time"]),
      });
    }
    if (rows.length < 100) return { fills, note: null };
    const lastId = str(rows[rows.length - 1]?.["id"]);
    if (!lastId || lastId === pageToken) break;
    pageToken = lastId;
  }
  return { fills, note: "Option fill history stopped after 2,000 activities." };
}

function readDelta(snap: unknown): number | null {
  if (!snap || typeof snap !== "object") return null;
  const greeks = (snap as Record<string, unknown>)["greeks"];
  if (!greeks || typeof greeks !== "object") return null;
  const delta = (greeks as Record<string, unknown>)["delta"];
  const value = typeof delta === "string" ? Number(delta) : Number(delta);
  return Number.isFinite(value) ? value : null;
}

async function fetchOptionDeltas(
  symbols: string[],
): Promise<{ deltas: Map<string, number>; note: string | null }> {
  const deltas = new Map<string, number>();
  if (!symbols.length) return { deltas, note: null };
  const { dataBase } = credentials();
  let note: string | null = null;

  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    const load = async (feed?: string) => {
      const query = new URLSearchParams({ symbols: chunk.join(",") });
      if (feed) query.set("feed", feed);
      return alpacaFetch<Record<string, unknown>>(`${dataBase}/v1beta1/options/snapshots?${query}`);
    };
    let res = await load();
    if (!res.ok) res = await load("indicative");
    if (!res.ok) {
      note = res.error;
      continue;
    }
    const snaps = res.data["snapshots"];
    if (!snaps || typeof snaps !== "object") continue;
    for (const [symbol, snap] of Object.entries(snaps as Record<string, unknown>)) {
      const delta = readDelta(snap);
      if (delta != null) deltas.set(symbol.toUpperCase(), delta);
    }
  }

  return { deltas, note };
}

export async function fetchAlpacaPaperLedger(): Promise<AlpacaPaperLedger> {
  const notes: string[] = [];
  const accountRes = await alpacaGet<Record<string, unknown>>("/account");
  if (!accountRes.ok) {
    return emptyAlpacaLedger([accountRes.error]);
  }

  const positionsRes = await alpacaGet<Record<string, unknown>[]>("/positions");
  const positions = positionsRes.ok ? positionsRes.data.map(mapPosition) : [];
  if (!positionsRes.ok) {
    notes.push(positionsRes.error);
  }

  const equityPositions = positions.filter((p) => !isOptionPosition(p));
  const optionPositions = positions.filter((p) => isOptionPosition(p));
  const account = mapAccount(accountRes.data);

  const feedNotes: string[] = [];
  const fillHistory = await fetchOptionFills();
  if (fillHistory.note) feedNotes.push(fillHistory.note);
  const greeks = await fetchOptionDeltas(optionPositions.map((position) => position.symbol));
  if (greeks.note) feedNotes.push(`Option greeks unavailable (${greeks.note}).`);

  const optionsFeed = buildOptionsFeed({
    positions: optionPositions.map((position) => ({
      symbol: position.symbol,
      qty: position.qty,
      side: position.side,
      avgEntryPrice: position.avgEntryPrice,
      currentPrice: position.currentPrice,
      unrealizedPl: position.unrealizedPl,
      delta: greeks.deltas.get(position.symbol) ?? null,
    })),
    fills: fillHistory.fills,
    notes: feedNotes,
  });

  notes.push(
    `Paper account ${account.status} · options level ${account.optionsTradingLevel ?? "n/a"} (approved ${account.optionsApprovedLevel ?? "n/a"})`,
  );
  notes.push(
    `${optionsFeed.spreads.length} open spread${optionsFeed.spreads.length === 1 ? "" : "s"} · ${optionPositions.length} option legs`,
  );

  return {
    live: true,
    asOf: new Date().toISOString(),
    baseUrl: credentials().baseUrl,
    account,
    positions,
    equityPositions,
    optionPositions,
    optionsFeed,
    notes,
  };
}
