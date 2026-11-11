// ENGINE (do not change unless you work on the data): the "Recent detections" layer (decision D38).
// Raw NASA FIRMS near-real-time VIIRS detections from NOAA-20 and NOAA-21, written by
// recent/fetch_firms.py into data/recent/. This layer is SEPARATE from the harmonised record:
// nothing here is on the S-NPP scale, nothing is added to any historical number, and nothing here
// is compared with the record as a ratio or score. Values are shown exactly as FIRMS gave them.

// Recent detections (D38): their own colour steps, never the record's. Counts are detections of
// nominal or high confidence per 0.25-degree cell in the chosen period. FRP is per detection (MW).
export const RECENT_COUNT_STEPS = [5, 20, 100];
export const RECENT_FRP_STEPS = [5, 20, 100];
export function recentStep(prop, steps, colours) {
  const out = ['step', ['get', prop], colours[0]];
  steps.forEach((v, i) => out.push(v, colours[i + 1]));
  return out;
}
export function recentLegendRows(steps, colours, unit) {
  const f = (x) => x.toLocaleString('en-GB');
  return colours.map((colour, i) => ({ colour,
    label: i === 0 ? `under ${f(steps[0])}${unit}` : i === steps.length ? `${f(steps[steps.length - 1])}${unit} or more` : `${f(steps[i - 1])} to ${f(steps[i])}${unit}` }));
}

const BASE = 'data/recent/';
const cache = new Map();

// One snapshot at a time (audit D1). Every file of one fetch carries the same "generation" id.
// Data files are requested with that id in the URL, so the browser and the CDN can never answer
// with a file of an earlier snapshot, and each file is checked to carry the id before it is used.
// A file of another fetch (a deploy still spreading) is refused: nothing is drawn rather than a mix.
export class SnapshotMismatch extends Error {}
export function snapshotId(status) {
  return status?.generation || status?.files?.['overview.json.gz']?.sha256 || status?.fetched_utc || '';
}
function checkGeneration(status, data, what) {
  if (status?.generation && data?.generation !== status.generation) {
    throw new SnapshotMismatch(`${what} belongs to another update`);
  }
  return data;
}

async function gzJson(path, version) {
  const url = BASE + path + (version ? `?v=${encodeURIComponent(version)}` : '');
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    let text;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {   // GitHub Pages serves .gz as it is
      const ds = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')));
      text = await ds.text();
    } else {
      text = new TextDecoder().decode(buf);      // some local servers unpack it on the way
    }
    return JSON.parse(text);
  })();
  cache.set(url, p);
  try { return await p; } catch (e) { cache.delete(url); throw e; }
}

// status.json, or null when there is no recent snapshot in this build. The build's publication
// record (publication.json, written by recent/snapshot.py) is attached as status.publication:
// it says whether this snapshot is the new fetch or an earlier one kept after a failed refresh.
// Read once per page, so the header and the map always describe the same snapshot. If the
// publication record belongs to another update, status.updating is set and nothing is drawn.
let statusOnce = null;
export function recentStatus() {
  if (!statusOnce) statusOnce = loadStatus();
  return statusOnce;
}
export function resetRecentForTests() { statusOnce = null; cache.clear(); }
async function loadStatus() {
  try {
    const res = await fetch(BASE + 'status.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const s = await res.json();
    if (!s || s.rows == null || !s.fetched_utc) return null;
    let publication = null;
    try {
      const p = await fetch(BASE + 'publication.json', { cache: 'no-cache' });
      if (p.ok) publication = await p.json();
    } catch { publication = null; }
    const updating = !!(publication?.generation && s.generation && publication.generation !== s.generation);
    return { ...s, publication: updating ? null : publication, updating };
  } catch { return null; }
}

// Freshness (Task 2, WP3). Three different times, never confused:
//   retrieved  when the snapshot was fetched from FIRMS (status.fetched_utc)
//   newest     the newest detection in it (status.latest_detection_utc). The "24 hours" and
//              "7 days" periods END HERE, not at the current time (same rule in the overview,
//              written by fetch_firms.py, and in recentPoints below).
//   now        the reader's clock, only used to say whether the snapshot is still current.
// Not current: older than STALE_AFTER_HOURS (the refresh runs every 3 hours, so two missed runs),
// or kept from an earlier fetch after a failed refresh (publication.state "fallback").
export const STALE_AFTER_HOURS = 6;
export const FEED_LAG_HOURS = 12;
const iso = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

// What an incomplete snapshot lacks: failed requests, and completed days on which a global product
// had no detection at all (suspect_days, audit D2), as runs of consecutive days.
export function missingCoverage(status) {
  const out = [];
  for (const p of Object.values(status?.products || {})) {
    for (const r of p.requests || []) if (!r.ok) out.push({ satellite: p.satellite, from: r.from, days: r.days });
    let run = null;
    for (const d of [...(p.suspect_days || [])].sort()) {
      const t = Date.parse(d + 'T00:00:00Z');
      if (run && t === run.last + 86400000) { run.days += 1; run.last = t; } else {
        run = { satellite: p.satellite, from: d, days: 1, last: t };
        out.push(run);
      }
    }
  }
  return out.map(({ satellite, from, days }) => ({ satellite, from, days }));
}

export function recentFreshness(status, nowMs = Date.now()) {
  if (!status || !status.fetched_utc) return null;
  const fetched = Date.parse(status.fetched_utc);
  const newest = status.latest_detection_utc ? Date.parse(status.latest_detection_utc) : null;
  const pub = status.publication || null;
  const fallback = pub?.state === 'fallback';
  const ageHours = (nowMs - fetched) / 3.6e6;
  const lagHours = newest == null ? null : (fetched - newest) / 3.6e6;
  return {
    retrieved: iso(fetched),
    newest: newest == null ? null : iso(newest),
    ageHours,
    stale: fallback || ageHours > STALE_AFTER_HOURS,
    fallback,
    attempted: fallback && pub.decided_utc ? iso(Date.parse(pub.decided_utc)) : null,
    feedLagHours: lagHours != null && lagHours > FEED_LAG_HOURS ? Math.round(lagHours) : null,
    incomplete: status.complete === false,
    missing: missingCoverage(status),
  };
}

export const PERIODS = { '24h': 1440, '7d': 7 * 1440, all: Infinity };
export const SAT_NAMES = { N20: 'NOAA-20', N21: 'NOAA-21' };
const CONF_NAMES = { l: 'low', n: 'nominal', h: 'high' };

// Minutes since 00:00 UTC of the window's first day -> ISO time (UTC).
export function minuteToIso(from, minute) {
  const t = Date.parse(from + 'T00:00:00Z') + minute * 60000;
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

// Overview: one point per 0.25-degree cell with at least one counted detection in the period.
// Counted = nominal or high confidence, outside SHIFT's non-fire cells (as the fetch defines).
export async function recentOverview(status, period) {
  const o = checkGeneration(status, await gzJson('overview.json.gz', snapshotId(status)), 'overview');
  const key = period === '24h' ? 'n24' : period === '7d' ? 'n7' : 'n';
  const features = [];
  for (let i = 0; i < o.id.length; i++) {
    const n = o[key][i];
    if (!n) continue;
    const r = Math.floor(o.id[i] / 1440), c = o.id[i] % 1440;
    const lon = -180 + (c + 0.5) * 0.25, lat = -90 + (r + 0.5) * 0.25;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { lon, lat, n, fmax: o.fmax[i] / 10, last: o.last[i] } });
  }
  return { type: 'FeatureCollection', features, from: o.from, latest: o.latest_minute };
}

