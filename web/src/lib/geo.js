// ENGINE (do not change unless you work on the data): geometry and labels for the map, shared by
// the flat map and the globe. Nothing here computes a fire value. Every number shown on the map
// comes straight from the monthly file the pipeline wrote (data.js: monthLayer), so the 2D map
// and the 3D globe show the same values by construction: they are one map with two projections.

export const MAP_CELL_DEG = 0.25;          // meta.map_grid_deg: the monthly map is per 0.25-degree cell
export const SWITCH_DAY = '2012-01-20';    // S-NPP becomes the record (L3); MODIS x k before
export const COMPARABLE_FROM = '2003-01';  // D20: Jan-Jun 2002 is Terra only, not comparable

// Colour steps for the map, per measure. Values are monthly sums for one 0.25-degree cell.
// frp: summed daily fire radiative power (MW), an index, not energy. cells: hotspot cell-days.
export const MAP_STEPS = {
  frp: [50, 250, 1000, 4000, 15000],
  cells: [3, 10, 30, 100, 250],
};

// MapLibre 'step' expression for one measure and the theme's six ramp colours.
export function stepExpression(variable, ramp) {
  const steps = MAP_STEPS[variable] || MAP_STEPS.frp;
  const out = ['step', ['get', variable], ramp[0]];
  steps.forEach((s, i) => out.push(s, ramp[i + 1]));
  return out;
}

// Legend rows that match stepExpression exactly.
export function legendRows(variable, ramp) {
  const s = MAP_STEPS[variable] || MAP_STEPS.frp;
  const f = (x) => x.toLocaleString('en-GB');
  return ramp.map((colour, i) => ({
    colour,
    label: i === 0 ? `under ${f(s[0])}` : i === s.length ? `${f(s[s.length - 1])} or more` : `${f(s[i - 1])} to ${f(s[i])}`,
  }));
}

// The true footprint of a map value: a 0.25-degree square around the cell centre.
export function cellSquare(lon, lat, deg = MAP_CELL_DEG) {
  const h = deg / 2;
  const w = lon - h, e = lon + h, s = lat - h, n = lat + h;
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

// Squares for a whole month layer, same properties as the points (no value is changed).
export function squaresOf(fc, deg = MAP_CELL_DEG) {
  if (!fc) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({ type: 'Feature', properties: f.properties,
      geometry: cellSquare(f.geometry.coordinates[0], f.geometry.coordinates[1], deg) })),
  };
}

// Any longitude to the range [-180, 180).
export function wrapLon(lon) {
  const x = ((((lon + 180) % 360) + 360) % 360) - 180;
  return x === 180 ? -180 : x;
}

// A box dragged on the map, snapped to 0.25 degrees. SHIFT areas never cross the date line (the
// area code works on -180..180 boxes), so a drag that crosses it is returned as
// { crossesDateLine: true } and the page asks for a box on one side instead.
// Flat map: longitudes are not wrapped (the world repeats sideways), so a drag inside one copy of
// the world is moved back to -180..180, and a drag from one copy into the next crosses the line.
// Globe: longitudes come back wrapped, so a jump of more than 180 degrees means the drag crossed.
export function dragBox(a, b, globe = false) {
  const r = (x) => Math.round(x * 4) / 4;
  let lo1 = a.lng, lo2 = b.lng;
  if (globe) {
    lo1 = wrapLon(lo1); lo2 = wrapLon(lo2);
    if (Math.abs(lo2 - lo1) > 180) return { crossesDateLine: true };
  } else {
    const off = Math.floor((lo1 + 180) / 360) * 360;
    lo1 -= off; lo2 -= off;
    if (lo2 < -180 || lo2 > 180) return { crossesDateLine: true };
  }
  return {
    w: r(Math.max(-180, Math.min(lo1, lo2))), e: r(Math.min(180, Math.max(lo1, lo2))),
    s: r(Math.max(-85, Math.min(a.lat, b.lat))), n: r(Math.min(85, Math.max(a.lat, b.lat))),
  };
}

// Which record a month comes from (decisions D19, D20, D27, D30).
export function eraOf(ym) {
  if (ym < '2002-07') return 'terra_only';
  if (ym < '2012-01') return 'modis';
  if (ym === '2012-01') return 'switch';
  return 'viirs';
}

// The 2.5-degree factor cell name, as in uncertainty.json and data.js (fineKey).
export function factorCell(lat, lon) {
  const t = (la, lo) => {
    const ns = la >= 0 ? 'N' : 'S', ew = lo >= 0 ? 'E' : 'W';
    return `${ns}${String(Math.abs(Math.trunc(la))).padStart(2, '0')}${ew}${String(Math.abs(Math.trunc(lo))).padStart(3, '0')}`;
  };
  return t(Math.floor(lat / 2.5) * 2.5, Math.floor(lon / 2.5) * 2.5);
}

