/**
 * Pure options fills ledger.
 * Groups open OCC legs into spreads, realizes premium from fills, and
 * computes defined-risk buying power. No network and no ETF-book side effects.
 */

const CONTRACT_MULTIPLIER = 100;

const UNDERLYING_BETA: Record<string, number> = {
  SPY: 1,
  VOO: 1,
  IVV: 1,
  QQQ: 1.15,
  IWM: 1.2,
  XLK: 1.1,
  XLF: 1.05,
  XLE: 1.1,
  XLV: 0.75,
  XLI: 1.05,
  XLY: 1.1,
  XLP: 0.6,
  XLU: 0.5,
  XLB: 1.05,
  XLRE: 0.9,
  XLC: 1,
};

export interface ParsedOcc {
  symbol: string;
  underlying: string;
  expiry: string;
  right: "C" | "P";
  strike: number;
}

export interface OptionLegInput {
  symbol: string;
  qty: number;
  side: "long" | "short";
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPl: number;
  delta?: number | null;
}

export interface OptionFillInput {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  price: number;
  transactionTime: string;
}

export interface SpreadLeg {
  symbol: string;
  right: "C" | "P";
  strike: number;
  qty: number;
  avg: number;
  mark: number;
  delta: number | null;
}

export interface OpenSpread {
  id: string;
  underlying: string;
  expiry: string;
  structure: string;
  contracts: number;
  netCredit: number;
  markCredit: number;
  unrealizedPl: number;
  maxLoss: number | null;
  bpUsed: number | null;
  betaWeightedDelta: number | null;
  undefinedRisk: boolean;
  legs: SpreadLeg[];
}

export interface OptionsFillsFeed {
  spreads: OpenSpread[];
  bpUsed: number | null;
  maxLoss: number | null;
  unrealizedPl: number;
  realizedPl: number | null;
  betaWeightedDelta: number | null;
  undefinedRisk: boolean;
  openLegCount: number;
  notes: string[];
}

interface WorkingLeg {
  symbol: string;
  underlying: string;
  expiry: string;
  right: "C" | "P";
  strike: number;
  signedQty: number;
  avg: number;
  mark: number;
  unrealizedPerContract: number;
  delta: number | null;
}

interface Vertical {
  kind: "vertical";
  contracts: number;
  short: WorkingLeg;
  long: WorkingLeg;
}

interface Packaged {
  kind: "package";
  structure: string;
  contracts: number;
  legs: WorkingLeg[];
  netCredit: number;
  markCredit: number;
  unrealizedPl: number;
  maxLoss: number | null;
  bpUsed: number | null;
  undefinedRisk: boolean;
}

export function parseOcc(symbol: string): ParsedOcc | null {
  const match = /^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(
    symbol.trim().toUpperCase(),
  );
  if (!match) return null;
  const underlying = match[1];
  const yearRaw = match[2];
  const monthRaw = match[3];
  const dayRaw = match[4];
  const right = match[5];
  const strikeRaw = match[6];
  if (
    !underlying ||
    !yearRaw ||
    !monthRaw ||
    !dayRaw ||
    (right !== "C" && right !== "P") ||
    !strikeRaw
  ) {
    return null;
  }
  const year = 2000 + Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const strike = Number(strikeRaw) / 1000;
  if (!Number.isFinite(strike)) return null;
  return {
    symbol: symbol.trim().toUpperCase(),
    underlying,
    expiry: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    right,
    strike,
  };
}

function isSell(side: string): boolean {
  return side.trim().toLowerCase().startsWith("sell");
}

function underlyingBeta(underlying: string): number {
  return UNDERLYING_BETA[underlying] ?? 1;
}

function signedQty(leg: OptionLegInput): number {
  const qty = Math.abs(leg.qty);
  return leg.side === "short" ? -qty : qty;
}

function sliceLeg(leg: WorkingLeg, qty: number): WorkingLeg {
  const sign = leg.signedQty < 0 ? -1 : 1;
  return { ...leg, signedQty: sign * qty };
}

function legCredit(leg: WorkingLeg, qty: number): number {
  const sign = leg.signedQty < 0 ? -1 : 1;
  return -sign * leg.avg * qty * CONTRACT_MULTIPLIER;
}

function legMarkCredit(leg: WorkingLeg, qty: number): number {
  const sign = leg.signedQty < 0 ? -1 : 1;
  return -sign * leg.mark * qty * CONTRACT_MULTIPLIER;
}

