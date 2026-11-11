// Map geography (12 Nov 2026): decoding, tiles in view, the zoom hierarchy, the maximum zoom and the
// shipped files. Map context only: these tests also check that no fire layer was changed by it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { decodeTile, decodeWorld, tilesForView } from '../src/geo/decode.js';
import { GEO_LABEL_IDS, MAX_ZOOM, ZOOM, geoLabelLayers, geoLineLayers, glyphsUrl } from '../src/geo/layers.js';

const read = (p) => readFileSync(new URL(p, import.meta.url));
const theme = { geo: { intl: '#111', adm1: '#222', adm2: '#333', label: '#444', water: '#555', halo: '#fff' } };

test('a packed tile decodes to lines and labels in degrees', () => {
  const f = decodeTile({ v: 1, scale: 1000, l: [[90000, 23000, 500, 0, 0, 500]], p: [[90250, 23250, 'Dhaka', 1500]] });
  assert.deepEqual(f[0].geometry.coordinates, [[90, 23], [90.5, 23], [90.5, 23.5]]);
  assert.deepEqual(f[1].properties, { n: 'Dhaka', a: 1500 });
  assert.deepEqual(f[1].geometry.coordinates, [90.25, 23.25]);
  assert.deepEqual(decodeTile(null), []);
  assert.deepEqual(decodeTile({ v: 2 }), []);
});

test('world.json decodes to border lines and named places', () => {
  const f = decodeWorld({ v: 1, scale: 1000, l: [[88000, 22000, 1000, 1000]], places: [[90000, 24000, 'Bangladesh', 'country', 3, 4.5]] });
  assert.equal(f[0].properties.k, 'border');
  assert.deepEqual(f[1].properties, { k: 'country', n: 'Bangladesh', r: 3, z: 4.5 });
  assert.deepEqual(decodeWorld(null), []);
});

test('tiles in view, including a view across the date line', () => {
  assert.deepEqual(tilesForView([88, 20.5, 92.7, 26.7], 10).sort(), ['N20E080', 'N20E090']);
  const fiji = tilesForView([175, -20, 185, -15], 10).sort();
  assert.deepEqual(fiji, ['S20E170', 'S20W180']);
  assert.ok(tilesForView([170, -20, -170, -15], 10).includes('S20W180'));      // west > east
  assert.equal(tilesForView([-400, -90, 400, 90], 30).length, 72);              // whole world once
});

test('the zoom hierarchy runs world -> countries -> ADM1 -> ADM2 -> maximum zoom', () => {
  assert.ok(ZOOM.continentsUntil <= ZOOM.countries[1] + 0.5);
  assert.ok(ZOOM.countries[0] < ZOOM.adm1Lines && ZOOM.adm1Lines < ZOOM.adm2Lines);
  assert.ok(ZOOM.adm1Labels[1] < ZOOM.adm2Labels[0] && ZOOM.adm2Labels[1] < MAX_ZOOM);
  assert.equal(MAX_ZOOM, 9);
  // single recent detections appear from zoom 6, the selected area is framed up to zoom 7: both below the limit
  const mv = read('../src/components/MapView.jsx').toString();
  assert.match(mv, /RECENT_POINTS_FROM = 6/);
  assert.match(mv, /maxZoom: MAX_ZOOM/);
  for (const m of mv.matchAll(/maxZoom: (\d+(?:\.\d+)?)/g)) assert.ok(+m[1] <= MAX_ZOOM);
});

test('boundary lines sit under the fire layers and labels have their own ids', () => {
  const lines = geoLineLayers(theme).map((l) => l.id);
  assert.deepEqual(lines, ['geo-adm2-lines', 'geo-adm1-lines', 'geo-intl-borders']);
  const labels = geoLabelLayers(theme, false);
  assert.deepEqual(labels.map((l) => l.id), GEO_LABEL_IDS);
  for (const l of labels) assert.equal(l.type, 'symbol');
  // narrow screens: same layers, labels start later
  const narrow = geoLabelLayers(theme, true);
  for (let i = 0; i < labels.length; i++) assert.ok((narrow[i].minzoom || 0) >= (labels[i].minzoom || 0));
  const mv = read('../src/components/MapView.jsx').toString();
  assert.ok(mv.indexOf('...geoLineLayers(theme)') < mv.indexOf("id: 'fires'"), 'lines are in the basemap, under the fire layers');
  assert.ok(mv.indexOf('geoLabelLayers(theme') > mv.indexOf("id: 'fires'"), 'labels come after the fire layers');
});

test('fonts are loaded from the site itself', () => {
  assert.equal(glyphsUrl({ origin: 'https://squadronzero.github.io', pathname: '/squadron-zero/' }),
    'https://squadronzero.github.io/squadron-zero/geo/fonts/{fontstack}/{range}.pbf');
  assert.equal(glyphsUrl({ origin: 'http://127.0.0.1:8765', pathname: '/index.html' }), 'http://127.0.0.1:8765/geo/fonts/{fontstack}/{range}.pbf');
});

const idxUrl = new URL('../public/geo/index.json', import.meta.url);
test('the shipped geography files match their index, every tile is listed, every country has a source', { skip: !existsSync(idxUrl) }, () => {
  const ix = JSON.parse(readFileSync(idxUrl));
  for (const [path, f] of Object.entries(ix.files)) {
    const body = readFileSync(new URL(`../public/geo/${path}`, import.meta.url));
    assert.equal(body.length, f.bytes, path);
    assert.equal(createHash('sha256').update(body).digest('hex'), f.sha256, path);
  }
  for (const k of ix.tiles.adm1) assert.ok(ix.files[`adm1/${k}.json`], k);
  for (const k of ix.tiles.adm2_attrib) assert.ok(ix.files[`adm2/attrib/${k}.json`], k);
  for (const k of ix.tiles.adm2_odbl) assert.ok(ix.files[`adm2/odbl/${k}.json`], k);
  for (const [iso, c] of Object.entries(ix.countries)) {
    if (c.adm2?.dataset) assert.ok(c.adm2.licence && c.adm2.source, `${iso} ADM2 licence and source`);
    if (c.adm2?.dataset) assert.doesNotMatch(c.adm2.licence, /ShareAlike|Direct Permission/i, iso);
    if (c.adm1) assert.ok(c.adm1.licence, `${iso} ADM1 licence`);
  }
  // Bangladesh: 8 divisions (Natural Earth still has 7) and 64 districts, by name
  assert.equal(ix.countries.BGD.adm1.units, 8);
  assert.equal(ix.countries.BGD.adm2.units, 64);
  assert.ok(ix.total_bytes < 25e6, `geography stays small (${ix.total_bytes} bytes)`);
  // what the site loads first stays small, and it can cache-bust every tile it may ask for
  const tj = JSON.parse(readFileSync(new URL('../public/geo/tiles.json', import.meta.url)));
  assert.ok(ix.files['world.json'].bytes + ix.files['tiles.json'].bytes < 400e3);
  for (const k of tj.tiles.adm2_attrib) assert.ok(tj.v[`adm2/attrib/${k}.json`], k);
  const world = decodeWorld(JSON.parse(readFileSync(new URL('../public/geo/world.json', import.meta.url))));
  const names = new Set(world.filter((f) => f.properties.k !== 'border').map((f) => f.properties.n));
  for (const n of ['Asia', 'Africa', 'Europe', 'Indian Ocean', 'Bangladesh', 'India', 'China', 'Australia']) assert.ok(names.has(n), n);
});
