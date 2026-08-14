export type MetricTrend = "up" | "down";

export interface KeyMetric {
  label: string;
  value: string;
  change: string;
  trend: MetricTrend;
  note: string;
  /** true when an increase is a positive signal for the market */
  upIsGood?: boolean;
}

export const keyMetrics: KeyMetric[] = [
  {
    label: "30Y Fixed Mortgage",
    value: "6.42%",
    change: "-18 bps",
    trend: "down",
    note: "30-day trend · Freddie Mac PMMS",
    upIsGood: false,
  },
  {
    label: "10Y Treasury Yield",
    value: "4.11%",
    change: "-9 bps",
    trend: "down",
    note: "30-day trend · U.S. Treasury",
    upIsGood: false,
  },
  {
    label: "Primary / Secondary Spread",
    value: "231 bps",
    change: "+7 bps",
    trend: "up",
    note: "30-day trend · vs. MBS current coupon",
    upIsGood: false,
  },
  {
    label: "FHFA HPI · QoQ",
    value: "+1.24%",
    change: "+0.31 pp",
    trend: "up",
    note: "Q2 2026 · seasonally adjusted",
    upIsGood: true,
  },
];

export interface RatePoint {
  month: string;
  treasury: number;
  mortgage: number;
}

export const rateSeries: RatePoint[] = [
  { month: "Aug '25", treasury: 4.28, mortgage: 6.84 },
  { month: "Sep '25", treasury: 4.19, mortgage: 6.71 },
  { month: "Oct '25", treasury: 4.34, mortgage: 6.88 },
  { month: "Nov '25", treasury: 4.41, mortgage: 6.95 },
  { month: "Dec '25", treasury: 4.26, mortgage: 6.79 },
  { month: "Jan '26", treasury: 4.12, mortgage: 6.66 },
  { month: "Feb '26", treasury: 4.05, mortgage: 6.58 },
  { month: "Mar '26", treasury: 4.22, mortgage: 6.74 },
  { month: "Apr '26", treasury: 4.31, mortgage: 6.81 },
  { month: "May '26", treasury: 4.24, mortgage: 6.7 },
  { month: "Jun '26", treasury: 4.16, mortgage: 6.55 },
  { month: "Jul '26", treasury: 4.11, mortgage: 6.42 },
];

export interface Indicator {
  label: string;
  value: string;
  detail: string;
  trend: MetricTrend;
  strength: number; // 0-100 bar fill
}

export const lendingConditions: Indicator[] = [
  { label: "Senior Loan Officer Tightening", value: "12.4%", detail: "net share tightening standards", trend: "down", strength: 38 },
  { label: "Avg. FICO — Purchase Originations", value: "748", detail: "+4 pts YoY", trend: "up", strength: 72 },
  { label: "Mortgage Credit Availability", value: "104.6", detail: "MCAI, Mar 2012 = 100", trend: "up", strength: 55 },
  { label: "Denial Rate — Conventional", value: "9.1%", detail: "-0.6 pp QoQ", trend: "down", strength: 30 },
];

export const liquidityIndicators: Indicator[] = [
  { label: "Agency MBS Issuance", value: "$118B", detail: "trailing 30 days", trend: "up", strength: 64 },
  { label: "Fed Balance Sheet", value: "$6.71T", detail: "-$28B MoM", trend: "down", strength: 44 },
  { label: "SOFR — Overnight", value: "4.33%", detail: "flat WoW", trend: "down", strength: 50 },
  { label: "Bank Reserve Balances", value: "$3.22T", detail: "+$41B MoM", trend: "up", strength: 68 },
];

/** 0 = strong buyer market, 100 = strong seller market */
export const marketBalanceScore = 62;

export interface LocalMarket {
  zip: string;
  name: string;
  stats: { label: string; value: string; detail: string }[];
  narrative: string[];
  tags: string[];
  rental: { label: string; value: string; detail: string }[];
  affordability: number; // 0 buyer -> 100 seller
  affordabilityNotes: { label: string; value: string }[];
}

export const localMarket: LocalMarket = {
  zip: "20007",
  name: "Georgetown, Washington, DC",
  stats: [
    { label: "Median House Price", value: "$1.42M", detail: "+3.8% YoY" },
    { label: "Price per Sq Ft", value: "$842", detail: "+2.1% YoY" },
    { label: "Median Household Income", value: "$148,300", detail: "+4.2% YoY" },
    { label: "Price-to-Income Ratio", value: "9.6x", detail: "national avg 4.7x" },
    { label: "Average Building Age", value: "86 yrs", detail: "built c. 1940" },
  ],
  narrative: [
    "Georgetown remains one of the most supply-constrained submarkets in the District. Federal-era rowhouses and historic-district review keep new inventory near zero, so pricing is driven almost entirely by turnover of existing stock rather than construction.",
    "Transit access is car-and-walk oriented: no Metro station inside the ZIP, but Foggy Bottom–GWU is a 12-minute walk from the eastern edge, and the DC Circulator plus Capital Bikeshare cover the M Street corridor. Walk Score sits in the low 90s.",
    "Demand skews toward dual-income professional households, university-affiliated buyers, and all-cash trade-down purchasers from Northwest DC and McLean. Roughly a third of closings in the last four quarters were cash, which mutes the local sensitivity to mortgage-rate swings.",
  ],
  tags: ["Historic district", "Walk Score 93", "Waterfront retail", "University-adjacent", "Low new supply"],
  rental: [
    { label: "Median Rent", value: "$3,950", detail: "2BR, +5.1% YoY" },
    { label: "Estimated Cap Rate", value: "3.6%", detail: "below metro avg 4.4%" },
    { label: "Price-to-Rent Ratio", value: "29.9x", detail: "renting favored" },
  ],
  affordability: 78,
  affordabilityNotes: [
    { label: "Median mortgage payment", value: "$7,180 / mo" },
    { label: "Share of median income", value: "58%" },
    { label: "Est. down payment (20%)", value: "$284,000" },
    { label: "Median days on market", value: "21 days" },
  ],
};
