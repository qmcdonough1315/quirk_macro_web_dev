import { OptionsSleevePanel } from "@/components/dashboard/OptionsSleevePanel";
import {
  CASH_MARGIN_RESERVE_USD,
  OPTIONS_BP_USED_USD,
  OPTIONS_PAPER_CAPITAL_USD,
} from "@/lib/capital-book";

const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export function OptionsBookTab() {
  const headroom = Math.max(0, CASH_MARGIN_RESERVE_USD - OPTIONS_BP_USED_USD);

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-base font-semibold tracking-tight">Options Book</h2>
          <span className="label-caps ml-auto">Phase 1 · rules live · fills not live</span>
        </div>
        <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
          Separate $25k defined-risk sleeve. Buying power is capped at{" "}
          {usd(OPTIONS_PAPER_CAPITAL_USD)}; margin stress is covered by the{" "}
          {usd(CASH_MARGIN_RESERVE_USD)} cash reserve. Open positions and marked P&amp;L appear here
          once the paper fills feed is wired — until then this tab is the mandate, gates, and signal
          map.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">Buying power used</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
              {usd(OPTIONS_BP_USED_USD)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Of {usd(OPTIONS_PAPER_CAPITAL_USD)} cap · not live
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">Margin headroom</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-positive">
              {usd(headroom)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Cash reserve minus BP used</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">Open positions</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-muted-foreground">
              Not live
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Awaiting options paper ledger</p>
          </div>
        </div>
      </section>

      <OptionsSleevePanel />
    </div>
  );
}
