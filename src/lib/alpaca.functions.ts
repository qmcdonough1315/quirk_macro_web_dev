import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  emptyAlpacaLedger,
  fetchAlpacaPaperLedger,
  placeEtfDcaBuy,
  placeOptionsPaperOrder,
  proposeEtfDcaBuys,
  proposeOptionsPaperTrades,
  type AlpacaPaperLedger,
  type EtfDcaProposalBatch,
  type OptionsProposalBatch,
  type PlaceEtfBuyResult,
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
  EtfDcaProposalBatch,
  PlaceEtfBuyResult,
  WeeklyEtfBuyProposal,
  EtfBuyProposalRow,
  PaperLotFromFill,
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

const etfProposeSchema = z.object({
  weights: z.record(z.string().min(1).max(8), z.number()),
  weeklyContribution: z.number().positive().max(50_000).optional(),
  includeVoo: z.boolean().optional(),
});

export const proposeAlpacaEtfDca = createServerFn({ method: "POST" })
  .validator((input: unknown) => etfProposeSchema.parse(input))
  .handler(async ({ data }): Promise<EtfDcaProposalBatch> => {
    try {
      return await proposeEtfDcaBuys({
        weights: data.weights,
        ...(data.weeklyContribution != null
          ? { weeklyContribution: data.weeklyContribution }
          : {}),
        ...(data.includeVoo != null ? { includeVoo: data.includeVoo } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "ETF DCA proposal failed";
      return {
        live: false,
        asOf: new Date().toISOString(),
        paperOnly: true,
        proposal: null,
        notes: [message],
      };
    }
  });

const etfPlaceSchema = z.object({
  confirm: z.literal(true),
  symbol: z.string().min(1).max(8),
  notional: z.number().min(1).max(50_000),
  reason: z.enum(["weekly_dca", "weekly_voo_dca"]).optional(),
  strategy: z.enum(["factor", "voo"]).optional(),
  runDate: z.string().min(8).max(32).optional(),
});

export const placeAlpacaEtfBuy = createServerFn({ method: "POST" })
  .validator((input: unknown) => etfPlaceSchema.parse(input))
  .handler(async ({ data }): Promise<PlaceEtfBuyResult> => {
    try {
      return await placeEtfDcaBuy({
        confirm: data.confirm,
        symbol: data.symbol,
        notional: data.notional,
        ...(data.reason != null ? { reason: data.reason } : {}),
        ...(data.strategy != null ? { strategy: data.strategy } : {}),
        ...(data.runDate != null ? { runDate: data.runDate } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "ETF buy failed";
      return {
        ok: false,
        dryRun: true,
        orderId: null,
        status: null,
        payload: null,
        filledQty: null,
        filledAvgPrice: null,
        lot: null,
        error: message,
      };
    }
  });