// The 10-degree tiles that a view box touches, limited to those that exist, nearest first.
export function tilesInView(bounds, index, max = 6) {
  if (!bounds || !index) return [];
  const [w, s, e, n] = bounds;
  const out = [];
  const name = (a, b) => `${a >= 0 ? 'N' : 'S'}${String(Math.abs(a)).padStart(2, '0')}${b >= 0 ? 'E' : 'W'}${String(Math.abs(b)).padStart(3, '0')}`;
  const cx = (w + e) / 2, cy = (s + n) / 2;
  for (let a = Math.floor(Math.max(-90, s) / 10) * 10; a < Math.min(90, n); a += 10) {
    for (let b = Math.floor(Math.max(-180, w) / 10) * 10; b < Math.min(180, e); b += 10) {
      const t = name(a, b);
      if (index[t]) out.push({ t, d: Math.hypot(a + 5 - cy, b + 5 - cx) });
    }
  }
  return out.sort((x, y) => x.d - y.d).slice(0, max).map((x) => x.t);
}

// Every detection of some tiles in the period, as map points with the FIRMS fields. A tile that
// cannot be loaded, or that belongs to another update, is left out and counted in "missing".
export async function recentPoints(status, tiles, period, latest) {
  const span = PERIODS[period] ?? Infinity;
  const features = [];
  let missing = 0;
  for (const name of tiles) {
    let t;
    try { t = checkGeneration(status, await gzJson(`tiles/${name}.json.gz`, snapshotId(status)), `tile ${name}`); } catch { missing += 1; continue; }
    for (let i = 0; i < t.la.length; i++) {
      const minute = t.d[i] * 1440 + Math.floor(t.t[i] / 100) * 60 + (t.t[i] % 100);
      if (latest - minute >= span) continue;
      const lon = t.lo[i] / 1e4, lat = t.la[i] / 1e4;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { lon, lat, sat: t.satellites[t.s[i]], conf: t.confidence[t.c[i]], frp: t.f[i] / 10,
          day: t.dn[i] ? 'day' : 'night', nf: t.nf[i], minute } });
    }
  }
  return { type: 'FeatureCollection', features, missing };
}

// What the detection panel shows: only fields FIRMS provides, plus SHIFT's non-fire flag.
export function detectionInfo(p, from) {
  return {
    lat: p.lat, lon: p.lon,
    time: minuteToIso(from, p.minute),
    satellite: SAT_NAMES[p.sat] || p.sat,
    tested: p.sat === 'N20',
    confidence: CONF_NAMES[p.conf] || p.conf,
    frp: p.frp,
    daynight: p.day,
    nonfire: !!p.nf,
  };
}
