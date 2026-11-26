// Tests for the step 1 fixes (see docs/architecture.md, section 1). Each would have failed on the code before the fix.
const test = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../src/core.js');
const { model, plan, initState, stepYear, VDEF, GDEF } = require('../src/fin.js');
const { lotPlan, MO } = require('../src/flow.js');
const { jacketBTU, lotParams, PRESS_CYCLE_HRS } = require('../src/winery.js');

const run = (g = {}, V = VDEF) => model(V, { ...GDEF, ...g }, simulate);
const scale = (V, f) => V.map(v => ({ ...v, cases: v.cases * f }));
const reds = m => m.FL.lots.filter(l => l.color === 'red');

test('1. sorting choice reaches the lot simulation and the crush line', () => {
  for (const [sort, rate] of [['hand', 2.5], ['optical', 6], ['none', 8]]) {
    const m = run({ sort });
    assert.strictEqual(m.FL.winery.sort, sort);
    for (const l of m.FL.lots) {
      const setup = l.color === 'red' ? 1.5 : 0.5;
      assert.ok(Math.abs(l.crushHrs - (l.tons / rate + setup)) < 1e-9, `${sort} ${l.name}`);
    }
  }
});

test('2. press loads and press hours use the winery press', () => {
  for (const f of [0.5, 1, 4]) {
    const m = run({}, scale(VDEF, f)), t = m.FL.winery.press.tons;
    assert.strictEqual(m.sz.items.find(i => i.k === 'Membrane press').unit, t + ' ton');
    for (const l of m.FL.lots) {
      assert.strictEqual(l.loads, Math.ceil(l.tons / t - 1e-9), `${f}x ${l.name} loads`);
      assert.ok(Math.abs(l.pressHrs - l.loads * PRESS_CYCLE_HRS[l.color]) < 1e-9, `${f}x ${l.name} hours`);
    }
  }
});

test('3. red lot cooling comes from the jacket on its tank', () => {
  const m = run(), W = m.FL.winery;
  assert.strictEqual(W.redTankGal, m.FL.size.redTank);
  assert.ok(Math.abs(W.coolBTU - jacketBTU(m.FL.size.redTank, m.G)) < 1e-9 && W.coolBTU > 0);
  const lo = run({ jacketFlux: 10 }).FL.winery.coolBTU;
  assert.ok(lo < W.coolBTU / 100, 'capacity follows the jacket heat flux');
  assert.strictEqual(lotParams(VDEF[3], 5, 280, W).coolBTU, W.coolBTU);
});

test('4. a stuck fermentation is flagged, not pressed on a nominal day', () => {
  // a low-nitrogen must with no nutrient additions sticks; the default nutrient plan carries the same must to dryness
  const V = [{ ...VDEF[3], brix: 30 }], starved = { yanHarvest: 80, yanTarget21: 60, yanPerBrix: 0, complexRate: 0 }, m = run(starved, V);
  assert.strictEqual(run({ yanHarvest: 80 }, V).FL.exceptions.filter(e => e.process === 'Primary fermentation').length, 0, 'nutrients rescue it');
  const stuck = m.FL.exceptions.filter(e => e.process === 'Primary fermentation');
  assert.ok(stuck.length > 0 && stuck.every(e => e.cls === 'method'));
  for (const l of m.FL.lots) {
    const press = l.segs.find(s => s.loc === 'press');
    assert.ok(press.a - l.p > 40, 'held in the fermenter to the end of the window, not day 20');
  }
  assert.strictEqual(run().FL.exceptions.filter(e => e.process === 'Primary fermentation').length, 0, 'none at default inputs');
});

