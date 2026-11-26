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

## 13. Aligning with the VEN 235 coursework (November 2026)

The owner's original VEN 235 Winery Design workbook (not copied into the repo) covered the front of harvest: arrival, crush rate, bins and fermentors. Three of its ideas are now in the model, on the branch `harvest-arrival`:

- **Arrival on curves.** Each variety's tons arrive on a normal curve (mean pick day, spread in days). The curve is cut into equal slices with one pick at the middle of each, so it stays deterministic. A whole-harvest spread multiplier is the first stress lever: below 1 compresses picks.
- **Harvest by day, in half-ton steps.** Each day gets the area under the variety's curve for that day, rounded to half-ton steps (one picking bin) with the season total held. Superseded the first version on this branch, which cut the curve into a few large picks; the owner wanted to see the distribution itself flow through the winery.
- **Fermentors filled from daily picks.** Fermentor size is a design choice under Harvest (3,000 gallons by default, as the coursework set one size and counted tanks). Each day's fruit goes into the fermentor being filled for that variety until it is full, or until a 2-day fill window has passed and it is at least 50% full; a small last fill joins the tank before it. A lot is one filled fermentor: its ferment starts when the fill completes, the tank is held from the first pick. At default: 66 tons over 50 days, 42 variety pick days, 7 fermentor lots. Without the minimum fill, thin shoulder picks each took a fermentor (7 red tanks against a floor of 2.9); with it, 3 at peak against 1.9. The 50% minimum and 2-day window are placeholders for the owner's practice.
- **Crush by pick day.** The crush crew's day is setup and cleanup plus line hours for everything picked that day. Any day whose red tons need more line hours than the 6-hour window, or whose white loads need more press hours than a 16-hour day, is reported as overtime. At default no day comes close (one window takes 15 tons, one press day 32); at 40,000 cases, 13 days are over.
- **Harvest by day chart** on the Cellar flow tab, on the same date scale as the cellar lanes: tons per day stacked by wine, cumulative share of the season, one day's crush and press capacity where it is in range, and a readout for the selected day.
- **The fermentor floor.** Fermenting volume over tank size, the coursework's fractional tank count, is computed beside the whole-tank count, and a test holds the whole-tank count at or above it. At default the red peak is 3 fermentors against a floor of 1.9.

Not yet aligned: the coursework's tank time uses fermentation days of 55 times e to the minus 0.07 T (T in C). The kinetics agree at red temperatures (8 days at 28C against 8; 7.5 at 30C against 7) but run faster in the cold (10.5 days at 20C against 14). That matters for white ferments in step 4. The coursework used 480 L of juice per ton for whites, against 170 gal (643 L) here; the units of its tons are still to confirm. Its Cabernet stays 32 days in tank with 21 days of post-ferment maceration, against 7 days here. Owner's answers (November 2026): 21 days of post-ferment maceration was his practice at the time and might be shorter now, so the Cabernet preset stays at 7 until he sets it; at default volume it makes no difference to fermentors (the red peak stays 2 tanks at 7, 14 or 21 days, Cabernet holding a tank 19, 26 or 33 days), though it would at the coursework's 345 tons or under a compressed harvest. The coursework's tons were most likely short tons (not certain), which makes its white juice 127 gal per ton against 170 here; whether that was free run only is still open, and it is the first white entry for the lot ledger.

Two effects of bigger lots that are artifacts rather than findings, to fix in later steps:

- One tank size per role puts small lots in oversized tanks; with fermentors now a chosen size, the cost of that choice is visible rather than hidden. A small 12-ton purchase spread over 10 days at a 2.5-day spread fills one tank slowly; a tighter spread per wine is how to say a small block is picked in one go. Step 3's mixed fleets and a fermentor-size sweep address the rest.
- Pumpover time is a fixed 0.33 hours per lot whatever its volume, so cellar labor falls about $12,600 a year at default partly because lots got bigger. Cap management time should scale with tank volume; it belongs with the owner's task times.

## 14. Harvest as a physical process (November 2026)

The harvest creates the physical problem the winery must solve. This round made harvest arrival a model of its own and fixed the places where the first version created or lost fruit, double counted bins, or disagreed with itself. Branch `harvest-arrival`.

### Stages and modules

`src/harvest.js` keeps four stages apart, and everything downstream consumes deliveries, never the curve:

