import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { OptionsSleevePanel } from "@/components/dashboard/OptionsSleevePanel";
import { OptionsTradeDesk } from "@/components/dashboard/OptionsTradeDesk";
import { getAlpacaPaperLedger } from "@/lib/alpaca.functions";
import { alpacaStatusLabel, classifyAlpacaConnection } from "@/lib/alpaca-status";
import {
  CASH_MARGIN_RESERVE_USD,
  OPTIONS_PAPER_CAPITAL_USD,
  cashPartitions,
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
  const conn = classifyAlpacaConnection({
    live,
    ...(ledger.data?.notes != null ? { notes: ledger.data.notes } : {}),
  });
  const feed = live ? (ledger.data?.optionsFeed ?? null) : null;
  const partitions = cashPartitions({
    etfFloatRemaining: 0,
    optionsBpUsed: feed ? feed.bpUsed : null,
  });
  const cell = (value: number | null | undefined, digits = 0) => {
    if (ledger.isPending) return "…";
    if (!live || value == null || !Number.isFinite(value)) return "Not live";
    return usd(value, digits);
  };
  const betaText = (value: number | null | undefined) => {
    if (ledger.isPending) return "…";
    if (!live || value == null || !Number.isFinite(value)) return "Not live";
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
  };
  const statusText = ledger.isPending
    ? "Loading Alpaca"
    : live
      ? `${alpacaStatusLabel(conn)} · level ${account?.optionsTradingLevel ?? "—"}`
      : alpacaStatusLabel(conn);

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-base font-semibold tracking-tight">Options Book</h2>
          <span className="label-caps ml-auto">{statusText}</span>
        </div>
        <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
          Open spreads, marks, and P&amp;L come from Alpaca paper fills and positions. Buying power
          used is defined-risk margin, capped by the {usd(OPTIONS_PAPER_CAPITAL_USD)} sleeve against
          the {usd(CASH_MARGIN_RESERVE_USD)} cash reserve. Strategy gates remain below.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">BP used</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
              {cell(feed?.bpUsed)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {live
                ? `Headroom ${cell(partitions.freeCollateralUsd)} · Alpaca options BP ${usd(account?.optionsBuyingPower)}`
                : "Add ALPACA_API_KEY_ID + SECRET in Cursor secrets"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">Open spreads</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
              {ledger.isPending ? "…" : live ? String(feed?.spreads.length ?? 0) : "Not live"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {live
                ? `${optionPositions.length} legs · max loss ${cell(feed?.maxLoss)}`
                : "Waiting for Alpaca"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">Unrealized P&amp;L</p>
            <p
              className={`mt-2 font-display text-2xl font-semibold tabular-nums ${
                live && (feed?.unrealizedPl ?? 0) < 0
                  ? "text-negative"
                  : live && (feed?.unrealizedPl ?? 0) > 0
                    ? "text-positive"
                    : "text-muted-foreground"
              }`}
            >
              {cell(feed?.unrealizedPl, 2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Marked from open legs</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">Realized premium</p>
            <p
              className={`mt-2 font-display text-2xl font-semibold tabular-nums ${
                live && (feed?.realizedPl ?? 0) < 0
                  ? "text-negative"
                  : live && (feed?.realizedPl ?? 0) > 0
                    ? "text-positive"
                    : "text-muted-foreground"
              }`}
            >
              {cell(feed?.realizedPl, 2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">FIFO from option fills</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <p className="label-caps">β-weighted Δ</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-muted-foreground">
              {betaText(feed?.betaWeightedDelta)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">SPY-equivalent shares</p>
          </div>
        </div>

        {live ? (
          <div className="mt-5 overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-border/70 bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Structure</th>
                  <th className="px-3 py-2.5 font-medium">Underlying</th>
                  <th className="px-3 py-2.5 font-medium">Expiry</th>
                  <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                  <th className="px-3 py-2.5 font-medium text-right">Entry credit</th>
                  <th className="px-3 py-2.5 font-medium text-right">Mark</th>
                  <th className="px-3 py-2.5 font-medium text-right">Max loss</th>
                  <th className="px-3 py-2.5 font-medium text-right">BP</th>
                  <th className="px-3 py-2.5 font-medium text-right">Unrealized</th>
                  <th className="px-3 py-2.5 font-medium text-right">βΔ</th>
                </tr>
              </thead>
              <tbody>
                {feed?.spreads.length ? (
                  feed.spreads.map((spread) => (
                    <tr key={spread.id} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2.5 font-medium">{spread.structure}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{spread.underlying}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{spread.expiry || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {spread.contracts}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {usd(spread.netCredit, 2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {usd(spread.markCredit, 2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {spread.maxLoss == null ? "Not live" : usd(spread.maxLoss, 2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {spread.bpUsed == null ? "Not live" : usd(spread.bpUsed, 2)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                          spread.unrealizedPl >= 0 ? "text-positive" : "text-negative"
                        }`}
                      >
                        {usd(spread.unrealizedPl, 2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {spread.betaWeightedDelta == null
                          ? "Not live"
                          : `${spread.betaWeightedDelta > 0 ? "+" : ""}${spread.betaWeightedDelta.toFixed(1)}`}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-3 py-4 text-sm text-muted-foreground">
                      No open spreads.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}

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
                  <tr
                    key={p.assetId || p.symbol}
                    className="border-b border-border/40 last:border-0"
                  >
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

        {live && feed?.notes.length ? (
          <p className="mt-4 text-xs text-muted-foreground">{feed.notes.join(" · ")}</p>
        ) : null}

        {!live && !ledger.isPending ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {(ledger.data?.notes ?? []).join(" · ") || "Alpaca paper ledger not connected yet."}
          </p>
        ) : null}
      </section>

      <OptionsTradeDesk live={live} connection={conn} />
      <OptionsSleevePanel />
    </div>
  );
}
