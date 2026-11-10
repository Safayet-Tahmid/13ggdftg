// Tests for the 2D map and 3D globe helpers (run: npm test, Node 20 or newer, no extra packages).
// The data tests run only when SHIFT_DATA_DIR points at an unpacked site_data folder
// (the folder that holds meta.json); in CI without data they are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  MAP_STEPS, cellInfo, cellSquare, countStatus, days_in_month, dragBox, eraOf, factorCell, imagery,
  legendRows, squaresOf, stepExpression, tenDegTile, wrapLon, zoneBox, zoneOf,
} from '../src/lib/geo.js';
import { cellId, tileName, zonesOfCells } from '../src/lib/data.js';

const ramp = ['#1', '#2', '#3', '#4', '#5', '#6'];

test('legend rows follow the map colour steps exactly', () => {
  for (const v of ['frp', 'cells']) {
    const e = stepExpression(v, ramp);
    assert.deepEqual(e.slice(0, 3), ['step', ['get', v], '#1']);
    const steps = e.slice(3).filter((_, i) => i % 2 === 0);
    assert.deepEqual(steps, MAP_STEPS[v]);
    const rows = legendRows(v, ramp);
    assert.equal(rows.length, 6);
    assert.equal(rows[0].label, `under ${MAP_STEPS[v][0].toLocaleString('en-GB')}`);
    assert.match(rows[5].label, /or more$/);
  }
});

test('a map value is drawn on its true 0.25-degree cell, values unchanged', () => {
  const g = cellSquare(150.125, -34.125);
  assert.deepEqual(g.coordinates[0][0], [150, -34.25]);
  assert.deepEqual(g.coordinates[0][2], [150.25, -34]);
  const fc = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [150.125, -34.125] }, properties: { lon: 150.125, lat: -34.125, cells: 312, frp: 80580 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [0.125, 0.125] }, properties: { lon: 0.125, lat: 0.125, cells: 0.5, frp: 0 } },
  ] };
  const sq = squaresOf(fc);
  assert.equal(sq.features.length, 2);
  assert.deepEqual(sq.features.map((f) => f.properties), fc.features.map((f) => f.properties));
  assert.equal(squaresOf(null).features.length, 0);
});

test('longitudes wrap to -180..180 (antimeridian)', () => {
  assert.equal(wrapLon(190), -170);
  assert.equal(wrapLon(-190), 170);
  assert.equal(wrapLon(180), -180);
  assert.equal(wrapLon(540), -180);
  assert.equal(wrapLon(0), 0);
  assert.equal(wrapLon(-179.75), -179.75);
});

test('boxes drawn on the flat map and on the globe', () => {
  // a normal drag, snapped to 0.25 degrees
  assert.deepEqual(dragBox({ lng: 88.1, lat: 20.9 }, { lng: 92.6, lat: 26.4 }), { w: 88, e: 92.5, s: 21, n: 26.5 });
  // the same drag in the next copy of the world on the flat map
  assert.deepEqual(dragBox({ lng: 448.1, lat: 20.9 }, { lng: 452.6, lat: 26.4 }), { w: 88, e: 92.5, s: 21, n: 26.5 });
  // flat map, dragged across the date line from one copy into the next
  assert.equal(dragBox({ lng: 170, lat: -20 }, { lng: 190, lat: -10 }).crossesDateLine, true);
  // flat map, a very wide box that does not cross the line is allowed
  assert.deepEqual(dragBox({ lng: -170, lat: -10 }, { lng: 170, lat: 10 }), { w: -170, e: 170, s: -10, n: 10 });
  // globe: longitudes come wrapped, a jump of more than 180 degrees crossed the line
  assert.equal(dragBox({ lng: 170, lat: -20 }, { lng: -170, lat: -10 }, true).crossesDateLine, true);
  assert.deepEqual(dragBox({ lng: 140.2, lat: -38.4 }, { lng: 154.1, lat: -28.2 }, true), { w: 140.25, e: 154, s: -38.5, n: -28.25 });
  // latitude kept inside the map's limits
  assert.equal(dragBox({ lng: 0, lat: -89 }, { lng: 10, lat: 89 }).s, -85);
});

test('each month carries the right record (D19, D20, D27)', () => {
  assert.equal(eraOf('2002-01'), 'terra_only');
  assert.equal(eraOf('2002-06'), 'terra_only');
  assert.equal(eraOf('2002-07'), 'modis');
  assert.equal(eraOf('2011-12'), 'modis');
  assert.equal(eraOf('2012-01'), 'switch');
  assert.equal(eraOf('2012-02'), 'viirs');
  assert.equal(eraOf('2026-10'), 'viirs');
});

