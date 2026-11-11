/**
 * Shared policy constants for the factor-model paper portfolio.
 * Keep these aligned with vendor/ETF_Quant_Model_patch/config.py.
 */

export const WEEKLY_CONTRIBUTION_USD = 1000;
export const MIN_HOLD_DAYS = 91; // ~3 months calendar
export const LONG_TERM_DAYS = 365;
export const WASH_SALE_DAYS = 30;
export const WEIGHT_EPS = 1e-4;
/** Paper strategy catch-up inception (inclusive model-run date). */
export const STRATEGY_INCEPTION_DATE = "2026-09-20";

/** Tickers treated as substantially identical for wash-sale avoidance. */
export const SUBSTANTIALLY_IDENTICAL: Record<string, string[]> = {
  SPY: ["IVV", "VOO", "SPLG", "VV"],
  IVV: ["SPY", "VOO", "SPLG", "VV"],
  VOO: ["SPY", "IVV", "SPLG", "VV"],
  QQQ: ["QQQM", "ONEQ"],
  QQQM: ["QQQ", "ONEQ"],
  IWM: ["VTWO", "SCHA"],
  VTWO: ["IWM", "SCHA"],
  IJH: ["MDY", "IVOO"],
  MDY: ["IJH", "IVOO"],
  EFA: ["IEFA", "VEA", "IDEV"],
  IEFA: ["EFA", "VEA", "IDEV"],
  VEA: ["EFA", "IEFA", "IDEV"],
  EEM: ["IEMG", "VWO"],
  IEMG: ["EEM", "VWO"],
  VWO: ["EEM", "IEMG"],
  AGG: ["BND", "FBND"],
  BND: ["AGG", "FBND"],
  TLT: ["VGLT", "TLH"],
  GLD: ["IAUM", "IAU", "GLDM"],
  IAUM: ["GLD", "IAU", "GLDM"],
  SLV: ["SIVR"],
  HYG: ["JNK", "SJNK"],
  LQD: ["VCIT", "USIG"],
};

/** Category peers used to find TLH substitutes when full betas are unavailable. */
export const ETF_CATEGORY_PEERS: Record<string, string[]> = {
  "Core Large Cap": [
    "VOO",
    "SPY",
    "IVV",
    "RSP",
    "SCHD",
    "QUAL",
    "SPHQ",
    "USMV",
    "MOAT",
    "VTI",
    "DUHP",
  ],
  "Mid Cap": ["IJH", "VO", "MDY", "IWR", "COWZ", "RDIV", "IJJ", "VOE", "IWS", "DON"],
  "Small Cap": ["IJR", "IWM", "VB", "AVUV", "DFAS", "IWN", "SLYV", "DFSV", "CALF"],
  Growth: ["VUG", "IWF", "SCHG", "MGK", "IWY", "QQQM", "VONG"],
  Value: ["VTV", "IWD", "VLUE", "AVLV", "DFLV", "RPV", "FNDX"],
  "Momentum & High Beta": ["MTUM", "SPMO", "QMOM", "XMMO", "PDP", "VFMO"],
  "Dividend & Income Quality": ["VIG", "DGRO", "SCHD", "NOBL", "DGRW", "VYM", "HDV"],
  Technology: ["XLK", "VGT", "QQQ", "SMH", "SOXX", "FDN", "AIQ", "HACK"],
  "Health Care": ["XLV", "VHT", "XBI", "IBB", "IYH", "IHI"],
  Financials: ["XLF", "VFH", "KRE", "IYF", "IAK", "KIE"],
  "Consumer Discretionary": ["XLY", "VCR", "XRT", "PEJ", "ONLN"],
  "Consumer Staples": ["XLP", "VDC", "IYK", "FXG"],
  Energy: ["XLE", "VDE", "XOP", "IEO", "URA"],
  Industrials: ["XLI", "VIS", "IYJ", "ITA", "AIRR", "SHLD"],
  "Materials & Mining": ["XLB", "VAW", "XME", "GDX", "COPX", "PICK"],
  "Utilities / Infra / Clean Energy": ["XLU", "VPU", "PAVE", "IFRA", "IGF", "GRID", "NLR"],
  "Real Estate": ["VNQ", "XLRE", "IYR", "SCHH", "SRVR", "REZ"],
  "Alts / Commodities / Managed Futures": ["DBC", "PDBC", "GLD", "SLV", "DBMF", "FTGC", "DBA"],
  "Fixed Income & Credit": ["AGG", "BND", "TLT", "IEF", "SHY", "LQD", "HYG", "TIP", "BIL", "SGOV"],
  "International & EM": ["VEA", "IEFA", "EFA", "VWO", "IEMG", "EFV", "EFG", "VXUS", "DXJ", "EMXC"],
  "Communication Services": ["XLC", "VOX", "FCOM", "NXTG"],
};

