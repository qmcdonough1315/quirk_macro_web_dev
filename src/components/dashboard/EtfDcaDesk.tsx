import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Landmark, Loader2, Send, Sparkles } from "lucide-react";

import {
  placeAlpacaEtfBuy,
  proposeAlpacaEtfDca,
  type EtfBuyProposalRow,
  type PaperLotFromFill,
} from "@/lib/alpaca.functions";
import { WEEKLY_CONTRIBUTION_USD } from "@/lib/paper-portfolio-rules";
import type { PortfolioHolding } from "@/lib/factor-beta";
import {
  TradingAdminGate,
  useTradingAdminSession,
} from "@/components/dashboard/TradingAdminGate";

const usd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export function EtfDcaDesk({
  holdings,
  runDate,
}: {
  holdings: PortfolioHolding[];
  runDate?: string | null;
}) {
  const queryClient = useQueryClient();
  const proposeFn = useServerFn(proposeAlpacaEtfDca);
  const placeFn = useServerFn(placeAlpacaEtfBuy);
  const adminSession = useTradingAdminSession();
  const adminUnlocked = Boolean(adminSession.data?.authenticated);
  const [buys, setBuys] = useState<EtfBuyProposalRow[]>([]);
  const [vooBuy, setVooBuy] = useState<EtfBuyProposalRow | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [lots, setLots] = useState<PaperLotFromFill[]>([]);
  const [includeVoo, setIncludeVoo] = useState(false);

  const weights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of holdings) {
      if (h.weight > 0) out[h.ticker] = h.weight;
    }
    return out;
  }, [holdings]);

  const propose = useMutation({
    mutationFn: () =>
      proposeFn({
        data: {
          weights,
          weeklyContribution: WEEKLY_CONTRIBUTION_USD,
          includeVoo,
        },
      }),
    onSuccess: (batch) => {
      setBuys(batch.proposal?.buys ?? []);
      setVooBuy(batch.proposal?.vooBuy ?? null);
      setNotes(batch.notes);
      setMessage(
        batch.live
          ? (batch.notes[0] ?? `Proposed ${batch.proposal?.buys.length ?? 0} buy(s)`)
          : (batch.notes[0] ?? "Proposal unavailable"),
      );
    },
    onError: (err) => {
      setBuys([]);
      setVooBuy(null);
      setNotes([]);
      setMessage(err instanceof Error ? err.message : "Propose failed");
    },
  });

  const place = useMutation({
    mutationFn: (row: EtfBuyProposalRow) =>
      placeFn({
        data: {
          confirm: true as const,
          symbol: row.ticker,
          notional: row.notional,
          reason: row.reason,
          strategy: row.reason === "weekly_voo_dca" ? "voo" : "factor",
          ...(runDate ? { runDate } : {}),
        },
      }),
    onSuccess: async (result, row) => {
      if (result.ok) {
        if (result.lot) setLots((prev) => [result.lot!, ...prev]);
        setMessage(
          `Placed ${row.ticker} ${usd(row.notional)} · order ${result.orderId ?? "?"} (${result.status ?? "submitted"})` +
            (result.lot
              ? ` · lot ${result.lot.shares.toFixed(4)} @ ${usd(result.lot.costPerShare)}`
              : " · awaiting fill for lot record"),
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

  const rows = vooBuy ? [...buys, vooBuy] : buys;
  const canPropose = Object.keys(weights).length > 0;

  return (
    <section className="panel p-6">
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <Landmark className="size-4 text-accent" />
        <h2 className="font-display text-base font-semibold tracking-tight">
          ETF DCA desk
        </h2>
        <span className="label-caps ml-auto">Alpaca equity · paper buys</span>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
        Propose this week&apos;s ~{usd(WEEKLY_CONTRIBUTION_USD, 0)} factor buys from the live
        target weights, place notional market orders on Alpaca paper, and map fills into tax
        lots. HIFO / TLH sells stay on the internal ledger path. Place requires an unlocked
        admin session.
      </p>

      <TradingAdminGate />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canPropose || propose.isPending}
          onClick={() => propose.mutate()}
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {propose.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Propose weekly buys
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeVoo}
            onChange={(e) => setIncludeVoo(e.target.checked)}
            className="size-3.5 accent-foreground"
          />
          Include VOO sleeve
        </label>
        {!canPropose ? (
          <span className="text-xs text-muted-foreground">Waiting for portfolio weights</span>
        ) : null}
      </div>

      {message ? <p className="mb-3 text-sm text-foreground">{message}</p> : null}
      {notes.length > 1 ? (
        <ul className="mb-3 list-inside list-disc text-xs text-muted-foreground">
          {notes.slice(1).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps py-2.5 pr-4">Ticker</th>
                <th className="label-caps py-2.5 pr-4 text-right">Weight</th>
                <th className="label-caps py-2.5 pr-4 text-right">Notional</th>
                <th className="label-caps py-2.5 pr-4">Reason</th>
                <th className="label-caps py-2.5 text-right">Place</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.reason}-${row.ticker}`} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 pr-4 font-mono font-medium">{row.ticker}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {(row.weight * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {usd(row.notional)}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-muted-foreground">{row.reason}</td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      disabled={!adminUnlocked || place.isPending}
                      title={
                        adminUnlocked
                          ? "Submit paper ETF buy"
                          : "Unlock the trading desk as admin first"
                      }
                      onClick={() => place.mutate(row)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/60 disabled:opacity-50"
                    >
                      {place.isPending ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Send className="size-3" />
                      )}
                      Place
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {lots.length > 0 ? (
        <div className="mt-5">
          <p className="label-caps mb-2">Lots from fills (this session)</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {lots.map((lot) => (
              <li key={lot.id} className="font-mono">
                {lot.ticker} · {lot.shares.toFixed(4)} @ {usd(lot.costPerShare)} · {lot.openedOn} ·{" "}
                {lot.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