1. **Expected arrival.** A curve per fruit source. Today a source is one wine row named for its variety (`id` like `3:Cabernet Sauvignon`); later it becomes a vineyard or block, and the lot ledger will map sources to lots to wines. Each day gets the area under the normal curve for that day, rescaled so the days sum exactly to the source's tons.
2. **Deliveries.** What a grower would bring. Any generated day under the minimum delivery (0.25 tons) hands its fruit to the neighboring day toward the middle of the curve until every day carries the minimum; mass is kept and each delivery records where its fruit came from (`from`), so the timing change is visible (1.23 tons moved at default). A manual schedule (`schedule` on a wine) is taken as given, smaller deliveries, gaps and dates past the new year included. Normality lives only in stage 1.
3. **Receiving.** A picking bin is a container (0.5 tons) holding fruit, not a unit of fruit: a delivery is some full bins and at most one partial bin, counted once at receiving. When a delivery is divided between fermentors, each portion carries its share of the delivery's bins, so dividing it adds none.
4. **Filling.** Deliveries go into fermentors under the color's policy (below). One filled fermentor is one lot.

`src/processing.js` holds the one account of processing demand per day (next section). `src/flow.js` builds lots from fills and lays them on the calendar.

### Fill policy: semantics

Each parameter, what it means, and whether it is implemented. Basis says what kind of limit it is: physical (cannot be done), practice (a preferred way of working), warning (needs the winemaker's review) or authorization (allowed only if the winemaker says so).

| Parameter | Meaning | Default | Basis | Status |
|---|---|---|---|---|
| Cold soak program | Days from a red fermentor's first fruit to inoculation, the wine's setting | per wine (Cabernet 3, Pinot 4) | practice | implemented; filling time does not extend it |
| Material exposure | How long each portion of fruit actually sat before inoculation | recorded per lot (first fruit, inoculation, fruit added after inoculation) | n/a | recorded, not yet shown per portion |
| Normal addition window | Fresh fruit (red) or juice (white) may go in until this long after inoculation | 48 hours | practice | implemented; the fermentor closes at the window, never held open |
| Later additions | Beyond the normal window | not allowed unless raised | authorization | raising the window is the authorization for now |
| Preferred minimum fill (red) | Below this a fermentor is used inefficiently | 50% of working volume | practice | reported as feasible with rescheduling |
| Review threshold (red) | Below this cap management needs the winemaker's review | 33% of working volume | warning | reported; never declared infeasible |
| Minimum fill (white) | No cap to manage; a thin fill is tank use only | same levels for now | practice | reported as tank use only |
| White settling | Juice settles before inoculation | 48 hours | practice | implemented |
| White holding warning | Juice held longer than this before inoculation | 96 hours | warning | implemented |
| Barrel-fermented whites | Each day's settled juice goes to barrel | n/a | practice | implemented (no juice waits past its settle) |
| Maximum time from harvest to processing | Fruit holding in bins before crush or press | not yet | physical and practice | deferred: fruit is processed the day it arrives; holding is a scheduler remedy (step 6) |
| Fruit temperature at arrival, cooling | Heat removed from incoming fruit | not yet | physical | deferred to thermal (step 5) |
| Spontaneous start before inoculation | Risk when warm fruit waits | not yet | warning | deferred; needs fruit temperature |

When a policy cannot be met, the model reports it with options (a smaller vessel, accepting the partial fill, moving a pick within its authorized window, holding fruit cold, authorizing a later addition) and never picks one itself. The earlier version held a fermentor open past its window to reach 50%; that is gone, and with it the silent merge of a small last fill into the tank before it.

### Material, reservation and the fermentor floor

A fermentor is now two things in the flow: a **reservation** from its first fruit to the press (it counts as a vessel in use the whole time, however full) and **material** records, one per delivery portion, each starting the day that fruit arrives. The cellar lanes show material, so a filling fermentor visibly fills; vessel counts follow reservations. Working volume is the fermentor less headspace (20% red, 10% white). The theoretical floor is the material in fermentors over working volume, as if it could be split freely across tanks; the vessel count under real fills and policies is reported beside it and can only be higher.

Labor, transfers, cleaning and gas read each lot's operational stages (fermentor, lot tank, barrel, blend), not the material records, so a fermentor filled over five days is still one fermentor to pump over.

### Biology during filling: interim and future interface

Interim: a red ferment is simulated from its first fruit with the cold soak counted from that fruit, and every addition is treated as present from the start. Later fruit actually has less skin contact and enters a ferment already under way. The fill history (each portion's day and tons, inoculation, tons added after inoculation) is kept on the lot so this can be replaced, not reconstructed.

Future interface for `core.js`, to build with the white kinetics (step 3): `simulate(p)` gains `p.additions = [{t, kg, gal, brix, yan, tempF, skins}]`, each merged into the state at time `t` (mass, volume, sugar, nitrogen, ethanol dilution, yeast dilution, heat balance), with inoculation as its own event (`p.inoculate = {t, cells}`) distinct from the start of active fermentation, and fruit temperature and pre-inoculation holding carried from receiving. Restarting a stuck ferment from a healthy one fits the same interface and stays deferred.

### One account of processing demand

`processingDemand` builds, per day: deliveries and bins received; crush line hours (red tons, and white tons when sorting) at the line rate; white press loads per delivery; red press loads on each fermentor's press day; press run hours, changeovers between wines (0.5 h each) and cleaning (1 h per press day); the crew's receiving hours; and how far the day runs over the crush window (6 hours) or the press day (16 hours less cleaning). Reds and whites share the press. The overtime check, the labor calendar, the equipment calendar and the harvest chart all read it; tests hold them equal. It is demand: it says what the plan asks and where that exceeds the practical window, not what got done. Deciding what waits is the scheduler's job.

### VEN 235 benchmark

`test/ven235.js` transcribes the workbook's inputs (the workbook itself is not in the repo). Fed the workbook's own once-a-day curve samples, the method reproduces its results exactly: 47.01 fermentors at the peak on day 25, and 4.81 tons an hour at the busiest crush. Fed this model's integrated arrival, it gives 46.71 and 4.76, within 1%: the difference is sampling against integrating, not an error. The later file version (2,500-liter fermentors, ferment days from the temperature formula) gives about 70 fermentors; its own result was not recovered. Uncertain and documented, not resolved: the units of the workbook's tons (most likely short tons), whether 480 liters per ton was free run only, and which version is final.

Not yet benchmarked: the model's own fermentor count under the workbook's simplified assumptions (fixed tank times, 10% headspace, one fermentor size), which needs a fixed-duration option for lots; that belongs with the ledger.

Kinetics against the workbook's empirical ferment time (55 e^(-0.07 T)), using the red engine at 23 Brix as a stand-in for juice:

| T (C) | 10 | 12 | 15 | 18 | 20 | 22 | 25 | 28 | 30 |
|---|---|---|---|---|---|---|---|---|---|
| Simulated days to dryness | 17.6 | 15.6 | 13.2 | 11.1 | 10.1 | 9.3 | 8.4 | 7.7 | 7.4 |
| Empirical days | 28 | 24 | 20 | 16 | 14 | 12 | 10 | 8 | 7 |

They agree at red temperatures and the engine runs 30 to 37% fast at white temperatures: its temperature sensitivity is too weak in the cold. To address with the white kinetics (step 3).

### What the defaults now say

At 4,000 cases the harvest is 65.67 tons in 42 deliveries over 50 days. Under the owner's policies the fruit fills 10 fermentors, 6 of them reported as thin (the shoulders of each curve, and whites whose 11-day spread outruns a 4-day window), two below the 33% review level (Pinot fermentor 2 at 27%, Cabernet fermentor 3 at 11%). Fermentor policy and harvest spread now move capital more than anything else at this scale:

| Setting | Fermentors | Capex | Cash IRR |
|---|---|---|---|
| Owner's policy (48-hour additions) | 4 red, 6 white | $4.52M | 8.77% |
| Additions authorized to 120 hours | 3 red, 4 white | $4.01M | 9.78% |
| Whites picked over a 1-day spread | 4 red, 3 white | $4.23M | 9.39% |
| Every variety over a 1-day spread | 3 red, 3 white | $3.94M | 10.03% |
| 1,500-gallon fermentors | 5 red, 6 white | $3.94M | 9.88% |

The spreads came from a 345-ton class harvest; for blocks of 12 to 27 tons they are probably too wide. That, and a mixed fleet, are the levers.

### Sequence

The proposed order holds, with these dependencies:

1. Harvest, material quantities and fill policies: this round.
2. Material ledger and lineage. Sources to lots to wines here (reserves, single vineyard, blends), with source ids already on every delivery and lot. Also the fixed-duration option the workbook benchmark needs.
3. White kinetics and process differentiation, with the additions interface above and the cold-temperature calibration.
4. Individual vessels and mixed fleets. The sensitivity table makes this the most valuable capital lever.
5. Thermal engineering. Needs 3 (white heat) and 4 (jacket per vessel), and fruit temperature at receiving.
6. Constrained scheduling. Resolves what 1 only reports (fruit holding, which fermentor, what waits for the press).
7. Deterministic comparison of equipment configurations (one larger press or two, another shift, fleet mixes), consuming the demand table; then optimization.

Harvest scenarios (compression, overlap, shifted or converging dates, more fruit on unchanged timing) need only a scenario object over stage 1 and can come at any point; quantity and timing are already separate inputs.

### Questions for the winemaker

- Spreads for small purchases: should a 12-ton block keep the class's 2.5-day spread, or come in over one or two days?
- Whites: is 48 hours the right normal addition window for white juice into an inoculated tank, or is it routinely longer?
- Whites below 50%: should thin white fills be reported at all, or only red ones?
- Preferred delivery of 0.5 tons: should generated schedules aim for it (consolidating more), with 0.25 tons as the floor?
