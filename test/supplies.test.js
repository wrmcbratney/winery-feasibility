// Packaging by wine and cellar chemicals from process events (src/supplies.js).
const test = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../src/core.js');
const { model, VDEF, GDEF, VARIETIES } = require('../src/fin.js');
const { GLASS, CLOSURE, CAPSULE, DAP_MAX, pkgOf, dryCase, nutrientPlan } = require('../src/supplies.js');
const { lotParams, wineryFor } = require('../src/winery.js');

const run = (g = {}, V = VDEF) => model(V, { ...GDEF, ...g }, simulate);
const prodCash = m => m.rows.reduce((a, r) => a + r.prodCash, 0);

test('every variety preset has a valid package, and the package sets the cost', () => {
  for (const [n, v] of Object.entries(VARIETIES)) {
    const k = pkgOf(v);
    assert.ok(GLASS[k.glass] && CLOSURE[k.closure] && CAPSULE[k.capsule], n);
    assert.strictEqual(k.glass, v.glass, `${n} glass is set, not defaulted`);
  }
  const cab = { ...VARIETIES['Cabernet Sauvignon'] }, sc = { ...cab, closure: 'screwcap' };
  assert.strictEqual(pkgOf(sc).capsule, 'none', 'no capsule over a screwcap');
  assert.ok(Math.abs(dryCase(cab, GDEF) - dryCase(sc, GDEF) - 12 * (CLOSURE[cab.closure].cost + CAPSULE[cab.capsule].cost - CLOSURE.screwcap.cost)) < 1e-9);
  assert.ok(dryCase(VARIETIES['Sauvignon Blanc'], GDEF) < dryCase(cab, GDEF));
});

test('a cheaper closure on one wine lowers production cash', () => {
  const a = run(), b = run({}, VDEF.map(v => v.name === 'Cabernet Sauvignon' ? { ...v, closure: 'screwcap' } : v));
  assert.ok(prodCash(b) < prodCash(a) - 1000);
});

test('chemical lines add up, per wine and in total', () => {
  const m = run(), C = m.CH;
  const lines = C.lines.reduce((a, l) => a + l.cost, 0), parts = C.per.reduce((a, x) => a + x, 0) + C.winery;
  assert.ok(Math.abs(lines - C.total) < 1e-6 && Math.abs(parts - C.total) < 1e-6, `${lines} ${parts} ${C.total}`);
  for (const l of C.lines) assert.ok(Number.isFinite(l.cost) && l.cost >= 0, l.name);
});

test('SO2 use scales with the addition rates', () => {
  const zero = { so2Crush: 0, so2PostAF: 0, so2Rack: 0, so2Barrel: 0, so2Bottle: 0 };
  assert.ok(!run(zero).CH.lines.some(l => l.k === 'kmbs'), 'no additions, no KMBS');
  const k = g => run(g).CH.lines.find(l => l.k === 'kmbs').qty, base = k({});
  const dbl = Object.fromEntries(Object.keys(zero).map(f => [f, GDEF[f] * 2]));
  assert.ok(Math.abs(k(dbl) - 2 * base) < 1e-9);
});

test('nutrients stay inside the federal DAP limit and feed the kinetics', () => {
  for (const brix of [20, 24, 26, 30, 34]) for (const yan of [60, 180, 350]) {
    const n = nutrientPlan({ brix }, { ...GDEF, yanHarvest: yan });
    assert.ok(n.dapGL <= DAP_MAX + 1e-12, `${brix} Brix, ${yan} YAN`);
    assert.ok(Math.abs(n.added + n.short - n.deficit) < 1e-9 || n.added > n.deficit);
  }
  const W = wineryFor(VDEF, GDEF, 1500), v = VDEF[3], p = lotParams(v, 5, 280, W), n = nutrientPlan(v, GDEF);
  assert.strictEqual(p.yan, GDEF.yanHarvest);
  assert.strictEqual(p.dapAmt, n.added);
  const starved = run({ yanHarvest: 60 }, [{ ...v, brix: 34 }]);
  assert.ok(starved.CH.short.length > 0, 'a shortfall at the limit is reported');
});

test('custom crush pays its fee, not the cellar chemicals', () => {
  const a = run({ facility: 'custom' }), b = run({ facility: 'custom', so2Crush: 80, otherSupplies: 5 });
  assert.strictEqual(prodCash(a), prodCash(b));
});
