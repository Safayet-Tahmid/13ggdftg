// The panel for one clicked map cell. Shows only what the published files hold for that cell and
// month (see lib/geo.js: cellInfo). Wording lives in content/text.js (T.map.cell).
import T from '../content/text.js';
import { firmsLink } from '../lib/downloads.js';
import { days_in_month } from '../lib/geo.js';

const deg = (x, pos, neg) => `${Math.abs(x).toFixed(2)}°${x >= 0 ? pos : neg}`;
const pct = (x) => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1));

export default function CellPanel({ info, onClose }) {
  if (!info) return null;
  const C = T.map.cell;
  const b = info.bounds;
  const last = `${info.month}-${String(days_in_month(info.month)).padStart(2, '0')}`;
  const zd = info.zoneDays;
  return (
    <aside className="cellpanel" aria-label={C.title} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <header>
        <h3>{C.title}</h3>
        <button type="button" className="link" onClick={onClose} aria-label={C.close}>✕</button>
      </header>
      <dl>
        <dt>{C.where}</dt>
        <dd>{deg(b.s, 'N', 'S')} to {deg(b.n, 'N', 'S')}, {deg(b.w, 'E', 'W')} to {deg(b.e, 'E', 'W')}<br />
          <span className="small muted">{C.size}</span></dd>
        <dt>{C.month}</dt><dd>{info.month}</dd>
        <dt>{C.cells}</dt><dd>{info.cells == null ? '0' : info.cells.toLocaleString()}</dd>
        <dt>{C.frp}</dt><dd>{info.frp == null ? '0' : info.frp.toLocaleString()} MW</dd>
        {!info.cells && zd?.nodata > 0 && <dd className="small">{C.zeroWithGaps(zd.nodata)}</dd>}
        <dt>{C.source}</dt><dd>{C.eras[info.era]}</dd>
        <dt>{C.range}</dt>
        <dd>{info.era === 'viirs' ? C.rangeNone
          : info.rangeCells != null && info.rangeFrp != null ? C.rangeValue(pct(info.rangeCells), pct(info.rangeFrp), info.factorCell)
            : C.rangeMissing}</dd>
        <dt>{C.cloud}</dt>
        <dd>{info.cloudFlag == null ? C.cloudUnknown : info.cloudFlag ? C.cloudYes(info.tile) : C.cloudNo(info.tile)}</dd>
        <dt>{C.zone}</dt>
        <dd>{zd ? C.zoneValue(zd.primary, zd.filled, zd.nodata) : '…'}</dd>
      </dl>
      <p className="small muted">{C.limits}</p>
      <a className="small" href={firmsLink({ box: b }, `${info.month}-01`, last)} target="_blank" rel="noreferrer">{C.firms}</a>
    </aside>
  );
}