function betaOf(
  legs: Array<{ delta: number | null; signedQty: number; underlying: string }>,
): number | null {
  let total = 0;
  for (const leg of legs) {
    if (leg.delta == null || !Number.isFinite(leg.delta)) return null;
    total += leg.delta * leg.signedQty * CONTRACT_MULTIPLIER * underlyingBeta(leg.underlying);
  }
  return total;
}

function definedRisk(maxLoss: number, credit: number): { maxLoss: number; bpUsed: number } {
  const loss = Math.max(0, maxLoss);
  return { maxLoss: loss, bpUsed: credit >= 0 ? loss : 0 };
}

interface Lot {
  qty: number;
  price: number;
  side: "long" | "short";
}

export function settleOptionFills(fills: OptionFillInput[]): {
  realized: number;
  openQty: Map<string, number>;
} {
  const books = new Map<string, Lot[]>();
  let realized = 0;
  const ordered = [...fills]
    .filter((fill) => parseOcc(fill.symbol) && fill.qty > 0 && Number.isFinite(fill.price))
    .sort((a, b) => a.transactionTime.localeCompare(b.transactionTime) || a.id.localeCompare(b.id));

  for (const fill of ordered) {
    const symbol = fill.symbol.toUpperCase();
    const sell = isSell(fill.side);
    let remaining = Math.abs(fill.qty);
    const book = books.get(symbol) ?? [];
    while (remaining > 1e-9 && book.length > 0) {
      const lot = book[0];
      if (!lot) break;
      const closes = (sell && lot.side === "long") || (!sell && lot.side === "short");
      if (!closes) break;
      const closeQty = Math.min(remaining, lot.qty);
      const pnl =
        lot.side === "long"
          ? (fill.price - lot.price) * closeQty * CONTRACT_MULTIPLIER
          : (lot.price - fill.price) * closeQty * CONTRACT_MULTIPLIER;
      realized += pnl;
      lot.qty -= closeQty;
      remaining -= closeQty;
      if (lot.qty <= 1e-9) book.shift();
    }
    if (remaining > 1e-9) {
      book.push({ qty: remaining, price: fill.price, side: sell ? "short" : "long" });
    }
    books.set(symbol, book);
  }

  const openQty = new Map<string, number>();
  for (const [symbol, lots] of books) {
    const net = lots.reduce((sum, lot) => sum + (lot.side === "short" ? -lot.qty : lot.qty), 0);
    if (Math.abs(net) > 1e-6) openQty.set(symbol, net);
  }
  return { realized, openQty };
}

function toWorking(leg: OptionLegInput): WorkingLeg | null {
  const parsed = parseOcc(leg.symbol);
  const qty = Math.abs(leg.qty);
  if (!parsed || qty <= 1e-9) return null;
  return {
    symbol: parsed.symbol,
    underlying: parsed.underlying,
    expiry: parsed.expiry,
    right: parsed.right,
    strike: parsed.strike,
    signedQty: signedQty(leg),
    avg: leg.avgEntryPrice,
    mark: leg.currentPrice,
    unrealizedPerContract: leg.unrealizedPl / qty,
    delta: leg.delta ?? null,
  };
}

function take(leg: WorkingLeg, contracts: number): WorkingLeg {
  const sliced = sliceLeg(leg, contracts);
  const sign = leg.signedQty < 0 ? -1 : 1;
  leg.signedQty -= sign * contracts;
  return sliced;
}

function pairVerticals(legs: WorkingLeg[]): { verticals: Vertical[]; rest: WorkingLeg[] } {
  const shorts = legs.filter((leg) => leg.signedQty < -1e-9);
  const longs = legs.filter((leg) => leg.signedQty > 1e-9);
  const verticals: Vertical[] = [];

  for (const short of shorts) {
    while (short.signedQty < -1e-9) {
      let wing: WorkingLeg | null = null;
      let best = Infinity;
      for (const long of longs) {
        if (long.signedQty <= 1e-9) continue;
        if (Math.abs(long.strike - short.strike) <= 1e-9) continue;
        const distance = Math.abs(long.strike - short.strike);
        if (distance < best - 1e-9) {
          best = distance;
          wing = long;
        }
      }
      if (!wing) break;
      const contracts = Math.min(Math.abs(short.signedQty), wing.signedQty);
      verticals.push({
        kind: "vertical",
        contracts,
        short: take(short, contracts),
        long: take(wing, contracts),
      });
    }
  }

  const rest = [...shorts, ...longs].filter((leg) => Math.abs(leg.signedQty) > 1e-9);
  return { verticals, rest };
}

