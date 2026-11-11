// Task 2 (WP3, WP5): the recent-detections layer says honestly how old its data is, and its
// "24 hours" and "7 days" periods have the same edges as the overview written by fetch_firms.py.
// A fixed clock is passed in, so these tests never depend on the real time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { recentFreshness, recentOverview, recentPoints, recentStatus, missingCoverage, resetRecentForTests, snapshotId, SnapshotMismatch,
  STALE_AFTER_HOURS, PERIODS } from '../src/lib/recent.js';
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

const requested = [];
function serve(files) {
  resetRecentForTests();
  requested.length = 0;
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const key = String(url).replace('data/recent/', '').split('?')[0];
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
  const count = async (p) => (await recentPoints({}, ['N10E090'], p, latest)).features.length;
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

// ---------------------------------------------------------------- audit hotfix D1 and D2

const G_A = '20261111T084400Z-aaaaaaaaaaaa', G_B = '20261111T114400Z-bbbbbbbbbbbb';
const ov = (gen, latest) => ({ format: 1, generation: gen, from: '2026-10-28', latest_minute: latest, id: [400 * 1440 + 1080],
  n24: [3], n7: [3], n: [3], fmax: [50], nf: [0], last: [latest] });
const tileOf = (gen) => ({ format: 1, generation: gen, from: '2026-10-28', satellites: ['N20', 'N21'], confidence: ['l', 'n', 'h'],
  la: [100000], lo: [902000], d: [0], t: [100], s: [0], c: [1], f: [45], dn: [1], nf: [0] });

test('D1: data files are requested with the snapshot id, so no cache can answer with another snapshot', async () => {
  const s = status({ generation: G_B });
  serve({ 'overview.json.gz': gzipSync(JSON.stringify(ov(G_B, 100))), 'tiles/N10E090.json.gz': gzipSync(JSON.stringify(tileOf(G_B))) });
  await recentOverview(s, '7d');
  await recentPoints(s, ['N10E090'], '7d', 100);
  assert.ok(requested.some((u) => u === `data/recent/overview.json.gz?v=${encodeURIComponent(G_B)}`), requested.join(' '));
  assert.ok(requested.some((u) => u === `data/recent/tiles/N10E090.json.gz?v=${encodeURIComponent(G_B)}`));
  // a format 2 snapshot (no generation yet) is still versioned, by its overview checksum
  assert.equal(snapshotId({ files: { 'overview.json.gz': { sha256: 'abc' } }, fetched_utc: 'x' }), 'abc');
});

test('D1: an overview of another update is refused, never drawn under this status', async () => {
  serve({ 'overview.json.gz': gzipSync(JSON.stringify(ov(G_A, 100))) });   // a CDN still serving the earlier file
  await assert.rejects(recentOverview(status({ generation: G_B }), '7d'), SnapshotMismatch);
});

test('D1: a tile of another update or a missing tile is left out and counted, never mixed in', async () => {
  serve({ 'tiles/N10E090.json.gz': gzipSync(JSON.stringify(tileOf(G_A))) });
  const r = await recentPoints(status({ generation: G_B }), ['N10E090', 'N20E090'], '7d', 100);
  assert.equal(r.features.length, 0);
  assert.equal(r.missing, 2);
});

test('D1: a publication record of another update marks the status as updating', async () => {
  serve({ 'status.json': JSON.stringify(status({ generation: G_B })), 'publication.json': JSON.stringify({ state: 'new', generation: G_A }) });
  const s = await recentStatus();
  assert.equal(s.updating, true);
  assert.equal(s.publication, null);
  assert.strictEqual(await recentStatus(), s);                               // read once: header and map share it
});

test('D2: completed days with no detections are named as missing coverage', () => {
  const s = status({ complete: false, products: {
    VIIRS_NOAA20_NRT: { satellite: 'N20', requests: [{ from: '2026-11-01', days: 5, ok: true }], suspect_days: [] },
    VIIRS_NOAA21_NRT: { satellite: 'N21', requests: [{ from: '2026-11-01', days: 5, ok: true }],
      suspect_days: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05'] } } });
  assert.deepEqual(missingCoverage(s), [{ satellite: 'N21', from: '2026-11-01', days: 3 }, { satellite: 'N21', from: '2026-11-05', days: 1 }]);
  const f = recentFreshness(s, Date.parse('2026-11-11T09:00:00Z'));
  assert.equal(T.recent.missing(f.missing.map(T.recent.missingItem).join(', ')),
    'Incomplete: no data was received for NOAA-21 from 2026-11-01 (3 days), NOAA-21 from 2026-11-05 (1 day). Missing data is not "no fire".');
});
