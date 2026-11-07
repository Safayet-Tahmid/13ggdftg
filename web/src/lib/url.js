// ENGINE: the page address keeps the view, area, measure and dates, so a result can be shared.
// Example: #explore?area=preset:bangladesh&v=cells&from=2026-10-01&to=2026-10-28&m=2026-09
export function readHash() {
  const h = location.hash.slice(1);
  const [view, q = ''] = h.split('?');
  return { view: view || 'explore', params: Object.fromEntries(new URLSearchParams(q)) };
}

export function writeHash(view, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  const next = `#${view}${q ? `?${q}` : ''}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}
