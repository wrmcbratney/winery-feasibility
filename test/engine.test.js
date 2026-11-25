// Engine tests: regression against baseline.json plus invariants that should hold for any inputs.
const test = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../src/core.js');
const { model, VDEF, GDEF, VARIETIES } = require('../src/fin.js');
const { TASKS } = require('../src/flow.js');
const baseline = require('./baseline.json');

const SCEN = { base: {}, estate: { fruit: 'estate' }, custom: { facility: 'custom' }, gravity: { buildTier: 'gravity' }, hire: { owner: 'hire' } };
const run = (g = {}, V = VDEF) => model(V, { ...GDEF, ...g }, simulate);

test('outputs match baseline (update baseline.json on purpose when a model change is intended)', () => {
  for (const [k, g] of Object.entries(SCEN)) {
    const m = run(g), b = baseline[k];
    assert.ok(Math.abs(m.fin.cash.equityTot - b.equityCash) < 1, `${k} equity`);
    assert.strictEqual(m.fin.cash.payback, b.paybackCash, `${k} payback`);
    assert.ok(Math.abs(m.fin.cash.irr * 100 - b.irrCash) < 0.01, `${k} IRR`);
    assert.ok(Math.abs(m.capexTotal - b.capex) < 1, `${k} capex`);
  }
});

test('no NaN anywhere across decision combinations', () => {
  const opts = { fruit: ['buy', 'estate'], facility: ['build', 'custom'], buildTier: ['shell', 'custom', 'gravity'], storage: ['onsite', 'offsite'], lab: ['outsource', 'basic', 'full'], water: ['district', 'well', 'buyRight'], owner: ['winemaker', 'hire'] };
  const keys = Object.keys(opts);
  for (let i = 0; i < 40; i++) {
    const g = Object.fromEntries(keys.map((k, j) => [k, opts[k][(i * (j + 3) + j) % opts[k].length]]));
    const m = run(g);
    for (const r of m.rows) for (const [f, v] of Object.entries({ rev: r.rev, opex: r.opex, ebitda: r.ebitda, capex: r.capex })) assert.ok(Number.isFinite(v), `${JSON.stringify(g)} year ${r.y} ${f}`);
  }
});

test('installed vessels cover the peak in use', () => {
  for (const g of [{}, { lotsPerTank: 1 }, { lotsPerTank: 3 }, { fruit: 'estate' }]) {
    const m = run(g), N = m.FL.need, S = m.sz;
    assert.ok(S.nRed >= N.redTank.v && S.nW >= N.whiteTank.v && S.nS >= N.storage.v && S.nB >= N.blend.v && S.barrels >= N.barrel.v, JSON.stringify(g));
  }
});

test('labor task totals equal the daily calendar', () => {
  const m = run(), W = m.lbr.WK;
  let daily = 0; for (let d = 0; d < 365; d++) for (const [k] of TASKS) daily += W.T[k][d];
  const tasks = m.lbr.tasks.reduce((a, t) => a + t.hrs, 0);
  assert.ok(Math.abs(daily - tasks) < 1, `${daily} vs ${tasks}`);
});

test('federal excise is 7 cents a gallon under 30,000 gallons', () => {
  const m = run({ shareTR: [0, 0, 100], tasting: true });
  const r = m.rows[10], gal = r.sold * 2.378;
  assert.ok(Math.abs(r.fixed.excise - gal * 0.07) < 1);
});

test('land is at least the zoning minimum and grows with production', () => {
  const small = run({ fruit: 'estate' }), big = run({ fruit: 'estate' }, VDEF.map(v => ({ ...v, cases: v.cases * 3 })));
  assert.ok(small.LD.bought >= GDEF.minParcel);
  assert.ok(big.LD.planted > small.LD.planted * 2.9);
});

test('every variety preset runs on its own', () => {
  for (const n of Object.keys(VARIETIES)) {
    const m = run({}, [{ name: n, cases: 1000, ...VARIETIES[n] }]);
    assert.ok(Number.isFinite(m.fin.cash.equityTot), n);
  }
});

test('stepping year by year reproduces model()', () => {
  const { plan, initState, stepYear } = require('../src/fin.js');
  const m = run({ fruit: 'estate' }), P = plan(VDEF, { ...GDEF, fruit: 'estate' }, simulate), S = initState(P);
  for (let y = 0; y <= P.Y; y++) {
    const r = stepYear(P, S, y).row;
    assert.ok(Math.abs(r.rev - m.rows[y].rev) < 1e-6 && Math.abs(r.opex - m.rows[y].opex) < 1e-6 && Math.abs(r.prodCash - m.rows[y].prodCash) < 1e-6, `year ${y}`);
  }
});

test('luck inputs move a year the right way', () => {
  const { plan, initState, stepYear } = require('../src/fin.js');
  const P = plan(VDEF, GDEF, simulate);
  const go = luckAt => { const S = initState(P), rows = []; for (let y = 0; y <= P.Y; y++) rows.push(stepYear(P, S, y, luckAt(y)).row); return rows };
  const ones = VDEF.map(() => 1), half = VDEF.map(() => 0.5), up = VDEF.map(() => 1.2);
  const base = go(() => null), short = go(y => y === 5 ? { yieldF: half, priceF: ones } : null), pricey = go(y => y >= 8 ? { yieldF: ones, priceF: up } : null);
  assert.ok(short[5].prodCash < base[5].prodCash, 'a short crop costs less to make that year');
  // sales are capped at each wine's yearly sell-through, so a short crop draws down the inventory backlog rather than cutting sales
  assert.ok(short[P.Y].inv < base[P.Y].inv - 1000, 'and leaves less wine in inventory');
  assert.ok(pricey[8].rev > base[8].rev * 1.15, 'higher prices raise revenue');
  assert.strictEqual(base[7].rev, pricey[7].rev, 'but only from the year they start');
});
