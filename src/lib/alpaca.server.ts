/**
 * Alpaca paper Trading API client (server-only).
 *
 * Credentials from env (never commit):
 *   ALPACA_API_KEY_ID
 *   ALPACA_API_SECRET_KEY
 * Optional:
 *   ALPACA_API_BASE_URL  (default https://paper-api.alpaca.markets)
 */

export const DEFAULT_ALPACA_PAPER_BASE = "https://paper-api.alpaca.markets";

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
  return { keyId, secret, baseUrl };
}

async function alpacaGet<T>(
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { keyId, secret, baseUrl } = credentials();
  if (!keyId || !secret) {
    return {
      ok: false,
      error:
        "Alpaca credentials missing. Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in Cursor secrets.",
    };
  }

  const url = `${baseUrl}/v2${path.startsWith("/") ? path : `/${path}`}`;
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
    notes,
  };
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

  notes.push(
    `Paper account ${account.status} · options level ${account.optionsTradingLevel ?? "n/a"} (approved ${account.optionsApprovedLevel ?? "n/a"})`,
  );

  return {
    live: true,
    asOf: new Date().toISOString(),
    baseUrl: credentials().baseUrl,
    account,
    positions,
    equityPositions,
    optionPositions,
    notes,
  };
}
