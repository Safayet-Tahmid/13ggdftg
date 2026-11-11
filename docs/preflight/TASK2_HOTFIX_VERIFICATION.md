# Task 2 hotfix verification (audit defects D1 to D6)

Team Squadron Zero · prepared by Claude, 11 November 2026, evidence gathered 19:06 to 19:24 Asia/Dhaka · branch `fix/recent-firms-audit-defects` from `main` 5b2c4d5 · code commit 76d9637. Answers `docs/preflight/TASK2_COMPLETION_AUDIT.md` (included in this branch). Not pushed, not merged, not deployed.

**Verdict: CONDITIONAL PASS.** All six defects are corrected and each has a test that fails on the old code and passes on the new. The scientific core is unchanged. What remains is external: D6 (job permissions) and the first pull with the new code can only be confirmed by a Website run on GitHub, which happens only after an authorised merge.

## 1. Summary table

| Defect | Root cause | Exact fix | Regression test | Result |
| --- | --- | --- | --- | --- |
| D1 browser shows two snapshots at once | `overview.json.gz` and tiles were fetched with the browser's default cache under fixed URLs, `status.json` with `no-cache`. After a deploy a reload got the new status and the old overview. Header badge and map each read `status.json` separately | Every file of one fetch carries the same `generation` id (`fetch_firms.py`). `recent.js` requests overview and tiles as `…?v=<generation>` and refuses any file whose `generation` differs (`SnapshotMismatch`). The map then shows nothing and the note "Recent detections are being updated … Nothing is shown rather than a mix". A tile of another update or a missing tile is left out and named ("Some single detections in view could not be loaded"). `status.json` is read once per page, so header and map share it. A publication record of another update marks the status as updating | `web/tests/browser/cache_mix_check.py` (A cached, B deployed, normal reload, server sends `max-age=600`, two cases). `web/tests/recent.test.mjs` D1 tests (4). `recent/test_snapshot.py::test_files_of_two_fetches_are_never_accepted_together` | Old build: both cases mixed (B's retrieval time with A's newest detection and A's map). New build: "deploy" shows B only. "propagation" (status B, overview still A) draws 0 cells and shows the updating note. PASS |
| D2 empty satellite product published as complete | A valid header-only reply counted as a successful request. `days_without_data` was computed but never used | `fetch_firms.py`: `suspect_days` = completed UTC days with no detection in a global product. A day counts as completed once it ended at least 6 hours (`LATENCY_HOURS`) before the fetch, so the current day and normal NRT delay are never judged. Only for `area = world`, since a small area can truly have no fire. Suspect days make the product incomplete (exit 2), so the existing fallback rules apply. `snapshot.py` and `recent.js` list them as missing coverage. The website names satellite and days | `test_D2_an_empty_global_product_…`, `test_D2_one_missing_completed_day_…` (with latency edge 5:59 / 6:00), `test_empty_valid_reply_for_a_small_area_is_a_real_zero`, `test_D2_empty_noaa21_feed_is_not_published_as_a_complete_new_snapshot`, web D2 test, browser check `D2_browser.json` | NOAA-21 valid but empty for 14 completed days, no previous snapshot: attempt B, served "incomplete", notice "Incomplete: no data was received for NOAA-21 from 2026-10-28 (14 days). Missing data is not "no fire"." PASS |
| D3 path traversal in `pull` | Tile names from the downloaded `status.json` became file paths before any check | `pull` now checks, before writing anything: format 1, 2 or 3, at most 648 tiles, each name `^[NS][0-9]{2}[EW][0-9]{3}$` and a real 10° tile, and (format 2 and 3) a files list equal to the expected set. Every target must resolve inside the download folder. Files are created with exclusive create (`"xb"`), so an existing file or link is never followed. A planted link in place of the download folder is removed, not followed. Size limits: status 2 MB, publication 200 KB, overview and each tile 20 MB, total 200 MB | `test_D3_unsafe_tile_names_…` (9 names: `../`, absolute, URL-encoded, nested, out of range, lower case, wrong suffix, empty, too long), `test_D3_too_many_tiles_or_oversized_files_…`, `test_D3_a_link_in_place_of_the_download_folder_…`, `test_D3_an_ordinary_snapshot_still_downloads` | Unsafe names: refused, no file written anywhere, no tile even requested. Ordinary snapshot: downloads byte-identical. PASS |
| D4 huge FRP crashed the fetch | `math.isfinite(1e308)` is true. `round(1e308 * 10)` is infinite and `int()` raised `OverflowError` | Rows with FRP above 1,000,000 MW are rejected with the reason "frp above 1,000,000 MW (not a value one pixel can have)". Rationale in the code: single VIIRS 375 m pixels report up to a few thousand MW in the largest fires [UNCERTAIN: exact record not checked], so no real record is lost. FRP × 10 stays an exact JavaScript integer (below 2^53) | `test_D4_absurd_frp_is_rejected_without_stopping_the_batch` (1e308 and 1,000,000.1 rejected, 5,000, 150,000, 0 and 999,999.9 kept, full run completes) | Before: crash, nothing written. After: two rows rejected, batch written. PASS |
| D5 stale CDN copy used as fallback | `pull` sent no revalidation and no unique query, and could not notice a change during the copy | Every request sends `Cache-Control: no-cache`, `Pragma: no-cache` and `?shift_pull=<GitHub run id>`. `status.json` is read again at the end. If it differs, the copy is dropped. The files list (SHA-256) and the `generation` id must match. A whole older copy that is self-consistent cannot be told apart from the live one, so it is never treated as new: it can only be served as a fallback, with its own fetch time and generation shown | `test_D5_a_stale_cached_status_with_newer_files_is_rejected`, `test_D5_a_deploy_during_the_copy_drops_the_copy`, `test_D5_an_older_but_whole_cached_snapshot_is_only_ever_a_labelled_fallback`, the unique query checked in `test_D3_an_ordinary_snapshot_still_downloads` | Mismatched and changing copies rejected. Older whole copy: state "fallback", its own `snapshot_fetched_utc`. PASS, with the limitation in section 4 |
| D6 broad workflow permissions | `pages: write` and `id-token: write` were set for the whole workflow, so the build job had them | Workflow: `contents: read`. Build job: `contents: read`, `pages: read` (for `actions/configure-pages`). Deploy job: `pages: write`, `id-token: write` | `docs/preflight/test_workflows.py` (4 tests: build has no write, only deploy writes, the key reaches one step and never deploy, no pull_request trigger, tests and build-check workflows read-only, baseline check first and never rewritten) | Test fails on the old `pages.yml`, passes on the new. Real deployment with the new permissions: **not yet run** (needs an authorised merge). CONDITIONAL |

