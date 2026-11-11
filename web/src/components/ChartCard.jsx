// A titled block with PNG/SVG download buttons for the chart inside it.
// The chart marks the element to export with data-export="canvas" or data-export="svg".
import { useEffect, useRef, useState } from 'react';
import T from '../content/text.js';
import { saveCanvasPNG, saveSVG, saveSVGasPNG } from '../lib/downloads.js';

export default function ChartCard({ title, file, imageTitle, theme, legend, children, note }) {
  const ref = useRef(null);
  const target = () => ref.current?.querySelector('[data-export]');
  const png = () => {
    const el = target();
    if (!el) return;
    if (el.tagName.toLowerCase() === 'canvas') saveCanvasPNG(el, file, imageTitle || title, theme, legend || []);
    else saveSVGasPNG(el, file, imageTitle || title, theme);
  };
  const svg = () => { const el = target(); if (el && el.tagName.toLowerCase() === 'svg') saveSVG(el, file, imageTitle || title, theme); };
  // A chart drawn on a canvas (the daily calendar) has no vector form, so it offers PNG only.
  // Before 11 Nov 2026 its SVG button quietly saved a PNG instead.
  const [hasSVG, setHasSVG] = useState(true);
  useEffect(() => { const el = target(); if (el) setHasSVG(el.tagName.toLowerCase() === 'svg'); });
  return (
    <section className="card" ref={ref}>
      <div className="card-head">
        <h3>{title}</h3>
        {file && (
          <div className="card-tools" aria-label={`Download ${title}`}>
            <button className="mini" onClick={png} title={hasSVG ? `${title}: PNG image` : `${title}: ${T.downloads.pngOnly}`}>{T.downloads.png}</button>
            {hasSVG && <button className="mini" onClick={svg} title={`${title}: SVG image`}>{T.downloads.svg}</button>}
          </div>
        )}
      </div>
      {children}
      {note && <p className="small">{note}</p>}
    </section>
  );
}
