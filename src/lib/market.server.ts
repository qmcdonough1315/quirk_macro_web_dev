/** Server-only helpers for FRED, RealtyAPI and the AI area-profile summary. */

import { fetchRealtyMarket } from "./realty.server";


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
  /** Real GDP growth, QoQ annualized (FRED A191RO1Q156NBEA) */
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

export interface LocalMarketLive {
  zip: string;
  name: string;
  stats: { label: string; value: string; detail: string }[];
  rental: { label: string; value: string; detail: string }[];
  affordability: number;
  affordabilityNotes: { label: string; value: string }[];
  bullets: string[];
  tags: string[];
}

const usd = (n: number | undefined | null, digits = 0) =>
  typeof n === "number" && Number.isFinite(n)
    ? `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`
    : "—";

const pct = (n: number | undefined | null) =>
  typeof n === "number" && Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(1)}%` : "—";

// RentCast has been replaced by RealtyAPI (Redfin + Apartments.com) — see realty.server.ts.


export async function generateAreaProfile(zip: string, context: string): Promise<{ bullets: string[]; tags: string[]; name: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI key is not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a housing market analyst. Respond ONLY with strict JSON: {\"name\":string,\"bullets\":[string,string,string],\"tags\":[string]}. name is the 'Neighborhood, City, State' for the ZIP. Exactly 3 bullets, each 1-2 sentences: (1) lifestyle & local vibe, (2) transit & access, (3) housing affordability & the local economy. tags: 4-5 short descriptors.",
        },
        { role: "user", content: `ZIP code ${zip}. Market data: ${context}` },
      ],
    }),
  });

  if (!res.ok) throw new Error(`AI summary failed (${res.status})`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI summary returned an unexpected response");
  const parsed = JSON.parse(match[0]) as { name?: string; bullets?: string[]; tags?: string[] };
  return {
    name: parsed.name ?? `ZIP ${zip}`,
    bullets: (parsed.bullets ?? []).slice(0, 3),
    tags: (parsed.tags ?? []).slice(0, 5),
  };
}

export async function buildLocalMarket(zipInput: string): Promise<LocalMarketLive> {
  const zip = zipInput.trim();
  if (!/^\d{5}$/.test(zip)) throw new Error("Enter a valid 5-digit ZIP code");

  const market = await fetchRealtyMarket(zip);

  const medianPrice = market.medianPrice;
  const medianRent = market.medianRent;
  const ppsf = market.pricePerSqFt;
  const priceYoY = market.priceYoYPct;
  

  const priceToRent =
    medianPrice && medianRent ? medianPrice / (medianRent * 12) : undefined;
  const capRate = medianPrice && medianRent ? ((medianRent * 12 * 0.6) / medianPrice) * 100 : undefined;

  // 30-yr amortized payment on 80% LTV using the live FRED mortgage rate.
  const mortgage = await fetchFredSeries("MORTGAGE30US");
  const r = mortgage.latest / 100 / 12;
  const principal = (medianPrice ?? 0) * 0.8;
  const payment = r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -360)) : 0;

  const dom = market.medianDom;
  // 0 = buyer market, 100 = seller market
  const domScore = typeof dom === "number" ? Math.max(0, Math.min(100, 100 - (dom - 10) * 1.4)) : 50;
  const momentum = typeof priceYoY === "number" ? Math.max(0, Math.min(100, 50 + priceYoY * 4)) : 50;
  const affordability = Math.round(domScore * 0.55 + momentum * 0.45);

  const profile = await generateAreaProfile(
    zip,
    JSON.stringify({
      medianPrice,
      pricePerSqFt: ppsf,
      medianRent,
      priceYoYPercent: priceYoY,
      medianDaysOnMarket: dom,
      homesSoldLastMonth: market.homesSold,
      saleToListPercent: market.saleToListPct,
      homesWithPriceDropsPercent: market.priceDropSharePct,
      activeListings: market.totalListings,
      mortgageRate: mortgage.latest,
    }),
  );

  return {
    zip,
    name: profile.name,
    stats: [
      { label: "Median Sale Price", value: usd(medianPrice), detail: `${pct(priceYoY)} YoY` },
      { label: "Price per Sq Ft", value: usd(ppsf), detail: "active Redfin listings" },
      {
        label: "Homes with Price Cuts",
        value: typeof market.priceDropSharePct === "number" ? `${market.priceDropSharePct.toFixed(1)}%` : "—",
        detail: `${market.newListings ?? "—"} new listings this week`,
      },
      {
        label: "Median Days on Market",
        value: typeof dom === "number" ? `${Math.round(dom)} days` : "—",
        detail: `${market.homesSold ?? "—"} homes sold`,
      },
      {
        label: "Est. Monthly Payment",
        value: payment ? `${usd(payment)} / mo` : "—",
        detail: `at ${mortgage.latest.toFixed(2)}% · 20% down`,
      },
    ],
    rental: [
      { label: "Median Rent", value: usd(medianRent), detail: "apartments.com listings" },
      {
        label: "Estimated Cap Rate",
        value: typeof capRate === "number" ? `${capRate.toFixed(1)}%` : "—",
        detail: "60% net operating margin assumed",
      },
      {
        label: "Price-to-Rent Ratio",
        value: typeof priceToRent === "number" ? `${priceToRent.toFixed(1)}x` : "—",
        detail: typeof priceToRent === "number" && priceToRent > 20 ? "renting favored" : "buying favored",
      },
    ],
    affordability,
    affordabilityNotes: [
      { label: "Median mortgage payment", value: payment ? `${usd(payment)} / mo` : "—" },
      { label: "Est. down payment (20%)", value: usd((medianPrice ?? 0) * 0.2) },
      { label: "Sale-to-list price", value: typeof market.saleToListPct === "number" ? `${market.saleToListPct.toFixed(1)}%` : "—" },
      { label: "Median days on market", value: typeof dom === "number" ? `${Math.round(dom)} days` : "—" },
    ],

    bullets: profile.bullets,
    tags: profile.tags,
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

export interface MacroContextInput {
  mortgageRate?: number;
  treasuryYield?: number;
  gdpGrowth?: number;
  corePceYoY?: number;
  asOf?: string;
}

export interface RecapResult {
  headline: string;
  bullets: string[];
}

export async function generateMacroRecap(ctx: MacroContextInput): Promise<RecapResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI key is not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "system",
          content: [
            'You are a macro strategist writing the "Past Week Recap" for an institutional housing & rates dashboard. Respond ONLY with strict JSON:',
            '{"headline":string,"bullets":[string]}',
            '- "headline": ONE sharp sentence (max 18 words) capturing the week for rates and housing.',
            '- "bullets": EXACTLY 6 items, each 1-2 sentences, covering in order: (1) GDP growth, (2) employment data (BLS payrolls / ADP), (3) CPI & Core PCE inflation, (4) Federal Reserve policy news, (5) Housing Starts & homebuilder activity, (6) Case-Shiller / home price trends.',
            "Use the provided reference levels where given. For reports without a provided level, characterize direction only (\"held steady\", \"ticked higher\") — never invent precise figures.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `Reference levels — 30Y mortgage ${ctx.mortgageRate ?? "—"}%, 10Y Treasury ${
            ctx.treasuryYield ?? "—"
          }%, real GDP growth ${ctx.gdpGrowth ?? "—"}% (QoQ annualized), Core PCE ${
            ctx.corePceYoY ?? "—"
          }% YoY. Data as of ${ctx.asOf ?? "latest"}.`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`AI recap failed (${res.status})`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI recap returned an unexpected response");
  const parsed = JSON.parse(match[0]) as { headline?: string; bullets?: string[] };
  return {
    headline: parsed.headline ?? "Rates held their range while housing data stayed mixed.",
    bullets: (parsed.bullets ?? []).slice(0, 6),
  };
}

export interface CalendarEvent {
  date: string; // YYYY-MM-DD
  time: string; // e.g. "8:30 AM ET"
  title: string;
  category: string;
  impact: "high" | "medium" | "low";
  consensus: string;
  prior: string;
}

function next7Days(): { date: string; weekday: string }[] {
  const now = new Date();
  const days: { date: string; weekday: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    days.push({
      date: d.toISOString().slice(0, 10),
      weekday: d.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" }),
    });
  }
  return days;
}

/** Rule-based recurring release schedule, used when the AI calendar is unavailable. */
function fallbackCalendar(days: { date: string; weekday: string }[]): CalendarEvent[] {
  const byWeekday: Record<string, Omit<CalendarEvent, "date">[]> = {
    Monday: [
      { time: "11:00 AM ET", title: "NY Fed 1-Yr Inflation Expectations", category: "Inflation", impact: "low", consensus: "—", prior: "3.0%" },
    ],
    Tuesday: [
      { time: "6:00 AM ET", title: "NFIB Small Business Optimism", category: "Growth", impact: "medium", consensus: "—", prior: "100.8" },
    ],
    Wednesday: [
      { time: "7:00 AM ET", title: "MBA Weekly Mortgage Applications", category: "Housing", impact: "medium", consensus: "—", prior: "+1.1%" },
      { time: "1:00 PM ET", title: "10-Year Treasury Note Auction", category: "Rates", impact: "medium", consensus: "—", prior: "—" },
    ],
    Thursday: [
      { time: "8:30 AM ET", title: "Initial Jobless Claims", category: "Employment", impact: "high", consensus: "225K", prior: "218K" },
      { time: "10:00 AM ET", title: "Existing Home Sales", category: "Housing", impact: "medium", consensus: "4.10M", prior: "4.06M" },
    ],
    Friday: [
      { time: "10:00 AM ET", title: "U. Michigan Consumer Sentiment", category: "Consumer", impact: "medium", consensus: "61.5", prior: "61.7" },
    ],
  };
  return days.flatMap((d) =>
    (byWeekday[d.weekday] ?? []).map((e) => ({ ...e, date: d.date })),
  );
}

export async function generateEconCalendar(): Promise<CalendarEvent[]> {
  const days = next7Days();
  const validDates = new Set(days.map((d) => d.date));

  try {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI key is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          {
            role: "system",
            content: [
              "You maintain the U.S. economic release calendar. Respond ONLY with strict JSON: an array of events:",
              '[{"date":"YYYY-MM-DD","time":"8:30 AM ET","title":string,"category":string,"impact":"high"|"medium"|"low","consensus":string,"prior":string}]',
              "Include only well-known scheduled U.S. macro releases for the requested dates (CPI, PPI, Core PCE, Nonfarm Payrolls, ADP, Jobless Claims, FOMC minutes/decisions, Housing Starts, Building Permits, Existing/New Home Sales, Case-Shiller HPI, GDP, Retail Sales, Consumer Sentiment, MBA Mortgage Applications).",
              'Impact: "high" for CPI / Core PCE / payrolls / FOMC / GDP, "medium" for housing / claims / retail, "low" otherwise.',
              'consensus / prior are short strings ("3.1%", "+175K", "4.09M"); use "—" when not applicable.',
              "Accuracy over quantity — it is fine to return few events. Skip dates with no notable releases.",
            ].join("\n"),
          },
          {
            role: "user",
            content: `List the scheduled U.S. economic releases for these dates: ${days
              .map((d) => `${d.date} (${d.weekday})`)
              .join(", ")}.`,
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`AI calendar failed (${res.status})`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("AI calendar returned an unexpected response");
    const parsed = JSON.parse(match[0]) as Partial<CalendarEvent>[];

    const events: CalendarEvent[] = parsed
      .filter(
        (e): e is CalendarEvent & { date: string } =>
          typeof e?.date === "string" && validDates.has(e.date) && typeof e?.title === "string",
      )
      .map((e) => ({
        date: e.date,
        time: typeof e.time === "string" ? e.time : "—",
        title: e.title,
        category: typeof e.category === "string" ? e.category : "Macro",
        impact: e.impact === "high" || e.impact === "medium" || e.impact === "low" ? e.impact : "low",
        consensus: typeof e.consensus === "string" ? e.consensus : "—",
        prior: typeof e.prior === "string" ? e.prior : "—",
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!events.length) throw new Error("AI calendar returned no usable events");
    return events;
  } catch {
    return fallbackCalendar(days);
  }
}
