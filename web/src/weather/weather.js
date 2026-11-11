// Weather context (decision D39): NASA POWER daily weather for the preset areas, compared over the
// SAME dates as "Now against the past" (D32). Context only: never used in the harmonised record,
// the anomaly classes or any score. Rules: context/power_rules.json (fixed before the first fetch).
//
// The files are written by context/fetch_power.py into public/context/power/ and ship with the site,
// so this works offline.

const BASE = 'context/power/';
export const BEFORE_DAYS = 60;          // rain in the days before the window (rules: rain_before)
export const PROVISIONAL_DAYS = 120;    // rules: provisional
export const MIN_YEARS = 10;            // rules: normal needs at least 10 usable years
export const PARAMS = ['PRECTOTCORR', 'RH2M', 'T2M_MAX', 'WS2M', 'GWETROOT'];
// rank 1 = the driest (rain, humidity, soil wetness) or the hottest / windiest
const LOW_FIRST = { PRECTOTCORR: true, RH2M: true, T2M_MAX: false, WS2M: false, GWETROOT: true };

let indexPromise = null;
const cache = new Map();

export function loadIndex(fetcher = fetch) {
  if (!indexPromise) {
    indexPromise = fetcher(`${BASE}index.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return indexPromise;
}

export async function loadPreset(id, fetcher = fetch) {
  const idx = await loadIndex(fetcher);
  const f = idx?.files?.[id];
  if (!f) return null;
  if (!cache.has(id)) {
    cache.set(id, fetcher(`${BASE}${f.file}?v=${f.sha256.slice(0, 12)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  const data = await cache.get(id);
  return data ? { ...data, index: idx } : null;
}

const DAY = 86400000;
const toIdx = (w, isoDay) => Math.round((Date.parse(isoDay + 'T00:00:00Z') - Date.parse(w.start + 'T00:00:00Z')) / DAY);

// Value of one parameter over [a, b] (weather day indexes): rain = total (mm), others = mean.
// null if any day is outside the data or missing (rules: a year is used only if every day has a value).
export function windowValue(w, p, a, b) {
  const v = w.values[p];
  if (a < 0 || b >= v.length || b < a) return null;
  let s = 0;
  for (let k = a; k <= b; k++) { if (v[k] == null) return null; s += v[k]; }
  return p === 'PRECTOTCORR' ? s : s / (b - a + 1);
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// years: [{ year, fromIso, toIso, target }] = the same dates in every year, as the fire comparison uses.
// baseline: [first, last] year of the normal. Returns one row per parameter plus rain before the window.
export function compareWeather(w, years, baseline, fetchedIso) {
  const rows = [];
  const spec = [...PARAMS.map((p) => ({ key: p, p, before: false })), { key: 'RAIN_BEFORE', p: 'PRECTOTCORR', before: true }];
  for (const { key, p, before } of spec) {
    const vals = years.map((y) => {
      let a = toIdx(w, y.fromIso), b = toIdx(w, y.toIso);
      if (before) { b = a - 1; a = a - BEFORE_DAYS; }
      return { year: y.year, target: !!y.target, value: windowValue(w, p, a, b) };
    });
    const target = vals.find((r) => r.target);
    const base = vals.filter((r) => !r.target && r.value != null && r.year >= baseline[0] && r.year <= baseline[1]);
    const normal = base.length >= MIN_YEARS ? median(base.map((r) => r.value)) : null;
    const usable = vals.filter((r) => r.value != null && r.year >= 2003);
    const low = LOW_FIRST[p];
    const ranked = [...usable].sort((x, y) => (low ? x.value - y.value : y.value - x.value));
    const rank = target?.value != null ? ranked.indexOf(target) + 1 : null;
    rows.push({ key, p, value: target?.value ?? null, normal, rank, of: ranked.length, baseCount: base.length,
      ratio: target?.value != null && normal > 0 ? target.value / normal : null,
      diff: target?.value != null && normal != null ? target.value - normal : null });
  }
  const tgt = years.find((y) => y.target);
  const provisional = !!(tgt && fetchedIso
    && Date.parse(tgt.toIso + 'T00:00:00Z') > Date.parse(fetchedIso) - PROVISIONAL_DAYS * DAY);
  const outside = !!(tgt && toIdx(w, tgt.toIso) >= w.values.PRECTOTCORR.length);
  return { rows, provisional, outside, end: w.end };
}