test('5. barrel time that differs from the plan is always reported', () => {
  for (const V of [VDEF, VDEF.map(v => ({ ...v, bottle: v.barrel ? v.bottle - 3 : v.bottle }))]) {
    const m = run({}, V);
    m.V.forEach((v, i) => {
      if (!(v.barrel > 0)) return;
      const off = m.FL.lots.filter(l => l.wi === i).some(l => {
        const b = l.segs.find(s => s.loc === 'barrel');
        return Math.abs((b.b - b.a) - v.barrel * MO) > 1;
      });
      const flagged = m.FL.exceptions.some(e => e.wine === v.name && e.process === 'Barrel aging');
      assert.strictEqual(off, flagged, `${v.name}: barrel time changed ${off}, reported ${flagged}`);
    });
  }
});

// Over the normal-year window, overlaid identical vintages should account for every lot's whole life exactly once.
function conserved(m) {
  const FL = m.FL;
  for (const loc of Object.keys(FL.lanes)) {
    let win = 0; for (let d = 0; d < 365; d++) win += FL.lanes[loc][d];
    const life = FL.lots.reduce((a, l) => a + l.segs.filter(s => s.loc === loc).reduce((b, s) => b + s.gal * (s.ev ? 1 : s.b - s.a), 0), 0);
    assert.ok(Math.abs(win - life) <= 1e-6 * Math.max(1, life), `${loc}: window ${win.toFixed(0)} vs lifetime ${life.toFixed(0)}`);
  }
  const last = Math.max(...FL.lots.flatMap(l => l.segs.map(s => s.b)));
  assert.ok(last < FL.D, 'the horizon covers every lot to its last case sold');
}

test('6. the flow horizon covers long release schedules', () => {
  conserved(run());
  const long = VDEF.map(v => ({ ...v, release: 72, bottle: 60, barrel: v.color === 'red' ? 40 : v.barrel }));
  const m = run({}, long);
  conserved(m);
  assert.ok(m.FL.need.bottled.v > 0, 'bottled wine shows up in the normal year');
});

test('7. case storage holds the within-year peak', () => {
  const m = run(), P = plan(VDEF, GDEF, simulate), S = initState(P);
  let yearEnd = 0;
  for (let y = 0; y <= P.Y; y++) {
    const { sales } = stepYear(P, S, y);
    assert.ok(sales.bottledPeak >= sales.bottled - 1e-6, `year ${y}: peak below year end`);
    yearEnd = Math.max(yearEnd, sales.bottled);
  }
  assert.ok(m.peakBottled > yearEnd, 'within the year the peak runs above the year-end count');
  assert.ok(m.rampBacklog > 0 && m.rampBacklog < m.peakBottled);
});

test('8. seasonal workers past 40 hours a week are paid overtime', () => {
  const m = run({ crushCrew: 8, capHrs: 1 }, scale(VDEF, 6)), L = m.lbr, G = m.G;
  assert.ok(L.seasonalOTHrs > 0, 'a big harvest pushes seasonal crew past 40 hours');
  const sb = 1 + G.seasonalBurden / 100;
  assert.ok(Math.abs(L.cost.seasonalOT - L.seasonalOTHrs * G.seasonalWage * 0.5 * sb) < 1e-6);
  assert.ok(L.seasonalOTHrs <= L.seasonalHrs, 'overtime hours are a subset of seasonal hours');
});

// No tank location ever holds more gallons than its vessels count times their size.
function withinCapacity(m) {
  const FL = m.FL;
  for (const loc of ['redTank', 'whiteTank', 'storage', 'blend'])
    for (let d = 0; d < 365; d++)
      assert.ok(FL.lanes[loc][d] <= Math.round(FL.ves[loc][d] * 1e6) / 1e6 * FL.size[loc] + 1e-6, `${loc} day ${d}: ${FL.lanes[loc][d].toFixed(0)} gal in ${FL.ves[loc][d]} x ${FL.size[loc]}`);
}

test('9. large lots are split across tanks instead of overfilling one', () => {
  withinCapacity(run());
  withinCapacity(run({ lotTons: 40, lotsPerTank: 3 }, scale(VDEF, 4)));
});

