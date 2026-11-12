/**
 * Estimate Fama-French / Carhart-style betas from ETF price history using
 * liquid style ETF long-short proxies, then rank TLH substitutes by
 * Euclidean distance in beta space.
 */

export type BetaVector = {
  mkt: number;
  smb: number;
  hml: number;
  rmw: number;
  cma: number;
  wml: number;
};

export const BETA_FACTOR_KEYS = ["mkt", "smb", "hml", "rmw", "cma", "wml"] as const;

/** Liquid ETF proxies used to synthesize factor portfolios for the replay engine. */
export const FACTOR_PROXY_TICKERS = [
  "SPY", // market
  "IWM", // size
  "IWD", // value
  "IWF", // growth
  "QUAL", // quality / profitability
  "USMV", // low-vol / conservative
  "SPHB", // high beta / aggressive
  "MTUM", // momentum
] as const;

export const BETA_LOOKBACK_DAYS = 126;

type PricePoint = { open: number; close: number };
type PriceMap = Map<string, Map<string, PricePoint>>;

function sortedDates(series: Map<string, PricePoint>): string[] {
  return [...series.keys()].sort();
}

function sharedDates(prices: PriceMap, tickers: string[], endDate: string): string[] {
  const seriesList = tickers.map((t) => prices.get(t)).filter(Boolean) as Map<string, PricePoint>[];
  if (seriesList.length !== tickers.length || !seriesList.length) return [];
  let dates = sortedDates(seriesList[0]!).filter((d) => d <= endDate);
  for (let i = 1; i < seriesList.length; i++) {
    const set = seriesList[i]!;
    dates = dates.filter((d) => set.has(d));
  }
  return dates;
}

function returnsFromCloses(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const cur = closes[i]!;
    out.push(prev > 0 ? cur / prev - 1 : 0);
  }
  return out;
}

function olsBetas(y: number[], factors: number[][]): BetaVector | null {
  const n = y.length;
  const k = 6;
  if (n < k + 5 || factors.length !== n) return null;

  const xtx = Array.from({ length: k + 1 }, () => Array(k + 1).fill(0));
  const xty = Array(k + 1).fill(0);

  for (let i = 0; i < n; i++) {
    const row = [1, ...factors[i]!];
    for (let a = 0; a <= k; a++) {
      xty[a] += row[a]! * y[i]!;
      for (let b = 0; b <= k; b++) xtx[a]![b] += row[a]! * row[b]!;
    }
  }

  const aug = xtx.map((r, i) => [...r, xty[i]!]);
  for (let col = 0; col <= k; col++) {
    let pivot = col;
    for (let r = col + 1; r <= k; r++) {
      if (Math.abs(aug[r]![col]!) > Math.abs(aug[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(aug[pivot]![col]!) < 1e-12) return null;
    [aug[col], aug[pivot]] = [aug[pivot]!, aug[col]!];
    const div = aug[col]![col]!;
    for (let c = col; c <= k + 1; c++) aug[col]![c]! /= div;
    for (let r = 0; r <= k; r++) {
      if (r === col) continue;
      const f = aug[r]![col]!;
      for (let c = col; c <= k + 1; c++) aug[r]![c]! -= f * aug[col]![c]!;
    }
  }

  const coef = aug.map((r) => r[k + 1]!);
  return {
    mkt: coef[1]!,
    smb: coef[2]!,
    hml: coef[3]!,
    rmw: coef[4]!,
    cma: coef[5]!,
    wml: coef[6]!,
  };
}

function factorMatrixOnDates(prices: PriceMap, dates: string[]): number[][] | null {
  const need = [...FACTOR_PROXY_TICKERS];
  if (!need.every((t) => prices.has(t))) return null;
  const closes = need.map((t) => dates.map((d) => prices.get(t)!.get(d)!.close));
  const rets = closes.map(returnsFromCloses);
  const idx = Object.fromEntries(need.map((t, i) => [t, i])) as Record<string, number>;
  const factors: number[][] = [];
  for (let i = 0; i < rets[0]!.length; i++) {
    factors.push([
      rets[idx.SPY!]![i]!,
      rets[idx.IWM!]![i]! - rets[idx.SPY!]![i]!,
      rets[idx.IWD!]![i]! - rets[idx.IWF!]![i]!,
      rets[idx.QUAL!]![i]! - rets[idx.SPY!]![i]!,
      rets[idx.USMV!]![i]! - rets[idx.SPHB!]![i]!,
      rets[idx.MTUM!]![i]! - rets[idx.SPY!]![i]!,
    ]);
  }
  return factors;
}

export function estimateBeta(
  ticker: string,
  prices: PriceMap,
  endDate: string,
  lookback = BETA_LOOKBACK_DAYS,
): BetaVector | null {
  if (!prices.has(ticker)) return null;
  const dates = sharedDates(prices, [ticker, ...FACTOR_PROXY_TICKERS], endDate);
  if (dates.length < lookback + 1) return null;
  const useDates = dates.slice(-(lookback + 1));
  const y = returnsFromCloses(useDates.map((d) => prices.get(ticker)!.get(d)!.close));
  const factors = factorMatrixOnDates(prices, useDates);
  if (!factors) return null;
  return olsBetas(y, factors);
}

export function betaDistance(a: BetaVector, b: BetaVector): number {
  let sum = 0;
  for (const key of BETA_FACTOR_KEYS) {
    const d = a[key] - b[key];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function buildBetaCache(
  tickers: string[],
  prices: PriceMap,
  endDate: string,
): Map<string, BetaVector> {
  const cache = new Map<string, BetaVector>();
  for (const ticker of [...new Set(tickers)]) {
    const beta = estimateBeta(ticker, prices, endDate);
    if (beta) cache.set(ticker, beta);
  }
  return cache;
}

/**
 * Pick the eligible candidate with the smallest Euclidean beta distance.
 * Falls back to null when the sold name or all candidates lack betas.
 */
export function chooseBetaDistanceSubstitute(args: {
  soldTicker: string;
  candidates: string[];
  betas: Map<string, BetaVector>;
  isEligible: (ticker: string) => boolean;
}): { ticker: string; distance: number } | null {
  const soldBeta = args.betas.get(args.soldTicker);
  if (!soldBeta) return null;

  let best: { ticker: string; distance: number } | null = null;
  for (const candidate of args.candidates) {
    if (candidate === args.soldTicker) continue;
    if (!args.isEligible(candidate)) continue;
    const beta = args.betas.get(candidate);
    if (!beta) continue;
    const distance = betaDistance(soldBeta, beta);
    if (!best || distance < best.distance) best = { ticker: candidate, distance };
  }
  return best;
}
