// Weather context (D39): the maths of the comparison, the shipped data files and the "context, not cause" wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { compareWeather, windowValue, MIN_YEARS } from '../src/weather/weather.js';

const read = (p) => readFileSync(new URL(p, import.meta.url));
const text = read('../src/content/text.js').toString();
const panel = read('../src/weather/WeatherContext.jsx').toString();
const method = read('../src/pages/Method.jsx').toString();

// a fake area: one value per day from 2003-01-01, the same every year except 2020, which is dry, hot and windy
function fakeArea() {
  const start = Date.parse('2003-01-01T00:00:00Z');
  const n = Math.round((Date.parse('2021-12-31T00:00:00Z') - start) / 86400000) + 1;
  const values = { PRECTOTCORR: [], RH2M: [], T2M_MAX: [], WS2M: [], GWETROOT: [] };
  for (let k = 0; k < n; k++) {
    const y = new Date(start + k * 86400000).getUTCFullYear();
    const dry = y === 2020;
    values.PRECTOTCORR.push(dry ? 0.5 : 2 + (y % 3) * 0.1);
    values.RH2M.push(dry ? 50 : 70);
    values.T2M_MAX.push(dry ? 35 : 30);
    values.WS2M.push(dry ? 4 : 2);
    values.GWETROOT.push(dry ? 0.3 : 0.6);
  }
  return { start: '2003-01-01', end: '2021-12-31', values };
}
const yearsFor = (target) => Array.from({ length: 19 }, (_, i) => 2003 + i)
  .map((y) => ({ year: y, target: y === target, fromIso: `${y}-10-01`, toIso: `${y}-10-31` }));

test('rain is a total over the window, the others are means, and a missing day leaves the year out', () => {
  const w = { start: '2003-01-01', values: { PRECTOTCORR: [1, 2, 3], RH2M: [60, 70, null] } };
  assert.equal(windowValue(w, 'PRECTOTCORR', 0, 2), 6);
  assert.equal(windowValue(w, 'RH2M', 0, 1), 65);
  assert.equal(windowValue(w, 'RH2M', 0, 2), null);
  assert.equal(windowValue(w, 'PRECTOTCORR', 1, 5), null);       // runs past the data
});

test('the dry year ranks 1 for rain, humidity and soil, and 1 for heat and wind', () => {
  const res = compareWeather(fakeArea(), yearsFor(2020), [2003, 2025], '2021-12-31T00:00:00Z');
  const by = Object.fromEntries(res.rows.map((r) => [r.key, r]));
  for (const k of ['PRECTOTCORR', 'RH2M', 'GWETROOT', 'T2M_MAX', 'WS2M']) assert.equal(by[k].rank, 1, k);
  assert.equal(by.PRECTOTCORR.value, 31 * 0.5);
  assert.equal(by.RH2M.diff, -20);
  assert.equal(by.T2M_MAX.diff, 5);
  assert.equal(by.PRECTOTCORR.baseCount, 18);                       // the chosen year is left out of the normal
  assert.equal(by.PRECTOTCORR.of, 19);
  assert.ok(res.provisional === false);
});

test('a normal needs at least MIN_YEARS usable years', () => {
  const years = yearsFor(2020).filter((y) => y.year >= 2020 - MIN_YEARS + 1 && y.year <= 2020);   // MIN_YEARS - 1 other years
  const res = compareWeather(fakeArea(), years, [2003, 2025], '2021-12-31T00:00:00Z');
  assert.equal(res.rows[0].normal, null);
});

test('recent dates are labelled provisional', () => {
  const res = compareWeather(fakeArea(), yearsFor(2021), [2003, 2025], '2021-12-31T00:00:00Z');
  assert.equal(res.provisional, true);
});

test('weather is context, never a cause (wording guard)', () => {
  const block = text.match(/weather: \{[\s\S]*?\n  \},/);
  assert.ok(block, 'weather text block present');
  assert.match(block[0], /notCause: 'Context, not cause/);
  assert.doesNotMatch(block[0], /caused by|due to (the )?(drought|dry|weather|heat)|because of (the )?(drought|dry|weather|heat)|risk score|danger rating:/i);
  assert.match(panel, /\{W\.notCause\}/);                           // shown every time the table is shown
  assert.match(method, /does not show why fires burned/);
  assert.match(text, /They are not fire danger ratings or emergency warnings/);
});

test('the shipped weather files match their index and the committed rules', () => {
  const dir = new URL('../public/context/power/', import.meta.url);
  const idx = JSON.parse(readFileSync(new URL('index.json', dir)));
  const rulesSha = createHash('sha256').update(read('../../context/power_rules.json')).digest('hex');
  assert.equal(idx.rules_sha256, rulesSha, 'files were made with the committed rules');
  const files = readdirSync(dir).filter((f) => f !== 'index.json');
  assert.equal(files.length, Object.keys(idx.files).length);
  for (const [id, f] of Object.entries(idx.files)) {
    const body = readFileSync(new URL(f.file, dir));
    assert.equal(createHash('sha256').update(body).digest('hex'), f.sha256, id);
    const d = JSON.parse(body);
    const n = (Date.parse(d.end) - Date.parse(d.start)) / 86400000 + 1;
    for (const [p, v] of Object.entries(d.values)) assert.equal(v.length, n, `${id} ${p}`);
    assert.ok(d.points.length >= 1 && d.points.length + (d.water_points?.length || 0) === 9, id);
  }
});
