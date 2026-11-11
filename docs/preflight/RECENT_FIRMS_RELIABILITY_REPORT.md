# Recent FIRMS reliability report (Task 2)

Team Squadron Zero · prepared by Claude, 11 November 2026 · branch `fix/recent-firms-reliability` from `main` 43286b0 (the merge of PR #3). Implementation commit 9950c24.

**Verdict: CONDITIONAL PASS.** The reliability changes work in every local test, in a simulation of the workflow steps on the real 1.5 million-detection snapshot, and in the browser. Three things can only be confirmed on GitHub: the CI run of this branch, the first real `pull` from GitHub Pages, and whether GitHub delivers the 3-hourly schedule (section 9). None of them can change historical data.

## 1. Baseline and scope

| Item | Value |
| --- | --- |
| Previously reviewed production commit | 44e2d21 (PR #2). Newer: 43286b0 (PR #3, scientific claims correction, wording only, merged and live) |
| Baseline for this task | 43286b0 |
| Scientific claims correction | Already merged, untouched by this branch |
| Protected files | Unchanged. `verify_baseline.py`: UNCHANGED, all 41 files (section 7) |
| Pushed, merged, deployed | No. Local commit only, waiting for "push yes" |

## 2. Root causes found

| # | Problem | Cause in the code at 43286b0 |
| --- | --- | --- |
| 1 | A failed refresh removed the recent layer from the new build | `pages.yml` ran `fetch_firms.py` straight into `web/public/data/recent` with `continue-on-error`. On total failure nothing was written, so the deploy had no recent files. The previous snapshot existed only on the live site and was never fetched back |
| 2 | NaN and infinite FRP passed the row checks and crashed the whole fetch | `float("nan")` and `float("inf")` succeed. Every comparison with NaN is False, so `frp < 0` let NaN and +infinity through. Coordinates were safe only by accident: NaN or infinite latitude and longitude failed the range test and were rejected as "coordinates out of range". Reproduced on 43286b0: one row with FRP `nan` was kept by `parse_rows`, then `round(f * 10)` raised `ValueError: cannot convert float NaN to integer`, the fetch stopped and wrote nothing, so that deploy had no recent layer |
| 3 | "Last 24 hours" could describe an old window | The overview and the single points count back from the newest detection in the snapshot, not from the current time. The label said "Last 24 hours". With a stopped feed or a stale build the label stayed the same |
| 4 | The baseline check was not enforced | No workflow ran `verify_baseline.py` |
| 5 | Implicit token permissions | `tests.yml` had no `permissions` block |
| 6 | Failure paths untested | 11 tests covered the parser and a failed chunk. No test covered publishing, fallback, corrupt or stale snapshots, or the period edges |

## 3. Files changed

| File | Change |
| --- | --- |
| `recent/snapshot.py` (new) | `pull`, `check`, `publish`. Standard library. No key, no access to the historical record |
| `recent/fetch_firms.py` | Finite-number checks with their own reasons. `allow_nan=False` on every JSON it writes. Map edges (latitude 90, longitude 180) go to tiles the site loads. `status.json` format 2 lists every file with size and SHA-256. Exit code 3 for a missing key. Duplicate policy written down |
| `.github/workflows/pages.yml` | Four recent steps: pull previous, fetch new (only step with the key), publish, final check |
| `.github/workflows/tests.yml` | `permissions: contents: read`. Runs `verify_baseline.py` and its failure tests |
| `web/src/lib/recent.js` | `recentStatus` attaches `publication.json`. `recentFreshness(status, now)` and `missingCoverage` |
| `web/src/content/text.js`, `pages/Explore.jsx`, `App.jsx`, `components/RecentLegend.jsx`, `styles/layout.css`, `pages/Method.jsx` | Period labels, retrieval and newest-detection times, "not current" notice, failed-refresh note, missing coverage, header badge marker, one Method sentence |
| Tests | `recent/test_fetch_firms.py` (+7), `recent/test_snapshot.py` (new, 30), `docs/preflight/test_verify_baseline.py` (new, 3), `web/tests/recent.test.mjs` (new, 9), `web/tests/browser/recent_states_check.py` (new) |

Not changed: `pipeline/`, `config/`, `web/src/lib/` engine files under the fingerprint, the release `site-data`, any historical export.

## 4. Snapshot architecture (WP1)

The snapshot the live site serves is the "previous snapshot". GitHub Pages is public, so the next build can read it back over HTTPS with no token and no extra permission. No release, artifact store or database is added, so nothing can trigger a new workflow run (Pages deployments do not trigger workflows).

Build steps in `pages.yml`:

1. **Pull** (`snapshot.py pull`): download `status.json`, `publication.json` if present, `overview.json.gz` and every tile named in the status index from `https://squadronzero.github.io/squadron-zero/data/recent/`. Keep it only if it passes `check`. Otherwise there is no previous snapshot.
2. **Fetch** (`fetch_firms.py`) into a separate folder. Only this step gets `NASA_FIRMS_MAP_KEY`. Its exit code is recorded: 0 complete, 2 partial, 1 every request failed, 3 no key.
3. **Publish** (`snapshot.py publish`): decides what the build serves, assembles it in a staging folder, checks it again, then swaps it in with a rename. It writes one line to the run's summary page.
4. **Final check**: if the published folder fails `check`, it is removed. The site then says "not available". The historical record is built and deployed in every case.

Publication policy:

| Case | Condition | Served | `publication.json` state |
| --- | --- | --- | --- |
| A | Fetch exit 0, snapshot passes every check, complete | New snapshot | `new` |
| B | Partial (a chunk or a whole product failed) | Previous snapshot if it passes the checks, is complete and is at most 24 h old. Otherwise the new one | `fallback`, or `incomplete` with the missing product and dates |
| C | Every request failed | Previous snapshot if it passes the checks | `fallback` |
| D | New snapshot fails a check (corrupt, inconsistent, wrong place) | Previous snapshot if it passes the checks | `fallback` |
| E | No key | Previous snapshot if it passes the checks | `fallback` |
| none | No usable snapshot at all | Nothing. Recent layer disabled with its note | (no folder) |

Rules that always hold:
- A served snapshot is the files of one fetch, byte for byte, including its own `status.json`. Its `fetched_utc` is never changed. Old and new files are never mixed.
- The only file added is `publication.json`: state, decision time, the snapshot's own fetch time, the SHA-256 of its `status.json`, completeness, missing coverage, and what the attempt found.
- A fallback of a fallback keeps the first fetch time.

What `check` verifies: status format (1 or 2), required fields, UTC timestamps, window dates and length, known products and satellites, product rows equal to their per-day counts, total rows, completeness flag equal to the products, newest detection inside the window and not after the fetch, tile counts adding up to the rows, no missing and no unexpected files, sizes and SHA-256 (format 2), gzip and JSON decoding, overview arrays and ranges (24 h ≤ 7 d ≤ all), every detection's fields in range with integers only (so NaN fails), and every detection inside its own 10° tile. The live snapshot of 10 Nov (1,506,779 detections, 240 tiles, format 1) passes in 2.8 s.

## 5. Validation rules (WP2)

A row is rejected, with the reason counted in `status.json`, if: latitude, longitude or FRP is not a number, or not finite (NaN, Infinity, -Infinity); coordinates outside ±90 / ±180; FRP negative; acquisition date invalid or outside the window; acquisition time invalid; satellite not the product's own; confidence not low, nominal or high; day/night not D or N. A reply missing a required column fails as a whole request (shown as missing, never as zero). One bad row never stops a good reply. A header-only reply is a valid empty answer (rows 0, complete), not a failure, and its day is listed under `days_without_data`.

Duplicates: within one product, rows identical after normalisation (day, time to the minute, latitude and longitude to 4 decimals, about 11 m, confidence class, FRP to 0.1 MW, day/night) are kept once. Two satellites are never compared. The existing `sorted(set(rows))` behaviour was kept: the test shows an exact repeat and a 0.00004° difference are merged, while the next minute or a 0.1 MW different FRP stay separate. For 375 m pixels this cannot merge two real detections.

Map edges: latitude 90 goes to the N80 row and longitude 180 (the same meridian as -180) to the W180 column. Before, they would have gone to tiles named N90 or E180, which the website never requests.

## 6. Time windows and staleness (WP3)

Traced through `fetch_firms.py` (`write_web`), `recent.js` (`recentOverview`, `recentPoints`), `Explore.jsx` and `text.js`:

- All times are UTC. Minutes are counted from 00:00 UTC of the window's first day.
- The **24 h** and **7 days** periods end at the **newest detection in the snapshot**, not at retrieval time or the reader's clock. A detection is inside if it is less than 1,440 (or 10,080) minutes older than the newest one. The overview (Python) and the single points (JavaScript) use the same edge. Tests at ages 1,439 / 1,440 and 10,079 / 10,080 pass in both.
- **Since 28 Oct** runs from the window's first day to the newest detection.
- A partial last day is just a shorter day: the window still ends at the newest detection.

Kept (lower risk before the demo): the calculation. Changed: what it is called and what is shown.

| Shown | Text |
| --- | --- |
| Period menu | "24 h to the newest detection", "7 days to the newest detection", "Since 28 Oct" |
| Map bar | "Retrieved from NASA FIRMS (time) UTC. Detections from 2026-10-28 to (newest) UTC (the newest one). Periods end at the newest detection, not at the current time." |
| Not current (older than 6 h, or a fallback) | "Recent observations are not current. Showing the last successful dataset, retrieved on (stored time) UTC." |
| Fallback | adds "The refresh of (time) UTC did not complete, so this earlier dataset is kept unchanged." |
| Delayed feed (newest detection more than 12 h before retrieval) | "The newest detection is N hours older than the retrieval: FIRMS may be delayed." |
| Incomplete | "Incomplete: no data was received for NOAA-21 from (date) (N days). Missing data is not \"no fire\"." |
| Header badge | "Recent detections to (newest) UTC (not current)" when not current |

The notice is plain text with a grey bar, no red. The page re-judges "not current" every 5 minutes, so a laptop left open during judging changes on its own. The limit of 6 hours is two missed 3-hourly refreshes.

## 7. Scientific integrity (verify_baseline output)

```
UNCHANGED: all 41 files match the baseline (829ce01).
exit 0
```

`git diff 43286b0..HEAD --name-only` touches no file under `pipeline/`, `config/` or the fingerprinted `web/src/lib/` files (`recent.js` is not fingerprinted).

## 8. Security review (WP4)

| Item | Finding |
| --- | --- |
| `tests.yml` | Now `permissions: contents: read`. No secrets used |
| `pages.yml` | `contents: read`, `pages: write`, `id-token: write` (needed to deploy). The key is passed only to the fetch step. The pull, publish and check steps get no secret. No `pull_request` trigger, so pull requests never reach the key |
| `web-check.yml` | `contents: read`, no secrets |
| `recent-firms.yml` | `contents: write` and the key, but runs only on pushes to `feature/recent-firms` or by hand. Not changed here. Recommended after judging: delete the branch `feature/recent-firms`, the draft release `recent-firms-preview`, and this workflow |
| Key exposure | `fetch_firms.py` never logs the URL and masks the key in reply snippets. `snapshot.py` never reads the key (tested). The key is not in any `VITE_` variable or web file |
| Actions pinning | Official actions pinned by major version, not by commit SHA. Recommended after judging |

## 9. Scheduled refresh (WP4C), as observed at 09:42 UTC on 11 Nov

| Condition | Evidence |
| --- | --- |
| Schedule configured | `cron: "17 */3 * * *"` in `pages.yml` on `main` |
| Workflow enabled | API: state `active` |
| Scheduled events delivered | 1 run with event `schedule` (#10, created 01:16 UTC). Since the layer went live (20:49 UTC, 10 Nov) the slots 21:17, 00:17, 03:17, 06:17 and 09:17 UTC passed. One was delivered, about an hour late |
| Job started, fetch succeeded, deployed | Run #10: success, deployed |
| Snapshot refreshed | Yes for run #10, and again by push run #11 (08:27 UTC, PR #3) |

Cause: GitHub delays and drops scheduled runs under load (documented by GitHub, more common at the top of busy hours). The YAML is correct, and nothing in this repository can make delivery reliable. What this branch changes: when refreshes are missed, the site now says the data is not current and shows the stored retrieval time, instead of still saying "Last 24 hours". Option for Squadron Zero (not done): a second cron line at another minute to double the chances.

## 10. Failure-behaviour matrix (WP5)

Evidence names are tests in `recent/test_snapshot.py` (S), `recent/test_fetch_firms.py` (F), `docs/preflight/test_verify_baseline.py` (B), `web/tests/recent.test.mjs` (W), the browser check `recent_states_check.py` (Br) and the workflow simulation (Sim). All results are from runs on 11 Nov.

| Scenario | Input | Expected | Actual | Evidence | Result |
| --- | --- | --- | --- | --- | --- |
| Complete acquisition | All chunks of both products OK | New snapshot served, state `new` | Served, files equal to the fetch | S `test_A_complete_fetch_is_published_as_new`, Br fresh | PASS |
| NaN or infinity | `nan`, `NaN`, `inf`, `-Infinity`, `-inf` in latitude, longitude, FRP | Rows rejected with their reason, others kept | 6 rejected with "… not finite", rest kept, no NaN in output | F `test_nonfinite_and_invalid_values_are_rejected_with_their_own_reason`, `test_one_bad_row_does_not_stop_a_good_reply` | PASS |
| Other invalid fields | Negative FRP, bad date, bad time, other satellite, bad confidence | Rejected with reasons | As expected | same test | PASS |
| Repeated records | Exact repeats, sub-11 m difference, next minute, other FRP, two satellites | Documented merge policy | 2 merged per product, 3 kept, satellites never merged | F `test_duplicate_policy_merges_only_identical_rows_of_one_product` | PASS |
| Missing satellite product | Every NOAA-21 chunk fails | Identified as incomplete, product named | `incomplete`, N21 named twice (two chunks) | S `test_B_a_whole_product_missing_is_identified` | PASS |
| One failed chunk | One NOAA-21 chunk fails | Never shown as complete | Fallback to a fresh complete previous, or `incomplete` with dates | S `test_B_partial_fetch_prefers_…`, `test_B_partial_…_old`, `test_B_without_…`, F `test_a_failed_chunk_is_reported_not_hidden`, Br incomplete | PASS |
| Total API outage | Every request fails | Previous snapshot kept unchanged | Byte-identical including `status.json`, fetch time kept | S `test_C_total_outage_keeps_the_previous_snapshot_byte_for_byte`, Br fallback | PASS |
| Missing API key | No key | Exit 3, nothing written, no key text, previous kept | As expected | F `test_no_key_means_nothing_is_fetched`, S `test_E_missing_key_keeps_the_previous_snapshot`, Sim | PASS |
| Corrupt previous snapshot | Missing tile, wrong bytes, truncated gzip, NaN in a tile, extra file | Rejected, not served | Rejected in all 11 damage cases, nothing served | S `test_damaged_snapshots_are_rejected` (11 cases), `test_corrupt_previous_snapshot_is_never_published`, `test_pull_rejects_a_served_snapshot_that_is_damaged` | PASS |
| Corrupt new snapshot | A tile replaced by junk | Not served, previous kept | `D`, fallback | S `test_D_corrupt_new_snapshot_is_not_published` | PASS |
| Missing previous snapshot | No previous, fetch fails | Recent layer unavailable, record works | No folder, layer disabled with its note, record drawn, story shows ranks | S `test_C_total_outage_without_…`, `test_pull_without_a_served_snapshot_returns_nothing`, Br unavailable | PASS |
| Stale previous snapshot | Reader 13 h after retrieval | Original times kept, "not current" visible | Notice with the stored time, badge "(not current)" | W `older than the limit…`, Br old | PASS |
| 24-hour edge | Ages 1,439 and 1,440 min | In, out | As expected, Python and JavaScript | F `test_24_hour_and_7_day_windows_end_at_the_newest_detection`, W `24-hour and 7-day edges…` | PASS |
| 7-day edge | Ages 10,079 and 10,080 min | In, out | As expected in both | same tests | PASS |
| Empty valid response | Header only | Complete with 0 rows, not a failure | Exit 0, rows 0, day listed as without data | F `test_empty_valid_reply_is_not_a_failure` | PASS |
| Wrong geographic data | A detection moved outside its tile, out-of-range coordinates | Rejected | "outside the tile", "coordinates out of range" | S `test_damaged_snapshots_are_rejected[point_outside_tile_v1]`, F `test_every_bad_row_is_rejected_with_a_reason` | PASS |
| Map edges | Latitude ±90, longitude ±180 | In tiles the site loads | N80, S90, W180 tiles only | F `test_edges_of_the_map_land_in_tiles_the_site_loads` | PASS |
| Baseline mismatch | A protected file changed or missing | CI fails | Exit 1 with "CHANGED" and the file name | B `test_a_changed_protected_file_fails`, `test_a_missing_protected_file_fails` | PASS |
| Repeated refresh | New, outage, new with other tiles, then over an existing folder | No mixing, no leftovers | Tile sets equal to the served fetch, no staging folders left | S `test_repeated_refreshes_never_mix_snapshots`, `test_fallback_of_a_fallback_keeps_the_first_fetch_time` | PASS |
| Workflow steps on the real snapshot | Live snapshot served locally, no key | Previous pulled, served unchanged | 242 files pulled, `fallback`, `diff -r` identical | Sim (`workflow_simulation.txt`) | PASS |

## 11. Tests run (11 Nov, Claude's workspace)

| Suite | Command | Result |
| --- | --- | --- |
| Baseline | `python docs/preflight/verify_baseline.py` | UNCHANGED, exit 0 |
| Recent | `python -m pytest -q recent` | 48 passed |
| Baseline-check tests | `python -m pytest -q docs/preflight` | 3 passed |
| Validation | `python -m pytest -q validation` | 5 passed |
| Pipeline | `cd pipeline && python -m pytest -q` | 63 passed, 1 skipped |
| Web, no data | `npm test` | 28 passed, 3 skipped (need data), 0 failed |
| Web, released data | `SHIFT_DATA_DIR=… npm test` | 31 passed, 0 failed |
| Build | `npm run build` | exit 0 |
| Browser: recent states | `recent_states_check.py` (fresh, old, fallback, incomplete, unavailable) | All five behave as section 6 says. Record drawn and ranked in all five. Page errors 0. Console: two 404s for `status.json` in the unavailable state only (expected, also on main) |
| Browser: recent layer | `recent_check.py` | 0 errors, overview 1,828 cells, points 1,944, popup text only, record untouched |
| Browser: globe | `globe_check.py` | 0 errors, 2D and 3D values identical |
| Browser: claims | `claims_check.py` | 0 errors, qualifier visible, no bare "95% range" |

On GitHub Actions: not yet run for this branch (it is not pushed). After "push yes", `tests` (3 Python versions, now including the baseline check) and `Website build check` run on the pull request.

## 12. Remaining limitations

- **First real pull from GitHub Pages is untested.** Claude's workspace cannot reach github.io. The pull was tested against a local server with the real snapshot. If Pages served the `.gz` files differently, the pull would fail its checks and the build would behave as today (no fallback), never serve wrong data. The first Website run after merge shows the result on its summary page.
- **Fallback keeps any age for cases C, D and E.** A very old snapshot stays visible, clearly marked "not current" with its date. Squadron Zero may prefer a maximum age (for example 7 days) after the event.
- **The 6-hour limit uses the reader's clock.** A device with a wrong clock would judge staleness wrongly. The stored times shown are always correct.
- **Scheduled refresh delivery depends on GitHub** (section 9).
- **Rendered cell counts in the browser vary by one or two between runs** (map rendering timing). The data files themselves are byte-identical (tests).

## 13. Rollback

- Fast: Actions > Website > "..." > Disable workflow. The live site keeps its last deploy.
- Full: revert the merge commit on `main` (`git revert -m 1 <merge>`), which redeploys the previous behaviour. Old website code reads the new `status.json` (format 2 only adds a field) and ignores `publication.json`, so a mixed state is harmless.
