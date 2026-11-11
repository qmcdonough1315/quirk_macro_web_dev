import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { MacroTab } from "@/components/dashboard/MacroTab";
import { FactorBetaTab } from "@/components/dashboard/FactorBetaTab";
import { CashManagerTab } from "@/components/dashboard/CashManagerTab";
import { AboutTab } from "@/components/dashboard/AboutTab";

const TABS = ["factors", "cash", "macros", "about"] as const;
type TabId = (typeof TABS)[number];

function parseTab(value: unknown): TabId {
  return TABS.includes(value as TabId) ? (value as TabId) : "factors";
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
          "Weekly factor-model allocation, cash yields, and the rates that explain the regime.",
      },
      { property: "og:title", content: "Quirk Macro — Personal Financial Analytics" },
      {
        property: "og:description",
        content:
          "Weekly factor-model allocation, cash yields, and the rates that explain the regime.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const NAV: { id: TabId; label: string }[] = [
  { id: "factors", label: "Wealth Management" },
  { id: "cash", label: "Cash Engine" },
  { id: "macros", label: "Get Your Macros" },
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
        {tab === "factors" ? (
          <FactorBetaTab />
        ) : tab === "cash" ? (
          <CashManagerTab />
        ) : tab === "macros" ? (
          <MacroTab />
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
