import reads from "@/data/regime-reads.json";
import digests from "@/data/digests.json";

import { selectLatestDigest } from "@/components/dashboard/WeeklyDigest";

export interface RegimeReadEntry {
  date: string;
  modelCommentary: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseEntry(value: unknown): RegimeReadEntry | null {
  const entry = asRecord(value);
  if (!entry) return null;
  const date = entry["date"];
  const modelCommentary = entry["modelCommentary"];
  if (typeof date !== "string" || typeof modelCommentary !== "string") return null;
  if (!ISO_DATE.test(date)) return null;
  const cleanModel = modelCommentary.trim();
  if (!cleanModel) return null;
  return { date, modelCommentary: cleanModel };
}

function selectLatest(value: unknown): RegimeReadEntry | null {
  if (!Array.isArray(value)) return null;
  let latest: RegimeReadEntry | null = null;
  for (const item of value) {
    const entry = parseEntry(item);
    if (!entry) continue;
    if (!latest || entry.date > latest.date) latest = entry;
  }
  return latest;
}

function formatReadDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function RegimeRead() {
  const entry = selectLatest(reads);
  const digest = selectLatestDigest(digests);

  if (!entry && !digest) {
    return (
      <p className="text-sm text-muted-foreground">
        No regime read published yet. Add an entry to the regime file to show it here.
      </p>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      {digest ? (
        <div>
          <h3 className="label-caps mb-2">Past week</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{digest.summary}</p>
        </div>
      ) : null}
      {entry ? (
        <div>
          <h3 className="label-caps mb-2">Model run · {formatReadDate(entry.date)}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{entry.modelCommentary}</p>
        </div>
      ) : null}
    </div>
  );
}