// The 10-degree tile name, as in cloud.json and the daily files.
export function tenDegTile(lat, lon) {
  const la = Math.floor(lat / 10) * 10, lo = Math.floor(lon / 10) * 10;
  const ns = la >= 0 ? 'N' : 'S', ew = lo >= 0 ? 'E' : 'W';
  return `${ns}${String(Math.abs(la)).padStart(2, '0')}${ew}${String(Math.abs(lo)).padStart(3, '0')}`;
}

// The 30-degree availability zone index, as in zones.bin (data.js: zonesOfCells).
export const zoneOf = (lat, lon) => Math.floor((lat + 90) / 30) * 12 + Math.floor((lon + 180) / 30);
export function zoneBox(z) {
  const s = Math.floor(z / 12) * 30 - 90, w = (z % 12) * 30 - 180;
  return { w, e: w + 30, s, n: s + 30 };
}

// Everything the cell panel shows for one map cell and month. Only fields the published files
// actually hold: the cell's two monthly sums, its era, the pre-2012 calibrated range of its
// 2.5-degree factor cell for that calendar month, the cloud flag of its 10-degree tile, and the
// satellite availability of its 30-degree zone. No exact location, no fire identity.
export function cellInfo({ lon, lat, cells, frp }, ym, { unc = null, cloud = null, zoneDays = null } = {}) {
  const h = MAP_CELL_DEG / 2;
  const m = +ym.slice(5, 7) - 1;
  const era = eraOf(ym);
  const fc = factorCell(lat, lon);
  const pre = era === 'modis' || era === 'terra_only' || era === 'switch';
  const range = (v) => {
    const r = unc?.range_pct?.[v]?.[fc]?.[m];
    return pre && r != null && isFinite(r) ? r : null;
  };
  const tile = tenDegTile(lat, lon);
  const cloudFlag = cloud ? (cloud.flags?.[tile] || []).includes(ym) : null;
  const cloudKnown = cloud ? ym <= cloud.until : false;
  return {
    bounds: { w: lon - h, e: lon + h, s: lat - h, n: lat + h },
    month: ym, cells, frp, era,
    factorCell: fc, rangeCells: range('cells'), rangeFrp: range('frp'),
    tile, cloudFlag: cloudKnown ? cloudFlag : null,
    zone: zoneOf(lat, lon), zoneDays,
  };
}

// Count zone-day status codes for one zone over a run of day indexes (codes as meta.zone_status).
export function countStatus(row, k0, k1) {
  const c = { primary: 0, filled: 0, nodata: 0, days: 0 };
  for (let k = Math.max(0, k0); k < Math.min(row.length, k1); k++) {
    const s = row[k];
    c.days++;
    if (s === 0) c.primary++; else if (s === 5) c.nodata++; else c.filled++;
  }
  return c;
}

// ---------------------------------------------------------------- satellite pictures (NASA GIBS)
// NASA Global Imagery Browse Services: open NASA imagery, no key, Web Mercator tiles.
// These pictures are a backdrop only. They are not SHIFT data and are not live fire imagery.
// Tiles are spread over GIBS's three aliases, as NASA's own MapLibre example does.
const HOSTS = ['a', 'b', 'c'].map((h) => `https://gibs-${h}.earthdata.nasa.gov/wmts/epsg3857/best`);
export const IMAGERY_FIRST_DAY = { terra: '2000-02-24', snpp: '2015-11-24' };

export function imagery(kind, day = null) {
  if (kind === 'satellite') {
    // the standard WMTS GetTile form names the format outright (image/jpeg); the layer has no daily date
    return { id: 'bluemarble', maxzoom: 8,
      tiles: HOSTS.map((h) => `${h}/wmts.cgi?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=BlueMarble_ShadedRelief_Bathymetry`
        + '&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible_Level8&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg'),
      label: 'NASA Blue Marble (cloud-free composite, 2004)' };
  }
  if (kind === 'daily') {
    if (!day || day < IMAGERY_FIRST_DAY.terra) return null;
    const snpp = day >= IMAGERY_FIRST_DAY.snpp;
    const layer = snpp ? 'VIIRS_SNPP_CorrectedReflectance_TrueColor' : 'MODIS_Terra_CorrectedReflectance_TrueColor';
    // same pattern as NASA's MapLibre example (gibs-web-examples, webmercator-epsg3857.js)
    return { id: `truecolour-${snpp ? 'snpp' : 'terra'}-${day}`, maxzoom: 9,
      tiles: HOSTS.map((h) => `${h}/${layer}/default/${day}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`),
      label: `${snpp ? 'VIIRS S-NPP' : 'MODIS Terra'} true colour, ${day} (one day: clouds, smoke and orbit gaps are real)` };
  }
  return null;
}

export const days_in_month = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
