// ENGINE: everything the site works out from an area's daily series. Each function is a plain
// sum, median, rank or the pipeline's own anomaly rule, so every number can be traced back.
import { dateOf, dayIndex, lastDataDay } from './data.js';

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function baselineYears(meta) {
  const first = +(meta.comparable_start || '2003-01-01').slice(0, 4);
  // the last complete calendar year: the year of the day after the last data day, minus one
  const after = new Date(Date.parse(meta.start + 'T00:00:00Z') + (lastDataDay(meta) + 1) * 864e5);
  return [first, after.getUTCFullYear() - 1];
}

// ---------------------------------------------------------------- months and their anomaly class
// The pipeline's rule: z of log(1 + value) against the same calendar month of the baseline years;
// below -1 low, -1..1 normal, 1..2 unusual, 2 and above critical.
export function monthly(meta, s, variable, cloud = null) {
  const v = s[variable];
  const map = new Map();
  for (let k = 0; k < meta.days; k++) {
    const d = dateOf(meta, k);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const key = y * 12 + m;
    let o = map.get(key);
    if (!o) { o = { year: y, month: m, value: 0, days: 0, nodata: 0, filled: 0 }; map.set(key, o); }
    o.value += v[k]; o.days += 1; o.nodata += s.nodata[k]; o.filled += s.filled[k];
  }
  const rows = [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month);
  const [comp, lastFullYear] = baselineYears(meta);
  const full = (r) => r.days === new Date(Date.UTC(r.year, r.month + 1, 0)).getUTCDate();
  const cloudy = cloudMonths(cloud, s.fineAll);
  const stats = Array.from({ length: 12 }, () => []);
  for (const r of rows) {
    r.notComparable = r.year < comp;
    r.incomplete = !full(r) || r.nodata > 0;
    r.modisEra = r.year < 2012;
    r.cloudy = cloudy.has(`${r.year}-${String(r.month + 1).padStart(2, '0')}`);
    if (!r.notComparable && !r.incomplete && r.year <= lastFullYear) stats[r.month].push(Math.log1p(r.value));
  }
  const mu = stats.map((a) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1));
  const sd = stats.map((a, i) => Math.max(0.05, Math.sqrt(a.reduce((x, y) => x + (y - mu[i]) ** 2, 0) / Math.max(a.length - 1, 1))));
  for (const r of rows) {
    if (r.notComparable || r.incomplete || stats[r.month].length < 5) { r.cls = null; continue; }
    r.z = (Math.log1p(r.value) - mu[r.month]) / sd[r.month];
    r.cls = r.z < -1 ? 'low' : r.z < 1 ? 'normal' : r.z < 2 ? 'unusual' : 'critical';
  }
  return { rows, baseline: [comp, lastFullYear], cloudUntil: cloud?.until || null };
}

// Months in which the factor cells holding most of the area's fire were cloudier than 90% of
// years (package option C). Flagged when cloudy cells hold at least half of the area's fire.
export function cloudMonths(cloud, weights) {
  const out = new Set();
  if (!cloud?.flags || !weights?.size) return out;
  let total = 0;
  for (const w of weights.values()) total += w;
  if (total <= 0) return out;
  const share = new Map();
  for (const [key, w] of weights) for (const ym of cloud.flags[key] || []) share.set(ym, (share.get(ym) || 0) + w);
  for (const [ym, w] of share) if (w / total >= 0.5) out.add(ym);
  return out;
}

// 95% range (%) of the MODIS-era factor for the area and calendar month, weighted by fire.
export function areaRange(unc, fineW, variable) {
  const t = unc?.range_pct?.[variable];
  if (!t) return null;
  const out = new Array(12).fill(null);
  for (let m = 0; m < 12; m++) {
    let w = 0, s = 0;
    for (const [key, wt] of fineW) {
      const r = t[key]?.[m];
      if (r != null && isFinite(r)) { s += r * wt; w += wt; }
    }
    out[m] = w > 0 ? s / w : null;
  }
  return out;
}

export function summary(rows) {
  let unusual = 0, critical = 0, nodataDays = 0;
  for (const r of rows) { if (r.cls === 'unusual') unusual++; if (r.cls === 'critical') critical++; nodataDays += r.nodata; }
  return { unusual, critical, nodataDays };
}

