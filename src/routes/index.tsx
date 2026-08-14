import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity } from "lucide-react";

import { MacroTab } from "@/components/dashboard/MacroTab";
import { LocalTab } from "@/components/dashboard/LocalTab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quirk Macro Analytics — Macro & Local Housing Dashboard" },
      {
        name: "description",
        content:
          "Institutional-grade dashboard tracking mortgage rates, Treasury yields, credit conditions, and local housing market affordability.",
      },
      { property: "og:title", content: "Quirk Macro Analytics" },
      {
        property: "og:description",
        content:
          "Track mortgage rates, Treasury yields, liquidity, and local market affordability in one dashboard.",
      },
    ],
  }),
  component: Dashboard,
});

const tabs = [
  { id: "macros", label: "Get Your Macros" },
  { id: "local", label: "Local Market Explorer" },
] as const;

function Dashboard() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("macros");

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
                Housing &amp; rates intelligence terminal
              </p>
            </div>
          </div>
          <span className="ml-auto flex items-center gap-2 rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-positive" />
            LIVE · 14 AUG 2026
          </span>
        </div>

        <div className="mx-auto max-w-7xl px-6">
          <nav className="flex gap-1" role="tablist" aria-label="Dashboard sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-4 py-3 font-display text-sm font-medium tracking-tight transition-colors ${
                  tab === t.id
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {tab === "macros" ? <MacroTab /> : <LocalTab />}
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