test('cell names match the pipeline names (factor cells, tiles, zones)', () => {
  for (let i = 0; i < 2000; i++) {
    const lat = -89.875 + 0.25 * Math.floor(Math.random() * 719), lon = -179.875 + 0.25 * Math.floor(Math.random() * 1439);
    assert.equal(factorCell(lat, lon), tileName(Math.floor(lat / 2.5) * 2.5, Math.floor(lon / 2.5) * 2.5));
    assert.equal(tenDegTile(lat, lon), tileName(Math.floor(lat / 10) * 10, Math.floor(lon / 10) * 10));
    assert.deepEqual([zoneOf(lat, lon)], zonesOfCells([cellId(lat, lon)]));
  }
  assert.deepEqual(zoneBox(zoneOf(-34.1, 150.1)), { w: 150, e: 180, s: -60, n: -30 });
});

test('month lengths, leap years included', () => {
  assert.equal(days_in_month('2024-02'), 29);
  assert.equal(days_in_month('2023-02'), 28);
  assert.equal(days_in_month('2000-02'), 29);
  assert.equal(days_in_month('2100-02'), 28);
  assert.equal(days_in_month('2026-10'), 31);
});

test('zone-day status counts keep "no data" apart from zero fire', () => {
  const row = Uint8Array.from([0, 0, 1, 2, 5, 5, 0, 3, 4]);
  assert.deepEqual(countStatus(row, 0, 9), { primary: 3, filled: 4, nodata: 2, days: 9 });
  assert.deepEqual(countStatus(row, 4, 6), { primary: 0, filled: 0, nodata: 2, days: 2 });
  assert.deepEqual(countStatus(row, 7, 20), { primary: 0, filled: 2, nodata: 0, days: 2 });
});

test('cell panel shows only published fields, with the right uncertainty', () => {
  const unc = { range_pct: { cells: { S35E150: Array(12).fill(10).map((x, i) => x + i) }, frp: { S35E150: Array(12).fill(20) } } };
  const cloud = { until: '2026-08', flags: { S40E150: ['2005-08'] } };
  const m = cellInfo({ lon: 150.125, lat: -34.125, cells: 2.5, frp: 40 }, '2005-08', { unc, cloud });
  assert.equal(m.era, 'modis');
  assert.equal(m.factorCell, 'S35E150');
  assert.equal(m.rangeCells, 17);   // August = index 7
  assert.equal(m.rangeFrp, 20);
  assert.equal(m.cloudFlag, true);
  assert.deepEqual(m.bounds, { w: 150, e: 150.25, s: -34.25, n: -34 });
  const v = cellInfo({ lon: 150.125, lat: -34.125, cells: 312, frp: 80580 }, '2019-12', { unc, cloud });
  assert.equal(v.era, 'viirs');
  assert.equal(v.rangeCells, null);     // observed months carry no factor range
  assert.equal(v.cloudFlag, false);
  const late = cellInfo({ lon: 150.125, lat: -34.125, cells: 1, frp: 1 }, '2026-10', { unc, cloud });
  assert.equal(late.cloudFlag, null);   // cloud data stops in 2026-08: unknown, not "not cloudy"
  assert.equal(cellInfo({ lon: 0.125, lat: 0.125, cells: 0, frp: 0 }, '2005-08', {}).rangeCells, null);
  // nothing in the panel that the files do not hold
  assert.deepEqual(Object.keys(m).sort(), ['bounds', 'cells', 'cloudFlag', 'era', 'factorCell', 'frp', 'month',
    'rangeCells', 'rangeFrp', 'tile', 'zone', 'zoneDays'].sort());
});