export function categoryForTicker(ticker: string): string | null {
  const t = ticker.toUpperCase();
  for (const [category, peers] of Object.entries(ETF_CATEGORY_PEERS)) {
    if (peers.includes(t)) return category;
  }
  return null;
}

/** Passive asset-mix proxies. US equity that is not mid-cap, small-cap, or international maps to VOO. */
export const ASSET_MIX_PROXIES = ["VOO", "IJH", "IJR", "VEA", "BND", "TLT", "PDBC"] as const;
export type AssetMixProxy = (typeof ASSET_MIX_PROXIES)[number];

const PROXY_TICKERS: Record<AssetMixProxy, string[]> = {
  IJH: [
    "IJH",
    "RNIN",
    "COWZ",
    "RDIV",
    "VO",
    "MDY",
    "IWR",
    "IJJ",
    "VOE",
    "IWS",
    "DON",
    "RFV",
    "XMVM",
  ],
  IJR: [
    "DFAS",
    "AVUV",
    "CALF",
    "IJR",
    "VB",
    "DFAT",
    "SCHA",
    "VTWO",
    "IWM",
    "IWN",
    "IWO",
    "SLYV",
    "RZV",
    "XSHQ",
    "RWJ",
    "DFSV",
  ],
  VEA: [
    "VEA",
    "IEFA",
    "CGIC",
    "DFIV",
    "VWO",
    "IEMG",
    "CGNG",
    "EMMF",
    "EFA",
    "EEM",
    "AVDE",
    "VXUS",
    "IXUS",
    "IDEV",
    "EFV",
    "EFG",
    "SCZ",
    "EMXC",
    "DXJ",
    "EWJ",
    "HEFA",
  ],
  PDBC: [
    "DBC",
    "GSG",
    "GLD",
    "SLV",
    "DBMF",
    "KMLM",
    "CTA",
    "JGLO",
    "PDBC",
    "USO",
    "FTGC",
    "DBA",
    "IAUM",
    "WTMF",
    "FMF",
    "BCI",
  ],
  BND: ["BOND", "FBND", "JCPB", "AGG", "BND", "HYG", "LQD", "VCIT", "EMB", "SJNK"],
  TLT: ["MINT", "TFLR", "SHY", "TLT", "IEF", "IEI", "TIP", "VTIP", "BIL", "SGOV"],
  VOO: [
    "VOO",
    "TCAF",
    "OAKM",
    "DSTL",
    "CGDV",
    "RSP",
    "SCHD",
    "AQEC",
    "IVV",
    "SPY",
    "VTI",
    "QUAL",
    "SPHQ",
    "USMV",
    "MOAT",
    "DUHP",
    "VUG",
    "LSGR",
    "PCLG",
    "IWF",
    "SCHG",
    "AKRE",
    "MGK",
    "RPG",
    "IVW",
    "IWY",
    "VONG",
    "QQQM",
    "ONEQ",
    "LRGE",
    "BUSA",
    "MFSV",
    "VTV",
    "IWD",
    "CGCV",
    "RPV",
    "SCHV",
    "IVE",
    "VLUE",
    "AVLV",
    "DFLV",
    "FNDX",
    "RWL",
    "PWV",
    "MTUM",
    "PDP",
    "SPHB",
    "QMOM",
    "JMOM",
    "FDMO",
    "XMMO",
    "DWAS",
    "SPMO",
    "VFMO",
    "FCPI",
    "VIG",
    "TDVG",
    "DIVB",
    "DGRO",
    "SDY",
    "HDV",
    "VYM",
    "NOBL",
    "DGRW",
    "DVY",
    "RDVY",
    "SCHY",
    "IDV",
    "DIVO",
    "XLK",
    "VGT",
    "FTEC",
    "SMH",
    "IGV",
    "SOXX",
    "XSD",
    "CLOU",
    "CIBR",
    "SKYY",
    "QQQ",
    "FDN",
    "AIQ",
    "BOTZ",
    "HACK",
    "WCLD",
    "XLV",
    "VHT",
    "XBI",
    "IHI",
    "IBB",
    "IHF",
    "FHLC",
    "IYH",
    "PJP",
    "XHS",
    "BBH",
    "PBE",
    "XLF",
    "VFH",
    "KRE",
    "KBWB",
    "IAI",
    "KCE",
    "FNCL",
    "KBE",
    "IYF",
    "IAK",
    "KIE",
    "FXO",
    "KBWP",
    "XLY",
    "VCR",
    "RSPD",
    "XRT",
    "FDIS",
    "IYC",
    "CARZ",
    "PEJ",
    "PEZ",
    "ONLN",
    "IBUY",
    "XLP",
    "VDC",
    "IYK",
    "FSTA",
    "RHS",
    "PBJ",
    "KXI",
    "PSL",
    "PSCC",
    "FXG",
    "XLE",
    "VDE",
    "XOP",
    "AMLP",
    "OIH",
    "FENY",
    "IYE",
    "FCG",
    "URA",
    "PXE",
    "XES",
    "IEO",
    "XLI",
    "VIS",
    "IYJ",
    "FIDU",
    "ITA",
    "XAR",
    "IYT",
    "EXI",
    "AIRR",
    "PKB",
    "SHLD",
    "XLB",
    "VAW",
    "XME",
    "FMAT",
    "LIT",
    "REMX",
    "SIL",
    "GDX",
    "PICK",
    "COPX",
    "GDXJ",
    "SLVP",
    "BATT",
    "XLU",
    "VPU",
    "IDU",
    "IGF",
    "NFRA",
    "PAVE",
    "GRID",
    "ICLN",
    "TAN",
    "NLR",
    "JXI",
    "IFRA",
    "UTES",
    "ZAP",
    "CNRG",
    "PBW",
    "XLRE",
    "VNQ",
    "DFAR",
    "IYR",
    "FREL",
    "MORT",
    "REZ",
    "INDS",
    "SCHH",
    "RWR",
    "SRVR",
    "PPTY",
    "HOMZ",
    "XLC",
    "VOX",
    "FCOM",
    "NXTG",
  ],
};