## 2. Changed files (76d9637 against 5b2c4d5)

| File | Change |
| --- | --- |
| `.github/workflows/pages.yml` | D6 job-level permissions (10 lines) |
| `recent/fetch_firms.py` | generation id, `suspect_days`, `--area`, `--now` (tests), FRP limit, status format 3 |
| `recent/snapshot.py` | format 3 checks (generation in every file, suspect days), missing coverage with suspect days, generation in `publication.json`, hardened `pull` |
| `recent/test_fetch_firms.py`, `recent/test_snapshot.py` | sparse fixtures now declare a small `--area`. New tests for D2, D3, D4, D5, generation |
| `web/src/lib/recent.js` | versioned and checked loads, status read once, suspect days in missing coverage |
| `web/src/pages/Explore.jsx`, `web/src/content/text.js` | updating note, missing-tiles note |
| `web/tests/recent.test.mjs` | D1 and D2 tests |
| `web/tests/browser/cache_mix_check.py` (new) | D1 browser scenario |
| `docs/preflight/test_workflows.py` (new) | D6 and WP4 static checks |
| `docs/preflight/TASK2_COMPLETION_AUDIT.md`, this file | documentation |

11 code and test files, 705 lines added, 79 removed. Not changed: `pipeline/`, `config/`, the 7 fingerprinted `web/src/lib/` files, `site-data`, `recent-firms.yml` (left as instructed).

Format compatibility: the live site now serves a format 2 snapshot (no generation). The new `pull` copied a format 2 snapshot made by the current live code without problems (`ev/pull_format2_compat.txt`), and the new website versions its files by the overview checksum until the first format 3 snapshot replaces it. Old website code reads format 3 (it only adds fields).

## 3. Before and after

| Situation | Before (main 5b2c4d5) | After (76d9637) |
| --- | --- | --- |
| Reload after a deploy, A cached | "Retrieved … 2026-11-12 00:30 (B) … to 2026-11-10 23:17 (A)", A's 30 cells | "Retrieved … 2026-11-12 00:30 … to 2026-11-11 23:17", B's cells, overview requested as `?v=20261112T003000Z-…` |
| Deploy still spreading (status B, overview A) | A's cells under B's times | 0 cells, "Recent detections are being updated …" |
| NOAA-21 answers empty files for two weeks | published as complete, new, no notice | attempt B: a complete previous snapshot up to 24 h old is kept (existing rule), otherwise incomplete with "no data was received for NOAA-21 from 2026-10-28 (14 days)" |
| NOAA-20 empty only on the current day | (not judged) | not judged (latency) |
| Live `status.json` lists `../../escaped` | file written to `/tmp/escaped.json.gz` | refused before any request for tiles, nothing written |
| One row with FRP 1e308 | `OverflowError`, nothing written | row rejected, batch written |
| Status changes during the copy | copy kept if it validated | copy dropped |
| Build job token | `pages: write`, `id-token: write` | `contents: read`, `pages: read` |

