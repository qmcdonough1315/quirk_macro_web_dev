# Quirk Macro Insights

Build an institutional-grade, dark-mode financial dashboard called 'Quirk Macro Analytics'. Use a sleek typography hierarchy, clean card layouts, and responsive charts.

The UI must have two main tabs:

TAB 1: 'Get Your Macros'

Hero Section: Key metrics bar across the top showing: 30-Year Fixed Mortgage Rate, 10-Year Treasury Yield, Primary/Secondary Rate Spread, and FHFA House Price Index (HPI) QoQ Change. Use green/red indicators for 30-day directional trends.

Rate & Yield Chart: A interactive line chart comparing the 10-Year Treasury Yield vs. Freddie Mac Weekly Mortgage Rates over the last 12 months.

Market Dynamics Panel: Cards for 'Lending & Credit Conditions', 'Liquidity Indicators', and an overall 'Buyer vs. Seller Advantage Scorecard' (a sliding gauge from Strong Buyer Market to Strong Seller Market).

Data Source Bar: Subtle footer note stating: 'Data powered by FRED API, U.S. Treasury, and FHFA.'

TAB 2: 'Local Market Explorer'

Search Bar: A prominent ZIP code or City/Town search bar with a submit button. Make it look sleek.

Grid Layout for Results (Placeholder mock data for ZIP 20007 / Georgetown, DC):

Key Stats Card: Median House Price, Price per Sq Ft, Median Household Income, Price-to-Income Ratio, Average building age.

Local Vibe & Insights: An AI narrative summary card titled 'Area Profile & Local Vibe' (describing local culture, transit access, top amenities, and buyer demographic).

Rental & Yield Metrics: Median Rent, Estimated Cap Rate, Price-to-Rent Ratio.

Affordability Gauge: Local Affordability Scorecard for average home buyers/renters. A prominent indicator that states whether it is a buyer market or a seller market.

Use mock data for initial rendering so the entire dashboard renders fully populated on load.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://quirkmacro.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dfb3d748-cd12-4930-a6e5-8e5857947bd7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
