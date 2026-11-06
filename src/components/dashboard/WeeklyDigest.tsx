import digests from "@/data/digests.json";

export interface DigestSection {
  sector: string;
  bullets: string[];
}

export interface WeeklyDigestEntry {
  title: string;
  date: string;
  summary: string;
  sections: DigestSection[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseEntry(value: unknown): WeeklyDigestEntry | null {
  const entry = asRecord(value);
  if (!entry) return null;

  const title = entry["title"];
  const date = entry["date"];
  const summary = entry["summary"];
  const sections = entry["sections"];
  if (typeof title !== "string" || typeof date !== "string" || typeof summary !== "string") {
    return null;
  }
  if (!ISO_DATE.test(date) || !Array.isArray(sections)) return null;

  const parsedSections: DigestSection[] = [];
  for (const section of sections) {
    const record = asRecord(section);
    if (!record) return null;
    const sector = record["sector"];
    const bullets = record["bullets"];
    if (typeof sector !== "string" || !Array.isArray(bullets)) return null;
    if (!bullets.every((bullet) => typeof bullet === "string")) return null;

    const cleanBullets = bullets
      .map((bullet) => bullet.trim())
      .filter((bullet) => bullet.length > 0);
    const cleanSector = sector.trim();
    if (!cleanSector || cleanBullets.length === 0) continue;
    parsedSections.push({ sector: cleanSector, bullets: cleanBullets });
  }

  const cleanTitle = title.trim();
  const cleanSummary = summary.trim();
  if (!cleanTitle || !cleanSummary) return null;

  return { title: cleanTitle, date, summary: cleanSummary, sections: parsedSections };
}

/** Newest valid entry in src/data/digests.json, compared by ISO date. */
export function selectLatestDigest(value: unknown): WeeklyDigestEntry | null {
  if (!Array.isArray(value)) return null;

  let latest: WeeklyDigestEntry | null = null;
  for (const item of value) {
    const entry = parseEntry(item);
    if (!entry) continue;
    if (!latest || entry.date > latest.date) latest = entry;
  }
  return latest;
}

function formatDigestDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function WeeklyDigest() {
  const digest = selectLatestDigest(digests);

  if (!digest) {
    return (
      <p className="text-sm text-muted-foreground">
        No weekly commentary published yet. Add an entry to the digest file to show it here.
      </p>
    );
  }

  return (
    <div>
      <p className="font-display text-lg font-semibold leading-snug tracking-tight">{digest.title}</p>
      <time
        dateTime={digest.date}
        className="mt-1.5 block font-mono text-xs tabular-nums text-muted-foreground"
      >
        {formatDigestDate(digest.date)}
      </time>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{digest.summary}</p>

      {digest.sections.length > 0 ? (
        <div className="mt-5 space-y-4">
          {digest.sections.map((section) => (
            <div key={section.sector}>
              <h4 className="label-caps">{section.sector}</h4>
              <ul className="mt-2.5 space-y-2.5">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3 text-sm text-muted-foreground">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="leading-relaxed">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
