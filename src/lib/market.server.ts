/** Server-only helpers for FRED, RentCast and the AI area-profile summary. */

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
  spreadBps: number;
  spreadChangeBps: number;
  series: { month: string; treasury: number; mortgage: number }[];
  updated: string;
}

export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  const [mortgage, treasury] = await Promise.all([
    fetchFredSeries("MORTGAGE30US"),
    fetchFredSeries("DGS10"),
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

interface RentcastMarket {
  zipCode?: string;
  saleData?: {
    averagePrice?: number;
    medianPrice?: number;
    averagePricePerSquareFoot?: number;
    medianPricePerSquareFoot?: number;
    averageDaysOnMarket?: number;
    medianDaysOnMarket?: number;
    totalListings?: number;
    newListings?: number;
    history?: Record<string, { medianPrice?: number }>;
  };
  rentalData?: {
    averageRent?: number;
    medianRent?: number;
    averageDaysOnMarket?: number;
    totalListings?: number;
    history?: Record<string, { medianRent?: number }>;
  };
}

function yoy(history: Record<string, { medianPrice?: number; medianRent?: number }> | undefined, key: "medianPrice" | "medianRent", current?: number) {
  if (!history || typeof current !== "number") return undefined;
  const keys = Object.keys(history).sort();
  const target = keys[Math.max(0, keys.length - 13)];
  const prior = target ? history[target]?.[key] : undefined;
  if (typeof prior !== "number" || prior === 0) return undefined;
  return ((current - prior) / prior) * 100;
}

export async function fetchRentcastMarket(zip: string): Promise<RentcastMarket> {
  const apiKey = process.env["RENTCAST_API_KEY"];
  if (!apiKey) throw new Error("RENTCAST_API_KEY is not configured");
  const res = await fetch(
    `https://api.rentcast.io/v1/markets?zipCode=${encodeURIComponent(zip)}&dataType=All&historyRange=13`,
    { headers: { "X-Api-Key": apiKey, Accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `No market data found for ZIP ${zip}`
        : `RentCast request failed (${res.status})`,
    );
  }
  return (await res.json()) as RentcastMarket;
}

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

  const market = await fetchRentcastMarket(zip);
  const sale = market.saleData ?? {};
  const rent = market.rentalData ?? {};

  const medianPrice = sale.medianPrice ?? sale.averagePrice;
  const medianRent = rent.medianRent ?? rent.averageRent;
  const ppsf = sale.medianPricePerSquareFoot ?? sale.averagePricePerSquareFoot;
  const priceYoY = yoy(sale.history, "medianPrice", medianPrice);
  const rentYoY = yoy(rent.history, "medianRent", medianRent);

  const priceToRent =
    medianPrice && medianRent ? medianPrice / (medianRent * 12) : undefined;
  const capRate = medianPrice && medianRent ? ((medianRent * 12 * 0.6) / medianPrice) * 100 : undefined;

  // 30-yr amortized payment on 80% LTV using the live FRED mortgage rate.
  const mortgage = await fetchFredSeries("MORTGAGE30US");
  const r = mortgage.latest / 100 / 12;
  const principal = (medianPrice ?? 0) * 0.8;
  const payment = r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -360)) : 0;

  const dom = sale.medianDaysOnMarket ?? sale.averageDaysOnMarket;
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
      rentYoYPercent: rentYoY,
      medianDaysOnMarket: dom,
      activeListings: sale.totalListings,
      mortgageRate: mortgage.latest,
    }),
  );

  return {
    zip,
    name: profile.name,
    stats: [
      { label: "Median House Price", value: usd(medianPrice), detail: `${pct(priceYoY)} YoY` },
      { label: "Price per Sq Ft", value: usd(ppsf), detail: "RentCast listings" },
      {
        label: "Active Listings",
        value: sale.totalListings?.toLocaleString("en-US") ?? "—",
        detail: `${sale.newListings ?? "—"} new this month`,
      },
      {
        label: "Median Days on Market",
        value: typeof dom === "number" ? `${Math.round(dom)} days` : "—",
        detail: "for-sale inventory",
      },
      {
        label: "Est. Monthly Payment",
        value: payment ? `${usd(payment)} / mo` : "—",
        detail: `at ${mortgage.latest.toFixed(2)}% · 20% down`,
      },
    ],
    rental: [
      { label: "Median Rent", value: usd(medianRent), detail: `${pct(rentYoY)} YoY` },
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
      { label: "Rental listings tracked", value: rent.totalListings?.toLocaleString("en-US") ?? "—" },
      { label: "Median days on market", value: typeof dom === "number" ? `${Math.round(dom)} days` : "—" },
    ],
    bullets: profile.bullets,
    tags: profile.tags,
  };
}
