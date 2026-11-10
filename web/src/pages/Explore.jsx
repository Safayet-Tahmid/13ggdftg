// The Explore page: map on one side, the story of the chosen area on the other.
// Layout and order of the sections can be changed freely; the numbers come from lib/.
import { useEffect, useMemo, useRef, useState } from 'react';
import T from '../content/text.js';
import PLACES from '../content/places.js';
import MapView from '../components/MapView.jsx';
import MapBoundary from '../components/MapBoundary.jsx';
import MapLegend from '../components/MapLegend.jsx';
import CellPanel from '../components/CellPanel.jsx';
import AreaPicker from '../components/AreaPicker.jsx';
import ChartCard from '../components/ChartCard.jsx';
import Calendar, { calendarLegend } from '../components/Calendar.jsx';
import MonthGrid from '../components/MonthGrid.jsx';
import Trend from '../components/Trend.jsx';
import Compare from '../components/Compare.jsx';
import Season from '../components/Season.jsx';
import Downloads from '../components/Downloads.jsx';
import { MAX_TILES, areaSeries, dateOf, iso, json, lastDataDay, monthLayer, tilesOfCells, dayIndex, zoneMonth } from '../lib/data.js';
import { IMAGERY_FIRST_DAY, cellInfo, days_in_month, imagery } from '../lib/geo.js';
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
  const [checks, setChecks] = useState(null);
  const [cmpMode, setCmpMode] = useState(params.from ? 'custom' : 'month');
  const [dates, setDates] = useState(() => ({
    from: params.from || `${lastIso.slice(0, 4)}-01-01`, to: params.to || lastIso }));

  // ---- map view: 2D or 3D, backdrop, gaps, the clicked cell, playback (none of these change a value)
  const [view, setView] = useState(params.p === '3d' ? '3d' : '2d');
  const [basemap, setBasemap] = useState({ sat: 'satellite', day: 'daily' }[params.b] || 'standard');
  const [dayOfMonth, setDayOfMonth] = useState(15);
  const [showGaps, setShowGaps] = useState(false);
  const [gaps, setGaps] = useState(null);
  const [picked, setPicked] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const [mapNote, setMapNote] = useState(null);
  const [mapOk, setMapOk] = useState(true);
  const [legendOpen, setLegendOpen] = useState(() => window.matchMedia?.('(min-width: 900px)').matches ?? true);
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);

  useEffect(() => {
    json('uncertainty.json').then(setUnc).catch(() => {});
    json('validation/report_harmonise.json').then(setHarm).catch(() => {});
    json('cloud.json').then(setCloud).catch(() => {});
    json('validation/report_checks.json').then(setChecks).catch(() => {});
  }, []);
  useEffect(() => {
    let live = true;
    monthLayer(month).then((f) => { if (live) setFires(f); }).catch(() => { if (live) setFires(null); });
    return () => { live = false; };
  }, [month]);
  // satellite availability per 30-degree zone for the map month (for the gap hatching and the cell panel)
  useEffect(() => {
    if (!showGaps && !picked) return undefined;
    let live = true;
    zoneMonth(meta, month).then((g) => { if (live) setGaps(g); }).catch(() => {});
    return () => { live = false; };
  }, [meta, month, showGaps, picked != null]);  // eslint-disable-line react-hooks/exhaustive-deps

  // playback: one published month after another (no in-between frames), then stop at the last one
  const monthRef = useRef(month);
  monthRef.current = month;
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => {
      const i = months.indexOf(monthRef.current);
      if (i < 0 || i >= months.length - 1) { setPlaying(false); return; }
      if (i + 2 < months.length) monthLayer(months[i + 2]).catch(() => {});   // fetch the next file early
      setMonth(months[i + 1]);
    }, reducedMotion ? Math.max(speed, 2000) : speed);
    return () => clearInterval(t);
  }, [playing, speed]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showNotFire || notFire) return;
    json('notfire.json').then((d) => setNotFire({ type: 'FeatureCollection', features: d.cells.map(([lat, lon, type, years]) =>
      ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { type, years } })) })).catch(() => {});
  }, [showNotFire, notFire]);

  // the share link follows every choice
  useEffect(() => {
    writeHash('explore', { area: area.spec, v: variable, m: month, ...(cmpMode === 'custom' ? { from: dates.from, to: dates.to } : {}),
      ...(view === '3d' ? { p: '3d' } : {}), ...(basemap !== 'standard' ? { b: basemap === 'satellite' ? 'sat' : 'day' } : {}) });
  }, [area, variable, month, dates, cmpMode, view, basemap]);

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

  const onBox = (b) => { setError(null); setPlaying(false); setArea(boxArea(b)); };
  const pickArea = (a) => { setError(null); setPlaying(false); setArea(a); };
  const pickMonth = (m) => { setPlaying(false); setMonth(m); };

  // the picture date follows the map month (clamped to the month and to the last data day)
  const imageryDay = useMemo(() => {
    const d = `${month}-${String(Math.min(dayOfMonth, days_in_month(month))).padStart(2, '0')}`;
    return d > lastIso ? lastIso : d;
  }, [month, dayOfMonth, lastIso]);
  const img = basemap === 'standard' ? null : imagery(basemap, imageryDay);
  useEffect(() => { setMapNote(basemap === 'daily' && !img ? T.map.imageryTooEarly : null); }, [basemap, img?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // the clicked cell, read again from the current month's file whenever the month changes
  const pickInfo = useMemo(() => {
    if (!picked) return null;
    const f = fires?.features.find((x) => x.properties.lon === picked.lon && x.properties.lat === picked.lat);
    return cellInfo({ lon: picked.lon, lat: picked.lat, cells: f ? f.properties.cells : 0, frp: f ? f.properties.frp : 0 },
      month, { unc, cloud, zoneDays: gaps ? gaps[Math.floor((picked.lat + 90) / 30) * 12 + Math.floor((picked.lon + 180) / 30)] : null });
  }, [picked, fires, month, unc, cloud, gaps]);

  const mapSummary = useMemo(() => {
    if (!fires) return '';
    let frp = 0, cl = 0;
    for (const f of fires.features) { frp += f.properties.frp; cl += f.properties.cells; }
    return T.map.summary(month, fires.features.length, Math.round(frp), Math.round(cl), T.map.views[view]);
  }, [fires, month, view]);
  const falseAlarm = checks?.anomaly_rule?.regions?.plain?.false_alarm_pct ?? harm?.anomaly_rule?.plain?.false_alarm_pct ?? 27;
  const totals = mon && summary(mon.rows);
  const file = (what) => `shift_${slug(area.name)}_${what}`;
  const mLabel = T.measures[variable];

  return (
    <main className="explore">
      <section className="mapside">
        <div className="mapstage">
        <MapBoundary onFail={() => setMapOk(false)}>
          <MapView key={theme.name} theme={theme} fires={fires} notFire={notFire} showNotFire={showNotFire}
            area={area} drawing={drawing} onBox={onBox} onDrawEnd={() => setDrawing(false)}
            onDateLine={() => setError(T.map.dateLine)}
            variable={variable} view={view} basemap={img ? basemap : 'standard'} imageryDay={imageryDay}
            gaps={gaps} showGaps={showGaps} picked={picked} onPick={(c) => { setPlaying(false); setPicked(c); }}
            resetKey={resetKey} reducedMotion={reducedMotion}
            onImageryError={() => setMapNote(T.map.imageryOffline)}
            onStatus={(st) => { if (st === 'failed') setMapOk(false); else setMapNote(st === 'lost' ? T.map.contextLost : null); }} />
        </MapBoundary>

        {mapOk && <>
        <div className="maptools" role="toolbar" aria-label={T.map.view}>
          <div className="seg" role="group" aria-label={T.map.view}>
            {['2d', '3d'].map((v) => <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v}
              onClick={() => setView(v)}>{T.map.views[v]}</button>)}
          </div>
          <label>{T.map.basemap}
            <select value={basemap} onChange={(e) => setBasemap(e.target.value)}>
              {Object.entries(T.map.basemaps).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {basemap === 'daily' && <label>{T.map.imageryDay}
            <select value={Math.min(dayOfMonth, days_in_month(month))} onChange={(e) => setDayOfMonth(+e.target.value)}>
              {Array.from({ length: days_in_month(month) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{month}-{String(d).padStart(2, '0')}</option>)}
            </select>
          </label>}
          <button type="button" className="action" onClick={() => setResetKey((k) => k + 1)}>{T.map.reset}</button>
        </div>

        {mapNote && <p className="mapnote" role="status">{mapNote}</p>}
        <CellPanel info={pickInfo} onClose={() => setPicked(null)} />
        <details className="legendbox" open={legendOpen} onToggle={(e) => setLegendOpen(e.currentTarget.open)}>
          <summary>{T.map.legendToggle}</summary>
          <MapLegend theme={theme} variable={variable} month={month} showGaps={showGaps} imageryLabel={img?.label} />
        </details>
        </>}
        </div>
        <p className="visually-hidden" aria-live="polite">{mapSummary}</p>

        <div className="mapbar">
          <label>{T.map.month}
            <select value={month} onChange={(e) => pickMonth(e.target.value)}>
              {months.slice().reverse().map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          {mapOk && <>
          <button type="button" className="action" aria-pressed={playing}
            onClick={() => { if (!playing && month === months[months.length - 1]) setMonth(months[0]); setPlaying(!playing); }}>
            {playing ? `❚❚ ${T.map.pause}` : `▶ ${T.map.play}`}</button>
          <label>{T.map.speed}
            <select value={speed} onChange={(e) => setSpeed(+e.target.value)}>
              {Object.entries(T.map.speeds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={showGaps} onChange={(e) => setShowGaps(e.target.checked)} />
            {T.map.gaps}</label>
          <label className="check"><input type="checkbox" checked={showNotFire} onChange={(e) => setShowNotFire(e.target.checked)} />
            {T.map.notFire}</label>
          {showNotFire && <span className="kinds">
            <span className="swatch round" style={{ background: theme.industry }} /> {T.map.kinds.industry}
            <span className="swatch round" style={{ background: theme.volcano }} /> {T.map.kinds.volcano}
            <span className="swatch round" style={{ background: theme.offshore }} /> {T.map.kinds.offshore}
          </span>}
          </>}
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