test('satellite pictures: NASA GIBS layers by date', () => {
  assert.equal(imagery('standard'), null);
  assert.match(imagery('satellite').tiles[0], /^https:\/\/gibs-a\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/wmts\.cgi\?.*LAYER=BlueMarble_ShadedRelief_Bathymetry.*FORMAT=image%2Fjpeg$/);
  assert.equal(imagery('satellite').tiles.length, 3);
  for (const k of ['{z}', '{y}', '{x}']) assert.ok(imagery('satellite').tiles[0].includes(k));
  assert.equal(imagery('daily', '2000-02-23'), null);
  assert.match(imagery('daily', '2000-02-24').tiles[0], /MODIS_Terra_CorrectedReflectance_TrueColor\/default\/2000-02-24\//);
  assert.match(imagery('daily', '2015-11-23').tiles[0], /MODIS_Terra/);
  assert.match(imagery('daily', '2015-11-24').tiles[0], /VIIRS_SNPP_CorrectedReflectance_TrueColor\/default\/2015-11-24\//);
  for (const k of ['satellite']) assert.ok(!/key=|token=/i.test(imagery(k).tiles[0]), 'no keys in public code');
});

// ---------------------------------------------------------------- with the released data
const DATA = process.env.SHIFT_DATA_DIR;
const haveData = DATA && existsSync(join(DATA, 'meta.json'));

function serveData() {
  globalThis.fetch = async (url) => {
    const p = join(DATA, String(url).replace(/^data\//, ''));
    const buf = await readFile(p);
    return new Response(buf, { status: 200 });
  };
}

test('map equals charts: the monthly map file and the daily files agree', { skip: !haveData && 'set SHIFT_DATA_DIR' }, async () => {
  serveData();
  const { monthLayer, decodeDaily, dayIndex } = await import('../src/lib/data.js');
  const meta = JSON.parse(await readFile(join(DATA, 'meta.json'), 'utf8'));
  const cases = [['S40E150', '2019-12'], ['N20E090', '2026-03'], ['S10E020', '2005-08'], ['N20E080', '2012-01'], ['N20E080', '2024-02']];
  for (const [tile, ym] of cases) {
    const la = (tile[0] === 'N' ? 1 : -1) * +tile.slice(1, 3), lo = (tile[3] === 'E' ? 1 : -1) * +tile.slice(4, 7);
    // a plain Uint8Array, as in the browser (a Node Buffer's slice() would share memory)
    const d = decodeDaily(new Uint8Array(gunzipSync(await readFile(join(DATA, `daily/${tile}.bin.gz`)))));
    const k0 = dayIndex(meta, `${ym}-01`), k1 = k0 + days_in_month(ym);
    let dc = 0, df = 0;
    for (let i = 0; i < d.n; i++) if (d.day[i] >= k0 && d.day[i] < k1) { dc += d.cells[i]; df += d.frp[i]; }
    const m = await monthLayer(ym);
    let mc = 0, mf = 0, n = 0;
    for (const f of m.features) {
      const { lon, lat, cells, frp } = f.properties;
      if (lat >= la && lat < la + 10 && lon >= lo && lon < lo + 10) { mc += cells; mf += frp; n++; }
    }
    // the map shows values rounded to 0.1 hotspot and 1 MW per cell, so allow that rounding only
    assert.ok(Math.abs(mc - dc) <= 0.05 * n + 1e-6 * dc + 0.01, `${tile} ${ym} cells map ${mc} daily ${dc}`);
    assert.ok(Math.abs(mf - df) <= 0.5 * n + 1e-6 * df + 0.5, `${tile} ${ym} frp map ${mf} daily ${df}`);
  }
});

test('map cell centres sit on the 0.25-degree grid', { skip: !haveData && 'set SHIFT_DATA_DIR' }, async () => {
  serveData();
  const { monthLayer } = await import('../src/lib/data.js');
  const m = await monthLayer('2019-12');
  assert.ok(m.features.length > 1000);
  for (const f of m.features.slice(0, 5000)) {
    const { lon, lat } = f.properties;
    assert.deepEqual(f.geometry.coordinates, [lon, lat]);
    assert.equal(((lon + 180) / 0.25) % 1, 0.5);
    assert.equal(((lat + 90) / 0.25) % 1, 0.5);
    assert.ok(f.properties.cells > 0);
  }
});

test('satellite gaps of a month: real gaps counted, cut-off day not', { skip: !haveData && 'set SHIFT_DATA_DIR' }, async () => {
  serveData();
  const { zoneMonth } = await import('../src/lib/data.js');
  const meta = JSON.parse(await readFile(join(DATA, 'meta.json'), 'utf8'));
  const mar02 = await zoneMonth(meta, '2002-03');
  assert.equal(mar02.length, 72);
  assert.ok(mar02.some((z) => z.nodata > 0), 'March 2002 had days without data');
  assert.ok(mar02.every((z) => z.days === 31 && z.primary + z.filled + z.nodata === 31));
  const oct26 = await zoneMonth(meta, '2026-10');
  assert.ok(oct26.every((z) => z.days === 28), 'counted to the last data day, 28 Oct');
  assert.ok(oct26.every((z) => z.nodata === 0), 'the cut-off day 29 Oct is not reported as a gap');
});
