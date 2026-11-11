// "Now against the past" (D32): a window of dates (this month so far, the last 30 days or the
// user's dates) against the same dates in every other year: median, rank and ratio.
import { useEffect, useRef, useState } from 'react';
import T, { MONTHS_LONG, rangeShort } from '../content/text.js';
import { compact, fmt, longDate } from '../lib/format.js';
import { dateOf } from '../lib/data.js';

export default function Compare({ meta, cmp, variable, theme, mode, setMode, monthShare }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    setWidth(Math.max(280, wrap.current.clientWidth));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const tabs = (
    <div className="seg" role="group" aria-label="Dates to compare">
      {Object.entries(T.compare.modes).map(([id, label]) => (
        <button key={id} className={mode === id ? 'on' : ''} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>
      ))}
    </div>
  );
  if (!cmp || cmp.error) {
    return <div ref={wrap}>{tabs}<p className="small">{cmp?.error === 'length' ? T.compare.tooLong : T.compare.customHint}</p></div>;
  }
  const tgt = cmp.target;
  const ys = cmp.years.filter((r) => r.year >= +(meta.comparable_start || '2003').slice(0, 4) || r.target);
  const h = 170, l = 44, r = 8, t = 10, b = 22;
  const hi = (row) => (row.rangePct != null ? row.value * (1 + row.rangePct / 100) : row.value);
  const max = Math.max(1, ...ys.map(hi), cmp.median || 0);
  const bw = (width - l - r) / Math.max(ys.length, 1);
  const y = (v) => t + (1 - v / max) * (h - t - b);
  const from = longDate(dateOf(meta, tgt?.from ?? 0)), to = longDate(dateOf(meta, tgt?.to ?? 0));
  const hv = hover != null ? ys[hover] : null;

  return (
    <div ref={wrap}>
      {tabs}
      {tgt && (
        <div className="facts compact">
          <p><b>{fmt(tgt.value, variable)}</b><span>{T.compare.window(from, to)}</span></p>
          <p><b>{T.compare.vsMedian(cmp.ratio)}</b><span>{T.compare.median(fmt(cmp.median, variable), cmp.baseline[0], cmp.baseline[1], cmp.baseCount)}</span></p>
          <p><b>{cmp.rank ? `#${cmp.rank}` : '–'}</b><span>{cmp.rank ? T.compare.rank(cmp.rank, cmp.of) : ''}</span></p>
        </div>
      )}
      {mode === 'month' && monthShare != null && tgt && (
        <p className="small">{T.compare.monthShare(Math.round(monthShare * 100), MONTHS_LONG[dateOf(meta, tgt.from).getUTCMonth()])}</p>
      )}
      <figure className="chart">
        <svg data-export="svg" width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={T.compare.chartLabel}
          onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => <g key={f}><line x1={l} x2={width - r} y1={y(f * max)} y2={y(f * max)} className="grid" />
            <text x={l - 6} y={y(f * max) + 4} className="axis" textAnchor="end">{compact(f * max)}</text></g>)}
          {ys.map((row, i) => {
            const x = l + i * bw;
            const fill = row.target ? theme.highlight : row.usable ? theme.cls.normal : theme.nodataBg;
            return (
              <g key={row.year} onMouseEnter={() => setHover(i)}>
                <rect x={x} y={t} width={bw} height={h - t - b} fill="transparent" />
                <rect x={x + 1} y={y(row.value)} width={Math.max(1, bw - 2)} height={Math.max(0, y(0) - y(row.value))} rx={1.5} fill={fill}
                  stroke={row.usable || row.target ? 'none' : theme.nodataLine} strokeDasharray="2 2" />
                {row.rangePct != null && row.usable && <line x1={x + bw / 2} x2={x + bw / 2} y1={y(hi(row))} y2={y(row.value / (1 + row.rangePct / 100))}
                  stroke={theme.muted} strokeWidth="1" />}
                {(row.year % 5 === 0 || row.target) && <text x={x + bw / 2} y={h - 6} className="axis" textAnchor="middle">{row.target ? row.year : `'${String(row.year).slice(2)}`}</text>}
              </g>
            );
          })}
          {cmp.median != null && <g><line x1={l} x2={width - r} y1={y(cmp.median)} y2={y(cmp.median)} stroke={theme.ink} strokeWidth="1.2" strokeDasharray="4 3" />
            <text x={l + 4} y={y(cmp.median) - 4} className="axis">normal</text></g>}
        </svg>
        {hv && (
          <div className="hover" style={{ left: Math.min(l + hover * bw + 10, width - 220), top: 6 }}>
            <b>{hv.year}</b>: {fmt(hv.value, variable)}
            {hv.rangePct != null && <><br />{rangeShort(Math.round(hv.rangePct))}</>}
            {!hv.usable && !hv.target && <><br />{hv.gaps ? `${hv.gaps} day(s) without data: left out` : 'not comparable'}</>}
          </div>
        )}
        <figcaption className="legend">
          <span><span className="swatch" style={{ background: theme.highlight }} /> {tgt?.year ?? ''}</span>
          <span><span className="swatch" style={{ background: theme.cls.normal }} /> other years</span>
          <span><span className="legend-line dashed" /> normal (median)</span>
        </figcaption>
      </figure>
      {cmp.left > 0 && <p className="small">{T.compare.left(cmp.left)}</p>}
      {cmp.targetGaps > 0 && <p className="small">{T.compare.targetGaps(cmp.targetGaps)}</p>}
      {ys.some((r2) => r2.rangePct != null) && <p className="small">{T.compare.modisNote}</p>}
    </div>
  );
}
