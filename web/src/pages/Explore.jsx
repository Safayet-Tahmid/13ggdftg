// The Explore page: map on one side, the story of the chosen area on the other.
// Layout and order of the sections can be changed freely; the numbers come from lib/.
import { useEffect, useMemo, useState } from 'react';
import T from '../content/text.js';
import PLACES from '../content/places.js';
import MapView from '../components/MapView.jsx';
import AreaPicker from '../components/AreaPicker.jsx';
import ChartCard from '../components/ChartCard.jsx';
import Calendar, { calendarLegend } from '../components/Calendar.jsx';
import MonthGrid from '../components/MonthGrid.jsx';
import Trend from '../components/Trend.jsx';
import Compare from '../components/Compare.jsx';
import Season from '../components/Season.jsx';
import Downloads from '../components/Downloads.jsx';
import { MAX_TILES, areaSeries, dateOf, iso, json, lastDataDay, monthLayer, tilesOfCells, dayIndex } from '../lib/data.js';
import { areaFromSpec, boxArea, presetArea } from '../lib/area.js';
import { areaRange, compareWindow, monthly, normalMonth, season, summary } from '../lib/analysis.js';
import { slug } from '../lib/downloads.js';
import { longDate } from '../lib/format.js';
import { writeHash } from '../lib/url.js';

