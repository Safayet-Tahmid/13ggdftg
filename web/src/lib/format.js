// How numbers and dates are written on the site.
export const fmt = (v, variable) => (v == null || !isFinite(v) ? '–'
  : variable === 'frp' ? `${Math.round(v).toLocaleString()} MW` : `${v.toFixed(v < 10 ? 1 : 0)} hotspots`);

export const num = (v, variable) => (v == null || !isFinite(v) ? '–'
  : variable === 'frp' ? Math.round(v).toLocaleString() : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString());

export function compact(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k`;
  return v >= 10 || v === 0 ? v.toFixed(0) : v.toFixed(1);
}

export const longDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
