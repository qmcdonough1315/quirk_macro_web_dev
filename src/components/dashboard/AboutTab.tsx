import { CheckCircle2, Database, Lightbulb, Linkedin, Mail, PiggyBank, ShieldCheck } from "lucide-react";

export function AboutTab() {
  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent/12 ring-1 ring-accent/30">
              <Lightbulb className="size-5 text-accent" />
            </span>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Why I Built QuirkMacro
            </h2>
          </div>
          <ul className="space-y-4">
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-display text-sm font-semibold">Tired of Context Switching</p>
                <p className="text-sm text-muted-foreground">
                  Built to eliminate the friction of toggling across multiple fragmented news and
                  financial portals for daily macro and housing updates.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-display text-sm font-semibold">
                  Practical Quantitative Modeling
                </p>
                <p className="text-sm text-muted-foreground">
                  Created to directly apply Fama-French/Carhart factor models and mathematical asset
                  pricing theories to real-world ETF allocations.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <PiggyBank className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-display text-sm font-semibold">Unbiased Cash Optimization</p>
                <p className="text-sm text-muted-foreground">
                  Designed to provide transparent, un-sponsored 30-day SEC yield rankings for idle
                  cash, avoiding for-profit affiliate pages that push high-commission funds.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <Database className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-display text-sm font-semibold">Data Integrity You Can Trust</p>
                <p className="text-sm text-muted-foreground">
                  Built on open-source automated data pipelines sourcing directly from official
                  institutions (FRED, U.S. Census Bureau, Federal Reserve).
                </p>
              </div>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent/12 ring-1 ring-accent/30">
              <ShieldCheck className="size-5 text-accent" />
            </span>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              About the Developer
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Quinn McDonough is a Certified Public Accountant (CPA), Project Management Professional
            (PMP), and MBA candidate at Georgetown University’s McDonough School of Business. Quinn
            has over 7 years of experience spanning capital markets, real estate risk analytics, and
            quantitative modeling. He has worked in roles at the Federal Housing Finance Agency
            (FHFA) and Guidehouse (formerly PwC). Quinn specializes in translating complex
            multi-billion-dollar portfolio data into actionable analytics tools. QuirkMacro
            represents his commitment to applying rigorous risk management principles, open-source
            data pipelines, and quantitative financial theory to personal data and portfolio
            management. This site was created and is maintained through his personal capacity and
            does not represent views or analysis from any employer, past or present.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-4 font-display text-lg font-semibold tracking-tight">Get in Touch</h3>
        <div className="flex flex-wrap gap-3">
          <a
            href="mailto:qrm3@georgetown.edu"
            className="inline-flex items-center gap-2 rounded-lg bg-accent/12 px-4 py-2.5 font-display text-sm font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/20"
          >
            <Mail className="size-4" />
            qrm3@georgetown.edu
          </a>
          <a
            href="https://linkedin.com/in/quinn-r-mcdonough-cpa"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary/12 px-4 py-2.5 font-display text-sm font-medium text-primary ring-1 ring-primary/30 transition-colors hover:bg-primary/20"
          >
            <Linkedin className="size-4" />
            LinkedIn
          </a>
        </div>
      </section>
    </div>
  );
}
