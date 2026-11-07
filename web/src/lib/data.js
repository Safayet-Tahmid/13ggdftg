// ENGINE (do not change unless you work on the data): loading and decoding the files written by
// the pipeline's export stage (pipeline/shift/export.py). Every number on the site comes from
// these files; the browser only sums them over the area the user picks.

const BASE = 'data/';
const cache = new Map();

async function bytes(path) {
  if (cache.has(path)) return cache.get(path);
  const p = (async () => {
    const res = await fetch(BASE + path);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    // GitHub Pages serves .gz files as they are; some local servers unpack them on the way.
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      const ds = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')));
      return new Uint8Array(await ds.arrayBuffer());
    }
    return buf;
  })();
  cache.set(path, p);
  try { return await p; } catch (e) { cache.delete(path); throw e; }
}

export async function json(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function csv(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const lines = (await res.text()).trim().split(/\r?\n/);
  const head = splitCSV(lines[0]);
  return lines.slice(1).map((l) => {
    const v = splitCSV(l);
    const o = {};
    head.forEach((h, i) => {
      const x = v[i];
      o[h] = x === '' || x === undefined ? null : x === 'True' ? true : x === 'False' ? false : (isNaN(+x) ? x : +x);
    });
    return o;
  });
}

function splitCSV(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// ---------------------------------------------------------------- names, as the pipeline writes them
export function tileName(lat0, lon0) {
  const ns = lat0 >= 0 ? 'N' : 'S';
  const ew = lon0 >= 0 ? 'E' : 'W';
  return `${ns}${String(Math.abs(Math.trunc(lat0))).padStart(2, '0')}${ew}${String(Math.abs(Math.trunc(lon0))).padStart(3, '0')}`;
}

// 1-degree cell id: row from the south (0..179) * 360 + column from the date line (0..359)
export const cellId = (lat, lon) => (Math.floor(lat) + 90) * 360 + (Math.floor(lon) + 180);
export const cellLat = (id) => Math.floor(id / 360) - 90;   // south edge
export const cellLon = (id) => (id % 360) - 180;            // west edge

// ---------------------------------------------------------------- binary layouts
function daily(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(0, true);
  let o = 4;
  const cells = new Float32Array(buf.slice(o, o + 4 * n).buffer); o += 4 * n;
  const frp = new Float32Array(buf.slice(o, o + 4 * n).buffer); o += 4 * n;
  const day = new Uint16Array(buf.slice(o, o + 2 * n).buffer); o += 2 * n;
  const cell = buf.subarray(o, o + n); o += n;
  const src = buf.subarray(o, o + n);
  return { n, cells, frp, day, cell, src };
}

export async function monthLayer(ym) {
  const buf = await bytes(`monthly/${ym}.bin.gz`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(0, true);
  const ids = new Uint32Array(buf.slice(4, 4 + 4 * n).buffer);
  const cells = new Float32Array(buf.slice(4 + 4 * n, 4 + 8 * n).buffer);
  const frp = new Float32Array(buf.slice(4 + 8 * n, 4 + 12 * n).buffer);
  const features = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(ids[i] / 1440), c = ids[i] % 1440;
    features[i] = { type: 'Feature', geometry: { type: 'Point', coordinates: [-180 + (c + 0.5) * 0.25, -90 + (r + 0.5) * 0.25] },
      properties: { cells: Math.round(cells[i] * 10) / 10, frp: Math.round(frp[i]) } };
  }
  return { type: 'FeatureCollection', features };
}

let zonesP = null;
function zones() {
  if (!zonesP) zonesP = bytes('zones.bin.gz').catch((e) => { zonesP = null; throw e; });
  return zonesP;
}

// ---------------------------------------------------------------- the area (a set of 1-degree cells)
export const MAX_TILES = 40;   // 10-degree daily files one area may load (keeps the browser responsive)

export function tilesOfCells(cells) {
  const seen = new Map();
  for (const id of cells) {
    const la = Math.floor(cellLat(id) / 10) * 10, lo = Math.floor(cellLon(id) / 10) * 10;
    const name = tileName(la, lo);
    if (!seen.has(name)) seen.set(name, { name, lat0: la, lon0: lo });
  }
  return [...seen.values()];
}

export function zonesOfCells(cells) {
  const s = new Set();
  for (const id of cells) s.add(Math.floor((cellLat(id) + 90) / 30) * 12 + Math.floor((cellLon(id) + 180) / 30));
  return [...s];
}

function lookup(cells) {
  const m = new Uint8Array(180 * 360);
  for (const id of cells) m[id] = 1;
  return m;
}

const fineKey = (lat, lon) => tileName(Math.floor(lat / 2.5) * 2.5, Math.floor(lon / 2.5) * 2.5);

// Daily sums for an area, where every value came from, and whether each day had data.
export async function areaSeries(meta, area) {
  const N = meta.days;
  const cells = new Float64Array(N), frp = new Float64Array(N);
  const filled = new Uint8Array(N);                 // 1 = some of the value was filled from a partner satellite
  const fineW = new Map();                          // 2.5-degree factor cell -> fire before 2012 (uncertainty weight)
  const fineAll = new Map();                        // 2.5-degree factor cell -> all fire (cloud weight)
  const switchDay = dayIndex(meta, '2012-01-20');
  const inArea = lookup(area.cells);
  const wanted = tilesOfCells(area.cells).filter((t) => meta.tiles[t.name]);
  await Promise.all(wanted.map(async (t) => {
    const d = daily(await bytes(`daily/${t.name}.bin.gz`));
    for (let i = 0; i < d.n; i++) {
      const row = Math.floor(d.cell[i] / 10), col = d.cell[i] % 10;
      const lat = t.lat0 + row, lon = t.lon0 + col;
      if (!inArea[(lat + 90) * 360 + (lon + 180)]) continue;
      const k = d.day[i];
      cells[k] += d.cells[i]; frp[k] += d.frp[i];
      const s = d.src[i];
      if (s === 1 || s === 2 || s === 4 || s === 5) filled[k] = 1;
      const key = fineKey(lat + 0.5, lon + 0.5);
      fineAll.set(key, (fineAll.get(key) || 0) + d.cells[i]);
      if (k < switchDay) fineW.set(key, (fineW.get(key) || 0) + d.cells[i]);
    }
  }));
  // availability: a day is "no data" when any 30-degree zone the area touches had no satellite at all
  const z = await zones();
  const nodata = new Uint8Array(N);
  for (const zi of zonesOfCells(area.cells)) {
    const row = z.subarray(zi * N, zi * N + N);
    for (let k = 0; k < N; k++) if (row[k] === 5) nodata[k] = 1;
  }
  return { cells, frp, filled, nodata, fineW, fineAll, tiles: wanted.length };
}

// One row per 1-degree cell and day with fire, inside the area and dates (the search CSV, D33).
export async function cellRows(meta, area, from, to, limit = 1_000_000) {
  const inArea = lookup(area.cells);
  const out = [];
  let truncated = false;
  for (const t of tilesOfCells(area.cells).filter((x) => meta.tiles[x.name])) {
    const d = daily(await bytes(`daily/${t.name}.bin.gz`));
    for (let i = 0; i < d.n; i++) {
      const k = d.day[i];
      if (k < from || k > to) continue;
      const row = Math.floor(d.cell[i] / 10), col = d.cell[i] % 10;
      const lat = t.lat0 + row, lon = t.lon0 + col;
      if (!inArea[(lat + 90) * 360 + (lon + 180)]) continue;
      if (out.length >= limit) { truncated = true; break; }
      out.push({ k, lat: lat + 0.5, lon: lon + 0.5, cells: d.cells[i], frp: d.frp[i], src: d.src[i] });
    }
  }
  out.sort((a, b) => a.k - b.k || a.lat - b.lat || a.lon - b.lon);
  return { rows: out, truncated };
}

// ---------------------------------------------------------------- dates
export function dayIndex(meta, iso) {
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(meta.start + 'T00:00:00Z')) / 86400000);
}

export function dateOf(meta, k) {
  return new Date(Date.parse(meta.start + 'T00:00:00Z') + k * 86400000);
}

export const iso = (meta, k) => dateOf(meta, k).toISOString().slice(0, 10);

// The last day with data: meta.last_data_day from the 7 Nov export, else the cut-off day minus one.
export function lastDataDay(meta) {
  if (meta.last_data_day) return dayIndex(meta, meta.last_data_day);
  return meta.days - 2;
}