function verticalName(short: WorkingLeg, long: WorkingLeg): string {
  if (short.right === "P") return short.strike > long.strike ? "Bull put" : "Bear put";
  return short.strike < long.strike ? "Bear call" : "Bull call";
}

function verticalPackage(vertical: Vertical): Packaged {
  const contracts = vertical.contracts;
  const short = sliceLeg(vertical.short, contracts);
  const long = sliceLeg(vertical.long, contracts);
  const netCredit = (short.avg - long.avg) * contracts * CONTRACT_MULTIPLIER;
  const markCredit = (short.mark - long.mark) * contracts * CONTRACT_MULTIPLIER;
  const width = Math.abs(short.strike - long.strike);
  const creditPerShare = short.avg - long.avg;
  const rawLoss =
    creditPerShare >= 0
      ? (width - creditPerShare) * CONTRACT_MULTIPLIER * contracts
      : Math.abs(creditPerShare) * CONTRACT_MULTIPLIER * contracts;
  const risk = definedRisk(rawLoss, netCredit);
  return {
    kind: "package",
    structure: verticalName(short, long),
    contracts,
    legs: [short, long],
    netCredit,
    markCredit,
    unrealizedPl: (short.unrealizedPerContract + long.unrealizedPerContract) * contracts,
    maxLoss: risk.maxLoss,
    bpUsed: risk.bpUsed,
    undefinedRisk: false,
  };
}

function mergeButterflies(verticals: Vertical[]): Array<Vertical | Packaged> {
  const used = new Set<number>();
  const out: Array<Vertical | Packaged> = [];
  for (let i = 0; i < verticals.length; i++) {
    if (used.has(i)) continue;
    const left = verticals[i];
    if (!left) continue;
    let partner = -1;
    for (let j = i + 1; j < verticals.length; j++) {
      if (used.has(j)) continue;
      const right = verticals[j];
      if (!right) continue;
      if (left.short.symbol !== right.short.symbol) continue;
      if (Math.abs(left.contracts - right.contracts) > 1e-9) continue;
      const leftAbove = left.long.strike > left.short.strike;
      const rightAbove = right.long.strike > right.short.strike;
      if (leftAbove === rightAbove) continue;
      partner = j;
      break;
    }
    if (partner < 0) {
      out.push(left);
      continue;
    }
    const other = verticals[partner];
    if (!other) {
      out.push(left);
      continue;
    }
    used.add(partner);
    const body = sliceLeg(left.short, left.contracts + other.contracts);
    const netCredit = verticalPackage(left).netCredit + verticalPackage(other).netCredit;
    const markCredit = verticalPackage(left).markCredit + verticalPackage(other).markCredit;
    const width = Math.max(
      Math.abs(left.short.strike - left.long.strike),
      Math.abs(other.short.strike - other.long.strike),
    );
    const creditPerShare = netCredit / (left.contracts * CONTRACT_MULTIPLIER);
    const rawLoss =
      creditPerShare >= 0
        ? (width - creditPerShare) * CONTRACT_MULTIPLIER * left.contracts
        : Math.abs(netCredit);
    const risk = definedRisk(rawLoss, netCredit);
    out.push({
      kind: "package",
      structure: "Butterfly",
      contracts: left.contracts,
      legs: [sliceLeg(left.long, left.contracts), body, sliceLeg(other.long, other.contracts)],
      netCredit,
      markCredit,
      unrealizedPl: verticalPackage(left).unrealizedPl + verticalPackage(other).unrealizedPl,
      maxLoss: risk.maxLoss,
      bpUsed: risk.bpUsed,
      undefinedRisk: false,
    });
  }
  return out;
}

function ironCondor(put: Vertical, call: Vertical, contracts: number): Packaged {
  const scaled = (vertical: Vertical): Vertical => ({
    kind: "vertical",
    contracts,
    short: sliceLeg(vertical.short, contracts),
    long: sliceLeg(vertical.long, contracts),
  });
  const putDollars = verticalPackage(scaled(put));
  const callDollars = verticalPackage(scaled(call));
  const credit = putDollars.netCredit + callDollars.netCredit;
  const width = Math.max(
    Math.abs(put.short.strike - put.long.strike),
    Math.abs(call.short.strike - call.long.strike),
  );
  const creditPerShare = credit / (contracts * CONTRACT_MULTIPLIER);
  const rawLoss =
    creditPerShare >= 0
      ? (width - creditPerShare) * CONTRACT_MULTIPLIER * contracts
      : Math.abs(credit);
  const risk = definedRisk(rawLoss, credit);
  return {
    kind: "package",
    structure: "Iron condor",
    contracts,
    legs: [...putDollars.legs, ...callDollars.legs],
    netCredit: credit,
    markCredit: putDollars.markCredit + callDollars.markCredit,
    unrealizedPl: putDollars.unrealizedPl + callDollars.unrealizedPl,
    maxLoss: risk.maxLoss,
    bpUsed: risk.bpUsed,
    undefinedRisk: false,
  };
}

