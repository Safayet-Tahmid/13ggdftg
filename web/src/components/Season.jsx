// "When the fire season comes": the average year for the area, the usual season, its peak, and
// where today sits in it. Built from the baseline years only; a guide to timing, not a forecast.
import { useEffect, useRef, useState } from 'react';
import T, { MONTHS } from '../content/text.js';
import { doyLabel } from '../lib/analysis.js';
import { dateOf, lastDataDay } from '../lib/data.js';
import { longDate } from '../lib/format.js';

export default function Season({ meta, sea, theme }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(300);
  useEffect(() => {
    setWidth(Math.max(280, wrap.current.clientWidth));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  if (!sea) return <div ref={wrap}><p className="muted">{T.season.none}</p></div>;

  const h = 120, l = 8, r = 8, t = 8, b = 20;
  const max = Math.max(...sea.smooth) || 1;
  const x = (d) => l + (d / 364) * (width - l - r);
  const y = (v) => t + (1 - v / max) * (h - t - b);
  const path = sea.smooth.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('') + `L${x(364)},${y(0)}L${x(0)},${y(0)}Z`;
  const arcs = sea.start <= sea.end ? [[sea.start, sea.end]] : [[sea.start, 364], [0, sea.end]];
  const today = longDate(dateOf(meta, lastDataDay(meta)));

  return (
    <div ref={wrap}>
      <figure className="chart">
        <svg data-export="svg" width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={T.season.chartLabel}>
          {arcs.map(([a, c]) => <rect key={a} x={x(a)} y={t} width={Math.max(1, x(c) - x(a))} height={h - t - b} fill={theme.band} />)}
          <path d={path} fill={theme.ramp[2]} stroke={theme.ramp[4]} strokeWidth="1.2" />
          {MONTHS.map((m, i) => {
            const d = Math.round((Date.UTC(2001, i, 1) - Date.UTC(2001, 0, 1)) / 864e5);
            return <text key={m} x={x(d) + 2} y={h - 6} className="axis">{m}</text>;
          })}
          <line x1={x(sea.peak)} x2={x(sea.peak)} y1={t} y2={h - b} stroke={theme.ink} strokeWidth="1" strokeDasharray="2 2" />
          <line x1={x(sea.today)} x2={x(sea.today)} y1={t - 4} y2={h - b} stroke={theme.highlight} strokeWidth="2" />
          <text x={Math.min(x(sea.today) + 4, width - 64)} y={t + 8} className="axis strong">{T.season.marker}</text>
        </svg>
        <figcaption className="legend">
          <span><span className="swatch" style={{ background: theme.band }} /> usual season (10% to 90% of a year's fire)</span>
          <span><span className="legend-line dashed" /> peak</span>
          <span><span className="legend-line accent" style={{ borderColor: theme.highlight }} /> {T.season.marker}: {today}</span>
        </figcaption>
      </figure>
      <ul className="season-list">
        <li>{T.season.runs(doyLabel(sea.start), doyLabel(sea.end), sea.length)} {T.season.peak(doyLabel(sea.peak))}</li>
        <li>{T.season.core(doyLabel(sea.core[0]), doyLabel(sea.core[1]))} {T.season.sharp(Math.round(sea.sharp * 100))}</li>
        <li><b>{T.season.now(today)}</b> {sea.inSeason ? T.season.inSeason : T.season.outSeason(sea.daysToStart)} {T.season.next30(Math.round(sea.next30 * 100))}
          {' '}{T.season.soFar(sea.soFarRatio, doyLabel(sea.quiet))} {sea.soFarGaps > 0 ? T.season.gaps : ''}</li>
      </ul>
      <p className="small">{T.season.basis(sea.baseline[0], sea.baseline[1])}</p>
    </div>
  );
}
