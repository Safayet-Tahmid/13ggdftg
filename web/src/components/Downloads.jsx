// Date range, the CSV downloads, the FIRMS link, the share link and the printable brief.
import { useState } from 'react';
import T from '../content/text.js';
import { cellRows, dayIndex, iso, lastDataDay, tileName } from '../lib/data.js';
import { cellCSV, dailyCSV, firmsLink, monthlyCSV, save, slug } from '../lib/downloads.js';

export default function Downloads({ meta, area, series, mon, range, unc, variable, dates, setDates }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [copied, setCopied] = useState(false);
  const minIso = meta.start, maxIso = iso(meta, lastDataDay(meta));
  const from = Math.max(0, dayIndex(meta, dates.from)), to = Math.min(lastDataDay(meta), dayIndex(meta, dates.to));
  const name = `shift_${slug(area.name)}_${dates.from}_${dates.to}`;
  const eraDays = { switchDay: dayIndex(meta, '2012-01-20'), terraEnd: dayIndex(meta, meta.terra_only_until) };

  const cells = async () => {
    setBusy(true); setNote(null);
    try {
      const { rows, truncated } = await cellRows(meta, area, from, to);
      const t = unc?.range_pct?.[variable];
      const fine = t ? (lat, lon, m, src) => (src >= 3 ? t[tileName(Math.floor(lat / 2.5) * 2.5, Math.floor(lon / 2.5) * 2.5)]?.[m] ?? null : null) : null;
      save(cellCSV(meta, rows, meta.sources || {}, fine), `${name}_cells.csv`, 'text/csv');
      if (truncated) setNote(T.downloads.cellsCut(rows.length));
    } finally { setBusy(false); }
  };
  const share = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt(T.area.share, location.href); }
  };

  return (
    <div className="downloads">
      <div className="picker">
        <label>{T.downloads.from}<input type="date" min={minIso} max={maxIso} value={dates.from}
          onChange={(e) => e.target.value && setDates({ ...dates, from: e.target.value })} /></label>
        <label>{T.downloads.to}<input type="date" min={minIso} max={maxIso} value={dates.to}
          onChange={(e) => e.target.value && setDates({ ...dates, to: e.target.value })} /></label>
        <button className="link" onClick={() => setDates({ from: minIso, to: maxIso })}>{T.downloads.whole}</button>
      </div>
      <div className="buttons">
        <button className="action" onClick={() => save(dailyCSV(meta, series, from, to, range, eraDays), `${name}_daily.csv`, 'text/csv')}>{T.downloads.daily}</button>
        <button className="action" onClick={() => save(monthlyCSV(mon, variable, range), `shift_${slug(area.name)}_monthly_${variable === 'frp' ? 'fire_power' : 'hotspots'}.csv`, 'text/csv')}>{T.downloads.monthly}</button>
        <button className="action" disabled={busy} onClick={cells}>{busy ? T.downloads.cellsBusy : T.downloads.cells}</button>
      </div>
      <div className="buttons">
        <a className="action ghost" href={firmsLink(area, dates.from, dates.to)} target="_blank" rel="noreferrer">{T.downloads.firms}</a>
        <button className="action ghost" onClick={share}>{copied ? T.area.copied : T.area.share}</button>
        <button className="action ghost" onClick={() => window.print()}>{T.downloads.print}</button>
      </div>
      {note && <p className="notice">{note}</p>}
      <p className="small">{T.downloads.note}</p>
    </div>
  );
}

