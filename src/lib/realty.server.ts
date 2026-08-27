/** Server-only helper: RealtyAPI (Redfin + Apartments.com providers) market & listing data. */

const KEY_NAME = "REALTYAPI_KEY";

function apiKey(): string {
  const key = process.env[KEY_NAME];
  if (!key) throw new Error("REALTYAPI_KEY is not configured");
  return key;
}

async function realtyFetch<T>(provider: string, path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://${provider}.realtyapi.io${path}?${qs}`, {
    headers: { "x-realtyapi-key": apiKey(), Accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("RealtyAPI rejected the request — check REALTYAPI_KEY.");
    if (res.status === 429) throw new Error("RealtyAPI rate limit reached — try again shortly.");
    throw new Error(`RealtyAPI ${provider}${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

const num = (s: unknown): number | undefined => {
  if (typeof s === "number") return Number.isFinite(s) ? s : undefined;
  if (typeof s !== "string") return undefined;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const median = (values: number[]): number | undefined => {
  const a = values.filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
  if (!a.length) return undefined;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
};

// --- Redfin market trends -------------------------------------------------

interface TrendsResponse {
  regionName?: string;
  sections?: {
    section?: string;
    metrics?: {
      label?: string;
      value?: string;
      aggregateData?: { date?: string; value?: string; yoy?: string }[];
    }[];
  }[];
}

export interface RealtyMarket {
  regionName?: string;
  medianPrice?: number;
  priceYoYPct?: number;
  medianDom?: number;
  homesSold?: number;
  priceDropSharePct?: number;
  saleToListPct?: number;
  soldAboveListPct?: number;
  pricePerSqFt?: number;
  totalListings?: number;
  newListings?: number;
  medianRent?: number;
  rentalListings?: number;
}

export interface RealtyListing {
  id: string;
  address: string;
  price: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  daysOnMarket: number | null;
  listedAt: string | null;
  openHouse: boolean;
}

interface RedfinSearchResponse {
  total?: number;
  resultCount?: number;
  searchResults?: {
    homeData?: {
      propertyId?: string;
      beds?: number;
      baths?: number;
      priceInfo?: { amount?: string };
      sqftInfo?: { amount?: string };
      daysOnMarket?: { daysOnMarket?: string; listingAddedDate?: string };
      sashes?: { sashTypeName?: string }[];
      addressInfo?: {
        formattedStreetLine?: string;
        city?: string;
        state?: string;
        zip?: string;
      };
    };
  }[];
}

interface AptSearchResponse {
  total?: number;
  searchResults?: {
    rentRange?: string;
    priceRange?: string;
    address?: { postalCode?: string };
  }[];
}

function readTrends(json: TrendsResponse): RealtyMarket {
  const out: RealtyMarket = { regionName: json.regionName };
  for (const section of json.sections ?? []) {
    for (const m of section.metrics ?? []) {
      const label = (m.label ?? "").toLowerCase();
      const value = num(m.value);
      const yoy = num(m.aggregateData?.[0]?.yoy);
      if (label.includes("median sale price")) {
        out.medianPrice = value;
        out.priceYoYPct = yoy;
      } else if (label.includes("homes sold") && label.includes("#")) {
        out.homesSold = value;
      } else if (label.includes("median days on market")) {
        out.medianDom = value;
      } else if (label.includes("price drops")) {
        out.priceDropSharePct = value;
      } else if (label.includes("sale-to-list")) {
        out.saleToListPct = value;
      } else if (label.includes("above list")) {
        out.soldAboveListPct = value;
      }
    }
  }
  return out;
}

export async function fetchRealtySaleListings(zip: string, count = 40): Promise<{ listings: RealtyListing[]; total?: number }> {
  const json = await realtyFetch<RedfinSearchResponse>("redfin", "/search/bylocation", {
    locationName: zip,
    searchType: "For_Sale",
    resultCount: String(count),
  });

  const listings = (json.searchResults ?? [])
    .map((r, i): RealtyListing | null => {
      const h = r.homeData;
      if (!h) return null;
      const price = num(h.priceInfo?.amount);
      const a = h.addressInfo;
      const address = [a?.formattedStreetLine, a?.city, a?.state].filter(Boolean).join(", ");
      if (!price || !address) return null;
      return {
        id: h.propertyId ?? `${zip}-${i}`,
        address,
        price,
        beds: typeof h.beds === "number" ? h.beds : null,
        baths: typeof h.baths === "number" ? h.baths : null,
        sqft: num(h.sqftInfo?.amount) ?? null,
        daysOnMarket: num(h.daysOnMarket?.daysOnMarket) ?? null,
        listedAt: h.daysOnMarket?.listingAddedDate ?? null,
        openHouse: (h.sashes ?? []).some((s) => (s.sashTypeName ?? "").toLowerCase().includes("open house")),
      };
    })
    .filter((l): l is RealtyListing => l !== null);

  return { listings, total: json.total ?? json.resultCount };
}

async function fetchMedianRent(zip: string): Promise<{ medianRent?: number; rentalListings?: number }> {
  try {
    const json = await realtyFetch<AptSearchResponse>("apartments", "/search/byzip", {
      zipCode: zip,
      resultCount: "50",
    });
    const rents = (json.searchResults ?? [])
      .filter((r) => !r.address?.postalCode || r.address.postalCode === zip)
      .map((r) => num((r.rentRange ?? r.priceRange ?? "").split("-")[0]))
      .filter((n): n is number => typeof n === "number");
    return { medianRent: median(rents), rentalListings: json.total };
  } catch {
    return {};
  }
}

export async function fetchRealtyMarket(zip: string): Promise<RealtyMarket> {
  const [trends, sale, rent] = await Promise.all([
    realtyFetch<TrendsResponse>("redfin", "/housingMarketTrends", { location: zip }),
    fetchRealtySaleListings(zip).catch(() => ({ listings: [] as RealtyListing[], total: undefined })),
    fetchMedianRent(zip),
  ]);

  const market = readTrends(trends);
  const ppsf = median(
    sale.listings
      .filter((l) => l.sqft && l.sqft > 0)
      .map((l) => l.price / (l.sqft as number)),
  );

  return {
    ...market,
    pricePerSqFt: ppsf ? Math.round(ppsf) : undefined,
    totalListings: sale.total,
    newListings: sale.listings.filter((l) => (l.daysOnMarket ?? 999) <= 7).length || undefined,
    ...rent,
  };
}
