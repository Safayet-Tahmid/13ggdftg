// The world map: monthly fire layer, "heat that isn't fire" layer, the selected area, and drawing.
// ONE map with two projections: the flat 2D map (Web Mercator) and the 3D globe. Both draw the
// same sources, so a value can never differ between them. Colours come from tokens.css through
// the theme object, wording from content/text.js.
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import T from '../content/text.js';
import { land } from '../lib/area.js';
import { cellSquare, dragBox, imagery, squaresOf, stepExpression, zoneBox } from '../lib/geo.js';

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
const fc = (geoms) => ({ type: 'FeatureCollection', features: geoms.filter(Boolean).map((g) => ({ type: 'Feature', properties: {}, geometry: g })) });
const areaFeature = (g) => (g ? fc([g]) : EMPTY);
const boxGeom = (b) => ({ type: 'Polygon', coordinates: [[[b.w, b.s], [b.e, b.s], [b.e, b.n], [b.w, b.n], [b.w, b.s]]] });
const HOME = { '2d': { center: [60, 15], zoom: 1.4 }, '3d': { center: [60, 15], zoom: 2.1 } };
const DOTS_UNTIL = 4.5;   // zoomed out: dots; zoomed in: the true 0.25-degree squares

// Diagonal hatching for zones with days of no satellite data (a pattern, so it reads without colour).
function hatch(colour) {
  const n = 8, c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  g.strokeStyle = colour; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(0, n); g.lineTo(n, 0); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(n - 1, n + 1); g.lineTo(n + 1, n - 1); g.stroke();
  return g.getImageData(0, 0, n, n);
}