function singlePackage(leg: WorkingLeg): Packaged {
  const contracts = Math.abs(leg.signedQty);
  const short = leg.signedQty < 0;
  const netCredit = legCredit(leg, contracts);
  const markCredit = legMarkCredit(leg, contracts);
  const structure = short
    ? leg.right === "P"
      ? "Short put"
      : "Short call"
    : leg.right === "P"
      ? "Long put"
      : "Long call";
  return {
    kind: "package",
    structure,
    contracts,
    legs: [sliceLeg(leg, contracts)],
    netCredit,
    markCredit,
    unrealizedPl: leg.unrealizedPerContract * contracts,
    maxLoss: short ? null : leg.avg * contracts * CONTRACT_MULTIPLIER,
    bpUsed: short ? null : 0,
    undefinedRisk: short,
  };
}

function unparsedPackage(leg: OptionLegInput): Packaged {
  const contracts = Math.abs(leg.qty);
  const short = leg.side === "short";
  const sign = short ? -1 : 1;
  return {
    kind: "package",
    structure: "Custom",
    contracts,
    legs: [
      {
        symbol: leg.symbol.toUpperCase(),
        underlying: leg.symbol.toUpperCase(),
        expiry: "",
        right: "C",
        strike: 0,
        signedQty: sign * contracts,
        avg: leg.avgEntryPrice,
        mark: leg.currentPrice,
        unrealizedPerContract: contracts > 0 ? leg.unrealizedPl / contracts : 0,
        delta: leg.delta ?? null,
      },
    ],
    netCredit: -sign * leg.avgEntryPrice * contracts * CONTRACT_MULTIPLIER,
    markCredit: -sign * leg.currentPrice * contracts * CONTRACT_MULTIPLIER,
    unrealizedPl: leg.unrealizedPl,
    maxLoss: short ? null : leg.avgEntryPrice * contracts * CONTRACT_MULTIPLIER,
    bpUsed: short ? null : 0,
    undefinedRisk: short,
  };
}

function packageGroup(legs: WorkingLeg[]): Packaged[] {
  const calls = legs.filter((leg) => leg.right === "C").map((leg) => ({ ...leg }));
  const puts = legs.filter((leg) => leg.right === "P").map((leg) => ({ ...leg }));
  const putPairs = pairVerticals(puts);
  const callPairs = pairVerticals(calls);
  const putPieces = mergeButterflies(putPairs.verticals);
  const callPieces = mergeButterflies(callPairs.verticals);
  const putVerticals = putPieces.filter((piece): piece is Vertical => piece.kind === "vertical");
  const callVerticals = callPieces.filter((piece): piece is Vertical => piece.kind === "vertical");
  const packaged = [
    ...putPieces.filter((piece) => piece.kind === "package"),
    ...callPieces.filter((piece) => piece.kind === "package"),
  ] as Packaged[];

  while (putVerticals.length && callVerticals.length) {
    const put = putVerticals[0];
    const call = callVerticals[0];
    if (!put || !call) break;
    const contracts = Math.min(put.contracts, call.contracts);
    packaged.push(ironCondor(put, call, contracts));
    put.contracts -= contracts;
    call.contracts -= contracts;
    if (put.contracts <= 1e-9) putVerticals.shift();
    if (call.contracts <= 1e-9) callVerticals.shift();
  }

  for (const vertical of [...putVerticals, ...callVerticals]) {
    if (vertical.contracts > 1e-9) packaged.push(verticalPackage(vertical));
  }
  for (const leg of [...putPairs.rest, ...callPairs.rest]) packaged.push(singlePackage(leg));
  return packaged;
}

