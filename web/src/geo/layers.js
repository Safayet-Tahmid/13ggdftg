// Map geography (12 Nov 2026): continents and oceans -> countries -> states/provinces (ADM1) ->
// districts (ADM2) -> the maximum zoom. Map context only: these layers never change a fire value,
// the fire colours or the hotspot squares. Data: Natural Earth and geoBoundaries gbOpen, prepared by
// geo/prepare_geo.py and shipped with the site (web/public/geo), so the map works offline.
import { decodeTile, decodeWorld, tilesForView } from './decode.js';

// The maximum zoom. Chosen by measurement (see geo/README.md): at zoom 9 a typical district
// (Bangladesh's median about 2,000 km2, about 45 km across) is about 130 px wide and a 300 km2
// unit (the smallest ADM2 kept) about 50 px, SHIFT's finest record cell (0.25 degree) is about
// 180 px and single recent detections (from zoom 6) stay selectable. Closer zooms add no fire
// information: the record is summed on 0.25 and 1 degree cells.
export const MAX_ZOOM = 9;
export const ZOOM = {
  continentsUntil: 3,        // continent names fade out between 2.4 and 3
  oceansUntil: 5.5,
  countries: [1.6, 2.6, 3.6], // labelrank 1-2, 3-4, the rest
  adm1Lines: 4.5, adm1Labels: [5, 6],     // big units first, all at 6
  adm2Lines: 6.5, adm2Labels: [7, 7.8],   // big units (1,500 km2 and more) first, all at 7.8
};
export const ADM1_TILE = 30, ADM2_TILE = 10;
const FONTS = { regular: ['Noto Sans Regular'], italic: ['Noto Sans Italic'], bold: ['Noto Sans Bold'] };
const LINE = ['==', ['geometry-type'], 'LineString'];
const POINT = ['==', ['geometry-type'], 'Point'];

// Where the label fonts live (MapLibre needs an absolute URL with the {fontstack} and {range} tokens).
export function glyphsUrl(loc = (typeof window !== 'undefined' ? window.location : null)) {
  if (!loc) return undefined;
  return `${loc.origin}${loc.pathname.replace(/[^/]*$/, '')}geo/fonts/{fontstack}/{range}.pbf`;
}
export const geoBase = () => (typeof window !== 'undefined' ? new URL('geo/', document.baseURI).href : 'geo/');

// Boundary lines go into the basemap (under the fire layers). compact = a narrow screen: fewer,
// smaller labels there (labels move later and stay smaller), the same lines.
export function geoLineLayers(theme) {
  const g = theme.geo;
  return [
    { id: 'geo-adm2-lines', type: 'line', source: 'geo-adm2', minzoom: ZOOM.adm2Lines, filter: LINE,
      paint: { 'line-color': g.adm2, 'line-width': ['interpolate', ['linear'], ['zoom'], 6.5, 0.3, 9, 0.8],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 0, 7, 1] } },
    { id: 'geo-adm1-lines', type: 'line', source: 'geo-adm1', minzoom: ZOOM.adm1Lines, filter: LINE,
      paint: { 'line-color': g.adm1, 'line-width': ['interpolate', ['linear'], ['zoom'], 4.5, 0.5, 9, 1.2], 'line-dasharray': [4, 2],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4.5, 0, 5, 1] } },
    { id: 'geo-intl-borders', type: 'line', source: 'geo-world', filter: ['==', ['get', 'k'], 'border'],
      paint: { 'line-color': g.intl, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 5, 1.2, 9, 2] } },
  ];
}

