// VEN 235 Winery Design (UC Davis coursework, the owner's own workbook) as an independent benchmark. The workbook is not
// in the repo; its inputs and results are transcribed here. Two file versions survive and disagree in places, so each
// is kept as its own case. Assumptions that are uncertain are marked, not resolved.
const { expectedArrival } = require('../src/harvest.js');

const VARIETIES = [
  // tons (unit uncertain, most likely short tons), mean day and standard deviation of arrival, color
  { name: 'Chardonnay', tons: 80, mean: 8.5, sd: 1.5, color: 'white' },
  { name: 'Sauvignon Blanc', tons: 80, mean: 16.5, sd: 2.5, color: 'white' },
  { name: 'Pinot Noir', tons: 65, mean: 10.5, sd: 2.5, color: 'red' },
  { name: 'Cabernet Sauvignon', tons: 120, mean: 24.5, sd: 2.5, color: 'red' },
];
const CASES = {
  // xlsx: 3,500 L fermentors at 90% working volume; tank days (pre + lag + ferm + post) fixed per variety
  xlsx: { tankL: 3500, working: 0.9, tankDays: { 'Chardonnay': 18, 'Sauvignon Blanc': 18, 'Pinot Noir': 15, 'Cabernet Sauvignon': 32 }, peak: 47.01, peakDay: 25 },
  // ods (later): 2,500 L fermentors; ferment days from 55 e^(-0.07 T) at 18, 20, 25, 25 C, so Chardonnay is 20 days
  ods: { tankL: 2500, working: 0.9, tankDays: { 'Chardonnay': 2 + 2 + 16, 'Sauvignon Blanc': 2 + 2 + 14, 'Pinot Noir': 4 + 1 + 10, 'Cabernet Sauvignon': 0 + 1 + 10 + 21 }, peak: null },
};
const JUICE_L = 480, MUST_L = 720; // litres per ton; whether 480 is free run only is uncertain
const CRUSH_HRS = 6, CRUSH_MAX_TPH = 4.81; // one 8-hour shift less 2 hours; workbook's overall peak tons per hour
const fermDays = tC => Math.ceil(55 * Math.exp(-0.07 * tC));

// The workbook's method: each day's must or juice over a fermentor's working volume, summed over a trailing window as
// long as the variety's tank time. Arrival comes from this model's harvest module, so this checks the arrival code.
// arrival='model' uses this model's harvest module (the curve integrated over each day); arrival='workbook' samples the
// curve's height once per day as the workbook did (at day minus half, with 3.142 for pi), to check the method itself.
function workbookArrival(v) {
  const out = [];
  for (let d = 1; d <= 49; d++) out.push({ day: d, tons: v.tons / (v.sd * Math.sqrt(2 * 3.142)) * Math.exp(-0.5 * ((d - 0.5 - v.mean) / v.sd) ** 2) });
  return out;
}
function benchmark(caseKey, arrival = 'model') {
  const C = CASES[caseKey], daily = {}, byDay = {};
  for (const v of VARIETIES) {
    const arr = arrival === 'workbook' ? workbookArrival(v) : expectedArrival({ tons: v.tons, pick: v.mean, pickSD: v.sd }, { harvestSpread: 1 });
    daily[v.name] = arr;
    for (const a of arr) byDay[a.day] = (byDay[a.day] || 0) + a.tons;
  }
  let peak = 0, at = null;
  for (let d = 0; d <= 70; d++) {
    let need = 0;
    for (const v of VARIETIES) {
      const J = C.tankDays[v.name], L = v.color === 'red' ? MUST_L : JUICE_L;
      for (const a of daily[v.name]) if (a.day > d - J && a.day <= d) need += a.tons * L / (C.tankL * C.working);
    }
    if (need > peak) { peak = need; at = d; }
  }
  const maxTph = Math.max(...Object.values(byDay)) / CRUSH_HRS;
  return { peak, at, maxTph };
}
module.exports = { workbookArrival, VARIETIES, CASES, JUICE_L, MUST_L, CRUSH_HRS, CRUSH_MAX_TPH, fermDays, benchmark };
