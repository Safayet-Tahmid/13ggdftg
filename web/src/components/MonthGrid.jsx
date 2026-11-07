// Each month against its own normal: one row per year, one square per month.
import { useState } from 'react';
import T, { MONTHS } from '../content/text.js';
import { fmt } from '../lib/format.js';

export default function MonthGrid({ monthly, variable, theme, falseAlarm }) {
  const [tip, setTip] = useState(null);
  const rows = monthly.rows;
  const years = [...new Set(rows.map((r) => r.year))];
  const cell = 18, gap = 2, left = 40, top = 16;
  const width = left + 12 * (cell + gap), height = top + years.length * (cell + gap);
  const anyCloud = rows.some((r) => r.cloudy);
  return (
    <figure className="chart">
      <div className="monthgrid">
        <svg data-export="svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={T.monthGrid.label}>
          {MONTHS.map((m, i) => <text key={m} x={left + i * (cell + gap) + cell / 2} y={10} className="axis" textAnchor="middle">{m[0]}</text>)}
          {years.map((y, yi) => <text key={y} x={0} y={top + yi * (cell + gap) + cell * 0.72} className="axis">{y}</text>)}
          <defs>
            <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill={theme.nodataBg} /><line x1="0" y1="0" x2="0" y2="5" stroke={theme.nodataLine} strokeWidth="1.2" />
            </pattern>
          </defs>
          {rows.map((r) => {
            const x = left + r.month * (cell + gap), y = top + years.indexOf(r.year) * (cell + gap);
            const fill = r.cls ? theme.cls[r.cls] : r.incomplete || r.notComparable ? 'url(#hatch)' : theme.zero;
            return (
              <g key={`${r.year}-${r.month}`} onMouseEnter={() => setTip({ r, x, y })} onMouseLeave={() => setTip(null)}>
                <rect x={x} y={y} width={cell} height={cell} rx={3} fill={fill} />
                {r.modisEra && r.cls && r.cls !== 'normal' && r.cls !== 'low' &&
                  <circle cx={x + cell - 4} cy={y + 4} r={2} fill={theme.surface} />}
                {r.cloudy && <circle cx={x + 4} cy={y + cell - 4} r={2.2} fill={theme.cloud} stroke={theme.surface} strokeWidth="0.8" />}
              </g>
            );
          })}
        </svg>
        {tip && (
          <div className="hover" style={{ left: Math.min(tip.x + 24, width - 40), top: tip.y + 20 }}>
            <b>{MONTHS[tip.r.month]} {tip.r.year}</b><br />
            {fmt(tip.r.value, variable)}<br />
            {tip.r.notComparable ? T.monthGrid.terra
              : tip.r.incomplete ? T.monthGrid.incomplete(tip.r.nodata)
              : tip.r.cls ? T.monthGrid.classed(T.classes[tip.r.cls], MONTHS[tip.r.month], tip.r.z.toFixed(1)) : T.monthGrid.tooFew}
            {tip.r.modisEra && tip.r.cls && (tip.r.cls === 'unusual' || tip.r.cls === 'critical') &&
              <><br />{T.monthGrid.falseAlarm(Math.round(falseAlarm))}</>}
            {tip.r.cloudy && <><br />{T.monthGrid.cloudTip}</>}
          </div>
        )}
      </div>
      <figcaption className="legend">
        {['low', 'normal', 'unusual', 'critical'].map((c) => <span key={c}><span className="swatch" style={{ background: theme.cls[c] }} /> {T.classes[c]}</span>)}
        <span><span className="swatch hatch" /> {T.monthGrid.notClassed}</span>
        <span><span className="dot" /> {T.monthGrid.before2012}</span>
        {(anyCloud || monthly.cloudUntil) && <span><span className="dot cloud" style={{ background: theme.cloud }} /> {T.monthGrid.cloudy}</span>}
      </figcaption>
      {monthly.cloudUntil && <p className="small">{T.monthGrid.cloudUntil(monthly.cloudUntil)}</p>}
    </figure>
  );
}
