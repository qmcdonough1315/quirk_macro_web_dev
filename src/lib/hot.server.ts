/** Server-only helper: "Hot Properties" — live RealtyAPI (Redfin) listings with a sample fallback. */

import { fetchRealtySaleListings } from "./realty.server";

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

async function fetchLiveListings(zip: string): Promise<HotProperty[]> {
  const { listings } = await fetchRealtySaleListings(zip, 24);
  if (!listings.length) throw new Error(`No active listings for ${zip}`);

  return listings
    .slice()
    .sort((a, b) => (a.daysOnMarket ?? 999) - (b.daysOnMarket ?? 999))
    .slice(0, 6)
    .map((l) => ({
      id: l.id,
      address: l.address,
      price: l.price,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft,
      daysOnMarket: l.daysOnMarket,
      views24h: null,
      badge: l.openHouse
        ? "Open house"
        : (l.daysOnMarket ?? 99) <= 2
          ? "New listing"
          : (l.daysOnMarket ?? 99) <= 7
            ? "High interest"
            : "Trending",
      listedAt: l.listedAt,
    }));
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
    const properties = await fetchLiveListings(zip);
    return { properties, source: "live" };
  } catch {
    return { properties: sampleListings(zip, ctx), source: "sample" };
  }
}
