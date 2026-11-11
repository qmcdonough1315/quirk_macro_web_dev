/**
 * Shared $100k paper-book capital constants.
 * Single source for Summary, Options, and Cash tabs.
 */
import {
  CASH_MARGIN_RESERVE_USD,
  OPTIONS_PAPER_CAPITAL_USD,
  TOTAL_PAPER_BOOK_USD,
} from "./options-sleeve-rules";
import {
  DCA_WEEKS,
  ETF_TARGET_CAPITAL_USD,
  WEEKLY_CONTRIBUTION_USD,
  etfFloatRemainingUsd,
} from "./paper-portfolio-rules";

export {
  CASH_MARGIN_RESERVE_USD,
  OPTIONS_PAPER_CAPITAL_USD,
  TOTAL_PAPER_BOOK_USD,
  DCA_WEEKS,
  ETF_TARGET_CAPITAL_USD,
  WEEKLY_CONTRIBUTION_USD,
  etfFloatRemainingUsd,
};

/** Until a live options ledger exists, buying power used is modeled as zero. */
export const OPTIONS_BP_USED_USD = 0;

export function cashPartitions(input: {
  etfFloatRemaining: number;
  optionsBpUsed?: number;
}) {
  const bpUsed = Math.max(0, input.optionsBpUsed ?? OPTIONS_BP_USED_USD);
  const freeCollateral = Math.max(0, CASH_MARGIN_RESERVE_USD - bpUsed);
  return {
    pledgedReserveUsd: CASH_MARGIN_RESERVE_USD,
    optionsBpUsedUsd: bpUsed,
    freeCollateralUsd: freeCollateral,
    etfFloatUsd: Math.max(0, input.etfFloatRemaining),
    totalCashBucketUsd: CASH_MARGIN_RESERVE_USD + Math.max(0, input.etfFloatRemaining),
  };
}
