// The burning activity calendar: one row per year, one column per day of the year.
import { useEffect, useMemo, useRef, useState } from 'react';
import T, { MONTHS } from '../content/text.js';
import { dateOf, dayIndex } from '../lib/data.js';
import { fmt } from '../lib/format.js';

export function calendarLegend(theme) {
  return [[theme.zero, T.calendar.noFire], ...theme.ramp.map((c, i) => [c, i === 0 ? 'any fire' : i === 5 ? T.calendar.more : '']).filter(([, l]) => l),
    [theme.nodataLine, T.calendar.noData]];
}

export default function Calendar({ meta, series, variable, theme }) {
  const ref = useRef(null);
  const wrap = useRef(null);
  const [tip, setTip] = useState(null);
  const [width, setWidth] = useState(300);
  const v = series[variable];
  const first = dateOf(meta, 0).getUTCFullYear();
  const last = dateOf(meta, meta.days - 1).getUTCFullYear();
  const years = last - first + 1;
  const switchDay = dayIndex(meta, '2012-01-20');

  // magnitude bins from this area's own non-zero days, so a quiet place and a busy one both read
  const bins = useMemo(() => {
    const nz = [];
    for (let k = 0; k < meta.days; k++) if (v[k] > 0 && !series.nodata[k]) nz.push(v[k]);
    nz.sort((a, b) => a - b);
    const q = (p) => (nz.length ? nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] : 0);
    return [q(0.4), q(0.65), q(0.82), q(0.93), q(0.98)];
  }, [v, series.nodata, meta.days]);

  useEffect(() => {
    setWidth(Math.max(280, wrap.current.clientWidth));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const left = 46, top = 18;
  const cw = (width - left - 4) / 366;
  const ch = Math.max(7, Math.min(14, cw * 3.2));
  const height = top + years * ch + 6;

  useEffect(() => {
    const c = ref.current, dpr = window.devicePixelRatio || 1;
    c.width = width * dpr; c.height = height * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, height);
    g.font = `11px ${theme.font}`;
    g.fillStyle = theme.muted;
    g.textBaseline = 'middle';
    MONTHS.forEach((m, i) => {
      const d = Math.round(new Date(Date.UTC(2001, i, 1)) / 864e5 - new Date(Date.UTC(2001, 0, 1)) / 864e5);
      g.fillText(m, left + d * cw, 8);
    });
    for (let y = 0; y < years; y++) {
      if ((first + y) % 2 === 0 || years < 14) g.fillText(String(first + y), 2, top + y * ch + ch / 2);
    }
    const hatch = g.createPattern(hatchTile(theme), 'repeat');
    for (let k = 0; k < meta.days; k++) {
      const d = dateOf(meta, k);
      const y = d.getUTCFullYear() - first;
      const doy = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5);
      const x = left + doy * cw, yy = top + y * ch;
      if (series.nodata[k]) { g.fillStyle = hatch; g.fillRect(x, yy, Math.max(cw, 1), ch - 1); continue; }
      const val = v[k];
      let i = -1;
      if (val > 0) { i = 0; while (i < 5 && val > bins[i]) i++; }
      g.fillStyle = i < 0 ? theme.zero : theme.ramp[i];
      g.fillRect(x, yy, Math.max(cw, 1), ch - 1);
    }
    // D30: a bracket beside the years whose day-level values are indicative
    const sd = dateOf(meta, switchDay);
    const sy = sd.getUTCFullYear() - first;
    g.strokeStyle = theme.muted; g.lineWidth = 1;
    g.beginPath(); g.moveTo(left - 5, top); g.lineTo(left - 8, top); g.lineTo(left - 8, top + (sy + 1) * ch - 2); g.lineTo(left - 5, top + (sy + 1) * ch - 2); g.stroke();
    // where VIIRS takes over
    const sx = left + Math.floor((sd - Date.UTC(sd.getUTCFullYear(), 0, 1)) / 864e5) * cw;
    g.strokeStyle = theme.ink; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(left, top + sy * ch - 0.5); g.lineTo(sx, top + sy * ch - 0.5);
    g.lineTo(sx, top + (sy + 1) * ch - 0.5); g.lineTo(width - 4, top + (sy + 1) * ch - 0.5); g.stroke();
  }, [width, height, v, series.nodata, bins, theme, meta, first, years, cw, ch, switchDay]);

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const yr = Math.floor((y - top) / ch), doy = Math.floor((x - left) / cw);
    if (yr < 0 || yr >= years || doy < 0 || doy > 365) return setTip(null);
    const t = Date.UTC(first + yr, 0, 1) + doy * 864e5;
    const k = Math.round((t - Date.parse(meta.start + 'T00:00:00Z')) / 864e5);
    if (k < 0 || k >= meta.days || new Date(t).getUTCFullYear() !== first + yr) return setTip(null);
    setTip({ x, y, k });
  };

  let tipText = null;
  if (tip) {
    const k = tip.k;
    const date = dateOf(meta, k).toISOString().slice(0, 10);
    const src = k < dayIndex(meta, meta.terra_only_until) + 1 ? T.calendar.srcTerra : k < switchDay ? T.calendar.srcModis : T.calendar.srcViirs;
    tipText = series.nodata[k]
      ? <><b>{date}</b><br />{T.calendar.tipNoData}</>
      : <><b>{date}</b><br />{fmt(v[k], variable)}<br />{src}{series.filled[k] ? T.calendar.filled : ''}
        {k < switchDay && <><br /><i>{T.calendar.tipIndicative}</i></>}</>;
  }

  return (
    <figure className="chart" ref={wrap}>
      <div className="calendar" onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
        <canvas ref={ref} data-export="canvas" style={{ width, height }} aria-label={T.calendar.label} role="img" />
        {tip && <div className="hover" style={{ left: Math.min(tip.x + 12, width - 230), top: tip.y + 12 }}>{tipText}</div>}
      </div>
      <figcaption className="legend">
        <span><span className="swatch" style={{ background: theme.zero }} /> {T.calendar.noFire}</span>
        <span>{theme.ramp.map((c, i) => <span key={c + i} className="swatch" style={{ background: c }} title={i ? `above ${fmt(bins[i - 1], variable)}` : 'any fire'} />)}
          <span className="legend-text">{T.calendar.more}</span></span>
        <span><span className="swatch hatch" /> {T.calendar.noData}</span>
        <span><span className="legend-line" /> {T.calendar.viirs}</span>
        <span><span className="legend-bracket" /> {T.calendar.indicative}</span>
      </figcaption>
    </figure>
  );
}

function hatchTile(theme) {
  const c = document.createElement('canvas');
  c.width = c.height = 6;
  const g = c.getContext('2d');
  g.fillStyle = theme.nodataBg; g.fillRect(0, 0, 6, 6);
  g.strokeStyle = theme.nodataLine; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 6); g.lineTo(6, 0); g.stroke();
  return c;
}
