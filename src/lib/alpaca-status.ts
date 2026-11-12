/**
 * Classify Alpaca paper ledger connection from the server snapshot.
 * Distinguishes missing secrets vs unauthorized keys vs other API errors.
 */

export type AlpacaConnStatus = "live" | "missing" | "unauthorized" | "error";

export function classifyAlpacaConnection(input: {
  live: boolean;
  notes?: string[] | null;
}): AlpacaConnStatus {
  if (input.live) return "live";
  const notes = (input.notes ?? []).join(" · ");
  if (/credentials missing/i.test(notes)) return "missing";
  if (/\b401\b|unauthorized/i.test(notes)) return "unauthorized";
  if (notes.trim()) return "error";
  return "missing";
}

export function alpacaStatusLabel(status: AlpacaConnStatus): string {
  switch (status) {
    case "live":
      return "Alpaca paper · live";
    case "unauthorized":
      return "Alpaca paper · unauthorized";
    case "error":
      return "Alpaca paper · error";
    case "missing":
    default:
      return "Alpaca paper · awaiting credentials";
  }
}

export function alpacaSummaryLabel(status: AlpacaConnStatus): string {
  switch (status) {
    case "live":
      return "Alpaca paper live";
    case "unauthorized":
      return "Alpaca unauthorized";
    case "error":
      return "Alpaca error";
    case "missing":
    default:
      return "Alpaca awaiting secrets";
  }
}
