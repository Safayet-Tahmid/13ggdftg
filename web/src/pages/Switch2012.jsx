// The 2012 switch: the raw record against SHIFT's harmonised record, year by year.
import { useEffect, useMemo, useState } from 'react';
import { csv } from '../lib/data.js';
import { REGION_NAMES } from './Validation.jsx';

export default function Switch2012({ theme }) {
  const [rows, setRows] = useState(null);
  const [steps, setSteps] = useState(null);
  const [region, setRegion] = useState('global');
  const [mode, setMode] = useState('raw');
  useEffect(() => {
    csv('validation/l3__yearly_totals.csv').then(setRows).catch(() => setRows([]));
    csv('validation/l3__step_2012.csv').then(setSteps).catch(() => setSteps([]));
  }, []);
  const data = useMemo(() => (rows || []).filter((r) => r.region === region && r.year >= 2003)
    .map((r) => ({ year: r.year, raw: r.year < 2012 ? r.MODIS_cells : r['S-NPP_cells'], harmonised: r.cells_h })), [rows, region]);
  const step = (steps || []).find((s) => s.region === region);
  if (!rows) return <main className="page"><p className="muted">Loading…</p></main>;
  const lastYear = data.length ? data[data.length - 1].year : null;
  const w = 720, h = 300, l = 56, r = 12, t = 16, b = 28;
  const max = Math.max(1, ...data.map((d) => Math.max(d.raw || 0, d.harmonised || 0)));
  const bw = (w - l - r) / Math.max(data.length, 1);
  const y = (v) => t + (1 - v / max) * (h - t - b);
  const unit = max >= 1e6 ? [1e6, 'M'] : max >= 1e3 ? [1e3, 'k'] : [1, ''];
  return (
    <main className="page">
      <h2>Raw records show fires more than doubling in 2012. That is the satellite, not the planet.</h2>
      <p className="lede">In January 2012 the record moves from MODIS (1 km pixels) to VIIRS (375 m pixels), which sees
        small fires MODIS misses. Joined end to end, the two make a cliff. SHIFT measures how each place's fires look
        to both satellites over the years they flew together and puts the older years on the newer scale.</p>
      <div className="picker">
        <label>Region<select value={region} onChange={(e) => setRegion(e.target.value)}>
          {[...new Set(rows.map((x) => x.region))].map((id) => <option key={id} value={id}>{REGION_NAMES[id] || id}</option>)}
        </select></label>
        <div className="seg" role="group" aria-label="Record">
          <button className={mode === 'raw' ? 'on' : ''} aria-pressed={mode === 'raw'} onClick={() => setMode('raw')}>Raw record</button>
          <button className={mode === 'harmonised' ? 'on' : ''} aria-pressed={mode === 'harmonised'} onClick={() => setMode('harmonised')}>SHIFT harmonised</button>
        </div>
      </div>
      <figure className="chart">
        <svg viewBox={`0 0 ${w} ${h}`} className="wide" role="img" aria-label={`Yearly hotspots, ${mode}`}>
          {[0, 0.5, 1].map((f) => <g key={f}><line x1={l} x2={w - r} y1={y(f * max)} y2={y(f * max)} className="grid" />
            <text x={l - 6} y={y(f * max) + 4} className="axis" textAnchor="end">{(f * max / unit[0]).toFixed(1)}{unit[1]}</text></g>)}
          {data.map((d, i) => {
            const v = d[mode] || 0;
            const fill = d.year < 2012 ? (mode === 'raw' ? theme.cls.normal : theme.ramp[3]) : theme.ramp[4];
            return <g key={d.year}>
              <rect x={l + i * bw + 1} y={y(v)} width={bw - 2} height={y(0) - y(v)} rx={2} fill={fill}>
                <title>{d.year}: {Math.round(v).toLocaleString()} hotspots{d.year === lastYear ? ' (year not complete)' : ''}</title>
              </rect>
              {(d.year % 3 === 0) && <text x={l + i * bw + bw / 2} y={h - 8} className="axis" textAnchor="middle">{d.year}</text>}
            </g>;
          })}
          <line x1={l + data.findIndex((d) => d.year === 2012) * bw} x2={l + data.findIndex((d) => d.year === 2012) * bw}
            y1={t} y2={h - b} className="switch" />
        </svg>
        <figcaption className="legend">Hotspots per year. Bars before 2012 are MODIS{mode === 'raw' ? ' as observed' : ' on the VIIRS scale'}; from 2012, VIIRS. {lastYear} is not complete.</figcaption>
      </figure>
      {step && (
        <div className="facts">
          <p><b>{step.cells_step_raw_switch?.toFixed(2)}×</b><span>jump at the switch in the raw record (VIIRS 2013 to 2015 against MODIS 2009 to 2011)</span></p>
          <p><b>{step.cells_step_harmonised?.toFixed(2)}×</b><span>the same comparison after SHIFT</span></p>
          <p><b>{step.cells_step_modis_only?.toFixed(2)}×</b><span>the change MODIS alone shows over the same years (one sensor, so no switch: the reference SHIFT aims to match, not a ground truth)</span></p>
        </div>
      )}
    </main>
  );
}
