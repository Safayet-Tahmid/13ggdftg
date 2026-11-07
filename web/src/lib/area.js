// ENGINE: turning what the user picks (a preset box, a country, typed coordinates, a point with a
// radius, a drawn box) into the set of 1-degree cells the daily files are summed over.
// A cell belongs to an area when its centre is inside it. An area too small to hold any
// centre gets the cell it sits in, so a small place still gets an answer.
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-50m.json';
import { cellId } from './data.js';

// Natural Earth borders, shipped with the site (works offline). Used by the map and here.
export const land = feature(world, world.objects.countries);

// ids are made from the name: the border file reuses some numeric codes (Australia and Ashmore Is.)
const nameId = (n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const COUNTRIES = land.features
  .filter((f) => f.properties?.name && f.geometry)
  .map((f) => ({ id: nameId(f.properties.name), name: f.properties.name, geometry: f.geometry }))
  .sort((a, b) => a.name.localeCompare(b.name));

const polygons = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x, y, poly) {
  if (!inRing(x, y, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) return false;
  return true;
}

function bboxOf(rings) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const ring of rings) for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { w, s, e, n };
}

function boxCells(b) {
  const out = [];
  for (let la = Math.floor(b.s); la < Math.ceil(b.n); la++) {
    if (la + 0.5 < b.s || la + 0.5 > b.n) continue;
    for (let lo = Math.floor(b.w); lo < Math.ceil(b.e); lo++) {
      if (lo + 0.5 < b.w || lo + 0.5 > b.e) continue;
      out.push(cellId(la, lo));
    }
  }
  if (!out.length) out.push(cellId(Math.min(89.9, (b.s + b.n) / 2), Math.min(179.9, (b.w + b.e) / 2)));
  return out;
}

const boxGeom = (b) => ({ type: 'Polygon', coordinates: [[[b.w, b.s], [b.e, b.s], [b.e, b.n], [b.w, b.n], [b.w, b.s]]] });
const r2 = (x) => Math.round(x * 100) / 100;

export function boxArea(b, name, id = 'box') {
  const box = { w: Math.max(-180, b.w), s: Math.max(-90, b.s), e: Math.min(180, b.e), n: Math.min(90, b.n) };
  return { id, kind: 'box', name: name || `${r2(box.s)}° to ${r2(box.n)}°, ${r2(box.w)}° to ${r2(box.e)}°`,
    box, geom: boxGeom(box), cells: boxCells(box), spec: `box:${[box.w, box.s, box.e, box.n].map(r2).join(',')}` };
}

export function presetArea(p) {
  const a = boxArea({ w: p.box[0], s: p.box[1], e: p.box[2], n: p.box[3] }, p.name, p.id);
  return { ...a, kind: 'preset', tested: !!p.tested, spec: `preset:${p.id}` };
}

export function pointArea(lat, lon, km) {
  const dlat = km / 111.32, dlon = km / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const a = boxArea({ w: lon - dlon, s: lat - dlat, e: lon + dlon, n: lat + dlat });
  return { ...a, kind: 'point', name: `${km} km around ${r2(lat)}°, ${r2(lon)}°`, point: [lon, lat], spec: `point:${r2(lat)},${r2(lon)},${km}` };
}

export function countryArea(c) {
  const polys = polygons(c.geometry);
  const set = new Set();
  let biggest = null, bigSize = -1;
  for (const poly of polys) {
    const b = bboxOf([poly[0]]);
    const size = (b.e - b.w) * (b.n - b.s);
    if (size > bigSize) { bigSize = size; biggest = b; }
    for (let la = Math.floor(b.s); la < Math.ceil(b.n); la++)
      for (let lo = Math.floor(b.w); lo < Math.ceil(b.e); lo++)
        if (inPolygon(lo + 0.5, la + 0.5, poly)) set.add(cellId(la, lo));
  }
  if (!set.size && biggest) set.add(cellId((biggest.s + biggest.n) / 2, (biggest.w + biggest.e) / 2));
  const all = bboxOf(polys.map((p) => p[0]));
  return { id: `country-${c.id}`, kind: 'country', name: c.name, box: all, geom: c.geometry, cells: [...set], spec: `country:${c.id}` };
}

// Share links: the area as one short string, and back.
export function areaFromSpec(spec, places) {
  if (!spec) return null;
  const [kind, rest = ''] = spec.split(':');
  const nums = rest.split(',').map(Number);
  if (kind === 'preset') { const p = places.find((x) => x.id === rest); return p ? presetArea(p) : null; }
  if (kind === 'country') { const c = COUNTRIES.find((x) => x.id === rest); return c ? countryArea(c) : null; }
  if (kind === 'box' && nums.length === 4 && nums.every(Number.isFinite)) return boxArea({ w: nums[0], s: nums[1], e: nums[2], n: nums[3] });
  if (kind === 'point' && nums.length === 3 && nums.every(Number.isFinite)) return pointArea(nums[0], nums[1], nums[2]);
  return null;
}

// Checks typed coordinates; returns an error sentence or null.
export function checkBox(b) {
  if (![b.w, b.s, b.e, b.n].every(Number.isFinite)) return 'Fill in all four numbers.';
  if (b.s < -90 || b.n > 90 || b.w < -180 || b.e > 180) return 'Latitude goes from -90 to 90 and longitude from -180 to 180.';
  if (b.s >= b.n) return 'South must be smaller than north.';
  if (b.w >= b.e) return 'West must be smaller than east (boxes across the date line are not supported).';
  return null;
}
