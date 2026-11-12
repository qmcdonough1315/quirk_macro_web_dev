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
import {
  proposeDefinedRiskTrade,
  type MlegOrderPayload,
  type OptionContractQuote,
  type TradeProposalResult,
} from "./options-orders";
import {
  OPTIONS_DTE_MAX,
  OPTIONS_DTE_MIN,
  OPTIONS_PAPER_CAPITAL_USD,
  maxNameMarginUsd,
  type OptionsStructure,
} from "./options-sleeve-rules";

export type { OptionsFillsFeed, OpenSpread } from "./options-fills";
export type {
  MlegOrderPayload,
  OptionContractQuote,
  TradeProposal,
  TradeProposalResult,
} from "./options-orders";

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
  init?: { method?: string; body?: string },
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { keyId, secret } = credentials();
  if (!keyId || !secret) {
    return {
      ok: false,
      error:
        "Alpaca credentials missing. Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in Vercel (Production) and redeploy, or in Cursor secrets.",
    };
  }

  try {
    const headers: Record<string, string> = {
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secret,
      Accept: "application/json",
    };
    if (init?.body) headers["Content-Type"] = "application/json";
    const res = await fetch(
      url,
      init?.body
        ? {
            method: init.method ?? "POST",
            headers,
            body: init.body,
            cache: "no-store",
          }
        : {
            method: init?.method ?? "GET",
            headers,
            cache: "no-store",
          },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Alpaca ${res.status}: ${body.slice(0, 240) || res.statusText}` };
    }
    if (res.status === 204) return { ok: true, data: {} as T };
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

async function alpacaPost<T>(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { baseUrl } = credentials();
  const url = `${baseUrl}/v2${path.startsWith("/") ? path : `/${path}`}`;
  return alpacaFetch<T>(url, { method: "POST", body: JSON.stringify(body) });
}

export function isPaperTradingBase(baseUrl = credentials().baseUrl): boolean {
  return /paper-api\.alpaca\.markets/i.test(baseUrl);
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

function ymdPlusDays(days: number, asOf = new Date()): string {
  const d = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mapContract(raw: Record<string, unknown>): OptionContractQuote | null {
  const symbol = str(raw["symbol"]).toUpperCase();
  const underlying = str(raw["underlying_symbol"] || raw["root_symbol"]).toUpperCase();
  const expirationDate = str(raw["expiration_date"]);
  const typeRaw = str(raw["type"]).toLowerCase();
  const type = typeRaw === "call" || typeRaw === "put" ? typeRaw : null;
  const strikePrice = num(raw["strike_price"]);
  if (!symbol || !underlying || !expirationDate || !type || !(strikePrice > 0)) return null;
  return {
    symbol,
    underlying,
    expirationDate,
    strikePrice,
    type,
    mid: null,
    bid: null,
    ask: null,
    delta: null,
    tradable: raw["tradable"] == null ? true : Boolean(raw["tradable"]),
  };
}

function readQuoteSide(snap: unknown, key: "bid" | "ask"): number | null {
  if (!snap || typeof snap !== "object") return null;
  const quote = (snap as Record<string, unknown>)["latestQuote"];
  if (!quote || typeof quote !== "object") return null;
  const px = (quote as Record<string, unknown>)[key === "bid" ? "bp" : "ap"];
  const value = typeof px === "string" ? Number(px) : Number(px);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function fetchOptionSnapshots(
  symbols: string[],
): Promise<{
  bySymbol: Map<string, { bid: number | null; ask: number | null; mid: number | null; delta: number | null }>;
  note: string | null;
}> {
  const bySymbol = new Map<
    string,
    { bid: number | null; ask: number | null; mid: number | null; delta: number | null }
  >();
  if (!symbols.length) return { bySymbol, note: null };
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
      const bid = readQuoteSide(snap, "bid");
      const ask = readQuoteSide(snap, "ask");
      const mid = bid != null && ask != null ? (bid + ask) / 2 : bid ?? ask;
      bySymbol.set(symbol.toUpperCase(), {
        bid,
        ask,
        mid: mid ?? null,
        delta: readDelta(snap),
      });
    }
  }

  return { bySymbol, note };
}

export async function fetchOptionContractsForUnderlying(
  underlying: string,
  opts?: { dteMin?: number; dteMax?: number },
): Promise<{ ok: true; contracts: OptionContractQuote[]; note: string | null } | { ok: false; error: string }> {
  const dteMin = opts?.dteMin ?? OPTIONS_DTE_MIN;
  const dteMax = opts?.dteMax ?? OPTIONS_DTE_MAX;
  const query = new URLSearchParams({
    underlying_symbols: underlying.toUpperCase(),
    status: "active",
    expiration_date_gte: ymdPlusDays(dteMin - 2),
    expiration_date_lte: ymdPlusDays(dteMax + 2),
    limit: "1000",
  });
  const res = await alpacaGet<Record<string, unknown>>(`/options/contracts?${query}`);
  if (!res.ok) return { ok: false, error: res.error };
  const rawList = res.data["option_contracts"];
  const rows = Array.isArray(rawList) ? (rawList as Record<string, unknown>[]) : [];
  const contracts = rows.map(mapContract).filter((c): c is OptionContractQuote => c != null);
  if (!contracts.length) {
    return { ok: true, contracts: [], note: `No active contracts for ${underlying.toUpperCase()}.` };
  }

  const snaps = await fetchOptionSnapshots(contracts.map((c) => c.symbol));
  for (const c of contracts) {
    const snap = snaps.bySymbol.get(c.symbol);
    if (!snap) continue;
    c.bid = snap.bid;
    c.ask = snap.ask;
    c.mid = snap.mid;
    c.delta = snap.delta;
  }
  return { ok: true, contracts, note: snaps.note };
}

export async function fetchUnderlyingLastPrice(
  symbol: string,
): Promise<{ ok: true; price: number } | { ok: false; error: string }> {
  const { dataBase } = credentials();
  const upper = symbol.toUpperCase();
  const tradeUrl = `${dataBase}/v2/stocks/${encodeURIComponent(upper)}/trades/latest`;
  let res = await alpacaFetch<Record<string, unknown>>(tradeUrl);
  if (!res.ok) {
    const q = new URLSearchParams({ symbols: upper, feed: "iex" });
    res = await alpacaFetch<Record<string, unknown>>(`${dataBase}/v2/stocks/trades/latest?${q}`);
  }
  if (!res.ok) return { ok: false, error: res.error };

  const trade =
    (res.data["trade"] as Record<string, unknown> | undefined) ??
    ((res.data["trades"] as Record<string, unknown> | undefined)?.[upper] as
      | Record<string, unknown>
      | undefined);
  const price = num(trade?.["p"] ?? trade?.["price"]);
  if (!(price > 0)) return { ok: false, error: `No last trade for ${upper}.` };
  return { ok: true, price };
}

export interface SignalProposalRequest {
  ticker: string;
  compositeScore: number;
  ivRank: number;
}

export interface OptionsProposalBatch {
  live: boolean;
  asOf: string;
  paperOnly: boolean;
  proposals: TradeProposalResult[];
  notes: string[];
}

export async function proposeOptionsPaperTrades(
  signals: SignalProposalRequest[],
): Promise<OptionsProposalBatch> {
  const notes: string[] = [];
  const { keyId, secret, baseUrl } = credentials();
  if (!keyId || !secret) {
    return {
      live: false,
      asOf: new Date().toISOString(),
      paperOnly: isPaperTradingBase(baseUrl),
      proposals: [],
      notes: [
        "Alpaca credentials missing. Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in Vercel (Production) and redeploy, or in Cursor secrets.",
      ],
    };
  }

  const paperOnly = isPaperTradingBase(baseUrl);
  if (!paperOnly) notes.push("Base URL is not paper-api — proposals only; placement blocked.");

  const proposals: TradeProposalResult[] = [];
  const budget = Math.min(maxNameMarginUsd(), OPTIONS_PAPER_CAPITAL_USD);

  for (const signal of signals) {
    const ticker = signal.ticker.toUpperCase();
    const priceRes = await fetchUnderlyingLastPrice(ticker);
    if (!priceRes.ok) {
      proposals.push({
        ok: false,
        ticker,
        structure: "skip_low_iv",
        signal: {
          ticker,
          compositeScore: signal.compositeScore,
          ivRank: signal.ivRank,
          regime: "q4_low_iv",
          structure: "skip_low_iv",
          dteMin: OPTIONS_DTE_MIN,
          dteMax: OPTIONS_DTE_MAX,
          shortDelta: 0,
          wingDelta: null,
          rationale: priceRes.error,
        },
        reason: priceRes.error,
      });
      continue;
    }

    const chainRes = await fetchOptionContractsForUnderlying(ticker);
    if (!chainRes.ok) {
      proposals.push({
        ok: false,
        ticker,
        structure: "skip_low_iv",
        signal: {
          ticker,
          compositeScore: signal.compositeScore,
          ivRank: signal.ivRank,
          regime: "q4_low_iv",
          structure: "skip_low_iv",
          dteMin: OPTIONS_DTE_MIN,
          dteMax: OPTIONS_DTE_MAX,
          shortDelta: 0,
          wingDelta: null,
          rationale: chainRes.error,
        },
        reason: chainRes.error,
      });
      continue;
    }
    if (chainRes.note) notes.push(`${ticker}: ${chainRes.note}`);

    proposals.push(
      proposeDefinedRiskTrade({
        ticker,
        compositeScore: signal.compositeScore,
        ivRank: signal.ivRank,
        underlyingPrice: priceRes.price,
        contracts: chainRes.contracts,
        capitalBudgetUsd: budget,
      }),
    );
  }

  return {
    live: true,
    asOf: new Date().toISOString(),
    paperOnly,
    proposals,
    notes,
  };
}

export interface PlaceOptionsOrderRequest {
  confirm: boolean;
  qty: number;
  limitPrice: number;
  legs: Array<{
    symbol: string;
    side: "buy" | "sell";
    positionIntent: "buy_to_open" | "sell_to_open";
    ratioQty?: number;
  }>;
  structure?: OptionsStructure;
  ticker?: string;
}

export interface PlaceOptionsOrderResult {
  ok: boolean;
  dryRun: boolean;
  orderId: string | null;
  status: string | null;
  payload: MlegOrderPayload | null;
  error: string | null;
}

export async function placeOptionsPaperOrder(
  req: PlaceOptionsOrderRequest,
): Promise<PlaceOptionsOrderResult> {
  const empty = (error: string, dryRun = true): PlaceOptionsOrderResult => ({
    ok: false,
    dryRun,
    orderId: null,
    status: null,
    payload: null,
    error,
  });

  if (!req.confirm) {
    return empty("Set confirm=true to submit a paper mleg order.");
  }
  if (!isPaperTradingBase()) {
    return empty("Refusing order: ALPACA_API_BASE_URL is not paper-api.alpaca.markets.");
  }
  if (req.structure === "skip_low_iv") {
    return empty("Refusing skip_low_iv — no order.");
  }
  if (!(req.qty > 0) || !Number.isFinite(req.qty)) {
    return empty("Invalid qty.");
  }
  if (!req.legs?.length || req.legs.length > 4) {
    return empty("mleg orders need 1–4 legs.");
  }
  if (!(req.limitPrice < 0)) {
    return empty("Credit spreads require a negative limit_price (Alpaca credit convention).");
  }

  const payload = {
    order_class: "mleg" as const,
    qty: String(Math.floor(req.qty)),
    type: "limit" as const,
    limit_price: String(req.limitPrice),
    time_in_force: "day" as const,
    legs: req.legs.map((leg) => ({
      symbol: leg.symbol.toUpperCase(),
      ratio_qty: String(leg.ratioQty ?? 1),
      side: leg.side,
      position_intent: leg.positionIntent,
    })),
  };
  const res = await alpacaPost<Record<string, unknown>>("/orders", payload);
  if (!res.ok) {
    return {
      ok: false,
      dryRun: false,
      orderId: null,
      status: null,
      payload,
      error: res.error,
    };
  }

  return {
    ok: true,
    dryRun: false,
    orderId: str(res.data["id"]) || null,
    status: str(res.data["status"]) || null,
    payload,
    error: null,
  };
}
