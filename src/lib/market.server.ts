/** Server-only FRED helpers for the macro dashboard. */


export interface SeriesPoint {
  date: string;
  value: number;
}

export interface SeriesSummary {
  latest: number;
  latestDate: string;
  changeBps: number;
  /** monthly last-observation series, trailing 12 months */
  monthly: SeriesPoint[];
}

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

function monthLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const m = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${m} '${String(d.getUTCFullYear()).slice(2)}`;
}

export async function fetchFredSeries(seriesId: string): Promise<SeriesSummary> {
  const apiKey = process.env["FRED_API_KEY"];
  if (!apiKey) throw new Error("FRED_API_KEY is not configured");

  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCDate(start.getUTCDate() - 45);

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${
    start.toISOString().slice(0, 10)
  }`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED request failed for ${seriesId} (${res.status})`);
  const json = (await res.json()) as { observations?: { date: string; value: string }[] };

  const obs: SeriesPoint[] = (json.observations ?? [])
    .filter((o) => o.value !== "." && !Number.isNaN(Number(o.value)))
    .map((o) => ({ date: o.date, value: Number(o.value) }));

  if (!obs.length) throw new Error(`No observations returned for ${seriesId}`);

  const last = obs[obs.length - 1]!;
  const cutoff = new Date(`${last.date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const priorList = obs.filter((o) => new Date(`${o.date}T00:00:00Z`) <= cutoff);
  const prior = priorList[priorList.length - 1] ?? obs[0]!;

  const byMonth = new Map<string, SeriesPoint>();
  for (const o of obs) byMonth.set(o.date.slice(0, 7), o);
  const monthly = Array.from(byMonth.values()).slice(-12);

  return {
    latest: last.value,
    latestDate: last.date,
    changeBps: Math.round((last.value - prior.value) * 100),
    monthly,
  };
}

export interface MacroSnapshot {
  mortgage: SeriesSummary;
  treasury: SeriesSummary;
  /** Real GDP growth, percent change from a year ago (FRED A191RO1Q156NBEA) */
  gdp: { latest: number; latestDate: string; changePp: number };
  /** Core PCE price index, YoY % (FRED PCEPILFE) */
  corePce: { latest: number; latestDate: string; changePp: number };
  spreadBps: number;
  spreadChangeBps: number;
  series: { month: string; treasury: number; mortgage: number }[];
  updated: string;
}

export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  const [mortgage, treasury, gdpRaw, corePce] = await Promise.all([
    fetchFredSeries("MORTGAGE30US"),
    fetchFredSeries("DGS10"),
    fetchFredSeries("A191RO1Q156NBEA"),
    fetchInflationYoY("PCEPILFE"),
  ]);

  const months = new Map<string, { month: string; treasury: number; mortgage: number }>();
  for (const p of treasury.monthly) {
    months.set(p.date.slice(0, 7), { month: monthLabel(p.date), treasury: p.value, mortgage: 0 });
  }
  for (const p of mortgage.monthly) {
    const key = p.date.slice(0, 7);
    const row = months.get(key) ?? { month: monthLabel(p.date), treasury: 0, mortgage: 0 };
    row.mortgage = p.value;
    months.set(key, row);
  }
  const series = Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .filter((r) => r.treasury > 0 && r.mortgage > 0);

  return {
    mortgage,
    treasury,
    gdp: {
      latest: gdpRaw.latest,
      latestDate: gdpRaw.latestDate,
      changePp: Math.round(gdpRaw.changeBps) / 100,
    },
    corePce,
    spreadBps: Math.round((mortgage.latest - treasury.latest) * 100),
    spreadChangeBps: mortgage.changeBps - treasury.changeBps,
    series,
    updated: mortgage.latestDate,
  };
}

// ---------------------------------------------------------------------------
// Inflation (YoY), macro recap, and economic calendar
// ---------------------------------------------------------------------------

async function fetchFredObservations(seriesId: string, startIso: string): Promise<SeriesPoint[]> {
  const apiKey = process.env["FRED_API_KEY"];
  if (!apiKey) throw new Error("FRED_API_KEY is not configured");
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startIso}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED request failed for ${seriesId} (${res.status})`);
  const json = (await res.json()) as { observations?: { date: string; value: string }[] };
  return (json.observations ?? [])
    .filter((o) => o.value !== "." && !Number.isNaN(Number(o.value)))
    .map((o) => ({ date: o.date, value: Number(o.value) }));
}

/** YoY % change for a monthly index series (e.g. PCEPILFE core PCE). */
export async function fetchInflationYoY(
  seriesId: string,
): Promise<{ latest: number; latestDate: string; changePp: number }> {
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 3);
  const obs = await fetchFredObservations(seriesId, start.toISOString().slice(0, 10));
  if (obs.length < 13) throw new Error(`Not enough observations for ${seriesId}`);

  const yoyAt = (i: number): number | undefined => {
    const prior = obs[i - 12];
    const cur = obs[i];
    if (!prior || !cur || prior.value === 0) return undefined;
    return ((cur.value - prior.value) / prior.value) * 100;
  };

  const latest = yoyAt(obs.length - 1);
  const prev = yoyAt(obs.length - 2);
  if (typeof latest !== "number") throw new Error(`Could not compute YoY for ${seriesId}`);

  return {
    latest: Math.round(latest * 100) / 100,
    latestDate: obs[obs.length - 1]!.date,
    changePp: typeof prev === "number" ? Math.round((latest - prev) * 100) / 100 : 0,
  };
}

