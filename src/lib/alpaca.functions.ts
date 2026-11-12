import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  emptyAlpacaLedger,
  fetchAlpacaPaperLedger,
  placeOptionsPaperOrder,
  proposeOptionsPaperTrades,
  type AlpacaPaperLedger,
  type OptionsProposalBatch,
  type PlaceOptionsOrderResult,
} from "./alpaca.server";

export type {
  AlpacaPaperLedger,
  AlpacaAccountSnapshot,
  AlpacaPosition,
  AlpacaOpenOrder,
  OptionsFillsFeed,
  OpenSpread,
  OptionsProposalBatch,
  PlaceOptionsOrderResult,
  TradeProposal,
  TradeProposalResult,
} from "./alpaca.server";

export const getAlpacaPaperLedger = createServerFn({ method: "GET" }).handler(
  async (): Promise<AlpacaPaperLedger> => {
    try {
      return await fetchAlpacaPaperLedger();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Alpaca paper ledger failed";
      return emptyAlpacaLedger([message]);
    }
  },
);

const signalSchema = z.object({
  ticker: z.string().min(1).max(8),
  compositeScore: z.number().min(-5).max(5),
  ivRank: z.number().min(0).max(100),
});

const proposeSchema = z.object({
  signals: z.array(signalSchema).min(1).max(14),
});

export const proposeAlpacaOptionsTrades = createServerFn({ method: "POST" })
  .validator((input: unknown) => proposeSchema.parse(input))
  .handler(async ({ data }): Promise<OptionsProposalBatch> => {
    try {
      return await proposeOptionsPaperTrades(data.signals);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Options proposal failed";
      return {
        live: false,
        asOf: new Date().toISOString(),
        paperOnly: true,
        proposals: [],
        notes: [message],
      };
    }
  });

const placeLegSchema = z.object({
  symbol: z.string().min(5).max(32),
  side: z.enum(["buy", "sell"]),
  positionIntent: z.enum(["buy_to_open", "sell_to_open"]),
  ratioQty: z.number().int().positive().max(10).optional(),
});

const placeSchema = z.object({
  confirm: z.literal(true),
  qty: z.number().int().positive().max(20),
  limitPrice: z.number().max(-0.01),
  legs: z.array(placeLegSchema).min(2).max(4),
  structure: z
    .enum(["bull_put_spread", "bear_call_spread", "iron_condor", "skip_low_iv"])
    .optional(),
  ticker: z.string().min(1).max(8).optional(),
});

export const placeAlpacaOptionsOrder = createServerFn({ method: "POST" })
  .validator((input: unknown) => placeSchema.parse(input))
  .handler(async ({ data }): Promise<PlaceOptionsOrderResult> => {
    try {
      return await placeOptionsPaperOrder({
        confirm: data.confirm,
        qty: data.qty,
        limitPrice: data.limitPrice,
        legs: data.legs.map((leg) => {
          const mapped = {
            symbol: leg.symbol,
            side: leg.side,
            positionIntent: leg.positionIntent,
          };
          return leg.ratioQty != null ? { ...mapped, ratioQty: leg.ratioQty } : mapped;
        }),
        ...(data.structure != null ? { structure: data.structure } : {}),
        ...(data.ticker != null ? { ticker: data.ticker } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Options order failed";
      return {
        ok: false,
        dryRun: true,
        orderId: null,
        status: null,
        payload: null,
        error: message,
      };
    }
  });
