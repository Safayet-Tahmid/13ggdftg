// Geography tiles (written by geo/prepare_geo.py) to GeoJSON for MapLibre.
// A tile is { v: 1, scale, l: [[x0, y0, dx, dy, dx, dy, ...], ...], p: [[x, y, name, areaKm2], ...] }:
// lines as integers (first point, then differences) and label points. Map context only.
export function decodeTile(t) {
  if (!t || t.v !== 1 || !t.scale) return [];
  const s = t.scale;
  const out = [];
  for (const pk of t.l || []) {
    let x = pk[0], y = pk[1];
    const coords = [[x / s, y / s]];
    for (let i = 2; i + 1 < pk.length; i += 2) { x += pk[i]; y += pk[i + 1]; coords.push([x / s, y / s]); }
    if (coords.length > 1) out.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  }
  for (const [x, y, n, a] of t.p || []) {
    out.push({ type: 'Feature', properties: { n, a }, geometry: { type: 'Point', coordinates: [x / s, y / s] } });
  }
  return out;
}

// world.json: international border lines (packed like the tiles) and places
// [x, y, name, kind, labelrank, minLabel] for continents, oceans and countries.
export function decodeWorld(w) {
  if (!w || w.v !== 1 || !w.scale) return [];
  const s = w.scale;
  const out = decodeTile({ v: 1, scale: s, l: w.l }).map((f) => ({ ...f, properties: { k: 'border' } }));
  for (const [x, y, n, k, r, z] of w.places || []) {
    out.push({ type: 'Feature', properties: { k, n, r, z }, geometry: { type: 'Point', coordinates: [x / s, y / s] } });
  }
  return out;
}

// Tile keys covering a view [w, s, e, n] (degrees) for tiles of `size` degrees. Views that cross
// the date line (west > east, or beyond +-180) wrap around. Keys look like N20E090 / S30W060.
export function tilesForView(bounds, size) {
  let [w, s, e, n] = bounds;
  s = Math.max(-90, s); n = Math.min(90, n);
  if (e < w) e += 360;
  if (e - w >= 360) { w = -180; e = 180; }
  const keys = new Set();
  for (let lat = Math.floor(s / size) * size; lat < n; lat += size) {
    if (lat < -90 || lat >= 90) continue;
    for (let lon = Math.floor(w / size) * size; lon < e; lon += size) {
      const l = ((((lon + 180) % 360) + 360) % 360) - 180;
      keys.add(`${lat >= 0 ? 'N' : 'S'}${String(Math.abs(lat)).padStart(2, '0')}${l >= 0 ? 'E' : 'W'}${String(Math.abs(l)).padStart(3, '0')}`);
    }
  }
  return [...keys];
}