const TICKER_PROXY = new Map<string, AssetMixProxy>();
for (const proxy of ["TLT", "BND", "PDBC", "IJH", "IJR", "VEA", "VOO"] as const) {
  for (const ticker of PROXY_TICKERS[proxy]) TICKER_PROXY.set(ticker, proxy);
}

export function proxyForTicker(ticker: string): AssetMixProxy {
  return TICKER_PROXY.get(ticker.toUpperCase()) ?? "VOO";
}

/** Collapse a model weight map into the seven-proxy asset mix. Weights are renormalized. */
export function assetMixWeights(weights: Record<string, number>): Record<AssetMixProxy, number> {
  const totals = {} as Record<AssetMixProxy, number>;
  let sum = 0;
  for (const [ticker, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const proxy = proxyForTicker(ticker);
    totals[proxy] = (totals[proxy] ?? 0) + weight;
    sum += weight;
  }
  if (sum <= 0) return {} as Record<AssetMixProxy, number>;
  for (const proxy of Object.keys(totals) as AssetMixProxy[]) totals[proxy] = totals[proxy]! / sum;
  return totals;
}

export function identicalSet(ticker: string): Set<string> {
  const t = ticker.toUpperCase();
  return new Set([t, ...(SUBSTANTIALLY_IDENTICAL[t] ?? [])]);
}

export function addCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.floor(ms / 86_400_000);
}

/** Benchmark sleeves are not factor tax lots. */
export function isBenchmarkTrade(trade: { strategy?: string; reason?: string }): boolean {
  return (
    trade.strategy === "voo" ||
    trade.strategy === "mix" ||
    trade.reason === "weekly_voo_dca" ||
    trade.reason === "weekly_mix_dca" ||
    trade.reason === "mix_rebalance"
  );
}

