// The world map: monthly fire layer, "heat that isn't fire" layer, the selected area, and drawing.
// Colours come from tokens.css through the theme object.
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import T from '../content/text.js';
import { land } from '../lib/area.js';

// A basemap that ships with the site, so the map works with the wifi off.
function style(theme) {
  return {
    version: 8,
    sources: { land: { type: 'geojson', data: land } },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': theme.sea } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': theme.land } },
      { id: 'borders', type: 'line', source: 'land', paint: { 'line-color': theme.border, 'line-width': 0.5 } },
    ],
  };
}

const EMPTY = { type: 'FeatureCollection', features: [] };
const areaFeature = (g) => (g ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] } : EMPTY);
const boxGeom = (b) => ({ type: 'Polygon', coordinates: [[[b.w, b.s], [b.e, b.s], [b.e, b.n], [b.w, b.n], [b.w, b.s]]] });

export default function MapView({ theme, fires, notFire, showNotFire, area, drawing, onBox, onDrawEnd }) {
  const el = useRef(null);
  const map = useRef(null);
  const ready = useRef(false);
  const latest = useRef({ onBox, onDrawEnd, drawing });
  latest.current = { onBox, onDrawEnd, drawing };

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current, style: style(theme), center: [60, 15], zoom: 1.4,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, preserveDrawingBuffer: true });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: T.map.attribution }));
    m.on('load', () => {
      m.addSource('fires', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'fires', type: 'circle', source: 'fires', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.1, 4, 2.6, 7, 9],
        'circle-color': ['step', ['get', 'frp'], theme.ramp[0], 50, theme.ramp[1], 250, theme.ramp[2],
          1000, theme.ramp[3], 4000, theme.ramp[4], 15000, theme.ramp[5]],
        'circle-opacity': 0.9 } });
      m.addSource('notfire', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'notfire', type: 'circle', source: 'notfire', layout: { visibility: 'none' }, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.4, 5, 3, 8, 7],
        'circle-color': ['match', ['get', 'type'], 1, theme.volcano, 3, theme.offshore, theme.industry],
        'circle-stroke-color': theme.surface, 'circle-stroke-width': 0.6 } });
      m.addSource('area', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': theme.area, 'fill-opacity': 0.06 } });
      m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': theme.area, 'line-width': 1.5 } });
      ready.current = true;
      m.fire('shift-ready');
    });

    const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'tip' });
    m.on('mousemove', 'fires', (e) => {
      const p = e.features[0].properties;
      tip.setLngLat(e.lngLat).setHTML(T.map.fireTip(Number(p.frp).toLocaleString(), p.cells)).addTo(m);
    });
    m.on('mouseleave', 'fires', () => tip.remove());
    m.on('mousemove', 'notfire', (e) => {
      const p = e.features[0].properties;
      tip.setLngLat(e.lngLat).setHTML(T.map.notFireTip(T.map.notFireKinds[p.type] || 'Static heat source', p.years)).addTo(m);
    });
    m.on('mouseleave', 'notfire', () => tip.remove());

    // drawing a box: press, drag, release (mouse or touch)
    let start = null;
    const down = (e) => {
      if (!latest.current.drawing) return;
      e.preventDefault(); m.dragPan.disable(); start = e.lngLat;
    };
    const move = (e) => { if (start) m.getSource('area')?.setData(areaFeature(boxGeom(norm(start, e.lngLat)))); };
    const up = (e) => {
      if (!start) return;
      const b = norm(start, e.lngLat); start = null; m.dragPan.enable();
      if (b.e - b.w >= 0.5 && b.n - b.s >= 0.5) latest.current.onBox(b);
      latest.current.onDrawEnd();
    };
    m.on('mousedown', down); m.on('touchstart', down);
    m.on('mousemove', move); m.on('touchmove', move);
    m.on('mouseup', up); m.on('touchend', up);
    map.current = m;
    return () => m.remove();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const whenReady = (fn) => {
    const m = map.current;
    if (!m) return;
    if (ready.current) fn(m); else m.once('shift-ready', () => fn(m));
  };

  useEffect(() => whenReady((m) => m.getSource('fires').setData(fires || EMPTY)), [fires]);
  useEffect(() => whenReady((m) => {
    m.getSource('notfire').setData(notFire || EMPTY);
    m.setLayoutProperty('notfire', 'visibility', showNotFire ? 'visible' : 'none');
  }), [notFire, showNotFire]);
  useEffect(() => whenReady((m) => {
    m.getSource('area').setData(areaFeature(area?.geom));
    if (area?.box && area.box.e - area.box.w < 300) {
      m.fitBounds([[area.box.w, area.box.s], [area.box.e, area.box.n]], { padding: 40, maxZoom: 7, duration: 600 });
    }
  }), [area]);
  useEffect(() => { if (map.current) map.current.getCanvas().style.cursor = drawing ? 'crosshair' : ''; }, [drawing]);

  return <div ref={el} className="map" role="application" aria-label={T.map.label} />;
}

function norm(a, b) {
  const r = (x) => Math.round(x * 4) / 4;
  return { w: r(Math.max(-180, Math.min(a.lng, b.lng))), e: r(Math.min(180, Math.max(a.lng, b.lng))),
    s: r(Math.max(-85, Math.min(a.lat, b.lat))), n: r(Math.min(85, Math.max(a.lat, b.lat))) };
}
