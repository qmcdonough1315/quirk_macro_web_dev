# 📈 QuirkMacro | Financial Intelligence & Macro Analytics Dashboard

**QuirkMacro** is a custom, high-density financial intelligence platform built to centralize macroeconomic indicators, localized real estate trends, quantitative factor models, and short-term yield optimization.

* **🔗 Live Platform Demo:** [quirkmacro.com](https://quirkmacro.com)
* **🛠️ Tech Stack:** React (Vite), Tailwind CSS, Supabase (Database & APIs), Python (Data Pipelines), Cursor AI, Lovable

---

## 🚀 Key Platform Modules & Tabs

### 1. 📊 Get Your Macros
* **Purpose:** Centralizes fragmented macroeconomic datasets (FRED, Federal Reserve releases, inflation indices, and government reports) into a single high-density dashboard.
* **Key Components:** 10Y Treasury Yield tracking, GDP Growth (QoQ annualized), Core PCE, the Treasury Yield Curve, Atlanta Fed rate cut/hike probabilities, a past week economic recap, and a 7-day upcoming release calendar.

### 2. 🏠 Housing Data
* **Purpose:** Isolates macro housing metrics and interest rate conditions to evaluate overall real estate lending and market dynamics.
* **Key Components:** 30Y Fixed Mortgage Rates, Primary/Secondary Spreads, FHFA House Price Index (QoQ), Trailing 12-Month Rates & Yields chart, Liquidity Indicators, and Buyer vs. Seller Advantage signals.

### 3. 📍 Local Market Explorer
* **Purpose:** Bypasses clunky, transactional real estate scrolling to deliver rapid, on-the-go geographical trend snapshots via ZIP Code or City search (including dual mapping for Washington, DC).
* **Key Components:** Micro-market pricing metrics, local inventory velocity, neighborhood AI summaries, and hyperlinked "Hot Properties" driving traffic directly to live listings on Redfin, Zillow, or Realtor.com.

### 4. 🧬 Factor Beta Predictions
* **Purpose:** Bridges academic quantitative finance and practical portfolio allocation by modeling asset exposure to baseline risk factors.
* **Key Components:** 3-month predicted factor excess returns (Mkt-Rf, SMB, HML, RMW, CMA, WML), a 10-ETF hold-period portfolio with target weights and Sharpe ratio estimates, an AI macro regime summary, and historical performance tracking.

### 5. 💵 Cash Manager Engine
* **Purpose:** Eliminates yield drag on idle capital by automatically tracking and ranking short-duration Treasury and money market funds.
* **Key Components:** A weekly leaderboard ranking top short-term liquidity funds by 30-Day SEC Yield, expense ratio comparisons, distribution frequencies, and direct trade action links.

---

## 🛠️ System Architecture & Data Pipeline
* **Frontend:** React scaffolded with Vite and styled using utility-first Tailwind CSS for clean, high-density financial layouts.
* **Backend:** Supabase relational tables storing merged Census, real estate, and financial metric records.
* **Automation:** Automated Python ingestion pipelines (`merge_data.py`) running via GitHub Actions to continuously update datasets on a weekly schedule.

---

*Disclaimer: QuirkMacro is for informational and educational purposes only and does not constitute investment advice.*
