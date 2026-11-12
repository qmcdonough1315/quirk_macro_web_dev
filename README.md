# QuirkMacro | Financial Intelligence & Macro Analytics Dashboard

**QuirkMacro** is a custom, high-density financial intelligence platform built to centralize macroeconomic indicators, localized real estate trends, quantitative factor models, and short-term yield optimization.

* ** Live Platform Demo:** [quirkmacro.com](https://quirkmacro.com)
* ** Tech Stack:** React (Vite), Tailwind CSS, Supabase (Database & APIs), Python (Data Pipelines), Cursor AI, Lovable

---

## Key Platform Modules & Tabs

### 1. Wealth Management
* **Purpose:** Turns the latest factor-model run into an allocation that can be checked against a VOO paper sleeve.
* **Key Components:** Authored weekly regime read, 3-month factor excess returns, target ETF weights, and the paper book published by the model job.

### 2. Cash Engine
* **Purpose:** Ranks short-duration Treasury and money market funds by 30-day SEC yield.
* **Key Components:** Live leaderboard, expense ratios, and the 3-month T-bill when FRED is available.

### 3. Get Your Macros
* **Purpose:** Shows the rates that explain the week, including the 30-year mortgage.
* **Key Components:** 30-year fixed mortgage, 10-year Treasury, mortgage-minus-10-year spread, GDP year over year, Core PCE, the Treasury curve, a bill-implied fed-funds gap, and the authored weekly recap. Missing feeds stay blank.

---

## System Architecture & Data Pipeline
* **Frontend:** React scaffolded with Vite and styled using utility-first Tailwind CSS.
* **Backend:** Supabase tables written by the weekly model and cash jobs. Live rates are read from FRED.
* **Automation:** The ETF quant model publishes factor runs and the paper book. Missing feeds stay blank in the UI.

---

*Disclaimer: QuirkMacro is for informational and educational purposes only and does not constitute investment advice.*
