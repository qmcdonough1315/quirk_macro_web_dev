/**
 * Shared policy constants for the factor-model paper portfolio.
 * Keep these aligned with vendor/ETF_Quant_Model_patch/config.py.
 */

export const WEEKLY_CONTRIBUTION_USD = 1000;
export const MIN_HOLD_DAYS = 91; // ~3 months calendar
export const LONG_TERM_DAYS = 365;
export const WASH_SALE_DAYS = 30;
export const WEIGHT_EPS = 1e-4;

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

/** Next weekday on/after the day following `iso` (model run → next session). */
export function nextBusinessDayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}
