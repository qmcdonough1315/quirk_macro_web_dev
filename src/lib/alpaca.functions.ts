import { createServerFn } from "@tanstack/react-start";

import { emptyAlpacaLedger, fetchAlpacaPaperLedger, type AlpacaPaperLedger } from "./alpaca.server";

export type {
  AlpacaPaperLedger,
  AlpacaAccountSnapshot,
  AlpacaPosition,
  OptionsFillsFeed,
  OpenSpread,
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
