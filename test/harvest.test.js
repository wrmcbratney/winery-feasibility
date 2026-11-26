// Harvest as a physical process: exact fruit, deliveries, bins, fermentor fills, and one account of processing demand.
const test = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../src/core.js');
const { model, VDEF, GDEF } = require('../src/fin.js');
const { expectedArrival, deliveriesFor, binsOf, sourcesOf } = require('../src/harvest.js');
const { crushHoursPerDay } = require('../src/winery.js');
const { AUG1 } = require('../src/flow.js');

const run = (g = {}, V = VDEF) => model(V, { ...GDEF, ...g }, simulate);
const scale = (V, f) => V.map(v => ({ ...v, cases: v.cases * f }));
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const SCEN = [
  ['default', {}, VDEF],
  ['compressed', { harvestSpread: 0.3 }, scale(VDEF, 3)],
  ['overlapping', {}, VDEF.map(v => ({ ...v, pick: 265 }))],
  ['tiny', {}, [{ ...VDEF[2], cases: 40 }]],
  ['commercial', {}, scale(VDEF, 10)],
  ['small fermentors', { redFermGal: 1000, whiteFermGal: 1000 }, VDEF],
  ['manual with gaps', {}, VDEF.map(v => v.name === 'Cabernet Sauvignon' ? { ...v, schedule: [{ day: 280, tons: 0.1 }, { day: 281, tons: 9 }, { day: 290, tons: 10 }, { day: 297, tons: v.cases / v.cpt - 19.1 }] } : v)],
  ['across new year', {}, VDEF.map(v => v.name === 'Cabernet Sauvignon' ? { ...v, pick: 362 } : v)],
];

test('fruit is conserved: planned = expected = delivered = received = assigned to fermentors', () => {
  for (const [name, g, V] of SCEN) {
    const m = run(g, V), G = m.G;
    sourcesOf(m.V).forEach(src => {
      const planned = src.tons;
      const expected = src.schedule ? planned : expectedArrival(src, G).reduce((a, e) => a + e.tons, 0);
      const delivered = m.FL.deliveries.filter(d => d.wi === src.wi).reduce((a, d) => a + d.tons, 0);
      const received = m.FL.demand.days.reduce((a, x) => a + x.deliveries.filter(d => d.wi === src.wi).reduce((b, d) => b + d.tons, 0), 0);
      const L = m.FL.lots.filter(l => l.wi === src.wi), assigned = L.reduce((a, l) => a + l.tons, 0);
      const pad = L.reduce((a, l) => a + l.segs.filter(s => s.loc === 'pad').reduce((b, s) => b + s.gal / 180, 0), 0);
      const picks = L.reduce((a, l) => a + l.picks.reduce((b, k) => b + k.tons, 0), 0);
      for (const [k, v] of [['expected', expected], ['delivered', delivered], ['received', received], ['assigned', assigned], ['on the pad', pad], ['in fill records', picks]])
        assert.ok(near(v, planned), `${name} ${src.name}: ${k} ${v} against planned ${planned}`);
    });
  }
});

test('generated deliveries respect the minimum delivery and record what moved', () => {
  const G = GDEF;
  for (const [tons, sd] of [[12.3, 2.5], [26.7, 2.5], [0.2, 2], [80, 1.5], [300, 3]]) {
    const src = { id: 'x', wi: 0, name: 'x', color: 'red', tons, pick: 280, pickSD: sd }, d = deliveriesFor(src, G);
    if (d.length > 1) for (const x of d) assert.ok(x.tons >= G.minDelivery - 1e-12, `${tons} t: ${x.tons} on day ${x.day}`);
    for (const x of d) assert.ok(near(x.from.reduce((a, f) => a + f.tons, 0), x.tons), 'every delivery accounts for where its fruit came from');
    const peak = d.reduce((a, x) => x.tons > a.tons ? x : a);
    assert.ok(Math.abs(peak.day - 280) <= 1);
  }
  const wide = deliveriesFor({ id: 'x', wi: 0, tons: 30, pick: 280, pickSD: 2.5 }, G), tight = deliveriesFor({ id: 'x', wi: 0, tons: 30, pick: 280, pickSD: 2.5 }, { ...G, harvestSpread: 0.4 });
  assert.ok(tight.length < wide.length && Math.max(...tight.map(x => x.tons)) > Math.max(...wide.map(x => x.tons)));
  const manual = deliveriesFor({ id: 'x', wi: 0, tons: 1, schedule: [{ day: 270, tons: 0.05 }, { day: 275, tons: 0.95 }] }, G);
  assert.deepStrictEqual(manual.map(x => x.tons), [0.05, 0.95], 'a manual schedule is taken as given, small deliveries included');
});

test('bins are counted once at receiving, full and partial, however fruit is divided', () => {
  assert.deepStrictEqual(binsOf(2.3, GDEF), { bins: 5, full: 4, partial: 1, partialTons: 2.3 - 2 });
  assert.deepStrictEqual(binsOf(2.0, GDEF), { bins: 4, full: 4, partial: 0, partialTons: 0 });
  assert.strictEqual(binsOf(0.1, GDEF).bins, 1);
  for (const [name, g, V] of SCEN) {
    const m = run(g, V), received = m.FL.deliveries.reduce((a, d) => a + binsOf(d.tons, m.G).bins, 0);
    const inLots = m.FL.lots.reduce((a, l) => a + l.bins, 0), onPad = m.FL.lots.reduce((a, l) => a + l.segs.filter(s => s.loc === 'pad').reduce((b, s) => b + s.units, 0), 0);
    assert.ok(near(inLots, received) && near(onPad, received), `${name}: ${received} bins received, ${inLots} in lots, ${onPad} on the pad`);
    assert.ok(near(m.FL.demand.days.reduce((a, x) => a + x.bins, 0), received));
  }
});