// Labels go on top (symbols never block clicks on the fire and recent layers). MapLibre's own
// collision handling keeps them apart, and on the 3D globe it hides labels on the far side.
export function geoLabelLayers(theme, compact) {
  const g = theme.geo;
  const k = compact ? 0.9 : 1;
  const later = compact ? 0.4 : 0;
  const halo = { 'text-halo-color': g.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
  const country = (id, filter, minzoom) => ({
    id, type: 'symbol', source: 'geo-world', minzoom: minzoom + later, maxzoom: 8,
    filter: ['all', ['==', ['get', 'k'], 'country'], filter],
    layout: { 'text-field': ['get', 'n'], 'text-font': FONTS.regular, 'symbol-sort-key': ['get', 'r'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11 * k, 6, 15 * k], 'text-max-width': 7, 'text-padding': 4 },
    paint: { 'text-color': g.label, ...halo } });
  // provinces in small capitals, districts in normal case, so "DHAKA" (division) and "Dhaka" (district) differ
  const area = (id, src, min, minzoom, size, upper) => ({
    id, type: 'symbol', source: src, minzoom: minzoom + later, filter: ['all', POINT, ['>=', ['get', 'a'], min]],
    layout: { 'text-field': ['get', 'n'], 'text-font': FONTS.regular, 'symbol-sort-key': ['-', 0, ['get', 'a']],
      'text-size': size * k, 'text-max-width': 8, 'text-padding': 3,
      ...(upper ? { 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 } : {}) },
    paint: { 'text-color': g.label, 'text-opacity': 0.9, ...halo } });
  return [
    { id: 'geo-oceans', type: 'symbol', source: 'geo-world', maxzoom: ZOOM.oceansUntil, filter: ['==', ['get', 'k'], 'ocean'],
      layout: { 'text-field': ['get', 'n'], 'text-font': FONTS.italic, 'text-size': 13 * k, 'text-letter-spacing': 0.1,
        'text-max-width': 6 },
      paint: { 'text-color': g.water, 'text-halo-color': g.halo, 'text-halo-width': 0.8 } },
    { id: 'geo-continents', type: 'symbol', source: 'geo-world', maxzoom: ZOOM.continentsUntil, filter: ['==', ['get', 'k'], 'continent'],
      layout: { 'text-field': ['get', 'n'], 'text-font': FONTS.bold, 'text-size': 14 * k, 'text-transform': 'uppercase',
        'text-letter-spacing': 0.18, 'text-max-width': 9 },
      paint: { 'text-color': g.label, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 2.4, 0.85, 3, 0], ...halo } },
    country('geo-countries-1', ['<=', ['get', 'r'], 2], ZOOM.countries[0]),
    country('geo-countries-2', ['all', ['>', ['get', 'r'], 2], ['<=', ['get', 'r'], 4]], ZOOM.countries[1]),
    country('geo-countries-3', ['>', ['get', 'r'], 4], ZOOM.countries[2]),
    area('geo-adm1-labels-big', 'geo-adm1', 30000, ZOOM.adm1Labels[0], 10.5, true),
    area('geo-adm1-labels', 'geo-adm1', 0, ZOOM.adm1Labels[1], 10.5, true),
    area('geo-adm2-labels-big', 'geo-adm2', 1500, ZOOM.adm2Labels[0], 10.5),
    area('geo-adm2-labels', 'geo-adm2', 0, ZOOM.adm2Labels[1], 10.5),
  ];
}
export const GEO_LABEL_IDS = ['geo-oceans', 'geo-continents', 'geo-countries-1', 'geo-countries-2', 'geo-countries-3',
  'geo-adm1-labels-big', 'geo-adm1-labels', 'geo-adm2-labels-big', 'geo-adm2-labels'];

// Loads the province and district tiles that the view needs, when it needs them, and keeps the
// last ones in memory. Nothing is loaded for districts below their zoom, so the first page load
// only fetches tiles.json and world.json (together about 0.3 MB) and the fonts for the labels in view.
export class GeoLoader {
  constructor(map, fetcher = (u) => fetch(u)) {
    this.map = map; this.fetch = fetcher; this.base = geoBase();
    this.index = null; this.cache = new Map(); this.max = 48; this.stopped = false;
    this.ready = this.fetch(this.base + 'tiles.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((ix) => { this.index = ix; });
    // world.json (borders, continent, ocean and country names) once, as soon as the map can take it
    this.world = this.ready.then(() => this.fetch(this.base + 'world.json' + this.ver('world.json')))
      .then((r) => (r.ok ? r.json() : null)).then(decodeWorld).catch(() => []);
  }

  ver(path) { return this.index?.v?.[path] ? `?v=${this.index.v[path]}` : ''; }

  async showWorld() {
    const f = await this.world;
    if (!this.stopped && this.map.getSource('geo-world')) this.map.getSource('geo-world').setData({ type: 'FeatureCollection', features: f });
  }

  stop() { this.stopped = true; }

  async tile(path) {
    if (this.cache.has(path)) { const v = this.cache.get(path); this.cache.delete(path); this.cache.set(path, v); return v; }
    const p = this.fetch(this.base + path + this.ver(path))
      .then((r) => (r.ok ? r.json() : null)).then(decodeTile).catch(() => []);
    this.cache.set(path, p);
    while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value);
    return p;
  }

  async update() {
    await this.ready;
    const m = this.map;
    if (this.stopped || !this.index || !m.getSource('geo-adm1')) return;
    const z = m.getZoom();
    const b = m.getBounds();
    const view = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const t = this.index.tiles;
    const want = (keys, prefix, have) => keys.filter((k) => have.includes(k)).map((k) => `${prefix}/${k}.json`);
    const a1 = z >= ZOOM.adm1Lines - 0.5 ? want(tilesForView(view, ADM1_TILE), 'adm1', t.adm1) : [];
    const k2 = z >= ZOOM.adm2Lines - 0.5 ? tilesForView(view, ADM2_TILE) : [];
    const a2 = [...want(k2, 'adm2/attrib', t.adm2_attrib), ...want(k2, 'adm2/odbl', t.adm2_odbl)];
    const [f1, f2] = await Promise.all([Promise.all(a1.map((p) => this.tile(p))), Promise.all(a2.map((p) => this.tile(p)))]);
    if (this.stopped || !m.getSource('geo-adm1')) return;
    m.getSource('geo-adm1').setData({ type: 'FeatureCollection', features: f1.flat() });
    m.getSource('geo-adm2').setData({ type: 'FeatureCollection', features: f2.flat() });
    this.loaded = { adm1: a1, adm2: a2 };
  }
}
