# Winery feasibility

A 20-year feasibility model for a small Washington winery, built as a thinking tool. It runs from land, water and building choices through every lot's path in the cellar to bottles sold, and out to cash, payback and return under all-cash or loan financing.

The page has two tabs:

- **Money.** The verdict (owner cash in, payback, IRR), the big decisions, the wines you make, the winery those wines imply (land, water, building by space, itemized equipment, labor, lab, storage, excise), the year-by-year table, and every assumption with its source and a confidence rating.
- **Cellar flow.** A normal year once the brand is running, day by day: gallons and vessels in use by location against installed capacity, cellar labor by task against the crew on hand, equipment hours against one shift, and a timeline for each lot.

## How it fits together

| File | What it does |
|---|---|
| `src/core.js` | Fermentation and malolactic kinetics for one lot (Boulton-style: nitrogen-limited growth, Monod sugar uptake, ethanol inhibition, heat balance, ML timing against cellar temperature). Shared with the standalone Winery Lot Simulator. |
| `src/flow.js` | Lot plan for every wine, the steady-state cellar calendar (gallons and vessels by location), and the daily work and equipment calendar. |
| `src/fin.js` | Variety presets, defaults, equipment sizing from the flow, building by space, land, water, lab, labor and excise. The engine is year-stepped: `plan()` makes the year-0 decisions and capital schedule, `stepYear()` runs one year (harvest the vintage, sell oldest first, book costs) with an optional luck input for yield and price, and `finStep()` runs one year of cash, loan, equity and distributions. `model()` chains them for a fixed 20-year plan. |
| `src/sources.js` | The assumptions table: value, basis, confidence, link. |
| `src/index.src.html` | The page. Placeholders `/*CORE*/`, `/*FIN*/`, `/*SRC*/`, `/*FLOW*/` are filled by the build. |
| `build.py` | Inlines the engine into `dist/index.html`, a single self-contained page. |

The engine files run in the browser and in Node, so the same code is tested and shipped.

## Build and test

```
npm install
npm test        # builds dist/index.html, then runs engine and page tests
npm run build   # build only
```

`test/baseline.json` holds headline outputs for a few scenarios. When a change is meant to move the numbers, regenerate it on purpose and say so in the commit.

## Published page

`dist/index.html` is published as a private Claude artifact (slug `07b65d15-69f3-4b05-bc5f-577bbb926dff`).

## Not modeled yet

Year-to-year growth or shrinkage, harvest and price variability, risk, a real sales model (visitors, conversion, club growth and attrition, distribution), income taxes, inflation, winery wastewater, and wineries in leased space in town.
