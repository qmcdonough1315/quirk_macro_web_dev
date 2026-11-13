/**
 * Ranker-only scoring for defined-risk credit proposals.
 * Uses live chain fields only — never invents IVR or composites.
 */

import type { TradeProposal } from "./options-orders";
import { OPTIONS_IVR_PREFERRED } from "./options-sleeve-rules";

export interface RankMetrics {
  popProxy: number | null;
  creditToWidth: number | null;
  shortAbsDelta: number | null;
  bidAskPct: number | null;
  ivRank: number;
  score: number;
  notes: string[];
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function rankCreditProposal(
  proposal: TradeProposal,
  ivRank: number,
): RankMetrics {
  const notes: string[] = [];
  const shortDeltas = proposal.legs
    .filter((l) => l.side === "sell" && l.delta != null && Number.isFinite(l.delta))
    .map((l) => Math.abs(l.delta as number));
  const shortAbsDelta = mean(shortDeltas);
  const popProxy = shortAbsDelta == null ? null : Math.max(0, Math.min(1, 1 - shortAbsDelta));
  if (popProxy == null) notes.push("POP proxy unavailable (missing short Δ).");

  const creditToWidth =
    proposal.width > 0 ? proposal.creditPerShare / proposal.width : null;
  if (creditToWidth == null) notes.push("Credit/width unavailable.");

  const spreads: number[] = [];
  for (const leg of proposal.legs) {
    // bid/ask not on OrderLegSpec — approximate liquidity via mid presence only.
    if (leg.mid == null) notes.push(`Missing mid on ${leg.symbol}`);
  }
  const bidAskPct = spreads.length ? mean(spreads) : null;

  let score = 0;
  if (popProxy != null) score += popProxy * 40;
  if (creditToWidth != null) score += Math.min(creditToWidth, 0.5) / 0.5 * 30;
  // IVR: prefer elevated; 0 below preferred floor contribution, scale to 100.
  const ivTerm =
    ivRank >= OPTIONS_IVR_PREFERRED
      ? 25
      : Math.max(0, ((ivRank - 30) / (OPTIONS_IVR_PREFERRED - 30)) * 25);
  score += ivTerm;
  if (bidAskPct != null) score += Math.max(0, 5 - bidAskPct * 100);

  return {
    popProxy,
    creditToWidth,
    shortAbsDelta,
    bidAskPct,
    ivRank,
    score: Math.round(score * 10) / 10,
    notes,
  };
}

export function compareRankScore(a: RankMetrics, b: RankMetrics): number {
  return b.score - a.score;
}
