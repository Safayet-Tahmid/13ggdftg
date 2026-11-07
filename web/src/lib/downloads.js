// ENGINE: every download on the site (CSV tables, chart images) and the link to FIRMS.
import { iso } from './data.js';

export function save(content, name, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'area';

const ERA = (meta, k, switchDay, terraEnd) => (k <= terraEnd ? 'Terra only (not comparable)' : k < switchDay ? 'MODIS on the VIIRS scale' : 'VIIRS');

// Daily totals for the area between two days (inclusive).
export function dailyCSV(meta, s, from, to, range, eraDays) {
  const lines = ['date,hotspots,fire_power_mw,era,range_95_pct,filled_from_partner,no_data'];
  for (let k = from; k <= to; k++) {
    const d = iso(meta, k);
    const era = ERA(meta, k, eraDays.switchDay, eraDays.terraEnd);
    const r = k < eraDays.switchDay && range ? range[+d.slice(5, 7) - 1] : null;
    lines.push([d, s.nodata[k] ? '' : s.cells[k].toFixed(2), s.nodata[k] ? '' : s.frp[k].toFixed(1), era,
      r == null ? '' : r.toFixed(1), s.filled[k], s.nodata[k]].join(','));
  }
  return lines.join('\n');
}

// Monthly totals with the anomaly class and flags (the "analytics" table).
export function monthlyCSV(mon, variable, range) {
  const lines = [`year,month,${variable === 'frp' ? 'fire_power_mw' : 'hotspots'},class,z,range_95_pct,no_data_days,cloud_flag,comparable`];
  for (const r of mon.rows) {
    lines.push([r.year, r.month + 1, r.value.toFixed(2), r.cls || '', r.z == null ? '' : r.z.toFixed(2),
      r.modisEra && range?.[r.month] != null ? range[r.month].toFixed(1) : '', r.nodata, r.cloudy ? 1 : 0, r.notComparable ? 0 : 1].join(','));
  }
  return lines.join('\n');
}

// The search CSV (D33): one row per 1-degree cell and day with fire.
export function cellCSV(meta, rows, sources, fineRange) {
  const lines = ['date,lat,lon,hotspots,fire_power_mw,source,range_95_pct'];
  for (const r of rows) {
    const d = iso(meta, r.k);
    const rp = fineRange ? fineRange(r.lat, r.lon, +d.slice(5, 7) - 1, r.src) : null;
    lines.push([d, r.lat.toFixed(1), r.lon.toFixed(1), r.cells.toFixed(2), r.frp.toFixed(1),
      `"${sources[String(r.src)] || r.src}"`, rp == null ? '' : rp.toFixed(1)].join(','));
  }
  return lines.join('\n');
}

// The original detections on NASA FIRMS for the same area and dates (opens online).
export function firmsLink(area, fromIso, toIso) {
  const b = area.box;
  const lon = ((b.w + b.e) / 2).toFixed(2), lat = ((b.s + b.n) / 2).toFixed(2);
  const span = Math.max(b.e - b.w, b.n - b.s);
  const z = span > 40 ? 3 : span > 15 ? 4 : span > 6 ? 5 : span > 2 ? 7 : 8;
  return `https://firms.modaps.eosdis.nasa.gov/map/#d:${fromIso},${toIso};@${lon},${lat},${z}z`;
}

// ---------------------------------------------------------------- chart images
const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'font-size', 'font-weight', 'font-family', 'text-anchor'];

function inlineSVG(svg, title, theme) {
  const clone = svg.cloneNode(true);
  const src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const st = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
    dst[i].setAttribute('style', st);
  });
  const vb = svg.viewBox?.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || +svg.getAttribute('width');
  const h = vb && vb.height ? vb.height : svg.clientHeight || +svg.getAttribute('height');
  const head = 34, foot = 20;
  const ns = 'http://www.w3.org/2000/svg';
  const out = document.createElementNS(ns, 'svg');
  out.setAttribute('xmlns', ns);
  out.setAttribute('width', w + 24);
  out.setAttribute('height', h + head + foot);
  out.setAttribute('viewBox', `0 0 ${w + 24} ${h + head + foot}`);
  out.innerHTML = `<rect width="100%" height="100%" fill="${theme.surface}"/>`
    + `<text x="12" y="22" font-family="${theme.font}" font-size="14" font-weight="700" fill="${theme.ink}">${esc(title)}</text>`
    + `<text x="12" y="${h + head + 14}" font-family="${theme.font}" font-size="10" fill="${theme.muted}">SHIFT · Team Squadron Zero · data: NASA FIRMS (MODIS, VIIRS)</text>`;
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('transform', `translate(12,${head})`);
  clone.removeAttribute('class');
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  g.appendChild(clone);
  out.appendChild(g);
  return { svg: new XMLSerializer().serializeToString(out), w: w + 24, h: h + head + foot };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function saveSVG(svg, name, title, theme) {
  save(inlineSVG(svg, title, theme).svg, `${name}.svg`, 'image/svg+xml');
}

export function saveSVGasPNG(svg, name, title, theme) {
  const { svg: text, w, h } = inlineSVG(svg, title, theme);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d');
    g.scale(2, 2); g.drawImage(img, 0, 0);
    c.toBlob((b) => save(b, `${name}.png`, 'image/png'));
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
}

export function saveCanvasPNG(canvas, name, title, theme, legend = []) {
  const dpr = canvas.width / canvas.clientWidth || 1;
  const head = 34 * dpr, foot = 22 * dpr, pad = 12 * dpr;
  const c = document.createElement('canvas');
  c.width = canvas.width + 2 * pad; c.height = canvas.height + head + foot;
  const g = c.getContext('2d');
  g.fillStyle = theme.surface; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = theme.ink; g.font = `700 ${14 * dpr}px ${theme.font}`; g.textBaseline = 'middle';
  g.fillText(title, pad, 17 * dpr);
  g.drawImage(canvas, pad, head);
  g.font = `${10 * dpr}px ${theme.font}`; g.fillStyle = theme.muted;
  let x = pad;
  for (const [color, label] of legend) {
    g.fillStyle = color; g.fillRect(x, c.height - foot / 2 - 5 * dpr, 10 * dpr, 10 * dpr);
    g.fillStyle = theme.muted; x += 14 * dpr; g.fillText(label, x, c.height - foot / 2); x += g.measureText(label).width + 12 * dpr;
  }
  g.fillText('SHIFT · data: NASA FIRMS (MODIS, VIIRS)', Math.max(x, c.width - 240 * dpr), c.height - foot / 2);
  c.toBlob((b) => save(b, `${name}.png`, 'image/png'));
}
