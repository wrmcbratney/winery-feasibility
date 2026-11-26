# Architecture and plan of work

This document carries the design decisions, sequence and open questions for the physical and operational simulation work, so they persist between sessions. Update it as decisions are made. Decisions that are settled are marked **Decided**; everything else is a proposal waiting on the owner.

The question the software should answer: what is the least expensive winery that can reliably make the wines I want, the way I want to make them, under realistic operating constraints? Physical processes drive operational requirements, which drive infrastructure, labor and cost. Financial or production targets never override physical reality.

## 1. Where the code stands (review, November 2026)

The engine is four files. `core.js` simulates one red lot (kinetics, heat, ML, press timing). `flow.js` builds a lot plan, overlays identical vintages into a steady-state calendar of gallons and vessel counts by location, and builds a daily labor and equipment calendar. `fin.js` sizes equipment, building, labor, land and water from that flow and runs the year-stepped financial engine. `sources.js` holds assumptions.

The structure is sound for a sizing model. Its main weakness for what comes next is that each physical quantity is computed in more than one place from separate rules of thumb, and nothing reconciles them. Examples found in review:

- Simulation parameters for a red lot are written out twice (`lotSim` in `flow.js` and the dead `tankDays`/`redRun` in `fin.js`), with sorting, press load and cooling hardcoded in both.
- Press size is chosen twice from total tons (`lotPlan` and `size`), by the same thresholds typed separately.
- Volumes come from at least six independent factors: 180 gal must per ton, 115 + 45 gal free run and press per ton for reds, 170 gal juice per ton for whites, 4% lees, 2.378 gal per case, and a 1.03 bottling allowance. They do not reconcile with each other.
- Whites never run the kinetics. They sit in tank a fixed two days, then go to barrel or stay in tank until day 21. That matters for step 4, because cool white ferments are a large share of refrigeration load per gallon.

### The eleven reviewed inconsistencies, verified

Each was checked against the code and, where possible, demonstrated by running the model.

| # | Issue | Verified | What it does today |
|---|---|---|---|
| 1 | Hand sorting hardcoded in the lot sim | Yes | Red crush-line hours always use the 2.5 t/hr hand rate; the labor calendar uses `G.sort` but the equipment calendar does not. Whites ignore sorting entirely. |
| 2 | Fixed 5-ton press load | Yes | Flow counts loads at the winery's press size (3, 5 or 8 tons); press hours come from the sim at 5 tons. Two answers for one press. |
| 3 | Fixed per-lot cooling | Yes, but see note | Every red lot gets 6,800 BTU/hr. At default set points this never binds (a 5-ton Cabernet at 85F peaks near 1,000 BTU/hr of cooling), so the fix moves nothing today. The real gap is the chiller rule, which is step 4. |
| 4 | Stuck ferment falls back silently | Yes | A 32 Brix Cabernet does not finish; it is pressed on the nominal day 20 with nominal volumes and no flag. ML that does not finish in 300 days is also forced to barrel silently. |
| 5 | Barrel time silently extended | Yes | Pinot Noir gets 11.6 months instead of 11, Cabernet 20.6 instead of 20, because a gap under 60 days before blending is absorbed into barrel time. The opposite case (bottling cuts barrel time) is reported; this one is not. |
| 6 | Flow horizon truncates long schedules | Yes, severe | Five vintages are overlaid. Any wine whose life from pick to sell-out exceeds about four years falls out of the steady-state window. At a 60-month release, the window shows zero bottled pallets. The interface allows 72 months. |
| 7 | Case storage from year-end inventory | Yes, and a bigger issue behind it | Year-end bottled inventory peaks at 5,800 cases; the steady-state flow peaks at 3,900. The within-year peak is higher than either. See challenge A below: most of the 5,800 is a permanent sales backlog. |
| 8 | Seasonal workers without overtime | Yes | Seasonal headcount assumes 50-hour weeks; all hours are costed at straight time. |
| 9 | Lots exceeding the largest standard tank | Yes, for lot tanks | Red, white and blend tanks split correctly. Lot tanks count one tank per combined group regardless of volume: at 40-ton lots, 17,000 gallons sit in one 8,000-gallon tank. |
| 10 | Off-season staffing averages away peaks | Yes | Off-season capacity is shown as a flat 5.3 hours a day; the busiest off-season day needs 39 (bottling). The hours are costed, but the capacity picture hides the crunch. |
| 11 | Barrel purchases do not reconcile with installed barrels | Yes, but small | Year 1 buys the sum of each wine's own peak times the spare factor (226.8 barrels); installed is the combined peak times the spare factor (227). Immaterial at default, larger when wines peak at different times. See challenge B. |

