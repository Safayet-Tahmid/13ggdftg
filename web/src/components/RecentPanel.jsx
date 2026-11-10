// The panel for one clicked recent detection (D38). Shows only the fields FIRMS provides, plus
// SHIFT's non-fire flag. Wording lives in content/text.js (T.recent.panel).
import T from '../content/text.js';
import { firmsLink } from '../lib/downloads.js';

const deg = (x, pos, neg) => `${Math.abs(x).toFixed(4)}°${x >= 0 ? pos : neg}`;

export default function RecentPanel({ info, onClose, onHistory }) {
  if (!info) return null;
  const P = T.recent.panel;
  const day = info.time.slice(0, 10);
  const box = { w: info.lon - 0.1, e: info.lon + 0.1, s: info.lat - 0.1, n: info.lat + 0.1 };
  return (
    <aside className="cellpanel recentpanel" aria-label={P.title} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <header>
        <h3>{P.title}</h3>
        <button type="button" className="link" onClick={onClose} aria-label={P.close}>✕</button>
      </header>
      <dl>
        <dt>{P.where}</dt>
        <dd>{deg(info.lat, 'N', 'S')}, {deg(info.lon, 'E', 'W')}<br /><span className="small muted">{P.size}</span></dd>
        <dt>{P.time}</dt><dd>{info.time}</dd>
        <dt>{P.satellite}</dt>
        <dd>{info.satellite} (VIIRS)<br /><span className="small muted">{info.tested ? P.tested : P.untested}</span></dd>
        <dt>{P.confidence}</dt><dd>{info.confidence}</dd>
        <dt>{P.frp}</dt><dd>{info.frp.toLocaleString()} MW</dd>
        <dt>{P.daynight}</dt><dd>{info.daynight}</dd>
      </dl>
      {info.nonfire && <p className="small"><b>{P.nonfire}</b></p>}
      <p className="small muted">{P.limits}</p>
      <button type="button" className="action" onClick={onHistory}>{P.history}</button>
      <p className="small muted">{P.historyNote}</p>
      <a className="small" href={firmsLink({ box }, day, day)} target="_blank" rel="noreferrer">{P.firms}</a>
    </aside>
  );
}
