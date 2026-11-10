// The map legend. It reads the same steps as the map (lib/geo.js), so the two cannot disagree.
import T from '../content/text.js';
import { legendRows } from '../lib/geo.js';

export default function MapLegend({ theme, variable, month, showGaps, imageryLabel }) {
  const rows = legendRows(variable, theme.ramp);
  return (
    <div className="maplegend">
      <b>{T.map.legendTitle(variable, month)}</b>
      <ul>
        {rows.map((r) => <li key={r.label}><span className="swatch" style={{ background: r.colour }} />{r.label}</li>)}
      </ul>
      <p>{T.map.legendUnit[variable]}</p>
      <p>{T.map.legendScale}</p>
      <p>{T.map.legendSupport}</p>
      {showGaps && <p><span className="swatch hatch" /> {T.map.legendGaps}</p>}
      {imageryLabel && <p><b>{imageryLabel}.</b> {T.map.imageryNote}</p>}
    </div>
  );
}
