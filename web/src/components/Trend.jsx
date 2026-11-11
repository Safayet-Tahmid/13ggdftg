// Monthly totals over the whole record, with the calibrated 95% range of the MODIS years.
import { useEffect, useRef, useState } from 'react';
import T, { MONTHS } from '../content/text.js';
import { compact, fmt } from '../lib/format.js';

export default function Trend({ monthly, range, variable, theme }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    setWidth(Math.max(280, wrap.current.clientWidth));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const rows = monthly.rows;
  const h = 200, l = 54, r = 10, t = 12, b = 24;
  const lo = (row) => (row.modisEra && range?.[row.month] != null ? row.value / (1 + range[row.month] / 100) : row.value);
  const hi = (row) => (row.modisEra && range?.[row.month] != null ? row.value * (1 + range[row.month] / 100) : row.value);
  const max = Math.max(1, ...rows.map(hi));
  const x = (i) => l + (i / Math.max(rows.length - 1, 1)) * (width - l - r);
  const y = (v) => t + (1 - v / max) * (h - t - b);
  const line = rows.map((row, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(row.value).toFixed(1)}`).join('');
  const pre = rows.map((row, i) => [i, row]).filter(([, row]) => row.modisEra);
  const band = pre.length
    ? pre.map(([i, row], j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(hi(row)).toFixed(1)}`).join('')
      + pre.slice().reverse().map(([i, row]) => `L${x(i).toFixed(1)},${y(lo(row)).toFixed(1)}`).join('') + 'Z'
    : '';
  const si = rows.findIndex((row) => !row.modisEra);
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const yearsShown = rows.map((row, i) => [row, i]).filter(([row]) => row.month === 0 && row.year % 4 === 0);
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - l) / (width - l - r)) * (rows.length - 1));
    setHover(i >= 0 && i < rows.length ? i : null);
  };
  const hv = hover != null ? rows[hover] : null;
  return (
    <figure className="chart" ref={wrap}>
      <svg data-export="svg" width={width} height={h} viewBox={`0 0 ${width} ${h}`} onMouseMove={onMove} onClick={onMove} onMouseLeave={() => setHover(null)} role="img"
        aria-label={T.trend.label(T.measures[variable].toLowerCase())}>
        {ticks.map((v) => <g key={v}><line x1={l} x2={width - r} y1={y(v)} y2={y(v)} className="grid" />
          <text x={l - 6} y={y(v) + 4} className="axis" textAnchor="end">{compact(v)}</text></g>)}
        {yearsShown.map(([row, i]) => <text key={row.year} x={x(i)} y={h - 6} className="axis" textAnchor="middle">{row.year}</text>)}
        {band && <path d={band} fill={theme.band} />}
        <path d={line} fill="none" stroke={theme.line} strokeWidth="1.6" strokeLinejoin="round" />
        {si > 0 && <g><line x1={x(si)} x2={x(si)} y1={t} y2={h - b} className="switch" />
          <text x={x(si) + 4} y={t + 10} className="axis">{T.trend.viirs}</text></g>}
        {hv && <g><line x1={x(hover)} x2={x(hover)} y1={t} y2={h - b} className="cross" />
          <circle cx={x(hover)} cy={y(hv.value)} r={4} fill={theme.line} stroke={theme.surface} strokeWidth="2" /></g>}
      </svg>
      {hv && (
        <div className="hover" style={{ left: Math.min(x(hover) + 12, width - 210), top: 8 }}>
          <b>{MONTHS[hv.month]} {hv.year}</b><br />{fmt(hv.value, variable)}
          {hv.modisEra && range?.[hv.month] != null && <><br />{T.trend.rangeTip(fmt(lo(hv), variable), fmt(hi(hv), variable))}</>}
          {hv.nodata > 0 && <><br />{hv.nodata} day(s) without data</>}
        </div>
      )}
      <figcaption className="legend">
        <span><span className="legend-line solid" /> {T.trend.total}</span>
        <span><span className="swatch" style={{ background: theme.band }} /> {T.trend.range}</span>
      </figcaption>
    </figure>
  );
}