/** Newest factor-sleeve trades for the Tax Lot Ledger, excluding both benchmarks. */
export function taxLedgerTrades<T extends { strategy?: string; reason?: string }>(
  trades: T[],
  limit = 12,
): T[] {
  return trades
    .filter((trade) => !isBenchmarkTrade(trade))
    .slice(-limit)
    .reverse();
}

export interface DatedCashFlow {
  date: string;
  amount: number;
}

const MS_PER_YEAR = 365 * 86_400_000;

function yearFraction(fromIso: string, toIso: string): number {
  return (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / MS_PER_YEAR;
}

function mergeCashFlows(flows: DatedCashFlow[]): DatedCashFlow[] {
  const byDate = new Map<string, number>();
  for (const flow of flows) {
    if (!flow.date || !Number.isFinite(flow.amount) || flow.amount === 0) continue;
    byDate.set(flow.date, (byDate.get(flow.date) ?? 0) + flow.amount);
  }
  return Array.from(byDate, ([date, amount]) => ({ date, amount }))
    .filter((flow) => flow.amount !== 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Money-weighted annualized return, Excel XIRR convention (actual/365).
 * Cash outflows are negative. Returns a decimal rate, or null if it cannot be solved.
 */
export function xirr(flows: DatedCashFlow[]): number | null {
  const merged = mergeCashFlows(flows);
  if (merged.length < 2) return null;
  if (!merged.some((flow) => flow.amount < 0) || !merged.some((flow) => flow.amount > 0))
    return null;

  const start = merged[0]!.date;
  const npv = (rate: number) => {
    let total = 0;
    for (const flow of merged) {
      total += flow.amount / Math.pow(1 + rate, yearFraction(start, flow.date));
    }
    return total;
  };
  const derivative = (rate: number) => {
    let slope = 0;
    for (const flow of merged) {
      const years = yearFraction(start, flow.date);
      slope += (-years * flow.amount) / Math.pow(1 + rate, years + 1);
    }
    return slope;
  };

  for (const seed of [0.1, -0.2, 0.5, 1, -0.5, 0]) {
    let rate = seed;
    for (let i = 0; i < 50; i++) {
      if (rate <= -0.999999) break;
      const value = npv(rate);
      const slope = derivative(rate);
      if (!Number.isFinite(value) || !Number.isFinite(slope) || Math.abs(slope) < 1e-12) break;
      const next = rate - value / slope;
      if (!Number.isFinite(next) || next <= -0.999999) break;
      if (Math.abs(next - rate) < 1e-10 && Math.abs(value) < 1e-6) return next;
      rate = next;
    }
  }

  let lo = -0.999999;
  let hi = 5;
  let npvLo = npv(lo);
  let npvHi = npv(hi);
  if (!Number.isFinite(npvLo)) return null;
  for (const cap of [10, 25, 50, 100]) {
    if (Number.isFinite(npvHi) && npvLo * npvHi <= 0) break;
    hi = cap;
    npvHi = npv(hi);
  }
  if (!Number.isFinite(npvHi) || npvLo * npvHi > 0) return null;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(mid);
    if (!Number.isFinite(npvMid)) return null;
    if (Math.abs(npvMid) < 1e-7 || hi - lo < 1e-10) return mid;
    if (npvLo * npvMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      npvLo = npvMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Annualized alpha, in percentage points, of a DCA sleeve versus a same-schedule benchmark.
 * Each contribution is an outflow; each sleeve is valued once, on `asOf`.
 */
export function annualizedAlphaPct(input: {
  contributions: DatedCashFlow[];
  asOf: string;
  factorValue: number;
  benchmarkValue: number;
}): number | null {
  const { contributions, asOf, factorValue, benchmarkValue } = input;
  if (!asOf || contributions.length === 0) return null;
  if (
    !Number.isFinite(factorValue) ||
    !Number.isFinite(benchmarkValue) ||
    factorValue <= 0 ||
    benchmarkValue <= 0
  ) {
    return null;
  }
  const invested = contributions.map((flow) => ({
    date: flow.date,
    amount: -Math.abs(flow.amount),
  }));
  const factor = xirr([...invested, { date: asOf, amount: factorValue }]);
  const benchmark = xirr([...invested, { date: asOf, amount: benchmarkValue }]);
  if (factor === null || benchmark === null) return null;
  return (factor - benchmark) * 100;
}

/** Next weekday on/after the day following `iso` (model run → next session). */
export function nextBusinessDayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}