export default function MapView({ theme, fires, notFire, showNotFire, area, drawing, onBox, onDrawEnd, onDateLine,
  variable = 'frp', view = '2d', basemap = 'standard', imageryDay = null, gaps = null, showGaps = false,
  picked = null, onPick, resetKey = 0, reducedMotion = false, onImageryError, onStatus }) {
  const el = useRef(null);
  const map = useRef(null);
  const ready = useRef(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef({});
  latest.current = { onBox, onDrawEnd, drawing, onPick, onDateLine, onImageryError, onStatus, view, reducedMotion };
  const squares = useMemo(() => squaresOf(fires), [fires]);

  useEffect(() => {
    let m;
    try {
      m = new maplibregl.Map({ container: el.current, style: style(theme), ...HOME[view],
        attributionControl: false, dragRotate: false, pitchWithRotate: false, maxPitch: 70,
        canvasContextAttributes: { antialias: true } });
    } catch (e) {
      // no WebGL (old device, blocked GPU): the story panel keeps working without the map
      setFailed(true);
      latest.current.onStatus?.('failed');
      return undefined;
    }
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: T.map.attribution }));
    m.on('load', () => {
      m.addImage('hatch', hatch(theme.gap));
      m.addSource('gaps', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'gaps', type: 'fill', source: 'gaps', layout: { visibility: 'none' }, paint: { 'fill-pattern': 'hatch', 'fill-opacity': 0.55 } });
      m.addLayer({ id: 'gaps-edge', type: 'line', source: 'gaps', layout: { visibility: 'none' },
        paint: { 'line-color': theme.gap, 'line-width': 1, 'line-dasharray': [3, 2] } });
      m.addSource('fires', { type: 'geojson', data: EMPTY });
      m.addSource('firecells', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'fires', type: 'circle', source: 'fires', maxzoom: DOTS_UNTIL, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.1, 3, 1.9, DOTS_UNTIL, 2.8],
        'circle-color': stepExpression(variable, theme.ramp),
        'circle-opacity': 0.9, 'circle-stroke-width': 0, 'circle-stroke-color': '#000' } });
      m.addLayer({ id: 'firecells', type: 'fill', source: 'firecells', minzoom: DOTS_UNTIL, paint: {
        'fill-color': stepExpression(variable, theme.ramp), 'fill-opacity': 0.82, 'fill-outline-color': theme.surface } });
      m.addSource('notfire', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'notfire', type: 'circle', source: 'notfire', layout: { visibility: 'none' }, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.4, 5, 3, 8, 7],
        'circle-color': ['match', ['get', 'type'], 1, theme.volcano, 3, theme.offshore, theme.industry],
        'circle-stroke-color': theme.surface, 'circle-stroke-width': 0.6 } });
      m.addSource('area', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': theme.area, 'fill-opacity': 0.06 } });
      m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': theme.area, 'line-width': 1.5 } });
      m.addSource('pick', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'pick', type: 'line', source: 'pick', paint: { 'line-color': theme.select, 'line-width': 2.5 } });
      ready.current = true;
      m.fire('shift-ready');
    });

    // imagery tiles that fail (offline, service down) are reported once per picture
    let warned = null;
    m.on('error', (e) => {
      if (e.sourceId === 'imagery') {
        const id = m.getSource('imagery')?.shiftId;
        if (id && warned !== id) { warned = id; latest.current.onImageryError?.(); }
      }
    });
    m.on('webglcontextlost', () => latest.current.onStatus?.('lost'));
    m.on('webglcontextrestored', () => latest.current.onStatus?.('ok'));

    const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'tip' });
    const showTip = (e) => {
      const p = e.features[0].properties;
      tip.setLngLat(e.lngLat).setHTML(T.map.fireTip(Number(p.frp).toLocaleString(), p.cells)).addTo(m);
      m.getCanvas().style.cursor = latest.current.drawing ? 'crosshair' : 'pointer';
    };
    const hideTip = () => { tip.remove(); m.getCanvas().style.cursor = latest.current.drawing ? 'crosshair' : ''; };
    for (const id of ['fires', 'firecells']) {
      m.on('mousemove', id, showTip);
      m.on('mouseleave', id, hideTip);
      m.on('click', id, (e) => {
        if (latest.current.drawing) return;
        const p = e.features[0].properties;
        latest.current.onPick?.({ lon: +p.lon, lat: +p.lat, cells: +p.cells, frp: +p.frp });
      });
    }
    m.on('mousemove', 'notfire', (e) => {
      const p = e.features[0].properties;
      tip.setLngLat(e.lngLat).setHTML(T.map.notFireTip(T.map.notFireKinds[p.type] || 'Static heat source', p.years)).addTo(m);
    });
    m.on('mouseleave', 'notfire', () => tip.remove());

    // drawing a box: press, drag, release (mouse or touch)
    let start = null;
    const isGlobe = () => latest.current.view === '3d';
    const down = (e) => {
      if (!latest.current.drawing) return;
      e.preventDefault(); m.dragPan.disable(); m.dragRotate.disable(); start = e.lngLat;
    };
    const move = (e) => {
      if (!start) return;
      const b = dragBox(start, e.lngLat, isGlobe());
      if (!b.crossesDateLine) m.getSource('area')?.setData(areaFeature(boxGeom(b)));
    };
    const up = (e) => {
      if (!start) return;
      const b = dragBox(start, e.lngLat, isGlobe()); start = null;
      m.dragPan.enable(); if (isGlobe()) m.dragRotate.enable();
      if (b.crossesDateLine) latest.current.onDateLine?.();
      else if (b.e - b.w >= 0.5 && b.n - b.s >= 0.5) latest.current.onBox(b);
      latest.current.onDrawEnd();
    };
    m.on('mousedown', down); m.on('touchstart', down);
    m.on('mousemove', move); m.on('touchmove', move);
    m.on('mouseup', up); m.on('touchend', up);
    map.current = m;
    if (window.__SHIFT_TEST__) window.__shiftMap = m;   // browser tests only (set before the page loads)
    return () => { ready.current = false; map.current = null; tip.remove(); m.remove(); };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const whenReady = (fn) => {
    const m = map.current;
    if (!m) return;
    if (ready.current) fn(m); else m.once('shift-ready', () => fn(m));
  };
  const motion = (d) => (reducedMotion ? 0 : d);

  // ---- the fire values: the same two sources feed both projections
  useEffect(() => whenReady((m) => {
    m.getSource('fires').setData(fires || EMPTY);
    m.getSource('firecells').setData(squares);
  }), [fires, squares]);
  useEffect(() => whenReady((m) => {
    const e = stepExpression(variable, theme.ramp);
    m.setPaintProperty('fires', 'circle-color', e);
    m.setPaintProperty('firecells', 'fill-color', e);
  }), [variable, theme]);

  useEffect(() => whenReady((m) => {
    m.getSource('notfire').setData(notFire || EMPTY);
    m.setLayoutProperty('notfire', 'visibility', showNotFire ? 'visible' : 'none');
  }), [notFire, showNotFire]);

  useEffect(() => whenReady((m) => {
    m.getSource('area').setData(areaFeature(area?.geom));
    if (area?.box && area.box.e - area.box.w < 300) {
      m.fitBounds([[area.box.w, area.box.s], [area.box.e, area.box.n]], { padding: 40, maxZoom: 7, duration: motion(600) });
    }
  }), [area]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => whenReady((m) => {
    m.getSource('pick').setData(picked ? fc([cellSquare(picked.lon, picked.lat)]) : EMPTY);
  }), [picked]);

  // ---- satellite gaps of the month: hatched 30-degree zones
  useEffect(() => whenReady((m) => {
    const zones = (gaps || []).map((z, i) => (z.nodata > 0 ? boxGeom(zoneBox(i)) : null));
    m.getSource('gaps').setData(fc(zones));
    for (const id of ['gaps', 'gaps-edge']) m.setLayoutProperty(id, 'visibility', showGaps ? 'visible' : 'none');
  }), [gaps, showGaps]);

  // ---- 2D map or 3D globe
  useEffect(() => whenReady((m) => {
    const globe = view === '3d';
    m.setProjection({ type: globe ? 'globe' : 'mercator' });
    if (globe) {
      m.dragRotate.enable(); m.touchZoomRotate.enableRotation(); m.touchPitch.enable();
      m.setSky({ 'sky-color': theme.space, 'horizon-color': theme.horizon, 'fog-color': theme.space,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 5, 0.4, 8, 0] });
    } else {
      m.dragRotate.disable(); m.touchZoomRotate.disableRotation(); m.touchPitch.disable();
      if (m.getPitch() || m.getBearing()) m.easeTo({ pitch: 0, bearing: 0, duration: motion(400) });
    }
    el.current.style.background = globe ? theme.space : '';
  }), [view, theme]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ---- backdrop: plain (ships with the site), Blue Marble, or the true-colour picture of one day
  useEffect(() => whenReady((m) => {
    const img = basemap === 'standard' ? null : imagery(basemap, imageryDay);
    if (m.getLayer('imagery')) m.removeLayer('imagery');
    if (m.getSource('imagery')) m.removeSource('imagery');
    if (img) {
      m.addSource('imagery', { type: 'raster', tiles: img.tiles, tileSize: 256, maxzoom: img.maxzoom,
        attribution: T.map.imageryAttribution });
      m.getSource('imagery').shiftId = img.id;
      m.addLayer({ id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-fade-duration': motion(200) } }, 'land');
    }
    m.setLayoutProperty('land', 'visibility', img ? 'none' : 'visible');
    m.setPaintProperty('borders', 'line-color', img ? 'rgba(255,255,255,0.55)' : theme.border);
    // a thin dark ring keeps the light colours of the ramp readable on a satellite picture
    m.setPaintProperty('fires', 'circle-stroke-width', img ? 0.5 : 0);
  }), [basemap, imageryDay, theme]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ---- reset the camera
  useEffect(() => {
    if (!resetKey) return;
    whenReady((m) => m.flyTo({ ...HOME[view], pitch: 0, bearing: 0, duration: motion(900), essential: false }));
  }, [resetKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (map.current) map.current.getCanvas().style.cursor = drawing ? 'crosshair' : ''; }, [drawing]);

  if (failed) return <div className="map map-failed" role="note"><p>{T.map.mapFailed}</p></div>;
  return <div ref={el} className="map" role="application" aria-label={`${T.map.label}. ${T.map.keys}`} />;
}
