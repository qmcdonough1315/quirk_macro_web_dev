import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, ChevronDown, Home, Wallet } from "lucide-react";

import { MacroTab } from "@/components/dashboard/MacroTab";
import { HousingTab } from "@/components/dashboard/HousingTab";
import { LocalTab } from "@/components/dashboard/LocalTab";
import { FactorBetaTab } from "@/components/dashboard/FactorBetaTab";
import { CashManagerTab } from "@/components/dashboard/CashManagerTab";
import { AboutTab } from "@/components/dashboard/AboutTab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quirk Macro — Macro & Local Housing Dashboard" },
      {
        name: "description",
        content:
          "Institutional-grade dashboard tracking mortgage rates, Treasury yields, credit conditions, and local housing market affordability.",
      },
      { property: "og:title", content: "Quirk Macro — Macro & Local Housing Dashboard" },
      {
        property: "og:description",
        content:
          "Institutional-grade dashboard tracking mortgage rates, Treasury yields, credit conditions, and local housing market affordability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type SubTabId = "macros" | "housing" | "local" | "factors" | "cash" | "about";

interface SubTab {
  id: SubTabId;
  label: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon?: typeof Home;
  subtabs: SubTab[];
}

const nav: (NavGroup | SubTab)[] = [
  { id: "macros", label: "Get Your Macros" },
  {
    id: "housing-group",
    label: "Housing",
    icon: Home,
    subtabs: [
      { id: "housing", label: "Housing Data" },
      { id: "local", label: "Local Market Explorer" },
    ],
  },
  {
    id: "wealth-group",
    label: "Wealth Management",
    icon: Wallet,
    subtabs: [
      { id: "factors", label: "ETF Model" },
      { id: "cash", label: "Cash Management" },
    ],
  },
  { id: "about", label: "About" },
];

const isGroup = (item: NavGroup | SubTab): item is NavGroup => "subtabs" in item;

function Dashboard() {
  const [tab, setTab] = useState<SubTabId>("macros");

  const activeGroup = nav.find(
    (item): item is NavGroup => isGroup(item) && item.subtabs.some((s) => s.id === tab),
  );

  return (
    <div className="min-h-screen grid-backdrop">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent/12 ring-1 ring-accent/30">
              <Activity className="size-4 text-accent" />
            </span>
            <div>
              <h1 className="font-display text-lg font-semibold leading-none tracking-tight">
                Quirk Macro Analytics
              </h1>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Personal Financial Analytics Terminal
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6">
          <nav className="flex flex-wrap gap-1" aria-label="Dashboard sections">
            {nav.map((item) =>
              isGroup(item) ? (
                <div key={item.id} className="group relative">
                  <button
                    type="button"
                    aria-haspopup="true"
                    className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 font-display text-sm font-medium tracking-tight transition-colors ${
                      activeGroup?.id === item.id
                        ? "border-accent text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                    <ChevronDown className="size-3.5 opacity-60 transition-transform group-hover:rotate-180" />
                  </button>
                  <div className="invisible absolute left-0 top-full z-30 min-w-[220px] translate-y-1 rounded-lg border border-border bg-background p-1.5 opacity-0 shadow-lg transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    {item.subtabs.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setTab(s.id)}
                        className={`flex w-full items-center rounded-md px-3 py-2.5 text-left font-display text-sm font-medium tracking-tight transition-colors ${
                          tab === s.id
                            ? "bg-accent/12 text-accent"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={`-mb-px border-b-2 px-4 py-3 font-display text-sm font-medium tracking-tight transition-colors ${
                    tab === item.id
                      ? "border-accent text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ),
            )}
          </nav>
        </div>

        {activeGroup ? (
          <div className="border-t border-border/50 bg-secondary/30">
            <div className="mx-auto flex max-w-7xl flex-wrap gap-1 px-6 py-1.5">
              {activeGroup.subtabs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-selected={tab === s.id}
                  onClick={() => setTab(s.id)}
                  className={`rounded-md px-3.5 py-1.5 font-display text-xs font-medium tracking-tight transition-colors ${
                    tab === s.id
                      ? "bg-accent/12 text-accent ring-1 ring-accent/30"
                      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {tab === "housing" ? (
          <HousingTab />
        ) : tab === "macros" ? (
          <MacroTab />
        ) : tab === "local" ? (
          <LocalTab />
        ) : tab === "factors" ? (
          <FactorBetaTab />
        ) : tab === "cash" ? (
          <CashManagerTab />
        ) : (
          <AboutTab />
        )}
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <p className="text-xs text-muted-foreground">
            Data powered by FRED API, U.S. Treasury, and FHFA.
          </p>
        </div>
      </footer>
    </div>
  );
}
