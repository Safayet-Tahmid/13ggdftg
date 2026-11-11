// Coastlines as lines, made from the same land shapes as the land fill, so they line up exactly.
// Before 12 Nov 2026 the coastline was the outline of the land polygons. On the 3D globe MapLibre
// also drew the edges where those polygons are cut into tiles near the pole (faint rings at about
// 66.5 and 79 degrees north) and the cut at the 180 degree meridian. Lines have no such edges, and
// the pieces that only exist because of the 180 degree cut or the South Pole are left out here.
// The main cause of the rings (found 12 Nov 2026): in world-atlas countries-50m, Russia's outline has
// four edges that jump from 179.9 to -180 degrees of longitude (at 65.1, 69.0, 71.0 and 71.5 degrees
// north). On the flat map they hide; on the globe each one is drawn the whole way round as a circle.
const CUT = (a, b) => Math.abs(a[0] - b[0]) > 180
  || (Math.abs(a[0]) >= 179.999 && Math.abs(b[0]) >= 179.999 && Math.abs(a[0] - b[0]) < 1e-6)
  || (a[1] <= -89.999 && b[1] <= -89.999);

export function coastLines(land) {
  const out = [];
  const rings = [];
  for (const f of land?.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) for (const r of p) rings.push(r);
  }
  for (const r of rings) {
    let cur = [r[0]];
    for (let i = 1; i < r.length; i++) {
      if (CUT(r[i - 1], r[i])) {
        if (cur.length > 1) out.push(cur);
        cur = [r[i]];
      } else cur.push(r[i]);
    }
    if (cur.length > 1) out.push(cur);
  }
  return { type: 'FeatureCollection', features: out.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })) };
}

// The land shapes for the map's land fill, with any ring that jumps across the 180 degree meridian
// joined up instead (longitudes continued past 180, which MapLibre wraps). Without this, Russia's
// four jumping edges also drew a hairline band of "land" round the 3D globe. Display copy only:
// the engine's own land (lib/area.js, used to pick areas) is not changed.
export function landForMap(land) {
  const fix = (r) => {
    let shift = 0, jumped = false;
    const out = [r[0].slice()];
    for (let i = 1; i < r.length; i++) {
      const d = r[i][0] - r[i - 1][0];
      if (d > 180) { shift -= 360; jumped = true; } else if (d < -180) { shift += 360; jumped = true; }
      out.push([r[i][0] + shift, r[i][1]]);
    }
    return jumped ? out : r;
  };
  return { ...land, features: (land?.features || []).map((f) => {
    const g = f.geometry;
    if (!g) return f;
    if (g.type === 'Polygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map(fix) } };
    if (g.type === 'MultiPolygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map((p) => p.map(fix)) } };
    return f;
  }) };
}
