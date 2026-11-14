import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { SummaryTab } from "@/components/dashboard/SummaryTab";
import { MacroTab } from "@/components/dashboard/MacroTab";
import { FactorBetaTab } from "@/components/dashboard/FactorBetaTab";
import { OptionsBookTab } from "@/components/dashboard/OptionsBookTab";
import { CashManagerTab } from "@/components/dashboard/CashManagerTab";
import { ResearchTab } from "@/components/dashboard/ResearchTab";
import { AboutTab } from "@/components/dashboard/AboutTab";

const TABS = ["summary", "factors", "options", "cash", "macros", "research", "about"] as const;
type TabId = (typeof TABS)[number];

function parseTab(value: unknown): TabId {
  return TABS.includes(value as TabId) ? (value as TabId) : "summary";
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: parseTab(search["tab"]),
  }),
  head: () => ({
    meta: [
      { title: "Quirk Macro — Personal Financial Analytics" },
      {
        name: "description",
        content:
          "Paper book overview across the ETF factor model, options sleeve, cash engine, walk-forward research, and macro regime.",
      },
      { property: "og:title", content: "Quirk Macro — Personal Financial Analytics" },
      {
        property: "og:description",
        content:
          "Paper book overview across the ETF factor model, options sleeve, cash engine, walk-forward research, and macro regime.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const NAV: { id: TabId; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "factors", label: "ETF Model" },
  { id: "options", label: "Options Book" },
  { id: "cash", label: "Cash Engine" },
  { id: "macros", label: "Macros" },
  { id: "research", label: "Research" },
  { id: "about", label: "About" },
];

function Dashboard() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const selectTab = (id: TabId) => {
    void navigate({ search: { tab: id } });
  };

  return (
    <div className="min-h-screen grid-backdrop">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent/12 ring-1 ring-accent/30">
              <Activity className="size-4 text-accent" />
            </span>
            <div>
              <h1 className="font-display text-lg font-semibold leading-none tracking-tight">
                Quirk Macro Analytics
              </h1>
              <p className="mt-1.5 hidden text-xs text-muted-foreground sm:block">
                Personal Financial Analytics Terminal
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Dashboard sections">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => selectTab(item.id)}
                className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-3 font-display text-sm font-medium tracking-tight transition-colors ${
                  tab === item.id
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {tab === "summary" ? (
          <SummaryTab />
        ) : tab === "factors" ? (
          <FactorBetaTab />
        ) : tab === "options" ? (
          <OptionsBookTab />
        ) : tab === "cash" ? (
          <CashManagerTab />
        ) : tab === "macros" ? (
          <MacroTab />
        ) : tab === "research" ? (
          <ResearchTab />
        ) : (
          <AboutTab />
        )}
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto max-w-7xl space-y-2 px-4 py-5 sm:px-6">
          <p className="text-xs text-muted-foreground">
            Not investment advice. For informational and educational purposes only.
          </p>
          <p className="text-xs text-muted-foreground">
            Rates from FRED. Model and cash figures from the weekly data jobs.
          </p>
        </div>
      </footer>
    </div>
  );
}