## 2. Sorting the work

**Straightforward fixes (step 1, done first):** all eleven above. Three needed a judgment call, made conservatively and listed under open questions: per-lot cooling (3), case storage peak (7), and off-season staffing (10).

**Foundational changes:** the lot ledger (step 2), individual vessels (step 3), aggregated thermal load (step 4), and the constrained scheduler (step 5). Each changes the shape of the data the rest of the model consumes.

**Dependent work:** operating mode (needs vessels and the scheduler), refrigeration feedback into kinetics (needs thermal aggregation and the scheduler), the exception views on the Cellar flow tab (needs the scheduler's exception records), and design-mode fleet derivation from stress harvests (needs vessels plus stress scenarios).

## 3. Proposed module boundaries

Plain JavaScript modules that run in Node and inline into the page, as now. No new runtime dependencies. Proposed, in dependency order:

| Module | Holds | Replaces or splits |
|---|---|---|
| `core.js` | Process physics for one lot: kinetics, heat generation, ML. No scheduling decisions, no fallbacks. Reports what happened, including failure. | Same file, with crush and press bookkeeping moved out. |
| `winery.js` (new, step 1) | The resolved winery: press size and cycle, sorting mode and rate, crush line rate, jacket capacity, refrigeration, crew. One function builds simulation parameters for a lot from a wine and a winery. | Duplicated parameter blocks in `flow.js` and `fin.js`; duplicated press thresholds. |
| `ledger.js` (step 2) | Per-lot material state and coefficients by wine and method. Forward from fruit, backward from target cases. Mass and volume kept separately. | The six volume factors. |
| `vessels.js` (step 3) | Vessel definitions, fleet, occupancy calendars, separation rules, minimum fill, cleaning. Also the generic resource calendar that step 5 reuses for presses, crush lines, pumps and crew. | Vessel counting in `flow()`. |
| `thermal.js` (step 4) | Heat loads by source and time, refrigeration peak and cumulative, electricity separately. | The chiller rule in `size()`. |
| `schedule.js` (step 5) | Desired schedule as process events; the constrained harvest scheduler; queues and decisions. | The fixed offsets in `lotPlan`. |
| `exceptions.js` (step 1, grows later) | One record shape for anything that departs from plan: severity class, originating constraint, affected lot and process, downstream consequences, remedies. | The `short` map and silent fallbacks. |
| `flow.js` | Becomes a view builder: lanes, vessel counts and labor calendars derived from the ledger, occupancy and schedule. | Its current calculation role shrinks. |
| `fin.js` | Sizing and economics. `plan()`, `stepYear()` with its luck hook, and `finStep()` stay intact. | Unchanged structure. |

Exception severity classes, from the brief: feasible as planned; feasible with overtime or extra shifts; feasible with rescheduling; feasible only by changing winemaking methods; physically infeasible. Step 1 introduces the record shape and uses the last three where they already apply (stuck ferment, barrel time cut or extended).

## 4. Sequence and the main tradeoffs

**Step 1, fixes.** In progress. Each fix lands in the shared model with a test that fails on the old code.

**Step 2, lot ledger.** Track fruit, solids and pomace as mass (kg); track liquids as volume at 20C. Must is the one place that needs both: convert through density from Brix at crush, and account for CO2 mass leaving during fermentation, so a mass balance closes even though volume does not. Each stage has a coefficient by wine and method (free run and press fractions by variety and press type; gross and fine lees by stage; racking, evaporation, topping, filtration and bottling losses). Topping wine is drawn from a named source (same lot in tank, a topping lot, or another wine), so topping is a transfer between lots, not a loss that vanishes. Running backward from target cases inverts the same chain, so forward and backward runs must reproduce each other to rounding. That round trip is the main invariant.

**Step 3, real vessels.** Design mode assigns each lot to vessels greedily against the unconstrained desired schedule, then derives a fleet (mixed sizes allowed). Note that assignment is itself a small scheduling problem (interval packing with separation rules), so I propose building the generic resource calendar here, used by vessels now and by presses, crush lines, pumps and crew in step 5. That avoids writing occupancy logic twice.

**Step 4, thermal load.** Requires whites to run kinetics, which they do not today. Proposed: give `core.js` a white path (juice, no skins, typically 55 to 60F set point, no cap) before aggregating. Then sum concurrent lot heat from the kinetics, add must chilling, cold soak, ML temperature control, tank and building heat exchange against seasonal ambient, and barrel room and case storage cooling. Report thermal energy removed separately from electricity (through a COP that varies with ambient). Refrigeration limits feeding back into ferment temperature is deferred, as the brief says, but the interface for it is a per-lot cooling allocation the scheduler hands to `core.js`.

**Step 5, constrained scheduler.** Three options considered:

1. **Hourly time-stepped simulation.** Advance the whole winery an hour at a time, dispatching ready work each tick. Easy to reason about, but wasteful over the aging stretch and awkward for multi-hour tasks that must not be split.
2. **Discrete-event simulation.** A queue of timestamped events (fruit arrives, press frees, ferment reaches dryness). Exact timing, natural for queues and waiting, and it handles both hours and days. More machinery to write and test.
3. **Priority-rule list scheduling** (the serial schedule-generation scheme from project scheduling). Take events in priority order and place each at the earliest time all its resources are free within its window; if none, record why. Deterministic, transparent, and each placement explains itself. Weak where durations depend on start time, which fermentation does.

Recommendation: a discrete-event core with list-scheduling style dispatch rules. Events carry earliest, preferred and latest start, duration, prerequisites, resources, setup and cleaning, and whether they can be delayed or split and at what cost. When a fermenter frees, the event loop asks the dispatch rules which waiting lot gets it, and records the decision and the reason. Fermentation duration is computed by `core.js` at the actual start, so a delayed lot gets its own kinetics. Hours during harvest; the same engine runs in day steps for aging because events there are sparse. First version: one harvest season, vessel, equipment and crew contention, starting from the steady-state occupancy on August 1 so older vintages already in barrel and tank are present.

Never resolve a conflict by changing how a wine is made. If the only way through is a method change (shorter extended maceration, skipping cold soak, pressing early), the scheduler records it as an exception in the method-change class rather than doing it.

## 5. Stress harvest scenarios (to confirm before building on them)

Proposed set. Design mode sizes to the worst of whichever are chosen, not to all of them stacked.

1. **Compressed picks.** The same tonnage, but each variety's picks land in half the usual span, and varieties overlap where their normal windows are within a week.
2. **Heat spell.** A late-September heat spell brings everything normally picked over the following two weeks in within five days. In the default lineup that pulls Cabernet forward onto Pinot and Chardonnay.
3. **Rain-driven rush.** A forecast rain event pulls all remaining fruit in over three days at the end of the season, when tanks are fullest.
4. **Sluggish lots.** One or two red lots take ten days longer to finish (low YAN or a cool cellar), on top of normal timing. This stresses fermenter turnover rather than intake.
5. **Big crop.** 20% more tons on normal timing. This is arguably a volume question rather than a timing one, and may belong to later stochastic work instead.

## 6. Inputs needed from the owner

The ledger and scheduler should not be built on these until they are confirmed. Current values in code are listed so you can correct rather than start from scratch.

| Input | In the code now |
|---|---|
| Free-run and press yields by variety and press type | Reds 115 gal free run and 45 gal press per ton for every variety and press; whites 170 gal juice per ton |
| Gross and fine lees by stage, racking losses | One 4% loss between press and barrel; whites 4% then another 2% |
| Barrel evaporation and topping per barrel-year, dry eastern Washington | Not modeled |
| Filtration and bottling losses | 3% allowance at bottling |
| Press fractions kept separate, and when lots may be combined | `pressHandling: 'blend'`; up to `lotsPerTank` lots of one wine combined after press |
| Minimum fill by vessel type | Not modeled; tanks assumed full to lot volume |
| Priority when two lots need the same press or crush line | Not modeled |
| Task times: cleaning, setup, pumpovers, transfers | 0.33 hr per cap management, 2 to 4 hr per transfer, 1.5 hr crush setup; all practitioner guesses, rated Low |
| Stress harvests to design against | Section 5 |

## 7. Challenges to the brief

**A. A sales assumption is sizing a physical space.** The brand ramp sells 35, 55, 75 and 90% of target in the first four years, but production runs at 100% from year one and the shortfall is never sold off. About 1.45 years of production sits in inventory permanently. Case storage is sized from that, so the warehouse is sized by a demand assumption, which is exactly what the brief says should not happen. Sales modeling is deferred, so the step 1 fix sizes case storage from the physical within-year peak and reports the backlog separately; the backlog question itself waits for the sales work.

**B. The barrel purchase problem is timing more than reconciliation.** The sum-of-peaks versus combined-peak gap is 0.2 barrels at default. The larger distortion is that year 1 buys the full steady-state stock, which holds two to three vintages, when only one vintage exists. Step 1 reconciles the counts; buying barrels as vintages accumulate should follow, and it touches cash flow in years 1 to 3.

**C. Per-lot cooling is not the binding constraint.** Jacket capacity on a correctly sized tank rarely limits a red ferment; the chiller and glycol loop do, when many lots peak together. Step 1 derives per-lot capacity from the jacket on the tank the lot sits in, which keeps the simulator honest, but the change that matters is step 4.

**D. A stuck ferment is unreachable at default inputs.** YAN is fixed at 180 for every lot, so the kinetics only stick at extreme Brix. Surfacing failures is right, but they will rarely appear until YAN, yeast and temperature vary by lot. Worth deciding whether YAN belongs in the variety presets or in the stress scenarios.

**E. Step 3 and step 5 are closer than the brief implies.** Design-mode vessel assignment is a packing and scheduling problem in its own right. Building the resource calendar once, in step 3, is cheaper than building it twice.

## 8. Lots, wines and blends (affects step 2)

The owner wants several wines from one variety (a reserve, a single vineyard bottling) and blends across varieties. Today a wine is a variety: its lots, presets and costs all hang off one row. The ledger should separate the two. A lot is fruit from a source (variety, vineyard or block, pick) and carries the physical history. A wine is a finished product that draws gallons from one or more lots, with its own barrel regime, bottling, package, release and price. Reserve selection is then a draw of the best lots at blending, and a blend is a draw across varieties. Lots are made first and assigned to wines at blending, so the lot ledger has to come before wines-as-blends, and costs (fruit, chemicals, barrels) follow the gallons from lot to wine.

### Bottling during harvest (noted November 2026, no change yet)

At default, Chardonnay bottles 12 months after a fixed mid-October harvest date, which puts its bottling on October 15 and 16, in the middle of crush. Those two days run 42 and 56 crew hours. Real wineries usually move bottling a little earlier or wait until after harvest, though bottling during harvest does sometimes happen. The cause is that bottling dates are counted in months from a fixed harvest date, with no notion of blackout windows. The step 5 scheduler should treat harvest as a soft blackout for bottling: pull it forward or push it past the last press, and if it has to stay inside harvest, report it as an exception (feasible with overtime or extra shifts) rather than doing it quietly.

## 9. Noted for the deferred sales work

Pricing is per bottle in the model, but real pricing differs by bottle and by case (case discounts), and the year includes club-release discounts and end-of-season sales beyond the flat club discount. Nothing to build yet; the sales model should carry a price schedule by channel and season rather than one net factor.

## 10. Decisions log

- **Decided (Nov 2026):** stay with plain JavaScript modules, single inlined page, no solver for the first scheduler.
- **Step 1 judgment calls, open for review:**
  - Under-60-day barrel extension (item 5): behavior kept, now reported as a schedule adjustment. Alternative: never extend, and let the wine sit in a lot tank for the gap.
  - Stuck ferment (item 4): the lot stays in its fermenter to the end of the simulated window, is then pressed, and is flagged as a method-change exception. The volumes are the ledger's nominal ones until step 2.
  - Case storage (item 7): sized from the within-year peak, with bottling events placed at their month and sales spread evenly through the year.
  - Off-season staffing (item 10): permanent crew and a part-time position are still set from average off-season hours. Routine work a few hours over slides to the next day; days more than four hours over the steady crew get temporary help with a four-hour minimum call at the seasonal wage, and those hours come out of the part-time position. At default that is 13 days, mostly bottling. A first attempt that re-solved the part-time rate after removing temp hours cascaded to 140 temp days a year and was dropped.
  - Per-lot cooling (item 3): jacket area on the assigned red tank times a heat flux of 1,500 BTU/hr per sq ft (Low confidence). At default this does not change any ferment; the chiller rule is untouched until step 4.

## 11. Step 1 results

Found while testing, not in the outside review: blending tanks were sized from finished wine volume (cases times 2.378 gal plus 3%), but the wine arriving from barrel is the larger pre-loss volume, so a blend tank could hold more than its size. The new capacity invariant caught it. Blend tanks are now sized for what arrives; the underlying mismatch is a lot ledger problem (step 2).

Headline changes at default (base scenario), all from physical corrections:

- Capex up about $105,000: blend tanks step from 4,000 to 5,000 gallons; the fermentation hall grows with tank volume; case storage grows 305 sq ft for the within-year bottled peak (7,833 cases rather than 5,800 at year end, of which about 5,800 is the sales ramp backlog).
- Cellar labor down about $1,250 a year: off-season bottling peaks now go to temporary help at the seasonal wage instead of part-time hours at the cellar wage, and seasonal overtime adds a little back.
- Payback one year later (12 rather than 11); cash IRR 9.55% rather than 9.75%.
- Two exceptions now show on the Cellar flow tab at default: Pinot Noir and Cabernet barrel time extended by under a month to meet blending.

## 12. Packaging and cellar chemicals (November 2026)

Built at the owner's request ahead of the ledger. Each wine picks glass, closure and capsule from a priced list; labels, carton and mobile bottling stay winery-wide. Still wines only; sparkling (crown caps, tirage, riddling, disgorging) is deferred as its own process path. Chemicals are counted from each lot's events and priced from supplier lists; usage rates are placeholders under Cellar practice until the owner sets his own. The nutrient plan (YAN target by Brix, complex nutrient then DAP, capped at 0.96 g/L under 27 CFR 24.246) is the same one the fermentation kinetics use, so a lot ferments with the nitrogen it was given. An explicit $1.00 a case covers supplies not itemized.

Results at default: dry goods fall about $20,600 a year (whites move to screwcap, Cabernet to heavy glass and natural cork); itemized chemicals and supplies come to about $10,600 a year against $32,000 under the old flat $8 a case; with nutrient additions the red ferments run 3 to 5 days shorter. Cash IRR 9.55% to 10.15%, payback 12 to 11 years. Open: the owner's own rates for SO2, nutrients, acid, fining, gas and cleaning, and his package per wine.