function toSpread(pack: Packaged, index: number): OpenSpread {
  const first = pack.legs[0];
  const beta = betaOf(
    pack.legs.map((leg) => ({
      delta: leg.delta,
      signedQty: leg.signedQty,
      underlying: leg.underlying,
    })),
  );
  return {
    id: `${first?.underlying || "custom"}-${first?.expiry || "open"}-${index}`,
    underlying: first?.underlying || pack.legs[0]?.symbol || "",
    expiry: first?.expiry || "",
    structure: pack.structure,
    contracts: pack.contracts,
    netCredit: pack.netCredit,
    markCredit: pack.markCredit,
    unrealizedPl: pack.unrealizedPl,
    maxLoss: pack.maxLoss,
    bpUsed: pack.bpUsed,
    betaWeightedDelta: beta,
    undefinedRisk: pack.undefinedRisk,
    legs: pack.legs.map((leg) => ({
      symbol: leg.symbol,
      right: leg.right,
      strike: leg.strike,
      qty: leg.signedQty,
      avg: leg.avg,
      mark: leg.mark,
      delta: leg.delta,
    })),
  };
}

export function buildOptionsFeed(input: {
  positions: OptionLegInput[];
  fills: OptionFillInput[] | null;
  notes?: string[];
}): OptionsFillsFeed {
  const notes = [...(input.notes ?? [])];
  const parsed: WorkingLeg[] = [];
  const loose: OptionLegInput[] = [];
  for (const position of input.positions) {
    const working = toWorking(position);
    if (working) parsed.push(working);
    else if (Math.abs(position.qty) > 1e-9) loose.push(position);
  }

  const groups = new Map<string, WorkingLeg[]>();
  for (const leg of parsed) {
    const key = `${leg.underlying}|${leg.expiry}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(leg);
    groups.set(key, bucket);
  }

  const packs = [...groups.values()].flatMap((legs) => packageGroup(legs));
  for (const leg of loose) packs.push(unparsedPackage(leg));
  const spreads = packs
    .map((pack, index) => toSpread(pack, index))
    .sort(
      (a, b) =>
        a.expiry.localeCompare(b.expiry) ||
        a.underlying.localeCompare(b.underlying) ||
        a.id.localeCompare(b.id),
    );

  const unrealizedPl = input.positions.reduce((sum, position) => sum + position.unrealizedPl, 0);
  const undefinedRisk = spreads.some((spread) => spread.undefinedRisk);
  const bpKnown = spreads.every((spread) => spread.bpUsed != null);
  const lossKnown = spreads.every((spread) => spread.maxLoss != null);
  const betaKnown = spreads.every((spread) => spread.betaWeightedDelta != null);
  const bpUsed =
    undefinedRisk || !bpKnown
      ? null
      : spreads.reduce((sum, spread) => sum + (spread.bpUsed ?? 0), 0);
  const maxLoss =
    undefinedRisk || !lossKnown
      ? null
      : spreads.reduce((sum, spread) => sum + (spread.maxLoss ?? 0), 0);
  const betaWeightedDelta =
    input.positions.length === 0
      ? 0
      : betaKnown
        ? spreads.reduce((sum, spread) => sum + (spread.betaWeightedDelta ?? 0), 0)
        : null;

  let realizedPl: number | null = null;
  if (input.fills == null) {
    notes.push("Realized premium needs Alpaca fill history.");
  } else if (input.positions.length > 0 && input.fills.length === 0) {
    notes.push("Alpaca returned no option fills for open contracts.");
  } else {
    const settled = settleOptionFills(input.fills);
    realizedPl = settled.realized;
    const open = new Map<string, number>();
    for (const position of input.positions) {
      const symbol = position.symbol.toUpperCase();
      if (!parseOcc(symbol)) continue;
      open.set(symbol, (open.get(symbol) ?? 0) + signedQty(position));
    }
    const symbols = new Set([...open.keys(), ...settled.openQty.keys()]);
    for (const symbol of symbols) {
      if (Math.abs((open.get(symbol) ?? 0) - (settled.openQty.get(symbol) ?? 0)) > 0.01) {
        notes.push("Fill history does not match open contracts; realized premium may be partial.");
        break;
      }
    }
  }

  if (undefinedRisk) {
    notes.push(
      "An unpaired short option has undefined risk, so buying power and max loss stay Not live.",
    );
  }
  if (
    input.positions.length > 0 &&
    betaWeightedDelta == null &&
    !notes.some((note) => note.includes("greeks"))
  ) {
    notes.push("β-weighted delta needs a greek on every open leg.");
  }

  return {
    spreads,
    bpUsed,
    maxLoss,
    unrealizedPl,
    realizedPl,
    betaWeightedDelta,
    undefinedRisk,
    openLegCount: input.positions.length,
    notes,
  };
}