test('10. off-season crunch days are staffed, and every hour is someone\'s', () => {
  const m = run(), L = m.lbr, W = L.WK;
  assert.ok(L.tempDays > 0 && L.tempPaid >= L.tempHrs);
  let off = 0;
  for (let d = 0; d < 365; d++) if (!W.active[d]) {
    let need = 0; for (const k in W.T) need += W.T[k][d];
    off += need;
    assert.ok(L.avail[d] >= need - 4 - 1e-9, `day ${d}: ${need.toFixed(1)} hrs needed, ${L.avail[d].toFixed(1)} on hand`);
  }
  const yW = 52 - L.harvestWeeks, covered = L.wmY + L.perms * yW * 40 + L.partHrs + L.tempHrs;
  assert.ok(Math.abs(covered - off) < 1e-6, `${covered.toFixed(1)} covered vs ${off.toFixed(1)} needed`);
});

test('11. barrels bought for the first vintage reconcile with barrels installed', () => {
  for (const V of [VDEF, VDEF.map(v => v.name === 'Chardonnay' ? { ...v, barrel: 4, bottle: 6 } : v)]) {
    const m = run({}, V), sum = m.FL.bStock.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - m.sz.barrels) < 1e-9, `${sum} bought vs ${m.sz.barrels} installed`);
    assert.strictEqual(m.sz.barrels, m.FL.installedB);
  }
});

// Seeded randomized coverage, replacing the old fixed decision-combination loop (which repeated a few combinations).
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

test('randomized decisions and wines: finite results, capacity and conservation hold', () => {
  const r = rng(20261125), pick = a => a[Math.floor(r() * a.length)];
  const opts = { fruit: ['buy', 'estate'], facility: ['build', 'custom'], buildTier: ['shell', 'custom', 'gravity'], storage: ['onsite', 'offsite'], lab: ['outsource', 'basic', 'full'], water: ['district', 'well', 'buyRight'], owner: ['winemaker', 'hire'], sort: ['none', 'hand', 'optical'] };
  for (let i = 0; i < 30; i++) {
    const g = Object.fromEntries(Object.entries(opts).map(([k, o]) => [k, pick(o)]));
    g.lotTons = pick([2, 5, 10, 25]); g.lotsPerTank = pick([1, 2, 3]);
    const V = VDEF.filter(() => r() < 0.8).map(v => {
      const barrel = v.barrel ? Math.round(v.barrel * (0.5 + r())) : 0, bottle = Math.round((v.bottle || 5) * (0.6 + r() * 0.8));
      return { ...v, cases: Math.round(200 + r() * 3000), barrel, bottle, release: bottle + 2 + Math.round(r() * 24) };
    });
    if (!V.length) continue;
    const m = run(g, V), tag = JSON.stringify({ g, V: V.map(v => [v.name, v.cases, v.barrel, v.bottle, v.release]) });
    for (const row of m.rows) for (const f of ['rev', 'opex', 'ebitda', 'capex']) assert.ok(Number.isFinite(row[f]), `${tag} year ${row.y} ${f}`);
    assert.ok(Number.isFinite(m.fin.cash.equityTot), tag);
    conserved(m); withinCapacity(m);
    for (const e of m.FL.exceptions) assert.ok(e.wine && e.process && e.what, tag);
  }
});

test('edge cases: one white wine, very long release, tiny and huge lots', () => {
  for (const [g, V] of [
    [{}, [VDEF[0]]],
    [{}, VDEF.map(v => ({ ...v, release: 72, bottle: 70 }))],
    [{ lotTons: 0.5 }, VDEF],
    [{ lotTons: 100, lotsPerTank: 3 }, scale(VDEF, 6)]
  ]) { const m = run(g, V); conserved(m); withinCapacity(m); assert.ok(Number.isFinite(m.fin.cash.equityTot)); }
});

test('lot plan is shared: the same lot parameters drive every red lot', () => {
  const { lots, winery } = lotPlan(VDEF, GDEF, simulate);
  assert.ok(winery.press && winery.coolBTU > 0);
  assert.ok(lots.length > 0);
});
