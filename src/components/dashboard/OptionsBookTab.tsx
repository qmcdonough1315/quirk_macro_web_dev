import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { OptionsSleevePanel } from "@/components/dashboard/OptionsSleevePanel";
import { getAlpacaPaperLedger } from "@/lib/alpaca.functions";
import {
  CASH_MARGIN_RESERVE_USD,
  OPTIONS_PAPER_CAPITAL_USD,
} from "@/lib/capital-book";

const usd = (n: number | null | undefined, digits = 0) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";

export function OptionsBookTab() {
  const fetchLedger = useServerFn(getAlpacaPaperLedger);
  const ledger = useQuery({
    queryKey: ["alpaca-paper-ledger"],
    queryFn: () => fetchLedger(),
    staleTime: 60_000,
    retry: 1,
  });

  const account = ledger.data?.account;
  const optionPositions = ledger.data?.optionPositions ?? [];
  const live = Boolean(ledger.data?.live);
  const optionsBp = account?.optionsBuyingPower ?? null;
  const bpUsedEstimate =
    live && account
      ? Math.max(0, OPTIONS_PAPER_CAPITAL_USD - Math.min(OPTIONS_PAPER_CAPITAL_USD, optionsBp ?? 0))
      : null;
  // Prefer cash-reserve headroom view: remaining options BP vs $25k sleeve.
  const headroom =
    live && optionsBp != null
      ? Math.min(CASH_MARGIN_RESERVE_USD, optionsBp)
      : CASH_MARGIN_RESERVE_USD;
  const openUnrealized = optionPositions.reduce((s, p) => s + p.unrealizedPl, 0);

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-base font-semibold tracking-tight">Options Book</h2>
          <span className="label-caps ml-auto">
            {ledger.isPending
              ? "Loading Alpaca"
              : live
                ? `Alpaca paper · live · level ${account?.optionsTradingLevel ?? "—"}`
                : "Alpaca paper · awaiting credentials"}
          </span>
        </div>
        <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
          Live sleeve from Alpaca paper (`paper-api.alpaca.markets`). Buying power is capped at{" "}
          {usd(OPTIONS_PAPER_CAPITAL_USD)} for our mandate; the {usd(CASH_MARGIN_RESERVE_USD)} cash
          reserve is the stress buffer. Strategy gates remain below.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">Options buying power</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
              {ledger.isPending ? "…" : live ? usd(optionsBp) : "Not live"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {live
                ? `Account equity ${usd(account?.equity)} · cash ${usd(account?.cash)}`
                : "Add ALPACA_API_KEY_ID + SECRET in Cursor secrets"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">Margin headroom (modeled)</p>
            <p
              className={`mt-2 font-display text-2xl font-semibold tabular-nums ${
                live ? "text-positive" : "text-muted-foreground"
              }`}
            >
              {ledger.isPending ? "…" : usd(headroom)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Min of reserve and Alpaca options BP
              {bpUsedEstimate != null ? ` · sleeve used ~${usd(bpUsedEstimate)}` : ""}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">Open option positions</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
              {ledger.isPending ? "…" : live ? String(optionPositions.length) : "Not live"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {live
                ? `Unrealized ${usd(openUnrealized, 2)} · ${ledger.data?.equityPositions.length ?? 0} equity lots`
                : (ledger.data?.notes[0] ?? "Waiting for Alpaca")}
            </p>
          </div>
        </div>

        {live && optionPositions.length ? (
          <div className="mt-5 overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border/70 bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Symbol</th>
                  <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                  <th className="px-3 py-2.5 font-medium text-right">Avg</th>
                  <th className="px-3 py-2.5 font-medium text-right">Mark</th>
                  <th className="px-3 py-2.5 font-medium text-right">Mkt value</th>
                  <th className="px-3 py-2.5 font-medium text-right">Unrealized</th>
                </tr>
              </thead>
              <tbody>
                {optionPositions.map((p) => (
                  <tr key={p.assetId || p.symbol} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{p.symbol}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{p.qty}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {usd(p.avgEntryPrice, 2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {usd(p.currentPrice, 2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {usd(p.marketValue, 2)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                        p.unrealizedPl >= 0 ? "text-positive" : "text-negative"
                      }`}
                    >
                      {usd(p.unrealizedPl, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!live && !ledger.isPending ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {(ledger.data?.notes ?? []).join(" · ") ||
              "Alpaca paper ledger not connected yet."}
          </p>
        ) : null}
      </section>

      <OptionsSleevePanel />
    </div>
  );
}