## 4. Remaining limitations

- **D6 deploy not yet seen on GitHub.** `pages: read` on the build job is what `actions/configure-pages` is expected to need [UNCERTAIN]. If the first Website run after merge fails at "configure-pages", the smallest correction is to give the build job `pages: write` back (not `id-token`) or remove that step. The deploy job keeps exactly the rights it had.
- **D5 cannot guarantee monotonic updates.** If a CDN answers every request (with the unique query) with a complete older snapshot, it passes the checks. It is then only ever served as a fallback, labelled "not current" with its real retrieval time, so it is never presented as new. There is no other reliable record of "the newest snapshot" without new storage, which the task ruled out.
- **D1 during a spreading deploy** shows nothing for a few minutes (by design) rather than mixed data. Snapshots in format 1 or 2 have no generation id inside their files, so for them the website relies on the versioned URL only. This lasts until the first successful fetch after merge.
- **D2 rule** assumes a global VIIRS product always has detections on a completed day. A genuinely global fire-free day is not physically plausible. The 6-hour latency is a judgement, not a measured FIRMS figure [UNCERTAIN].
- **D4 limit** of 1,000,000 MW is generous on purpose. The largest real single-pixel VIIRS FRP was not looked up [UNCERTAIN], but it is orders of magnitude lower.
- `recent-firms.yml` (D7 in the audit) is unchanged, as instructed.

## 5. Scientific fingerprint

```
UNCHANGED: all 41 files match the baseline (829ce01).
exit 0
```

## 6. Test results (11 Nov 2026, this workspace, Python 3.13.18, Node 22.23.4)

| Command | Exit | Result |
| --- | --- | --- |
| `python -m pytest -q recent` | 0 | 70 passed |
| `python -m pytest -q docs/preflight` | 0 | 7 passed (3 baseline, 4 workflow) |
| `python -m pytest -q validation` | 0 | 5 passed |
| `cd pipeline && python -m pytest -q` | 0 | 63 passed, 1 skipped |
| `python docs/preflight/verify_baseline.py` | 0 | UNCHANGED |
| `cd web && npm test` | 0 | 34 passed, 3 skipped (need released data), 0 failed |
| `SHIFT_DATA_DIR=… npm test` | 0 | 37 passed |
| `npm run build` | 0 | built |

Red checks (new tests against the old code, `ev/red_check_*.txt`): the 20 new Python tests for D2, D3, D4, D5 and generation all fail against main's `fetch_firms.py` and `snapshot.py`. The new workflow test fails against main's `pages.yml`. Against main's `recent.js` the new web test file fails at import, because the new exports do not exist yet. The meaningful red evidence for D1 is the browser scenario on the old build (section 3).

## 7. Browser evidence

| Check | Build | Result |
| --- | --- | --- |
| `cache_mix_check.py` | old (main) | deploy: mixed. propagation: mixed |
| `cache_mix_check.py` | new | deploy: all B. propagation: nothing drawn, updating note |
| `recent_states_check.py`, real 10 Nov snapshot (format 1) | new | fresh, old, fallback, incomplete, unavailable as specified. Record works in all. Only console message: one 404 in the "unavailable" state, where the files are absent on purpose (expected) |
| `recent_states_check.py`, format 3 snapshot | new | same |
| D2 state (NOAA-21 empty 14 days) | new | incomplete notice names NOAA-21 and the dates, legend says missing days are not "no fire" |
| `recent_check.py` | new | 0 errors, overview 1,828 cells, single points 1,944, popups text only, record untouched |
| `globe_check.py` | new | 2D and 3D identical, 0 mismatches |
| `claims_check.py` | new | Task 1 qualifier visible, no bare "95% range" |
| `downloads_check.py` | new | 12 of 12 downloads correct |
| Acceptance A → total failure → rebuild (YAML steps, real network failure), real snapshot and format 3 snapshot | new | previous snapshot copied (242 and 6 files), attempt C, fallback byte-identical, original fetch time kept, "not current" and the failed refresh shown, record in 2D and 3D. Key in no published file or log |

## 8. GitHub Actions verification

Not run for this branch yet (not pushed). After "push yes": `tests` (3 jobs, now including the workflow tests) and `Website build check` will run on the pull request. The new job permissions in `pages.yml` and the first pull with the new code are only exercised by the Website workflow on `main`, so they can only be confirmed after an authorised merge (Website run summary: "previous snapshot copied", "attempt A … serving new", deploy green). No deployment has happened with this code.

## 9. Rollback

Fast: Actions > Website > Disable workflow (the live site keeps its last deploy). Full: revert the merge commit of this branch. Nothing historical is touched. Old website code reads format 3 snapshots (extra fields only), and the new `pull` reads format 1 and 2, so a revert in either direction never strands the recent layer. If only D6 misbehaves, restore the three permission lines at workflow level.
