import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

import {
  placeAlpacaOptionsOrder,
  proposeAlpacaOptionsTrades,
  type TradeProposal,
  type TradeProposalResult,
} from "@/lib/alpaca.functions";
import type { AlpacaConnStatus } from "@/lib/alpaca-status";

const SIGNAL_DESK = [
  { ticker: "SPY", compositeScore: 0.9, ivRank: 55 },
  { ticker: "XLK", compositeScore: -0.8, ivRank: 62 },
  { ticker: "XLU", compositeScore: 0.1, ivRank: 48 },
  { ticker: "QQQ", compositeScore: 0.7, ivRank: 22 },
] as const;

/** Paper desk places 1 lot by default; sizing still shown on the proposal row. */
const PLACE_QTY = 1;

const usd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

function isProposal(p: TradeProposalResult): p is TradeProposal {
  return p.ok;
}

export function OptionsTradeDesk({
  live,
  connection,
}: {
  live: boolean;
  connection: AlpacaConnStatus;
}) {
  const queryClient = useQueryClient();
  const proposeFn = useServerFn(proposeAlpacaOptionsTrades);
  const placeFn = useServerFn(placeAlpacaOptionsOrder);
  const [proposals, setProposals] = useState<TradeProposalResult[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const propose = useMutation({
    mutationFn: () =>
      proposeFn({
        data: {
          signals: SIGNAL_DESK.map((s) => ({
            ticker: s.ticker,
            compositeScore: s.compositeScore,
            ivRank: s.ivRank,
          })),
        },
      }),
    onSuccess: (batch) => {
      setProposals(batch.proposals);
      setNotes(batch.notes);
      const ok = batch.proposals.filter((p) => p.ok).length;
      const skipped = batch.proposals.length - ok;
      setMessage(
        batch.live
          ? `Proposed ${ok} trade(s), skipped ${skipped} · ${batch.asOf}`
          : (batch.notes[0] ?? "Proposal unavailable"),
      );
    },
    onError: (err) => {
      setProposals([]);
      setNotes([]);
      setMessage(err instanceof Error ? err.message : "Propose failed");
    },
  });

  const place = useMutation({
    mutationFn: (proposal: TradeProposal) =>
      placeFn({
        data: {
          confirm: true as const,
          qty: PLACE_QTY,
          limitPrice: proposal.limitPrice,
          structure: proposal.structure,
          ticker: proposal.ticker,
          legs: proposal.legs.map((leg) => ({
            symbol: leg.symbol,
            side: leg.side,
            positionIntent: leg.positionIntent,
            ratioQty: leg.ratioQty,
          })),
        },
      }),
    onSuccess: async (result, proposal) => {
      if (result.ok) {
        setMessage(
          `Placed ${proposal.ticker} ${proposal.structure} ×${PLACE_QTY} · order ${result.orderId ?? "?"} (${result.status ?? "submitted"}). Day orders fill in RTH — accepted after-hours until the open.`,
        );
        await queryClient.invalidateQueries({ queryKey: ["alpaca-paper-ledger"] });
      } else {
        setMessage(result.error ?? "Order rejected");
      }
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : "Place failed");
    },
  });

  return (
    <section className="panel p-6">
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <Sparkles className="size-4 text-accent" />
        <h2 className="font-display text-base font-semibold tracking-tight">
          Paper trade desk
        </h2>
        <span className="label-caps ml-auto">Alpaca mleg · credit only</span>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
        Build defined-risk credit structures from the factor×IVR examples, price them on the live
        option chain, then submit paper multi-leg orders (negative limit = credit). Place submits{" "}
        {PLACE_QTY} contract by default.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          disabled={propose.isPending || !live}
          onClick={() => propose.mutate()}
        >
          {propose.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Propose from signals
        </button>
        {!live ? (
          <p className="text-xs text-muted-foreground">
            {connection === "unauthorized"
              ? "Alpaca rejected the API keys (401). Rotate paper keys in Alpaca, update Vercel + Cursor secrets, redeploy."
              : connection === "error"
                ? "Alpaca ledger error — see notes above."
                : "Connect Alpaca paper credentials first (Vercel Production env + redeploy)."}
          </p>
        ) : null}
      </div>

      {message ? <p className="mb-4 text-xs text-muted-foreground">{message}</p> : null}
      {notes.length ? (
        <p className="mb-4 text-xs text-muted-foreground">{notes.join(" · ")}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-border/70 bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Ticker</th>
              <th className="px-3 py-2.5 font-medium">Structure</th>
              <th className="px-3 py-2.5 font-medium">Expiry</th>
              <th className="px-3 py-2.5 font-medium text-right">Qty</th>
              <th className="px-3 py-2.5 font-medium text-right">Credit</th>
              <th className="px-3 py-2.5 font-medium text-right">Limit</th>
              <th className="px-3 py-2.5 font-medium text-right">Est. BP</th>
              <th className="px-3 py-2.5 font-medium">Legs / reason</th>
              <th className="px-3 py-2.5 font-medium text-right">Place</th>
            </tr>
          </thead>
          <tbody>
            {propose.isPending ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-sm text-muted-foreground">
                  Pricing chains…
                </td>
              </tr>
            ) : proposals.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-sm text-muted-foreground">
                  No proposals yet — run Propose from signals.
                </td>
              </tr>
            ) : (
              proposals.map((row) => {
                if (!isProposal(row)) {
                  return (
                    <tr key={`${row.ticker}-skip`} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2.5 font-mono font-semibold">{row.ticker}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{row.structure}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground" colSpan={5}>
                        Skip
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.reason}</td>
                      <td />
                    </tr>
                  );
                }
                const placing =
                  place.isPending &&
                  place.variables?.ticker === row.ticker &&
                  place.variables?.structure === row.structure;
                return (
                  <tr
                    key={`${row.ticker}-${row.structure}-${row.expirationDate}`}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="px-3 py-2.5 font-mono font-semibold">{row.ticker}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{row.structure}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {row.expirationDate} · {row.dte}d
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {PLACE_QTY}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        /{row.qty}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {usd(row.creditPerShare)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {row.limitPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {usd(row.maxLossPerContract * PLACE_QTY, 0)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {row.legs
                        .map((l) => `${l.side === "sell" ? "STO" : "BTO"} ${l.strike}${l.right}`)
                        .join(" · ")}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/40 disabled:opacity-50"
                        disabled={!live || place.isPending}
                        onClick={() => place.mutate(row)}
                      >
                        {placing ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Send className="size-3" />
                        )}
                        Place
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
