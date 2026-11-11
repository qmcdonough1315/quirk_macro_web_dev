/**
 * Short-options / vol paper sleeve rules.
 * Keep aligned with ETF_Quant_Model/modules/options_sleeve.py and config.py.
 */

export const OPTIONS_PAPER_CAPITAL_USD = 25_000;
export const CASH_MARGIN_RESERVE_USD = 25_000;
export const TOTAL_PAPER_BOOK_USD = 100_000;

export const OPTIONS_IVR_MIN = 30;
export const OPTIONS_IVR_PREFERRED = 50;
export const OPTIONS_DTE_MIN = 30;
export const OPTIONS_DTE_MAX = 45;
export const OPTIONS_PROFIT_TAKE_PCT = 0.5;
export const OPTIONS_STOP_MULTIPLE = 2;
export const OPTIONS_MAX_NAME_MARGIN_PCT = 0.02;
export const OPTIONS_MAX_SECTOR_MARGIN_PCT = 0.12;

export const PHASE1_OPTIONABLE_ETFS = [
  "SPY",
  "QQQ",
  "IWM",
  "XLK",
  "XLF",
  "XLE",
  "XLV",
  "XLI",
  "XLY",
  "XLP",
  "XLU",
  "XLB",
  "XLRE",
  "XLC",
] as const;

export type OptionsStructure =
  | "bull_put_spread"
  | "bear_call_spread"
  | "iron_condor"
  | "skip_low_iv";

export type OptionsRegime =
  | "q1_bullish_vol_seller"
  | "q2_bearish_vol_seller"
  | "q3_neutral_vol"
  | "q4_low_iv";

export interface OptionsSignal {
  ticker: string;
  compositeScore: number;
  ivRank: number;
  regime: OptionsRegime;
  structure: OptionsStructure;
  dteMin: number;
  dteMax: number;
  shortDelta: number;
  wingDelta: number | null;
  rationale: string;
}

export function classifyRegime(compositeScore: number, ivRank: number): OptionsRegime {
  if (ivRank < OPTIONS_IVR_MIN) return "q4_low_iv";
  if (compositeScore >= 0.5) return "q1_bullish_vol_seller";
  if (compositeScore <= -0.5) return "q2_bearish_vol_seller";
  return "q3_neutral_vol";
}

export function buildOptionsSignal(
  ticker: string,
  compositeScore: number,
  ivRank: number,
): OptionsSignal {
  const regime = classifyRegime(compositeScore, ivRank);
  if (regime === "q1_bullish_vol_seller") {
    return {
      ticker: ticker.toUpperCase(),
      compositeScore,
      ivRank,
      regime,
      structure: "bull_put_spread",
      dteMin: OPTIONS_DTE_MIN,
      dteMax: OPTIONS_DTE_MAX,
      shortDelta: 0.25,
      wingDelta: null,
      rationale:
        "High factor score + elevated IVR → defined-risk long extension via short put spread.",
    };
  }
  if (regime === "q2_bearish_vol_seller") {
    return {
      ticker: ticker.toUpperCase(),
      compositeScore,
      ivRank,
      regime,
      structure: "bear_call_spread",
      dteMin: OPTIONS_DTE_MIN,
      dteMax: OPTIONS_DTE_MAX,
      shortDelta: 0.25,
      wingDelta: null,
      rationale: "Weak factor score + elevated IVR → short expression via short call spread.",
    };
  }
  if (regime === "q3_neutral_vol") {
    return {
      ticker: ticker.toUpperCase(),
      compositeScore,
      ivRank,
      regime,
      structure: "iron_condor",
      dteMin: OPTIONS_DTE_MIN,
      dteMax: OPTIONS_DTE_MAX,
      shortDelta: 0.18,
      wingDelta: 0.18,
      rationale: "Neutral factor score + elevated IVR → double-ended theta / vol premium.",
    };
  }
  return {
    ticker: ticker.toUpperCase(),
    compositeScore,
    ivRank,
    regime,
    structure: "skip_low_iv",
    dteMin: OPTIONS_DTE_MIN,
    dteMax: OPTIONS_DTE_MAX,
    shortDelta: 0,
    wingDelta: null,
    rationale: "IV Rank below gate — do not sell cheap volatility.",
  };
}

export function maxNameMarginUsd(totalBookUsd = TOTAL_PAPER_BOOK_USD): number {
  return totalBookUsd * OPTIONS_MAX_NAME_MARGIN_PCT;
}

export function maxSectorMarginUsd(
  optionsPlusCashUsd = OPTIONS_PAPER_CAPITAL_USD + CASH_MARGIN_RESERVE_USD,
): number {
  return optionsPlusCashUsd * OPTIONS_MAX_SECTOR_MARGIN_PCT;
}

export function sizeSpreadContracts(
  creditPerShare: number,
  width: number,
  capitalBudget: number,
): number {
  if (creditPerShare < 0 || width <= 0 || capitalBudget <= 0) return 0;
  const maxLoss = Math.max(width - creditPerShare, 0.01) * 100;
  return Math.floor(capitalBudget / maxLoss);
}
