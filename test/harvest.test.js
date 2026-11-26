// Harvest by day on each variety's curve (VEN 235), fermentor fills, daily crush capacity and the fermentor floor.
const test = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../src/core.js');
const { model, VDEF, GDEF } = require('../src/fin.js');
const { dailyArrival, crushHoursPerDay } = require('../src/winery.js');

const run = (g = {}, V = VDEF) => model(V, { ...GDEF, ...g }, simulate);
const scale = (V, f) => V.map(v => ({ ...v, cases: v.cases * f }));

test('daily arrival follows the curve in half-ton steps and keeps the season total', () => {
  for (const [tons, sd] of [[12.3, 2.5], [26.7, 2.5], [0.3, 2], [80, 1.5], [120, 2.5]]) {
    const v = { pick: 280, pickSD: sd }, d = dailyArrival(v, tons, GDEF), sum = d.reduce((a, x) => a + x.tons, 0);
    assert.strictEqual(sum, Math.max(1, Math.round(tons / 0.5)) * 0.5, `${tons} t`);
    for (const x of d) assert.ok(x.tons > 0 && Math.abs(x.tons / 0.5 - Math.round(x.tons / 0.5)) < 1e-9, 'half-ton steps');
    const peak = d.reduce((a, x) => x.tons > a.tons ? x : a);
    assert.ok(Math.abs(peak.day - 280) <= 1, `${tons} t peaks at the mean`);
  }
  const v = { pick: 280, pickSD: 2.5 }, wide = dailyArrival(v, 30, GDEF), tight = dailyArrival(v, 30, { ...GDEF, harvestSpread: 0.4 });
  assert.ok(tight.length < wide.length && Math.max(...tight.map(x => x.tons)) > Math.max(...wide.map(x => x.tons)), 'a compressed harvest is shorter and taller');
  assert.deepStrictEqual(dailyArrival({ pick: 280, pickSD: 0 }, 10, GDEF), [{ day: 280, tons: 10 }]);
});

test('every day picked lands on the crush pad, and every ton lands in a lot', () => {
  for (const [g, f] of [[{}, 1], [{ harvestSpread: 0.5 }, 3], [{ redFermGal: 1500, whiteFermGal: 1500 }, 2]]) {
    const m = run(g, scale(VDEF, f));
    m.V.forEach((v, i) => {
      const h = m.FL.harvest.filter(x => x.wi === i).reduce((a, x) => a + x.tons, 0);
      const L = m.FL.lots.filter(l => l.wi === i), lots = L.reduce((a, l) => a + l.tons, 0);
      const pad = L.reduce((a, l) => a + l.segs.filter(s => s.loc === 'pad').reduce((b, s) => b + s.gal / 180, 0), 0);
      assert.ok(Math.abs(h - lots) < 1e-9 && Math.abs(h - pad) < 1e-9, `${v.name}: harvest ${h}, lots ${lots}, pad ${pad}`);
    });
  }
});

test('fermentors are filled within capacity, to the minimum fill where the harvest allows', () => {
  for (const [g, f] of [[{}, 1], [{}, 4], [{ redFermGal: 1500 }, 2], [{ minFillPct: 0 }, 1], [{ lotTons: 5 }, 2]]) {
    const m = run(g, scale(VDEF, f)), G = m.G;
    m.V.forEach((v, i) => {
      const red = v.color === 'red', perTon = red ? 180 * 1.2 : 170 * 1.1, cap = Math.min(G.lotTons, (red ? G.redFermGal : G.whiteFermGal) / perTon);
      const L = m.FL.lots.filter(l => l.wi === i), total = L.reduce((a, l) => a + l.tons, 0);
      for (const l of L) {
        assert.ok(l.tons <= cap + 1e-9, `${v.name} lot ${l.j + 1}: ${l.tons} t over ${cap.toFixed(2)}`);
        if (total >= cap * G.minFillPct / 100 && L.length > 1 && l !== L[L.length - 1])
          assert.ok(l.tons >= cap * G.minFillPct / 100 - 1e-9, `${v.name} lot ${l.j + 1} below minimum fill`);
        for (let k = 1; k < l.picks.length; k++) assert.ok(l.picks[k].day >= l.picks[k - 1].day, 'picks in order');
      }
      if (G.minFillPct === 0) for (const l of L) assert.ok(l.fillDays < G.fillDays, 'with no minimum, fills close with the window');
    });
  }
});

test('a day over the crush window is flagged as overtime; default harvest is not', () => {
  assert.strictEqual(run().FL.exceptions.filter(e => e.process === 'Crush').length, 0);
  const hard = run({ harvestSpread: 0.2 }, scale(VDEF, 3)).FL.exceptions.filter(e => e.process === 'Crush');
  assert.ok(hard.length > 0 && hard.every(e => e.cls === 'overtime'));
  assert.strictEqual(crushHoursPerDay(GDEF), 6, 'one 8-hour shift less 2 hours, as in VEN 235');
});

test('whole tanks never come in under the fractional fermentor floor', () => {
  for (const [g, f] of [[{}, 1], [{}, 3], [{ harvestSpread: 0.3 }, 2], [{ redFermGal: 1000 }, 1], [{ lotsPerTank: 3 }, 5]]) {
    const FL = run(g, scale(VDEF, f)).FL;
    for (const k of ['redTank', 'whiteTank'])
      assert.ok(FL.need[k].v >= FL.fermFloor[k] - 1e-9, `${JSON.stringify(g)} ${f}x ${k}: ${FL.need[k].v} below ${FL.fermFloor[k].toFixed(2)}`);
  }
});

test('a compressed harvest needs at least as many fermentors', () => {
  const V = scale(VDEF, 3), a = run({}, V).FL.need.redTank.v, b = run({ harvestSpread: 0.3 }, V).FL.need.redTank.v;
  assert.ok(b >= a, `${b} vs ${a}`);
});
