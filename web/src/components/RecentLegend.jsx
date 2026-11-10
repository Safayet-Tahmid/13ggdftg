// Legend of the recent-detections layer (D38). Reads the same steps as the map (lib/geo.js).
import T from '../content/text.js';
import { RECENT_COUNT_STEPS, RECENT_FRP_STEPS, recentLegendRows } from '../lib/recent.js';

export default function RecentLegend({ theme, zoomedIn, status }) {
  const R = T.recent;
  const rows = zoomedIn ? recentLegendRows(RECENT_FRP_STEPS, theme.recent, ' MW') : recentLegendRows(RECENT_COUNT_STEPS, theme.recent, '');
  return (
    <div className="maplegend">
      <b>{R.legendTitle(zoomedIn)}</b>
      <ul>
        {rows.map((r) => <li key={r.label}><span className="swatch round" style={{ background: r.colour }} />{r.label}</li>)}
      </ul>
      <p>{zoomedIn ? R.legendUnitPoints : R.legendUnitCells}</p>
      {zoomedIn && <p><span className="swatch round" style={{ background: theme.recentNonfire }} /> {R.legendLow}</p>}
      <p>{R.legendRaw}</p>
      <p>{R.legendOverlap}</p>
      {status && !status.complete && <p><b>{R.incomplete}</b></p>}
    </div>
  );
}
