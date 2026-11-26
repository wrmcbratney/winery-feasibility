// Harvest arrival on curves, one lot per pick, daily crush capacity and the fermentor floor (VEN 235 alignment).
const test = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../src/core.js');
const { model, VDEF, GDEF } = require('../src/fin.js');
const { pickDays, pickCapTons, crushHoursPerDay, wineryFor } = require('../src/winery.js');

const run = (g = {}, V = VDEF) => model(V, { ...GDEF, ...g }, simulate);
const scale = (V, f) => V.map(v => ({ ...v, cases: v.cases * f }));
const lotsOf = (m, name) => m.FL.lots.filter(l => l.name === name);

test('small blocks come in as one pick on the mean day', () => {
  const m = run();
  for (const n of ['Sauvignon Blanc', 'Chardonnay', 'Pinot Noir']) {
    const L = lotsOf(m, n), v = m.V.find(v => v.name === n);
    assert.strictEqual(L.length, 1, n);
    assert.strictEqual(L[0].pick, v.pick, `${n} picks on its mean day`);
  }
});

test('picks sit on the arrival curve, symmetric, in order, and tighten with the spread', () => {
  const v = { pick: 280, pickSD: 2.5 };
  const d = pickDays(v, 4, GDEF), tight = pickDays(v, 4, { ...GDEF, harvestSpread: 0.4 });
  assert.deepStrictEqual(d, [...d].sort((a, b) => a - b));
  assert.ok(Math.abs((d[0] + d[3]) / 2 - 280) <= 0.5, 'centered on the mean');
  assert.ok(tight[3] - tight[0] < d[3] - d[0], 'a compressed harvest pulls picks together');
  for (let i = 1; i < tight.length; i++) assert.ok(tight[i] > tight[i - 1], 'never two picks of a variety on one day');
  assert.deepStrictEqual(pickDays(v, 1, GDEF), [280]);
});

test('no pick is larger than the largest lot or one day of crush or press', () => {
  for (const [g, f] of [[{}, 1], [{}, 4], [{ sort: 'optical' }, 4], [{ lotTons: 8 }, 2], [{ crushShifts: 2 }, 6]]) {
    const m = run(g, scale(VDEF, f)), W = m.FL.winery;
    for (const l of m.FL.lots) {
      const cap = Math.min(m.G.lotTons, pickCapTons(l.color, W, m.G));
      assert.ok(l.tons <= cap + 1e-9, `${JSON.stringify(g)} ${f}x ${l.name}: ${l.tons.toFixed(1)} t over ${cap.toFixed(1)}`);
    }
    const n = m.V.reduce((a, v) => a + Math.max(1, Math.ceil((v.cases / v.cpt) / Math.min(m.G.lotTons, pickCapTons(v.color, W, m.G)) - 1e-9)), 0);
    assert.strictEqual(m.FL.lots.length, n, 'as few picks as the limits allow');
  }
});

test('two red picks on one day beyond the crush window are flagged as overtime', () => {
  const V = VDEF.map(v => v.name === 'Pinot Noir' ? { ...v, pick: 281 } : v.name === 'Cabernet Sauvignon' ? { ...v, pick: 281, pickSD: 0 } : v);
  const over = run({}, V).FL.exceptions.filter(e => e.process === 'Crush');
  assert.ok(over.length > 0 && over.every(e => e.cls === 'overtime'));
  assert.strictEqual(run({ crushShifts: 2, lotTons: 15 }, V).FL.exceptions.filter(e => e.process === 'Crush').length, 0, 'a second shift clears it');
  assert.strictEqual(run().FL.exceptions.filter(e => e.process === 'Crush').length, 0, 'none at default');
  assert.strictEqual(crushHoursPerDay(GDEF), 6, 'one 8-hour shift less 2 hours, as in VEN 235');
});

test('whole tanks never come in under the fractional fermentor floor', () => {
  for (const [g, f] of [[{}, 1], [{}, 3], [{ harvestSpread: 0.3 }, 2], [{ lotTons: 4 }, 1], [{ lotsPerTank: 3 }, 5]]) {
    const FL = run(g, scale(VDEF, f)).FL;
    for (const k of ['redTank', 'whiteTank'])
      assert.ok(FL.need[k].v >= FL.fermFloor[k] - 1e-9, `${JSON.stringify(g)} ${f}x ${k}: ${FL.need[k].v} below floor ${FL.fermFloor[k].toFixed(2)}`);
  }
});

test('a compressed harvest needs at least as many fermentors', () => {
  const V = scale(VDEF, 3), a = run({}, V).FL.need.redTank.v, b = run({ harvestSpread: 0.3 }, V).FL.need.redTank.v;
  assert.ok(b >= a, `${b} vs ${a}`);
});
