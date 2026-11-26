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
| `src/exceptions.js` | One record shape for departures from the plan as set (a stuck ferment, barrel time cut or extended), with a severity class from feasible as planned to physically infeasible. |
| `src/supplies.js` | Packaging per wine (glass, closure, capsule, labels) and cellar chemicals built from each lot's events: SO2 additions, yeast, nutrients to a YAN target under the federal DAP limit, ML bacteria, acid, bentonite, filter pads, CO2 purges, dry ice, cleaning chemicals, sulfuring empty barrels, and an explicit allowance for what is not itemized. The same nutrient plan feeds the fermentation kinetics. |
| `src/harvest.js` | Harvest as stages: expected arrival per fruit source (normal curve integrated per day, exact mass), deliveries (minimum delivery, consolidation recorded, manual schedules), receiving (full and partial bins) and fermentor filling under each color's policy. |
| `src/processing.js` | One account of processing demand per day: crush line, a press shared by reds and whites, setup, cleaning and changeovers, against the practical window. Overtime, labor, the equipment calendar and the harvest chart all read it. |
| `src/winery.js` | The resolved winery: press size and cycle, sorting and crush rates, jacket cooling, and the one function that sets up a lot simulation. |
| `src/fin.js` | Variety presets, defaults, equipment sizing from the flow, building by space, land, water, lab, labor and excise. The engine is year-stepped: `plan()` makes the year-0 decisions and capital schedule, `stepYear()` runs one year (harvest the vintage, sell oldest first, book costs) with an optional luck input for yield and price, and `finStep()` runs one year of cash, loan, equity and distributions. `model()` chains them for a fixed 20-year plan. |
| `src/sources.js` | The assumptions table: value, basis, confidence, link. |
| `src/index.src.html` | The page. Placeholders `/*CORE*/`, `/*EXC*/`, `/*SUP*/`, `/*WINERY*/`, `/*HARV*/`, `/*PROC*/`, `/*FIN*/`, `/*SRC*/`, `/*FLOW*/` are filled by the build. |
| `build.py` | Inlines the engine into `dist/index.html`, a single self-contained page. |

The engine files run in the browser and in Node, so the same code is tested and shipped.

## Build and test

```
npm install
npm test        # builds dist/index.html, then runs engine and page tests
npm run build   # build only
```

Tests live in `test/`: `engine.test.js` (regression and earlier invariants), `fixes.test.js` (one test per reviewed inconsistency, seeded randomized coverage, and invariants for gallon-day conservation, vessel capacity and horizon), `supplies.test.js` (packaging and chemicals), `harvest.test.js` (fruit conservation, bins, fills, demand consistency), `ven235.test.js` (the coursework benchmark, inputs in `ven235.js`), and `page.test.js` (the built page in jsdom). `test/baseline.json` holds headline outputs for a few scenarios. When a change is meant to move the numbers, regenerate it on purpose and say so in the commit.

## Published page

`dist/index.html` is published as a private Claude artifact (slug `07b65d15-69f3-4b05-bc5f-577bbb926dff`).

## Plan of work

`docs/architecture.md` holds the review, proposed module boundaries, sequence, stress scenarios, inputs still needed and the decisions log for the physical and operational simulation work.

## Not modeled yet

Year-to-year growth or shrinkage, harvest and price variability, risk, a real sales model (visitors, conversion, club growth and attrition, distribution), income taxes, inflation, winery wastewater, and wineries in leased space in town.

Known financial limitations, noted and deferred: the sales ramp never sells off its early shortfall, so about 1.45 years of production sits in inventory for good (and is reported as backlog in case storage); year one buys the full steady-state barrel stock rather than buying as vintages accumulate; there is no inflation or income tax; terminal value is book value.