test('fermentors: within working volume, additions only inside the window, reserved from first fruit, filling visibly', () => {
  for (const [name, g, V] of SCEN) {
    const m = run(g, V), FL = m.FL;
    for (const l of FL.lots) {
      assert.ok(l.tons <= l.capTons + 1e-9, `${name} ${l.name} ${l.j + 1} over working volume`);
      for (const k of l.picks) assert.ok(k.day <= l.addUntil + 1e-9, `${name} ${l.name} ${l.j + 1}: fruit on ${k.day} after the window closed ${l.addUntil}`);
      const loc = l.color === 'red' ? 'redTank' : 'whiteTank', res = l.segs.filter(s => s.loc === loc && s.reserve);
      assert.strictEqual(res.length, 1, 'one reservation per fermentor');
      assert.strictEqual(res[0].a, l.p, 'reserved from the first fruit');
      const mat = l.segs.filter(s => s.loc === loc && !s.reserve);
      assert.ok(near(mat.filter(s => s.a < l.p + 1).reduce((a, s) => a + s.gal, 0), l.picks.filter(k => k.day === l.first).reduce((a, k) => a + k.tons, 0) * (l.color === 'red' ? 180 : 170)), 'first day holds only the first fruit');
      if (l.last > l.first && l.color === 'red') assert.ok(mat.reduce((a, s) => a + s.gal, 0) > mat.filter(s => s.a < l.p + 1).reduce((a, s) => a + s.gal, 0), 'volume grows as fruit arrives');
    }
    for (const k of ['redTank', 'whiteTank']) for (let d = 0; d < 365; d++)
      assert.ok(FL.lanes[k][d] <= FL.ves[k][d] * FL.working[k] + 1e-6, `${name} ${k} day ${d}: material over the working volume of the reserved tanks`);
  }
});

test('a fermentor that closes thin is reported, never held open', () => {
  const m = run(), G = m.G;
  for (const l of m.FL.lots.filter(l => l.color === 'red')) {
    const e = m.FL.exceptions.find(x => x.process === 'Fermentor filling' && x.wine === l.name && x.lot === l.j);
    if (l.fill < G.redWarnMinFill / 100) assert.ok(e && e.cls === 'method' && e.basis === 'warning', `${l.name} ${l.j + 1} at ${l.fill}`);
    else if (l.fill < G.redPrefMinFill / 100) assert.ok(e && e.cls === 'reschedule' && e.basis === 'practice');
    else assert.ok(!e);
  }
  const wider = run({ addWindowHrs: 120 });
  assert.ok(wider.FL.lots.length <= m.FL.lots.length, 'a longer authorized addition window fills fermentors further');
});

test('one account of processing demand: calendar, overtime and shifts agree with it', () => {
  for (const [name, g, V] of SCEN) {
    const m = run(g, V), PD = m.FL.demand, E = m.lbr.WK.E0;
    for (const x of PD.days) {
      const d = x.day - AUG1;
      if (d < 0 || d >= m.FL.D) continue;
      const others = PD.days.filter(y => y.day - AUG1 === d && y !== x);
      assert.strictEqual(others.length, 0);
      assert.ok(near(E.crushline[d], x.lineHrs > 0 ? PD.setup + x.lineHrs : 0), `${name} day ${x.day}: crush line ${E.crushline[d]} against demand`);
      assert.ok(near(E.press[d], x.pressHrs), `${name} day ${x.day}: press ${E.press[d]} against demand ${x.pressHrs}`);
      const over = m.FL.exceptions.some(e => e.process === 'Crush' && e.what.startsWith(m.FL.exceptions.length ? '' : ''));
      if (x.lineHrs > PD.window + 1e-9) assert.ok(m.FL.exceptions.some(e => e.process === 'Crush'), `${name}: a day over the crush window is reported`);
      if (x.pressRunHrs + x.changeHrs > PD.pressAvail + 1e-9) assert.ok(m.FL.exceptions.some(e => e.process === 'Pressing'));
    }
    assert.strictEqual(PD.window, crushHoursPerDay(m.G));
  }
});

test('reds and whites compete for one press', () => {
  // Pinot pressed while Chardonnay is arriving: move Chardonnay late so its loads land on a red press day
  const base = run(), pn = base.FL.lots.find(l => l.name === 'Pinot Noir');
  const V = VDEF.map(v => v.name === 'Chardonnay' ? { ...v, pick: pn.pressDOY, pickSD: 0 } : v);
  const m = run({}, V), x = m.FL.demand.byDay[m.FL.lots.find(l => l.name === 'Pinot Noir').pressDOY];
  assert.ok(x && x.shared && x.whiteLoads > 0 && x.redLoads > 0, 'red and white loads on one press day');
  assert.ok(x.changeHrs > 0, 'a changeover between wines is counted');
});

test('compressed and overlapping harvests raise peak demand', () => {
  const V = scale(VDEF, 3), peak = m => Math.max(...m.FL.demand.days.map(x => x.redTons + x.whiteTons));
  const a = run({}, V), b = run({ harvestSpread: 0.3 }, V), c = run({}, V.map(v => ({ ...v, pick: 265 })));
  assert.ok(peak(b) > peak(a) && peak(c) > peak(a));
  assert.ok(b.FL.need.redTank.v >= a.FL.need.redTank.v);
});

test('whole fermentors never come in under the theoretical floor', () => {
  for (const [name, g, V] of SCEN) {
    const FL = run(g, V).FL;
    for (const k of ['redTank', 'whiteTank']) assert.ok(FL.need[k].v >= FL.fermFloor[k] - 1e-9, `${name} ${k}`);
  }
});
