import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

import {
  getLiveOptionsSignalBoard,
  placeAlpacaOptionsOrder,
  proposeAlpacaOptionsTrades,
  type TradeProposal,
  type TradeProposalResult,
} from "@/lib/alpaca.functions";
import type { AlpacaConnStatus } from "@/lib/alpaca-status";
import { compareRankScore, rankCreditProposal } from "@/lib/options-ranker";
import {
  TradingAdminGate,
  useTradingAdminSession,
} from "@/components/dashboard/TradingAdminGate";

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
  const boardFn = useServerFn(getLiveOptionsSignalBoard);
  const proposeFn = useServerFn(proposeAlpacaOptionsTrades);
  const placeFn = useServerFn(placeAlpacaOptionsOrder);
  const adminSession = useTradingAdminSession();
  const adminUnlocked = Boolean(adminSession.data?.authenticated);
  const [proposals, setProposals] = useState<TradeProposalResult[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const board = useQuery({
    queryKey: ["options-live-signal-board"],
    queryFn: () => boardFn(),
    staleTime: 60_000,
    retry: 1,
  });

  const ranked = useMemo(() => {
    const ivByTicker = new Map(
      (board.data?.ivRanks ?? []).map((r) => [r.ticker.toUpperCase(), r.ivRank]),
    );
    return [...proposals]
      .map((row) => {
        if (!isProposal(row)) return { row, rank: null as ReturnType<typeof rankCreditProposal> | null };
        const ivRank = ivByTicker.get(row.ticker.toUpperCase()) ?? row.signal.ivRank;
        return { row, rank: rankCreditProposal(row, ivRank) };
      })
      .sort((a, b) => {
        if (a.rank && b.rank) return compareRankScore(a.rank, b.rank);
        if (a.rank) return -1;
        if (b.rank) return 1;
        return a.row.ticker.localeCompare(b.row.ticker);
      });
  }, [proposals, board.data?.ivRanks]);

  const propose = useMutation({
    mutationFn: () => proposeFn({ data: { useLiveSignals: true } }),
    onSuccess: (batch) => {
      setProposals(batch.proposals);
      setNotes(batch.notes);
      const ok = batch.proposals.filter((p) => p.ok).length;
      const skipped = batch.proposals.length - ok;
      setMessage(
        batch.live || ok > 0 || batch.notes.length
          ? `Proposed ${ok} trade(s), skipped ${skipped} · ${batch.asOf}`
          : (batch.notes[0] ?? "Proposal unavailable"),
      );
      void queryClient.invalidateQueries({ queryKey: ["options-live-signal-board"] });
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
        <span className="label-caps ml-auto">Phase 1 · sell rich IVR · HITL paper</span>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
        Phase 1 harvests elevated IV Rank with defined-risk credit spreads and stands aside when IV
        is cheap (IVR &lt; 30) — it does not buy undervalued vol. Builds proposals from live Supabase
        IV Rank plus published <span className="font-mono text-[11px]">options_composite</span>{" "}
        scores, prices them on the Alpaca chain, then places paper mleg only after you confirm.
        Missing live inputs are skipped — never filled with demo data. Place submits {PLACE_QTY}{" "}
        contract by default and requires an unlocked admin session.
      </p>

      <TradingAdminGate />

      <div className="mb-5 overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border/70 bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Ticker</th>
              <th className="px-3 py-2.5 font-medium text-right">Composite</th>
              <th className="px-3 py-2.5 font-medium text-right">IVR</th>
              <th className="px-3 py-2.5 font-medium">Structure</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {board.isPending ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground">
                  Loading live IVR / composites…
                </td>
              </tr>
            ) : (board.data?.rows.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground">
                  No live signal board yet.
                </td>
              </tr>
            ) : (
              board.data!.rows.map((row) => (
                <tr key={row.ticker} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2.5 font-mono font-semibold">{row.ticker}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {row.compositeScore == null ? "—" : row.compositeScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {row.ivRank == null ? "—" : `${row.ivRank.toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {row.signal?.structure ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.ready ? "Ready" : row.skipReason ?? "Not ready"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {board.data?.notes?.length ? (
        <p className="mb-4 text-xs text-muted-foreground">{board.data.notes.join(" · ")}</p>
      ) : null}

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
          Propose from live signals
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
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="border-b border-border/70 bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Rank</th>
              <th className="px-3 py-2.5 font-medium">Ticker</th>
              <th className="px-3 py-2.5 font-medium">Structure</th>
              <th className="px-3 py-2.5 font-medium text-right">POP≈</th>
              <th className="px-3 py-2.5 font-medium text-right">Credit/width</th>
              <th className="px-3 py-2.5 font-medium">Expiry</th>
              <th className="px-3 py-2.5 font-medium text-right">Credit</th>
              <th className="px-3 py-2.5 font-medium text-right">Est. BP</th>
              <th className="px-3 py-2.5 font-medium">Legs / reason</th>
              <th className="px-3 py-2.5 font-medium text-right">Place</th>
            </tr>
          </thead>
          <tbody>
            {propose.isPending ? (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-sm text-muted-foreground">
                  Pricing chains…
                </td>
              </tr>
            ) : ranked.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-sm text-muted-foreground">
                  No proposals yet — run Propose from live signals.
                </td>
              </tr>
            ) : (
              ranked.map(({ row, rank }, idx) => {
                if (!isProposal(row)) {
                  return (
                    <tr key={`${row.ticker}-skip`} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">—</td>
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
                    <td className="px-3 py-2.5 font-mono tabular-nums">
                      #{idx + 1}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {rank ? rank.score.toFixed(1) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold">{row.ticker}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{row.structure}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {rank?.popProxy == null ? "—" : `${(rank.popProxy * 100).toFixed(0)}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {rank?.creditToWidth == null ? "—" : rank.creditToWidth.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {row.expirationDate} · {row.dte}d
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {usd(row.creditPerShare)}
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
                        disabled={!live || !adminUnlocked || place.isPending}
                        title={
                          adminUnlocked
                            ? "Submit paper mleg"
                            : "Unlock the trading desk as admin first"
                        }
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