// ---------------------------------------------------------------- a window of dates against the same dates in other years (D32)
// The window [from, to] (day indexes) is moved to the same calendar dates in every other year.
// A year counts only if it is comparable (from 2003) and had no "no data" day in the window.
export function compareWindow(meta, s, variable, from, to, range = null) {
  const v = s[variable];
  const len = to - from + 1;
  if (len < 1 || len > 366) return { error: 'length' };
  const d0 = dateOf(meta, from);
  const mo = d0.getUTCMonth(), da = d0.getUTCDate(), y0 = d0.getUTCFullYear();
  const [base0, base1] = baselineYears(meta);
  const comp = +(meta.comparable_start || '2003-01-01').slice(0, 4);
  const years = [];
  const first = dateOf(meta, 0).getUTCFullYear(), last = dateOf(meta, meta.days - 1).getUTCFullYear();
  for (let y = first; y <= last; y++) {
    const start = dayIndex(meta, new Date(Date.UTC(y, mo, da)).toISOString().slice(0, 10));
    const end = start + len - 1;
    if (start < 0 || end > lastDataDay(meta)) continue;
    let sum = 0, gaps = 0;
    for (let k = start; k <= end; k++) { sum += v[k]; gaps += s.nodata[k]; }
    years.push({ year: y, value: sum, gaps, from: start, to: end, modisEra: y < 2012 || (y === 2012 && start < dayIndex(meta, '2012-01-20')),
      usable: y >= comp && gaps === 0, target: y === y0 });
  }
  const target = years.find((r) => r.target);
  const base = years.filter((r) => r.usable && !r.target && r.year >= base0 && r.year <= base1);
  const med = median(base.map((r) => r.value));
  const ranked = years.filter((r) => r.usable || r.target).sort((a, b) => b.value - a.value);
  const rank = target ? ranked.indexOf(target) + 1 : null;
  const m = d0.getUTCMonth();
  const rangePct = range?.[m] ?? null;
  for (const r of years) r.rangePct = r.modisEra && rangePct != null ? rangePct : null;
  const q = (p) => { const a = base.map((r) => r.value).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
  return { len, years, target, median: med, p10: q(0.1), p90: q(0.9), rank, of: ranked.length, baseCount: base.length,
    ratio: target && med > 0 ? target.value / med : null, left: years.filter((r) => !r.usable && !r.target && r.year >= comp).length,
    baseline: [base0, base1], targetGaps: target?.gaps || 0 };
}

// The normal total of a whole calendar month (median of the baseline years), for "so far this month
// has X% of a normal month".
export function normalMonth(mon, month) {
  const [b0, b1] = mon.baseline;
  return median(mon.rows.filter((r) => r.month === month && !r.incomplete && !r.notComparable && r.year >= b0 && r.year <= b1).map((r) => r.value));
}

// ---------------------------------------------------------------- the fire season (anticipating critical periods)
// From the baseline years: the average day of the year (Feb 29 folded into Feb 28), smoothed over
// 31 days. The fire year starts at the quietest point; the season runs from the day 10% of a
// normal year's fire has burned to the day 90% has, and peaks at the highest smoothed day.
export function season(meta, s, variable) {
  const v = s[variable];
  const [b0, b1] = baselineYears(meta);
  const sum = new Float64Array(365), cnt = new Float64Array(365);
  for (let k = 0; k <= lastDataDay(meta); k++) {
    const d = dateOf(meta, k), y = d.getUTCFullYear();
    if (y < b0 || y > b1 || s.nodata[k]) continue;
    sum[doy365(d)] += v[k]; cnt[doy365(d)] += 1;
  }
  const mean = Array.from(sum, (x, i) => (cnt[i] ? x / cnt[i] : 0));
  const annual = mean.reduce((a, b) => a + b, 0);
  const years = b1 - b0 + 1;
  if (annual <= 0 || years < 5) return null;
  const sm = mean.map((_, i) => { let t = 0; for (let j = -15; j <= 15; j++) t += mean[(i + j + 365) % 365]; return t / 31; });
  let quiet = 0, peak = 0;
  for (let i = 1; i < 365; i++) { if (sm[i] < sm[quiet]) quiet = i; if (sm[i] > sm[peak]) peak = i; }
  // cumulative share from the quiet day
  const cum = new Float64Array(365);
  let c = 0;
  for (let j = 0; j < 365; j++) { c += mean[(quiet + j) % 365]; cum[j] = c / annual; }
  const at = (p) => { let j = 0; while (j < 364 && cum[j] < p) j++; return (quiet + j) % 365; };
  const start = at(0.1), end = at(0.9), core0 = at(0.25), core1 = at(0.75);
  const length = ((end - start + 365) % 365) + 1;
  // concentration: share of the year's fire in its busiest 90 days (high = a sharp season)
  let best = 0;
  for (let i = 0; i < 365; i++) { let t = 0; for (let j = 0; j < 90; j++) t += mean[(i + j) % 365]; best = Math.max(best, t); }
  // today in the season
  const lastK = lastDataDay(meta);
  const today = doy365(dateOf(meta, lastK));
  const pos = (today - quiet + 365) % 365;
  const next30 = (() => { let t = 0; for (let j = 1; j <= 30; j++) t += mean[(today + j) % 365]; return t / annual; })();
  // this fire year so far, against a normal year so far
  let so = 0, gaps = 0;
  for (let j = 0; j <= pos; j++) { const k = lastK - pos + j; if (k < 0) continue; so += v[k]; gaps += s.nodata[k]; }
  const normalSoFar = cum[pos] * annual;
  return { mean, smooth: sm, annual, quiet, peak, start, end, core: [core0, core1], length, sharp: best / annual,
    today, pos, shareDone: cum[pos], next30, soFar: so, normalSoFar, soFarRatio: normalSoFar > 0 ? so / normalSoFar : null,
    soFarGaps: gaps, baseline: [b0, b1], inSeason: inArc(today, start, end), daysToStart: (start - today + 365) % 365 };
}

const inArc = (x, a, b) => (a <= b ? x >= a && x <= b : x >= a || x <= b);

function doy365(d) {
  const y = d.getUTCFullYear();
  let doy = Math.floor((d - Date.UTC(y, 0, 1)) / 864e5);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (leap && doy >= 59) doy -= 1;           // Feb 29 joins Feb 28, later days shift back one
  return Math.min(364, doy);
}

export function doyLabel(doy) {
  const d = new Date(Date.UTC(2001, 0, 1) + doy * 864e5);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
