/** Server-only helper: "Hot Properties" — live RentCast listings with a structured sample fallback. */

export interface HotProperty {
  id: string;
  address: string;
  price: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  daysOnMarket: number | null;
  views24h: number | null;
  badge: string;
  listedAt: string | null;
}

export interface HotContext {
  medianPrice?: number | null;
  medianRent?: number | null;
  dom?: number | null;
}

export interface HotResult {
  properties: HotProperty[];
  source: "live" | "sample";
}

interface RentcastListing {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  daysOnMarket?: number;
  listedDate?: string;
}

async function fetchRentcastListings(zip: string): Promise<HotProperty[]> {
  const apiKey = process.env["RENTCAST_API_KEY"];
  if (!apiKey) throw new Error("RENTCAST_API_KEY is not configured");

  const res = await fetch(
    `https://api.rentcast.io/v1/listings/sale?zipCode=${encodeURIComponent(zip)}&status=Active&limit=12`,
    { headers: { "X-Api-Key": apiKey, Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`RentCast listings request failed (${res.status})`);
  const json = (await res.json()) as RentcastListing[];
  if (!Array.isArray(json) || !json.length) throw new Error(`No active listings for ${zip}`);

  return json
    .slice()
    .sort((a, b) => (a.daysOnMarket ?? 999) - (b.daysOnMarket ?? 999))
    .slice(0, 6)
    .map((l, i) => ({
      id: l.id ?? `${zip}-${i}`,
      address:
        l.formattedAddress ?? [l.addressLine1, l.city, l.state].filter(Boolean).join(", "),
      price: l.price ?? 0,
      beds: l.bedrooms ?? null,
      baths: l.bathrooms ?? null,
      sqft: l.squareFootage ?? null,
      daysOnMarket: l.daysOnMarket ?? null,
      views24h: null,
      badge:
        (l.daysOnMarket ?? 99) <= 2
          ? "New listing"
          : (l.daysOnMarket ?? 99) <= 7
            ? "High interest"
            : "Trending",
      listedAt: l.listedDate ?? null,
    }))
    .filter((p) => p.price > 0 && p.address.length > 0);
}

/** Deterministic PRNG so sample cards are stable for a given ZIP. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREETS = [
  "Maple Ave",
  "Cedar St",
  "Willow Ln",
  "Oakmont Dr",
  "Birchwood Ct",
  "Juniper Way",
  "Magnolia Blvd",
  "Elm St",
  "Hawthorne Rd",
  "Sycamore Pl",
];
const BADGES = ["New listing", "Price cut", "Open house", "Trending"];

function sampleListings(zip: string, ctx: HotContext): HotProperty[] {
  const seed = Number.parseInt(zip, 10) || 1;
  const rnd = mulberry32(seed);
  const base = ctx.medianPrice && ctx.medianPrice > 0 ? ctx.medianPrice : 650_000;

  return Array.from({ length: 6 }, (_, i) => {
    const price = Math.round((base * (0.78 + rnd() * 0.5)) / 1000) * 1000;
    const beds = 2 + Math.floor(rnd() * 4);
    const baths = 1 + Math.floor(rnd() * 3) + (rnd() > 0.5 ? 0.5 : 0);
    const sqft = 850 + Math.floor(rnd() * 2200);
    return {
      id: `sample-${zip}-${i}`,
      address: `${100 + Math.floor(rnd() * 8900)} ${STREETS[Math.floor(rnd() * STREETS.length)]}`,
      price,
      beds,
      baths,
      sqft,
      daysOnMarket: 1 + Math.floor(rnd() * 8),
      views24h: 60 + Math.floor(rnd() * 420),
      badge: BADGES[Math.floor(rnd() * BADGES.length)]!,
      listedAt: null,
    };
  });
}

export async function getHotListings(zip: string, ctx: HotContext): Promise<HotResult> {
  try {
    const properties = await fetchRentcastListings(zip);
    return { properties, source: "live" };
  } catch {
    return { properties: sampleListings(zip, ctx), source: "sample" };
  }
}