/* ── Treasury yield curve + Fed funds probability ─────────────────────────── */

export interface CurvePoint {
  tenor: string;
  months: number;
  current: number;
  yearAgo: number | null;
}

export interface RateProbability {
  label: string;
  probability: number;
}

export interface RatesOutlook {
  curve: CurvePoint[];
  curveDate: string;
  fedFunds: number;
  /** implied policy rate ~12 months out, from the 1Y Treasury */
  impliedRate: number;
  probabilities: RateProbability[];
  nextMeeting: string;
  updated: string;
}

const CURVE_SERIES: { id: string; tenor: string; months: number }[] = [
  { id: "DGS1MO", tenor: "1M", months: 1 },
  { id: "DGS3MO", tenor: "3M", months: 3 },
  { id: "DGS6MO", tenor: "6M", months: 6 },
  { id: "DGS1", tenor: "1Y", months: 12 },
  { id: "DGS2", tenor: "2Y", months: 24 },
  { id: "DGS3", tenor: "3Y", months: 36 },
  { id: "DGS5", tenor: "5Y", months: 60 },
  { id: "DGS7", tenor: "7Y", months: 84 },
  { id: "DGS10", tenor: "10Y", months: 120 },
  { id: "DGS20", tenor: "20Y", months: 240 },
  { id: "DGS30", tenor: "30Y", months: 360 },
];

/**
 * Bill-implied policy gap. The distance between effective fed funds and the
 * 3-month Treasury, minus a small term premium, is scaled into hold/cut/hike
 * shares. This is not the Atlanta Fed Market Probability Tracker.
 */
function impliedProbabilities(fedFunds: number, threeMonth: number): RateProbability[] {
  // ~10 bps of average bill term premium is not a policy expectation
  const gapBps = (threeMonth - fedFunds) * 100 - 10;
  // 25 bps move fully priced when the 3M bill sits a full quarter-point away.
  const cut = Math.max(0, Math.min(1, -gapBps / 25));
  const hike = Math.max(0, Math.min(1, gapBps / 25));
  const cut50 = Math.max(0, Math.min(1, (-gapBps - 25) / 25)) * cut;
  const cut25 = Math.max(0, cut - cut50);
  const hike25 = Math.max(0, hike);
  const hold = Math.max(0, 1 - cut25 - cut50 - hike25);
  const round = (n: number) => Math.round(n * 1000) / 10;
  return [
    { label: "Cut 50+ bps", probability: round(cut50) },
    { label: "Cut 25 bps", probability: round(cut25) },
    { label: "Hold", probability: round(hold) },
    { label: "Hike 25 bps", probability: round(hike25) },
  ];
}

async function latestAndYearAgo(seriesId: string) {
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCDate(start.getUTCDate() - 20);
  const obs = await fetchFredObservations(seriesId, start.toISOString().slice(0, 10));
  if (!obs.length) return null;
  const last = obs[obs.length - 1]!;
  const first = obs[0]!;
  return { current: last.value, currentDate: last.date, yearAgo: first.value };
}

export async function fetchRatesOutlook(): Promise<RatesOutlook> {
  const results = await Promise.all(
    CURVE_SERIES.map(async (s) => ({ meta: s, data: await latestAndYearAgo(s.id).catch(() => null) })),
  );

  const curve: CurvePoint[] = [];
  let curveDate = "";
  for (const r of results) {
    if (!r.data) continue;
    curveDate = r.data.currentDate > curveDate ? r.data.currentDate : curveDate;
    curve.push({
      tenor: r.meta.tenor,
      months: r.meta.months,
      current: r.data.current,
      yearAgo: r.data.yearAgo,
    });
  }
  if (!curve.length) throw new Error("Treasury curve data unavailable");

  const ff = await latestAndYearAgo("DFF").catch(() => null);
  const fedFunds = ff?.current ?? curve[0]!.current;
  const threeMonth = curve.find((c) => c.tenor === "3M")?.current ?? fedFunds;
  const oneYear = curve.find((c) => c.tenor === "1Y")?.current ?? fedFunds;

  return {
    curve: curve.sort((a, b) => a.months - b.months),
    curveDate,
    fedFunds,
    impliedRate: oneYear,
    probabilities: impliedProbabilities(fedFunds, threeMonth),
    nextMeeting: nextFomcMeeting(),
    updated: new Date().toISOString(),
  };
}

/** Approximate next FOMC decision date (8 meetings/yr, ~6-week cadence). */
function nextFomcMeeting(): string {
  const dates2026 = [
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
    "2026-07-29", "2026-09-16", "2026-11-04", "2026-12-16",
  ];
  const today = new Date().toISOString().slice(0, 10);
  return dates2026.find((d) => d >= today) ?? "2027-01-27";
}