export default function Explore({ meta, theme, params }) {
  const lastK = lastDataDay(meta);
  const lastIso = iso(meta, lastK);
  // the map opens on the last complete month
  const [month, setMonth] = useState(() => params.m || (() => {
    const d = new Date(Date.UTC(+lastIso.slice(0, 4), +lastIso.slice(5, 7) - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  })());
  const [fires, setFires] = useState(null);
  const [notFire, setNotFire] = useState(null);
  const [showNotFire, setShowNotFire] = useState(false);
  const [area, setArea] = useState(() => areaFromSpec(params.area, PLACES) || presetArea(PLACES[0]));
  const [drawing, setDrawing] = useState(false);
  const [variable, setVariable] = useState(params.v === 'frp' ? 'frp' : 'cells');
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unc, setUnc] = useState(null);
  const [harm, setHarm] = useState(null);
  const [cloud, setCloud] = useState(null);
  const [cmpMode, setCmpMode] = useState(params.from ? 'custom' : 'month');
  const [dates, setDates] = useState(() => ({
    from: params.from || `${lastIso.slice(0, 4)}-01-01`, to: params.to || lastIso }));

  useEffect(() => {
    json('uncertainty.json').then(setUnc).catch(() => {});
    json('validation/report_harmonise.json').then(setHarm).catch(() => {});
    json('cloud.json').then(setCloud).catch(() => {});
  }, []);
  useEffect(() => { monthLayer(month).then(setFires).catch(() => setFires(null)); }, [month]);
  useEffect(() => {
    if (!showNotFire || notFire) return;
    json('notfire.json').then((d) => setNotFire({ type: 'FeatureCollection', features: d.cells.map(([lat, lon, type, years]) =>
      ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { type, years } })) })).catch(() => {});
  }, [showNotFire, notFire]);

  // the share link follows every choice
  useEffect(() => {
    writeHash('explore', { area: area.spec, v: variable, m: month, ...(cmpMode === 'custom' ? { from: dates.from, to: dates.to } : {}) });
  }, [area, variable, month, dates, cmpMode]);

  const tileCount = useMemo(() => tilesOfCells(area.cells).filter((t) => meta.tiles[t.name]).length, [area, meta]);
  useEffect(() => {
    if (tileCount > MAX_TILES) { setSeries(null); setError(T.area.tooBig(tileCount, MAX_TILES)); return undefined; }
    let live = true;
    setLoading(true);
    areaSeries(meta, area).then((s) => { if (live) { setSeries(s); setLoading(false); } })
      .catch(() => { if (live) { setSeries(null); setLoading(false); setError(T.loadError); } });
    return () => { live = false; };
  }, [meta, area, tileCount]);

  const mon = useMemo(() => (series ? monthly(meta, series, variable, cloud) : null), [meta, series, variable, cloud]);
  const range = useMemo(() => (series && unc ? areaRange(unc, series.fineW, variable) : null), [series, unc, variable]);
  const sea = useMemo(() => (series ? season(meta, series, variable) : null), [meta, series, variable]);
  const win = useMemo(() => {
    if (cmpMode === 'month') return [dayIndex(meta, `${lastIso.slice(0, 7)}-01`), lastK];
    if (cmpMode === 'last30') return [lastK - 29, lastK];
    return [Math.max(0, dayIndex(meta, dates.from)), Math.min(lastK, dayIndex(meta, dates.to))];
  }, [cmpMode, dates, meta, lastK, lastIso]);
  const cmp = useMemo(() => (series ? compareWindow(meta, series, variable, win[0], win[1], range) : null),
    [meta, series, variable, win, range]);
  const monthShare = useMemo(() => {
    if (!mon || !cmp?.target || cmpMode !== 'month') return null;
    const n = normalMonth(mon, dateOf(meta, cmp.target.from).getUTCMonth());
    return n > 0 ? cmp.target.value / n : null;
  }, [mon, cmp, cmpMode, meta]);

  const months = useMemo(() => {
    const out = [];
    const s = new Date(meta.start + 'T00:00:00Z'), e = new Date(meta.end + 'T00:00:00Z');
    for (let d = new Date(s); d <= e; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))
      out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    return out;
  }, [meta]);

  const onBox = (b) => { setError(null); setArea(boxArea(b)); };
  const pickArea = (a) => { setError(null); setArea(a); };
  const falseAlarm = harm?.anomaly_rule?.plain?.false_alarm_pct ?? 27;
  const totals = mon && summary(mon.rows);
  const file = (what) => `shift_${slug(area.name)}_${what}`;
  const mLabel = T.measures[variable];

  return (
    <main className="explore">
      <section className="mapside">
        <MapView key={theme.name} theme={theme} fires={fires} notFire={notFire} showNotFire={showNotFire}
          area={area} drawing={drawing} onBox={onBox} onDrawEnd={() => setDrawing(false)} />
        <div className="mapbar">
          <label>{T.map.month}
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.slice().reverse().map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={showNotFire} onChange={(e) => setShowNotFire(e.target.checked)} />
            {T.map.notFire}</label>
          {showNotFire && <span className="kinds">
            <span className="swatch round" style={{ background: theme.industry }} /> {T.map.kinds.industry}
            <span className="swatch round" style={{ background: theme.volcano }} /> {T.map.kinds.volcano}
            <span className="swatch round" style={{ background: theme.offshore }} /> {T.map.kinds.offshore}
          </span>}
        </div>
      </section>

      <section className="story" aria-live="polite">
        <div className="controls">
          <AreaPicker area={area} setArea={pickArea} drawing={drawing} setDrawing={setDrawing} setError={setError} />
          <div className="seg" role="group" aria-label="Measure">
            {['cells', 'frp'].map((v) => <button key={v} className={variable === v ? 'on' : ''} aria-pressed={variable === v}
              onClick={() => setVariable(v)}>{T.measures[v]}</button>)}
          </div>
          <details className="define"><summary>{T.whatIsHotspot}</summary><p>{T.hotspotDefinition}</p></details>
        </div>
        {error && <p className="notice" role="alert">{error}</p>}

        <div className="print-only print-head">
          <b>{T.brand}</b> · {T.dataTo(longDate(dateOf(meta, lastK)))} · printed {new Date().toISOString().slice(0, 10)} · {location.href}
        </div>
        <h2>{area.name}</h2>
        <p className="small">{area.tested ? `${T.area.tested} ` : ''}{T.area.edgeNote}</p>
        {loading && <p className="muted">{T.loading}</p>}
        {!loading && series && series.tiles === 0 && <p className="muted">{T.noFire}</p>}
        {!loading && series && mon && series.tiles > 0 && (
          <>
            <p className="lede">{T.lede(totals.unusual, totals.critical, mon.baseline[0], mon.baseline[1], totals.nodataDays)}</p>

            <ChartCard title={T.headings.now} file={file('compare')} theme={theme} imageTitle={`${area.name}: ${mLabel.toLowerCase()}, same dates every year`}>
              <Compare meta={meta} cmp={cmp} variable={variable} theme={theme} mode={cmpMode} setMode={setCmpMode} monthShare={monthShare} />
            </ChartCard>

            <ChartCard title={T.headings.season} file={file('season')} theme={theme} imageTitle={`${area.name}: the usual fire season`}>
              <Season meta={meta} sea={sea} theme={theme} />
            </ChartCard>

            <ChartCard title={T.headings.calendar} file={file('calendar')} theme={theme} legend={calendarLegend(theme)}
              imageTitle={`${area.name}: daily ${mLabel.toLowerCase()}, ${meta.start.slice(0, 4)} to ${lastIso.slice(0, 4)}`}>
              <Calendar meta={meta} series={series} variable={variable} theme={theme} />
            </ChartCard>

            <ChartCard title={T.headings.months} file={file('months')} theme={theme} imageTitle={`${area.name}: each month against its normal (${mLabel.toLowerCase()})`}>
              <MonthGrid monthly={mon} variable={variable} theme={theme} falseAlarm={falseAlarm} />
            </ChartCard>

            <ChartCard title={T.headings.trend} file={file('trend')} theme={theme} imageTitle={`${area.name}: monthly ${mLabel.toLowerCase()}`}
              note={T.explainScale}>
              <Trend monthly={mon} range={range} variable={variable} theme={theme} />
            </ChartCard>

            <section className="card no-print">
              <h3>{T.headings.downloads}</h3>
              <Downloads meta={meta} area={area} series={series} mon={mon} range={range} unc={unc} variable={variable}
                dates={dates} setDates={(d) => { setDates(d); setCmpMode('custom'); }} />
            </section>
          </>
        )}
      </section>
    </main>
  );
}
