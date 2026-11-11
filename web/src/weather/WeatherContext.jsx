// "Weather at the time" (D39): NASA POWER weather over the same dates as "Now against the past".
// Context only, never a cause. Shown for the preset areas, whose weather ships with the site.
import { useEffect, useMemo, useState } from 'react';
import T from '../content/text.js';
import { dateOf } from '../lib/data.js';
import { longDate } from '../lib/format.js';
import { compareWeather, loadPreset } from './weather.js';

const isoOf = (meta, k) => dateOf(meta, k).toISOString().slice(0, 10);

export default function WeatherContext({ meta, cmp, area }) {
  const id = area?.kind === 'preset' ? String(area.spec || '').replace(/^preset:/, '') : null;
  const [w, setW] = useState(undefined);              // undefined: loading, null: not available
  useEffect(() => {
    let live = true;
    setW(undefined);
    if (!id) { setW(null); return undefined; }
    loadPreset(id).then((d) => { if (live) setW(d); });
    return () => { live = false; };
  }, [id]);

  const res = useMemo(() => {
    if (!w || !cmp || cmp.error || !cmp.target) return null;
    const years = cmp.years.map((y) => ({ year: y.year, target: y.target, fromIso: isoOf(meta, y.from), toIso: isoOf(meta, y.to) }));
    return compareWeather(w, years, cmp.baseline, w.fetched_utc);
  }, [w, cmp, meta]);

  if (!id) return <p className="small weather-off">{T.weather.presetsOnly}</p>;
  if (w === undefined || !cmp || cmp.error || !cmp.target) return null;
  if (!w || !res) return <p className="small weather-off">{T.weather.unavailable}</p>;

  const W = T.weather;
  const rows = res.rows.filter((r) => r.value != null);
  const firsts = res.rows.filter((r) => r.rank === 1 && r.of >= W.minYearsForSentence).map((r) => W.firsts[r.key]);
  const of = res.rows.find((r) => r.key === 'PRECTOTCORR')?.of;
  const base = res.rows.find((r) => r.key === 'PRECTOTCORR');

  return (
    <div className="weather">
      <h4>{W.title}</h4>
      {firsts.length > 0 && <p className="weather-lead">{W.lead(of, firsts)}</p>}
      {rows.length === 0 ? <p className="small">{W.noData(longDate(new Date(Date.parse(res.end + 'T00:00:00Z'))))}</p> : (
        <div className="tablewrap">
          <table className="weather-table">
            <thead><tr>{W.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{W.rows[r.key]}</td>
                  <td>{W.value(r.key, r.value)}</td>
                  <td>{r.normal == null ? '–' : W.value(r.key, r.normal)}</td>
                  <td>{r.normal == null ? W.noNormal : W.vsNormal(r.key, r)}</td>
                  <td>{r.rank ? W.rank(r.key, r.rank, r.of) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && <p className="small">{W.rankNote}</p>}
      {res.provisional && <p className="small weather-note">{W.provisional}</p>}
      <p className="small weather-note">{W.notCause}</p>
      <p className="small">{W.source(base?.baseCount ?? 0, cmp.baseline[0], cmp.baseline[1], longDate(new Date(Date.parse(res.end + 'T00:00:00Z'))))}</p>
    </div>
  );
}
