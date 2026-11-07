// Choosing the area: a preset, a country, typed box corners, a point with a radius, or a drawn box.
import { useEffect, useState } from 'react';
import T from '../content/text.js';
import PLACES from '../content/places.js';
import { COUNTRIES, boxArea, checkBox, countryArea, pointArea, presetArea } from '../lib/area.js';

export default function AreaPicker({ area, setArea, drawing, setDrawing, setError }) {
  const [mode, setMode] = useState(area?.kind === 'preset' ? 'preset' : area?.kind || 'preset');
  const [box, setBox] = useState({ w: '', s: '', e: '', n: '' });
  const [pt, setPt] = useState({ lat: '', lon: '', km: '50' });

  // keep the typed fields in step with the current area, so they are a starting point for edits
  useEffect(() => {
    if (!area?.box) return;
    const r = (x) => String(Math.round(x * 100) / 100);
    setBox({ w: r(area.box.w), s: r(area.box.s), e: r(area.box.e), n: r(area.box.n) });
    if (area.point) setPt((p) => ({ ...p, lat: r(area.point[1]), lon: r(area.point[0]) }));
  }, [area]);

  const go = (a) => { setError(null); setArea(a); };
  const applyBox = (e) => {
    e.preventDefault();
    const b = { w: +box.w, s: +box.s, e: +box.e, n: +box.n };
    const err = checkBox(b);
    if (err) return setError(err);
    go(boxArea(b));
  };
  const applyPoint = (e) => {
    e.preventDefault();
    const lat = +pt.lat, lon = +pt.lon, km = +pt.km;
    if (![lat, lon, km].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || km <= 0 || km > 1500) {
      return setError('Latitude -90 to 90, longitude -180 to 180, radius 1 to 1500 km.');
    }
    go(pointArea(lat, lon, km));
  };

  return (
    <div className="area-picker">
      <div className="seg" role="tablist" aria-label={T.area.heading}>
        {Object.entries(T.area.modes).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} className={mode === id ? 'on' : ''}
            onClick={() => { setMode(id); setDrawing(id === 'draw'); }}>{label}</button>
        ))}
      </div>
      <div className="area-form">
        {mode === 'preset' && (
          <label>{T.area.preset}
            <select value={area?.kind === 'preset' ? area.id : ''} onChange={(e) => { const p = PLACES.find((x) => x.id === e.target.value); if (p) go(presetArea(p)); }}>
              {area?.kind !== 'preset' && <option value="">…</option>}
              {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {mode === 'country' && (
          <label>{T.area.country}
            <select value={area?.kind === 'country' ? area.spec.slice(8) : ''} onChange={(e) => { const c = COUNTRIES.find((x) => x.id === e.target.value); if (c) go(countryArea(c)); }}>
              <option value="">{T.area.countryPick}</option>
              {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        {mode === 'box' && (
          <form className="coords" onSubmit={applyBox}>
            {['w', 's', 'e', 'n'].map((k) => (
              <label key={k}>{T.area[{ w: 'west', s: 'south', e: 'east', n: 'north' }[k]]}
                <input inputMode="decimal" value={box[k]} onChange={(e) => setBox({ ...box, [k]: e.target.value })} size="7" />
              </label>
            ))}
            <button className="action" type="submit">{T.area.apply}</button>
          </form>
        )}
        {mode === 'point' && (
          <form className="coords" onSubmit={applyPoint}>
            <label>{T.area.lat}<input inputMode="decimal" value={pt.lat} onChange={(e) => setPt({ ...pt, lat: e.target.value })} size="7" /></label>
            <label>{T.area.lon}<input inputMode="decimal" value={pt.lon} onChange={(e) => setPt({ ...pt, lon: e.target.value })} size="7" /></label>
            <label>{T.area.radius}<input inputMode="decimal" value={pt.km} onChange={(e) => setPt({ ...pt, km: e.target.value })} size="5" /></label>
            <button className="action" type="submit">{T.area.apply}</button>
          </form>
        )}
        {mode === 'draw' && (
          <button className={drawing ? 'action on' : 'action'} onClick={() => setDrawing(!drawing)}>
            {drawing ? T.area.drawing : T.area.draw}
          </button>
        )}
      </div>
    </div>
  );
}
