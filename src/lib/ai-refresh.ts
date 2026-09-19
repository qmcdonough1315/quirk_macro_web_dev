const EASTERN_TIME_ZONE = "America/New_York";

const easternParts = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function previousDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day) - 86_400_000).toISOString().slice(0, 10);
}

/** Identifies the active 6 AM, noon, or 6 PM Eastern commentary window. */
export function getEasternRefreshWindow(now = new Date()): string {
  const values = Object.fromEntries(
    easternParts.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const currentDate = `${values.year}-${values.month}-${values.day}`;

  if (hour < 6) return `${previousDate(year, month, day)}-18`;
  if (hour < 12) return `${currentDate}-06`;
  if (hour < 18) return `${currentDate}-12`;
  return `${currentDate}-18`;
}

/** Seven hours safely covers one window; the window key enforces each boundary. */
export const COMMENTARY_CACHE_TTL_MS = 7 * 60 * 60_000;