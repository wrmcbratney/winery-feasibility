// Page smoke test: the built page loads, both tabs render, and the main interactions run without errors.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('built page loads and interactions run', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  const errors = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.test/', beforeParse(w) {
    w.ResizeObserver = class { observe() {} };
    Object.defineProperty(w.SVGElement.prototype, 'clientWidth', { get() { return 800 } });
    Object.defineProperty(w.SVGElement.prototype, 'clientHeight', { get() { return 500 } });
    w.addEventListener('error', e => errors.push(e.message));
  } });
  await new Promise(r => setTimeout(r, 300));
  const w = dom.window, $ = id => w.document.getElementById(id), q = s => w.document.querySelector(s);
  assert.match($('headline').textContent, /\$/);
  $('tbFlow').click();
  assert.strictEqual($('flowView').hidden, false);
  assert.ok($('sF').innerHTML.length > 1000 && $('sL').innerHTML.length > 1000 && $('sE').innerHTML.length > 1000);
  for (const r of ['year', 'vintage', 'harvest']) q(`[data-rng="${r}"]`).click();
  q('[data-unit="ves"]').click();
  $('scrub').value = 120; $('scrub').dispatchEvent(new w.Event('input'));
  const before = +$('scrub').value;
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(+$('scrub').value, before + 7, 'shift + right arrow moves a week');
  $('sF').dispatchEvent(new w.MouseEvent('click', { clientX: 300, bubbles: true }));
  const lockedAt = +$('scrub').value;
  assert.ok($('flowView').classList.contains('locked'), 'clicking a chart locks the date');
  $('sF').dispatchEvent(new w.MouseEvent('pointermove', { clientX: 600, bubbles: true }));
  assert.strictEqual(+$('scrub').value, lockedAt, 'a locked date ignores the mouse');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(!$('flowView').classList.contains('locked'), 'esc unlocks');
  $('snap').querySelector('[data-loc="barrel"]').click();
  assert.match($('snap').querySelector('.detail').textContent, /^Barrels:/, 'tapping a location pins its lot details');
  assert.match($('laborNow').textContent, /hrs/);
  $('addVar').value = 'Syrah'; $('addWine').click();
  q('[data-d="fruit"][data-v="estate"]').click();
  q('[data-d="facility"][data-v="custom"]').click();
  $('tbMoney').click();
  await new Promise(r => setTimeout(r, 50));
  assert.deepStrictEqual(errors, []);
});
