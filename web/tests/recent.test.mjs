// Task 2 (WP3, WP5): the recent-detections layer says honestly how old its data is, and its
// "24 hours" and "7 days" periods have the same edges as the overview written by fetch_firms.py.
// A fixed clock is passed in, so these tests never depend on the real time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { recentFreshness, recentPoints, recentStatus, missingCoverage, STALE_AFTER_HOURS, PERIODS } from '../src/lib/recent.js';
import T from '../src/content/text.js';

const H = 3.6e6;
const status = (over = {}) => ({
  fetched_utc: '2026-11-11T08:28:00Z', latest_detection_utc: '2026-11-11T08:00Z', complete: true, rows: 10,
  products: { VIIRS_NOAA20_NRT: { satellite: 'N20', requests: [{ from: '2026-11-08', days: 4, ok: true }] } }, ...over });
const at = (iso) => Date.parse(iso);

test('a fresh snapshot is current, with its three times kept apart', () => {
  const f = recentFreshness(status(), at('2026-11-11T09:30:00Z'));
  assert.equal(f.stale, false);
  assert.equal(f.retrieved, '2026-11-11 08:28 UTC');
  assert.equal(f.newest, '2026-11-11 08:00 UTC');
  assert.equal(f.feedLagHours, null);
  assert.equal(f.incomplete, false);
});

test('older than the limit is not current, judged with a fixed clock', () => {
  const fetched = at('2026-11-11T08:28:00Z');
  assert.equal(recentFreshness(status(), fetched + STALE_AFTER_HOURS * H).stale, false);       // exactly the limit
  assert.equal(recentFreshness(status(), fetched + STALE_AFTER_HOURS * H + 60000).stale, true); // one minute over
  assert.equal(recentFreshness(status(), fetched + 72 * H).retrieved, '2026-11-11 08:28 UTC');   // its own time, never "now"
});

test('a snapshot kept after a failed refresh is never current, and says when the refresh failed', () => {
  const s = status({ publication: { state: 'fallback', decided_utc: '2026-11-11T11:17:00Z' } });
  const f = recentFreshness(s, at('2026-11-11T09:00:00Z'));
  assert.equal(f.stale, true);
  assert.equal(f.fallback, true);
  assert.equal(f.attempted, '2026-11-11 11:17 UTC');
  assert.equal(f.retrieved, '2026-11-11 08:28 UTC');
  assert.match(T.recent.stale(f.retrieved), /^Recent observations are not current\. Showing the last successful dataset, retrieved on 2026-11-11 08:28 UTC\.$/);
});

test('a delayed feed is pointed out', () => {
  const f = recentFreshness(status({ latest_detection_utc: '2026-11-10T19:00Z' }), at('2026-11-11T09:00:00Z'));
  assert.equal(f.feedLagHours, 13);
  assert.match(T.recent.feedLag(f.feedLagHours), /13 hours older than the retrieval/);
});

test('an incomplete snapshot names what is missing and never calls it no fire', () => {
  const s = status({ complete: false, products: {
    VIIRS_NOAA20_NRT: { satellite: 'N20', requests: [{ from: '2026-11-08', days: 4, ok: true }] },
    VIIRS_NOAA21_NRT: { satellite: 'N21', requests: [{ from: '2026-11-08', days: 4, ok: false }] } } });
  const f = recentFreshness(s, at('2026-11-11T09:00:00Z'));
  assert.equal(f.incomplete, true);
  assert.deepEqual(missingCoverage(s), [{ satellite: 'N21', from: '2026-11-08', days: 4 }]);
  const text = T.recent.missing(f.missing.map(T.recent.missingItem).join(', '));
  assert.equal(text, 'Incomplete: no data was received for NOAA-21 from 2026-11-08 (4 days). Missing data is not "no fire".');
});

test('no snapshot means no freshness, not a fabricated one', () => {
  assert.equal(recentFreshness(null), null);
  assert.equal(recentFreshness({ rows: 0 }), null);
});

test('the period labels say where the period ends', () => {
  assert.match(T.recent.periods['24h'], /newest detection/);
  assert.match(T.recent.periods['7d'], /newest detection/);
  assert.doesNotMatch(JSON.stringify(T.recent.periods), /Last 24 hours|Last 7 days/);
  assert.match(T.recent.fetched('a', 'b', 'c'), /not at the current time/);
  assert.equal(T.recentTo('2026-11-11 08:00 UTC', true), 'Recent detections to 2026-11-11 08:00 UTC (not current)');
  assert.equal(T.recentTo('2026-11-11 08:00 UTC', false), 'Recent detections to 2026-11-11 08:00 UTC');
});

// ---------------------------------------------------------------- data loading with a fake server

function serve(files) {
  globalThis.fetch = async (url) => {
    const key = String(url).replace('data/recent/', '');
    if (!(key in files)) return new Response('', { status: 404 });
    const v = files[key];
    return new Response(typeof v === 'string' ? v : v, { status: 200 });
  };
}

test('24-hour and 7-day edges for single detections match the overview (same rule as fetch_firms.py)', async () => {
  // minutes since the window start. The newest detection is minute 11519.
  const latest = 11519;
  const ages = [0, 1439, 1440, 10079, 10080];
  const mins = ages.map((a) => latest - a);
  const tile = { format: 1, from: '2026-11-01', satellites: ['N20', 'N21'], confidence: ['l', 'n', 'h'],
    la: ages.map(() => 100000), lo: ages.map(() => 902000), d: mins.map((m) => Math.floor(m / 1440)),
    t: mins.map((m) => Math.floor((m % 1440) / 60) * 100 + (m % 60)), s: ages.map(() => 0), c: ages.map(() => 1),
    f: ages.map(() => 45), dn: ages.map(() => 1), nf: ages.map(() => 0) };
  serve({ 'tiles/N10E090.json.gz': gzipSync(JSON.stringify(tile)) });
  const count = async (p) => (await recentPoints(['N10E090'], p, latest)).features.length;
  assert.equal(await count('24h'), 2);     // ages 0 and 1439
  assert.equal(await count('7d'), 4);      // up to age 10079
  assert.equal(await count('all'), 5);
  assert.equal(PERIODS['24h'], 1440);
});

test('the status loader attaches the publication record, and copes without one', async () => {
  serve({ 'status.json': JSON.stringify(status()), 'publication.json': JSON.stringify({ state: 'fallback', decided_utc: '2026-11-11T11:17:00Z' }) });
  assert.equal((await recentStatus()).publication.state, 'fallback');
  serve({ 'status.json': JSON.stringify(status()) });
  assert.equal((await recentStatus()).publication, null);
  serve({});
  assert.equal(await recentStatus(), null);
});
