// The owner's VEN 235 workbook as an independent benchmark (inputs and results in ven235.js).
const test = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../src/core.js');
const { lotParams, wineryFor } = require('../src/winery.js');
const { VDEF, GDEF, VARIETIES } = require('../src/fin.js');
const B = require('./ven235.js');

test('the workbook method, fed the workbook arrival, reproduces its 47.01 fermentors and 4.81 tons an hour', () => {
  const r = B.benchmark('xlsx', 'workbook');
  assert.ok(Math.abs(r.peak - B.CASES.xlsx.peak) < 0.005, `peak ${r.peak}`);
  assert.strictEqual(r.at, B.CASES.xlsx.peakDay);
  assert.ok(Math.abs(r.maxTph - B.CRUSH_MAX_TPH) < 0.005, `max ${r.maxTph} t/hr`);
});

test('this model\'s arrival, integrated over each day, lands within 1% of the workbook\'s point samples', () => {
  for (const c of ['xlsx', 'ods']) {
    const w = B.benchmark(c, 'workbook'), m = B.benchmark(c, 'model');
    assert.ok(Math.abs(m.peak / w.peak - 1) < 0.01, `${c}: ${m.peak} against ${w.peak}`);
    assert.ok(Math.abs(m.maxTph / w.maxTph - 1) < 0.015, `${c}: ${m.maxTph} against ${w.maxTph} t/hr`);
  }
});

test('kinetics against the empirical ferment time: close at red temperatures (known to run fast in the cold)', () => {
  const W = wineryFor(VDEF, GDEF, 3000);
  for (const C of [25, 28, 30]) {
    const F = C * 1.8 + 32, v = { ...VARIETIES['Cabernet Sauvignon'], brix: 23, setF: F, soak: 0, ext: 0 };
    const r = simulate({ ...lotParams(v, 5, 280, W), fruitF: Math.min(65, F) });
    assert.ok(Math.abs(r.dry / B.fermDays(C) - 1) < 0.2, `${C} C: ${r.dry.toFixed(1)} days against ${B.fermDays(C)}`);
  }
});
