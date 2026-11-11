# Task 2 completion audit

Team Squadron Zero · audit by Claude of its own Task 2 work, 11 November 2026, 18:37 to 19:00 Asia/Dhaka (12:37 to 13:00 UTC). Read-only: no code, setting, workflow or data was changed, nothing was pushed, merged or deployed. This file is untracked. Evidence files are in `task2_audit_evidence.zip` (folder `ev/`), referred to below as `ev/<file>`.

## A. Executive verdict

**CONDITIONAL PASS.** Task 2 does what it set out to do on the server side. The audit's acceptance scenario (section 14 of the audit prompt) was reproduced through the real production code: a complete snapshot was published, the next refresh failed for real (every FIRMS request refused), the four workflow steps were run as written in `pages.yml`, the rebuilt site served the earlier snapshot byte for byte with its original fetch time, showed "not current" and the failed refresh, and the historical record worked in 2D and 3D. Non-finite values are rejected and tested, and the Python and JavaScript time windows agree at every edge tested.

The audit also found two defects that must be fixed before final submission (P1), and five smaller ones (P2):

| ID | Priority | Defect | Reproduced |
| --- | --- | --- | --- |
| D1 | P1 | After a deploy, a normal browser reload can show the **new** status (retrieval time) with the **old** overview and tiles from the browser cache. Two snapshot generations are combined on screen | Yes (`ev/cache_mix.json`) |
| D2 | P1 | If one satellite product answers with a valid but empty file for the whole window (a product outage that looks like "no detections"), the snapshot is published as complete and new, and the website says nothing. Missing data can look like less fire | Yes (`ev/probes.json`, `n21_empty`) |
| D3 | P2 | `snapshot.py pull` writes downloaded files before checking the tile names, so a hostile `status.json` on the live site can write outside the download folder (path traversal) | Yes (a file was written to `/tmp`) |
| D4 | P2 | A finite but huge FRP (about 1.8e307 MW or more) passes the row checks and then crashes the whole fetch at integer encoding | Yes (`OverflowError`) |
| D5 | P2 | `pull` sends no cache bypass, so on a fallback it may republish a CDN-cached snapshot that is older than the one the site served last | No (needs the live CDN), code inspection |
| D6 | P2 | `pages.yml` grants `pages: write` and `id-token: write` to the whole workflow, so the build job (which holds the FIRMS key and handles downloaded content) has them too | Code inspection (pre-existing) |
| D7 | P2 | `recent-firms.yml` still has `contents: write` and the key on the old branch `feature/recent-firms` | Code inspection (pre-existing, already documented) |

No P0 was found: the historical record and its fingerprints are unchanged, no credential was found in any published file or log, and no mixed snapshot is ever written to the site. D1 is a mixed view in the browser, not a mixed published snapshot, and lasts at most as long as the browser keeps the old files (GitHub Pages is widely reported to send `Cache-Control: max-age=600`, 10 minutes. [UNCERTAIN] not verified from this workspace, which cannot reach github.io).

During the judging freeze no deploys happen, so D1 cannot occur then. D2 needs a product-wide empty answer from FIRMS. Both are small fixes (section L).

Verified completion: requirement matrix 40 of 48 applicable requirements PASS (83%). Failure matrix T01 to T30: 27 PASS, 3 PARTIAL.

## B. Repository state

| Item | Value |
| --- | --- |
| Repository | github.com/squadronzero/squadron-zero |
| Current branch, HEAD | `main`, 5b2c4d5 (= `origin/main`) |
| Working tree | clean except the untracked `docs/preflight/PHASE1_COMPLETION_AUDIT.md` (and this file). `git diff --check`: clean |
| Baseline for Task 2 | 43286b0 (merge of PR #3, Task 1 claims correction) |
| Task 2 commits | 9950c24 (code and tests), 80cf0a3 (report). PR #4, merged as 3cb148b on 11 Nov 10:44 UTC |
| Deployed | Website run #12 (43006095322), then #13 (scheduled), #14 and #15 (PRs #5, #6) all deployed this code |
| After Task 2 (not Task 2) | PR #5 3507d91 (chart PNG/SVG fix, report section 14), PR #6 5b2c4d5 (calendar PNG only) |
| Task 2 files | 17 files, 1,466 lines added, 29 removed (section 10 of the evidence) |
| Protected files | none of `pipeline/`, `config/` or the 7 fingerprinted `web/src/lib/` files changed between 43286b0 and HEAD |
| Task 1 isolation | Task 2 touched three Task 1 files (`text.js`, `Method.jsx`, `layout.css`) in other lines only. The 9 Task 1 claims tests still pass (`ev/npm_test_*.txt`) and the claims browser check still shows the qualifier and no bare "95% range" (`ev/claims_check.json`) |

## C. Task 2 requirement matrix

Statuses as defined in the audit prompt. "Reproduced" means re-run during this audit.

| ID | Requirement (Task 2 prompt) | Status | Evidence | Defect or missing evidence | Required correction |
| --- | --- | --- | --- | --- | --- |
| R01 | Inspect state, own branch, keep Task 1 isolated | PASS — DIRECTLY VERIFIED | section B | | |
| R02 | WP1.1 retrieve or generate a candidate | PASS — REPRODUCED | `ev/acceptance_real.json`, `acceptance_format2.json` | | |
| R03 | WP1.2 validate completeness and consistency | PASS — REPRODUCED | 11 damage cases (`pytest_recent.txt`), real 1.5 M snapshot passes | format 1 snapshots (no checksums) still accepted | P3, drop format 1 once no format 1 snapshot is live (it is not now) |
| R04 | WP1.3 publish the candidate only if accepted | PASS — REPRODUCED | `test_A_…`, `test_D_…`, acceptance | | |
| R05 | WP1.4 keep the previous complete snapshot on failure | PASS — REPRODUCED | acceptance: real network failure, steps run from the YAML, files byte-identical | | |
| R06 | WP1.5 keep the previous snapshot's original acquisition and publication metadata | PARTIAL | acquisition: `status.json` SHA-256 identical before and after | the previous `publication.json` is replaced. Only its `state` is kept (`previous_publication_state`), not its original decision time | P3, keep the earlier publication record inside the new one |
| R07 | WP1.6 mark a restored snapshot as fallback | PASS — REPRODUCED | browser: notice and "(not current)" badge (`acceptance_real.json`) | | |
| R08 | WP1.7 no valid snapshot, recent mode off gracefully | PASS — REPRODUCED | `recent_states_check.json` "unavailable" | | |
| R09 | WP1.8 historical website fully operational | PASS — REPRODUCED | record drawn and ranked in all 5 states, 2D and 3D, story and chart text identical to the pre-Task-2 build (`history_compare.json`) | | |
| R10 | Never a hybrid snapshot (new status, old tiles) | PASS — REPRODUCED for published files | `test_repeated_refreshes_never_mix_snapshots`, staging plus rename, checksums | see R44 for the browser | |
| R11 | Never label an old dataset as newly acquired | PASS — REPRODUCED for published files | acceptance: `fetched_utc` unchanged after the fallback, UI shows it | see R44 | |
| R12 | Never silently replace a complete snapshot with a partial or corrupt one | PASS — REPRODUCED | `test_B_…`, `test_D_…` | a product-wide empty answer is not seen as partial (R45) | |
| R13 | Smallest architecture, no backend, no extra write permission, no release loop | PASS — DIRECTLY VERIFIED | fallback source is the public Pages site, read over HTTPS with no token. No release or artifact is created. Pages deploys trigger no workflow | | |
| R14 | Integrity checks: format, fields, timestamps, products, satellites, completeness, tiles, gzip and JSON, inventory, missing files, counts, source | PASS — REPRODUCED | `snapshot.validate`, 11 damage cases, real snapshot | | |
| R15 | Atomic or staged publication | PASS — DIRECTLY VERIFIED | staging folder, check, rename. No staging folder left (`test_repeated_…`) | | |
| R16 | Explicit policy for cases A to E | PASS — REPRODUCED | tests for each case, probes for N20-only and N21-only failure and a bad CSV schema | | |
| R17 | Acceptance test: success then failure, and no previous snapshot | PASS — REPRODUCED | `acceptance_real.json`, `recent_states_check.json` | | |
| R18 | WP2 latitude, longitude, FRP finite | PASS — REPRODUCED | `test_nonfinite_…` | | |
| R19 | WP2 ranges and non-negative FRP, boundaries ±90 and ±180 | PASS — REPRODUCED | probes `bounds`: ±90, ±180 kept, 90.0001 and -180.0001 rejected | | |
| R20 | WP2 date, time, satellite, confidence, required fields | PASS — REPRODUCED | tests, probe `times`: 0000 and 2359 kept, 2400 and 0060 rejected | | |
| R21 | WP2 one malformed row must not crash a valid batch | PARTIAL | NaN and infinity are rejected | **D4**: FRP 1e308 is finite, passes, then crashes the whole fetch | reject implausible FRP, test |
| R22 | WP2 missing required column makes the reply invalid | PASS — REPRODUCED | `test_missing_column_…`, probe `schema_bad_n20`: chunk failed, snapshot incomplete | | |
| R23 | WP2 tests for each listed case | PASS — REPRODUCED | 14 listed cases each have a test that ran | | |
| R24 | WP2 deduplication documented and tested | PASS — REPRODUCED | `test_duplicate_policy_…`. Real data: 5 and 2 rows removed out of 1,506,786 (`status.json` of 10 Nov) | | |
| R25 | WP2 confidence policy and fire definitions unchanged | PASS — DIRECTLY VERIFIED | diff: only checks added before the existing ones | | |
| R26 | WP3 trace and define the windows | PASS — DIRECTLY VERIFIED | report section 6, this section F | | |
| R27 | WP3 one explicit reference time, labels accurate | PASS — REPRODUCED | browser: "24 h to the newest detection", "Periods end at the newest detection, not at the current time" | | |
| R28 | WP3 show retrieval time, newest observation, window end, stale, incomplete | PASS — REPRODUCED | browser states | incomplete is only shown for failed requests (R45) | |
| R29 | WP3 restrained stale notice with the stored time | PASS — REPRODUCED | browser text and screenshot | | |
| R30 | WP3 never claim absence of detections means no fire | PARTIAL | text says so for failed requests | **D2**: a product-wide empty answer gets no notice | see D2 |
| R31 | WP3 stale state tested with a controlled clock | PASS — REPRODUCED | `recent.test.mjs`, Playwright fixed clock | | |
| R32 | WP4A `verify_baseline.py` in `tests.yml`, fails on change | PASS — REPRODUCED | CI logs of PR #4, #5, #6 ("UNCHANGED"). Negative control on a disposable copy: exit 1 (`ev/T26_negative_control.txt`) | a red CI run on a real protected change was not observed (by the audit's own rule) | |
| R33 | WP4A no automatic baseline update | PASS — DIRECTLY VERIFIED | no workflow writes the manifest | | |
| R34 | WP4B `tests.yml` least privilege | PASS — DIRECTLY VERIFIED | `contents: read` | | |
| R35 | WP4B secret-bearing workflows inspected, no exposure to pull requests | PARTIAL | `pages.yml` has no `pull_request` trigger. The key is given to one step | **D6** workflow-wide `pages`/`id-token` write. **D7** `recent-firms.yml` | scope permissions to the deploy job, remove `recent-firms.yml` after judging |
| R36 | WP4B key never in frontend, logs or generated files | PASS — REPRODUCED | dummy-key run: key absent from every published file, the step summary and the full fetch output (`ev/T27_fetch_full_output.txt`). CI logs show only `***` | the real key cannot be compared (by design) | |
| R37 | WP4C scheduled refresh checked with each condition separated | PASS — DIRECTLY VERIFIED | section G | delivery is late and often missing (GitHub) | none in the repository |
| R38 | WP5 deterministic tests for all 16 scenarios | PASS — REPRODUCED | `pytest_recent.txt` 48, `pytest_baseline_check.txt` 3, web 9 | | |
| R39 | WP5 integration tests of the publication pipeline | PASS — REPRODUCED | `test_pull_…` (local HTTP server), acceptance runs the YAML steps | | |
| R40 | Section 9: `pytest recent`, `verify_baseline`, scientific and validation tests | PASS — REPRODUCED | section H | | |
| R41 | Section 9: `npm test`, `npm run build` | PASS — REPRODUCED | section H | | |
| R42 | Section 9: browser, historical charts, calendars, 2D and 3D maps, panel, console, navigation and exports | PASS — REPRODUCED | `history_compare.json` (story, chart text, calendar pixels identical), `globe_check`, `recent_check`, `downloads_check` 12 of 12 | | |
| R43 | Section 11 deliverables (report, matrix, verify output, CI, browser, verdict) | PASS — DIRECTLY VERIFIED | `RECENT_FIRMS_RELIABILITY_REPORT.md` | some claims overstated (section J) | correct the report |
| R44 | No hybrid view or old data labelled as new, as the user sees it (audit 6.3) | FAIL | **D1** reproduced: new status, overview and tiles from the browser cache | | version the data URLs |
| R45 | A product outage must not appear as zero activity (audit 5.4, Task 2 WP1 "never treat missing observations as zero fires") | FAIL | **D2** reproduced | | surface `days_without_data`, treat an all-empty product as partial |
| R46 | Retrieved content cannot overwrite files outside its folder (audit 7.2) | FAIL | **D3** reproduced | | check names before downloading |
| R47 | A delayed or cancelled refresh cannot replace newer data with older data (audit T29) | NOT VERIFIABLE | needs the live CDN. Code: no cache bypass in `pull` (D5). `concurrency: cancel-in-progress` prevents two builds at once | | cache bypass in `pull` |
| R48 | No unrelated or unnecessary change, no new dependency, no permission escalation | PASS — DIRECTLY VERIFIED | section 10 of this audit, standard library only | | |

## D. Snapshot reliability assessment

Where the previous snapshot comes from: the files the live site serves (`https://squadronzero.github.io/squadron-zero/data/recent/`), read by `snapshot.py pull` over public HTTPS. No token is needed, so no permission was added. GitHub Actions runners are discarded after each run and nothing relies on them. Proven on GitHub: every Website run since the merge logged "previous snapshot copied (242 files)" (#12, #13 scheduled, #14, #15).

Lifecycle, as run in the audit with the YAML steps unchanged except the site URL (`ev/acceptance_real.json`):

| Stage | What happened |
| --- | --- |
| Run A | real 10 Nov snapshot (1,506,779 detections, fetched 2026-11-10 20:01:08 UTC) published by `snapshot.py publish`, served as the live site. `status.json` SHA-256 1e913732… |
| Run B step 1 | "previous snapshot copied (242 files)" |
| Run B step 2 | dummy key, every request refused by the network (HTTP 400), "no request succeeded, nothing written", exit 1 |
| Run B step 3 | "attempt C (every FIRMS request failed (fetch exit 1)); serving fallback, fetched 2026-11-10T20:01:08Z" |
| Run B step 4 | check OK |
| Output | every data file and `status.json` byte-identical to Run A. New `publication.json`: state `fallback`, `snapshot_fetched_utc` 2026-11-10T20:01:08Z |
| Rebuilt site, browser, clock set one hour after Run A | badge "Recent detections to 2026-11-10 20:00 UTC (not current)". Notice "Recent observations are not current. Showing the last successful dataset, retrieved on 2026-11-10 20:01 UTC. The refresh of 2026-11-11 12:41 UTC did not complete, so this earlier dataset is kept unchanged." Map bar still gives the original retrieval time. Recent cells drawn in 2D and 3D. Record drawn in 2D and 3D, story ranks shown |

The same scenario with a format 2 snapshot made by the current fetch code also ended byte-identical (`ev/acceptance_format2.json`).

Partial failures (`ev/probes.json` and tests):

| Condition | Decision | Appropriate? |
| --- | --- | --- |
| NOAA-20 OK, NOAA-21 fails (any chunk) | previous complete snapshot if at most 24 h old, otherwise new one marked incomplete with product and dates | Yes. A complete, slightly older picture is less misleading than a current one missing a satellite, and both are labelled |
| NOAA-21 OK, NOAA-20 fails | same, NOAA-20 named | Yes |
| One date chunk fails | same, dates named | Yes |
| Invalid CSV schema in one reply | that chunk fails, so the same as above | Yes |
| A request succeeds with zero detections for a day | accepted, day listed in `days_without_data` in `status.json` only | **No, for a whole product or day (D2).** A global VIIRS product never has zero detections in a day, so this is missing data, and the website does not say so |
| All requests fail | previous snapshot, or recent mode off | Yes |

Persistence and deployment risks:

| Risk | Finding |
| --- | --- |
| New runner, next run | Fine. The previous snapshot is read from the site, not from a runner |
| Page rebuild, deploy retry | Fine. A retry pulls the same live snapshot again |
| API outage | Fine (reproduced) |
| Failed download of the previous snapshot | Pull reports "no previous snapshot". If the fetch also fails, the layer is off, as before Task 2. Not documented in the reliability report |
| Corrupted previous snapshot | Rejected (11 damage cases, pull test). But files are written before the check (D3) |
| Stale or incomplete deployment read by pull | A half-deployed or CDN-mixed set fails the checksums and is rejected (format 2). A wholly older cached set passes and could be republished on a fallback (D5) |
| Recursive loop | None. Nothing creates a release or pushes |
| Races | `concurrency: pages, cancel-in-progress: true`: a newer run cancels an older one, so two builds never publish at once. GitHub's own Pages example uses `cancel-in-progress: false` so a deployment is not cut off. A cancelled deploy leaves the earlier site live (seen on 10 Nov), so this is P3 |

## E. Numerical and source-data validation

Rows are rejected with their own reasons for: non-numeric values, non-finite latitude, longitude or FRP (NaN, Infinity, -Infinity), coordinates outside ±90 or ±180, negative FRP, bad or out-of-window dates, bad times, another satellite, unknown confidence, bad day/night. A reply missing a column fails as a whole. All checks run before rounding and integer encoding.

Edges re-tested in this audit (`ev/probes.json`): latitude -90 and +90 and longitude -180 and +180 kept and placed in tiles the site loads (S90W180, N80W180). FRP 0, 0.01 and 1e20 encode and validate. **FRP 1e308 crashes the fetch** (`OverflowError: cannot convert float infinity to integer` at `round(f * 10)` in `build`). The fallback then keeps the previous snapshot, so the site stays honest, but one absurd row blocks the refresh (D4).

Times: `acq_date` and `acq_time` are used as given (UTC, no conversion). FRP is kept in MW, stored ×10 as an integer and divided by 10 on the site.

Deduplication: the key is `(day, minute, latitude to 4 decimals, longitude to 4 decimals, confidence class, FRP to 0.1 MW, day/night)`, applied after rounding, within one product only. Requests do not overlap (FIRMS `DATE` plus `DAY_RANGE` pieces), so cross-request duplicates cannot arise from the requests themselves. Two satellites are never compared. A merge of two different detections needs all seven fields equal, which for 375 m pixels means the same pixel and pass. Real data, 10 Nov: 5 (NOAA-20) and 2 (NOAA-21) rows removed of 1,506,786, all-field identical. The documented policy matches the code.

Empty data:

| Case | Behaviour |
| --- | --- |
| Valid reply with zero rows | chunk OK, rows 0, day in `days_without_data` (status only) |
| Malformed reply (wrong columns) | chunk failed, snapshot incomplete, named in the UI |
| Empty body from an error (HTTP 4xx, 5xx, network) | chunk failed, as above. The error body is not kept for 4xx, so the reason is lost (P3) |
| Product outage answered with empty CSV files | treated as zero rows: **published as complete, no notice (D2)** |
| Failed request | as malformed |

No numbers from the recent layer reach the historical record: `fetch_firms.py` and `snapshot.py` import nothing from `pipeline/` (tested), and the site never adds them to record values (unchanged since D38).

## F. Temporal and freshness verification

| Term | Definition (all UTC) |
| --- | --- |
| Retrieval time | `status.fetched_utc`, when `fetch_firms.py` ran |
| Newest observation | `status.latest_detection_utc`, the newest detection in the snapshot |
| 24 h window | detections less than 1,440 minutes older than the newest one: (newest − 1440 min, newest] |
| 7 day window | the same with 10,080 minutes |
| Full window | from 00:00 on the first day (28 Oct) to the newest detection |
| Current time | the reader's clock, used only to judge "not current" |
| Fallback age | reader's clock minus the snapshot's own retrieval time |
| Staleness threshold | more than 6 hours since retrieval, or any fallback |

Edges tested in both Python (overview) and JavaScript (single points), same rule: age 0 and 1,439 in, 1,440 out (24 h), 10,079 in, 10,080 out (7 d), including 00:00, 23:59 and the date change (`test_24_hour_and_7_day_windows_end_at_the_newest_detection`, `recent.test.mjs`). The lower edge is exclusive and the upper edge (the newest detection) inclusive. The overview counts only nominal and high confidence outside SHIFT's non-fire cells, while the points show all detections. This difference is by design and is stated in the legend. It is not a time-rule difference.

Honest reporting, checked in the browser: an old retrieval is never shown as now (stored time printed), a fallback is never shown as a new refresh (fallback note), failed requests are named and "not no fire" is stated, and the deploy time is never used as the observation time (after the audit rebuild on 11 Nov the site still said "Retrieved … 2026-11-10 20:01:08 UTC").

Not honest in two cases: D1 and D2 (section J).

**Frontend cache (audit 6.3), reproduced (`ev/cache_mix.json`).** The server sent `Cache-Control: max-age=600`, the value GitHub Pages is reported to use [UNCERTAIN]. The page was loaded on snapshot A, the folder was replaced by snapshot B (a deploy), and the page was reloaded normally. `status.json` and `publication.json` are fetched with `cache: 'no-cache'` and came from B. `overview.json.gz` was not requested again and came from the browser cache (A). The screen then read "Retrieved from NASA FIRMS 2026-11-11 12:42:31 UTC. Detections from 2026-11-01 to 2026-11-10 20:00 UTC", mixing B's retrieval time and start date with A's newest detection and A's map, while the header badge (from B) said "Recent detections to 2026-11-06 07:15 UTC". Tiles are cached the same way. Within one open page the data never refreshes (module cache, status read once), so a reload is needed to see a new snapshot. That limitation is not documented.

## G. CI and security audit

Baseline check: `tests.yml` runs `python3 docs/preflight/verify_baseline.py` from the repository root as the first step after checkout, in all three jobs, on every push and pull request. A non-zero exit fails the job (`bash -e`). Seen in CI: "UNCHANGED: all 41 files match the baseline (829ce01)" on PR #4, #5 and #6. Negative control on a disposable copy, with one line added to the copy of `pipeline/shift/harmonise.py`: "CHANGED: 1 of 41 files differ … pipeline/shift/harmonise.py: baseline f06dbf00e4b9 now 49da1a627030", exit 1. The real file was untouched (UNCHANGED again afterwards). Nothing updates the manifest automatically.

Permissions:

| Workflow | Permissions | Secrets | Triggers | Finding |
| --- | --- | --- | --- | --- |
| `tests.yml` | `contents: read` | none | push, pull_request | good |
| `web-check.yml` | `contents: read` | none | pull_request, push to branches | good |
| `pages.yml` | `contents: read`, `pages: write`, `id-token: write` for the whole workflow | FIRMS key, fetch step only | push to main, release, manual, schedule. No pull_request | D6: the build job does not need `pages: write` or `id-token: write` |
| `recent-firms.yml` | `contents: write` | FIRMS key | push to `feature/recent-firms`, manual | D7: no longer needed |

Credentials: the key is passed only to the fetch step, never to `pull`, `publish` or `check` (tested: `snapshot.py` does not mention it). The fetch never logs the URL and masks the key in reply snippets. With a dummy key the audit found it in no published file, no step summary and no line of the full fetch output. CI logs show only `***`. No key is in any `VITE_` variable or web file.

Downloaded content: the previous snapshot is checked fully before use, but its tile names are used as file paths before the check (D3). Nothing is extracted from an archive.

Schedule (GitHub API, 11 Nov, 12:40 UTC):

| Condition | Evidence |
| --- | --- |
| Schedule configured | `cron: "17 */3 * * *"` on `main` |
| Workflow enabled | state `active` |
| Scheduled events delivered | 2 since the layer went live (20:49 UTC, 10 Nov), for 6 slots (21:17, 00:17, 03:17, 06:17, 09:17, 12:17). Run #10 (42937721475) created 01:16 UTC on 44e2d21. Run #13 (43008857941) created 11:04 UTC on 3cb148b |
| Job started | both: build and deploy success |
| Acquisition succeeded | #10: 1,524,005 detections, complete. #13: 1,555,529, complete |
| Candidate validated | #13: "OK … complete true, rows 1555529" (#10 ran before Task 2, no check step) |
| Deployed and published | #13: "previous snapshot copied (242 files)", "attempt A (complete); serving new, fetched 2026-11-11T11:04:33Z", deploy success |

Observation: run #13, 20 minutes after run #12, had 48 fewer detections (1,555,529 against 1,555,577). FIRMS near-real-time data can be revised between fetches. This is not a snapshot problem, but it means counts can go down between refreshes.

## H. Test evidence (this audit, 11 Nov, Python 3.13.18, Node 22.23.4, pytest 9.1.1, Playwright 1.63.0)

| Command | Exit | Result | File |
| --- | --- | --- | --- |
| `python docs/preflight/verify_baseline.py` | 0 | UNCHANGED, 41 files | `T25_verify_baseline.txt` |
| `python -m pytest -q recent` | 0 | 48 passed | `pytest_recent.txt` |
| `python -m pytest -q docs/preflight` | 0 | 3 passed | `pytest_baseline_check.txt` |
| `python -m pytest -q validation` | 0 | 5 passed | `pytest_validation.txt` |
| `cd pipeline && python -m pytest -q` | 0 | 63 passed, 1 skipped | `pytest_pipeline.txt` |
| `cd web && npm test` | 0 | 29 passed, 3 skipped (need data), 0 failed | `npm_test_no_data.txt` |
| `SHIFT_DATA_DIR=… npm test` | 0 | 32 passed | `npm_test_with_data.txt` |
| `npm run build` | 0 | built | `npm_build.txt` |
| `recent_check.py` | 0 | 0 errors, record untouched, popups text only | `recent_check.json` |
| `globe_check.py` | 0 | 2D and 3D identical (404 common cells, 0 mismatches) | `globe_check.json` |
| `recent_states_check.py` | 0 | fresh, old, fallback, incomplete, unavailable as specified. Record in all. Two expected 404s in "unavailable" | `recent_states_check.json` |
| `downloads_check.py` | 0 | 12 of 12 downloads correct | `downloads_check.json` |
| `claims_check.py` | 0 | Task 1 qualifier visible, no bare "95% range" | `claims_check.json` |
| acceptance scenario (real snapshot, YAML steps, browser 2D and 3D) | 0 | as section D | `acceptance_real.json`, screenshots |
| acceptance scenario (format 2) | 0 | byte-identical fallback | `acceptance_format2.json` |
| historical comparison, pre-Task-2 build 43286b0 against main | 0 | story, chart text and calendar pixels identical for 3 areas. Only difference: the calendar's removed SVG button (PR #6) | `history_compare.json` |
| probes and cache scenario | 0 | D1 to D4 reproduced | `probes.json`, `cache_mix.json` |

Failure matrix (audit prompt section 8):

| ID | Scenario | Test (file) | Result |
| --- | --- | --- | --- |
| T01 | Complete acquisition | `test_A_complete_fetch_is_published_as_new` (S), acceptance Run A | PASS |
| T02 | NaN latitude | `test_nonfinite_and_invalid_values_…` (F) | PASS |
| T03 | Infinity longitude | same (`-Infinity`), probe `bounds` | PASS |
| T04 | NaN FRP | same, `test_one_bad_row_does_not_stop_a_good_reply` (F) | PASS |
| T05 | Negative FRP | same | PASS |
| T06 | Invalid date | same | PASS |
| T07 | Invalid time | same, probe `times` (2400, 0060) | PASS |
| T08 | Invalid satellite | same | PASS |
| T09 | Invalid confidence | same | PASS |
| T10 | Missing column | `test_missing_column_fails_the_whole_reply` (F), probe `schema_bad_n20` | PASS |
| T11 | Duplicates | `test_duplicate_policy_…` (F), real data counts | PASS |
| T12 | Zero detections, valid reply | `test_empty_valid_reply_is_not_a_failure` (F), probe `n21_empty` | **PARTIAL**: told apart from a failure in `status.json`, but a product-wide empty answer is published as complete with no notice (D2) |
| T13 | One satellite fails | `test_B_a_whole_product_missing_is_identified` (S), probe `n20_fail` | PASS |
| T14 | One request fails | `test_B_partial_…` (S), `test_a_failed_chunk_…` (F) | PASS |
| T15 | Complete outage | `test_C_total_outage_…` (S), acceptance (real network failure) | PASS |
| T16 | No previous snapshot | `test_C_…_without_…` (S), states "unavailable" | PASS |
| T17 | Corrupt previous snapshot | 11 damage cases, `test_corrupt_previous_…`, `test_pull_rejects_…` (S) | PASS |
| T18 | Fallback to previous complete | acceptance | PASS |
| T19 | Original timestamps kept | acceptance (`status.json` SHA-256 identical) | PASS |
| T20 | Stale UI shown | states "old" and "fallback", acceptance browser | PASS |
| T21 | 24 h edge | F and W edge tests | PASS |
| T22 | 7 day edge | same | PASS |
| T23 | Overview and points agree in time | same rule, both tested | PASS |
| T24 | Record with no recent data | states "unavailable" | PASS |
| T25 | Fingerprints unchanged | `verify_baseline` | PASS |
| T26 | CI rejects a changed protected file | negative control, `test_verify_baseline.py` in CI | PASS |
| T27 | No credentials in published files | dummy-key run, CI logs | PASS |
| T28 | Refreshes never mix generations | `test_repeated_refreshes_…` (S) for published files | **PARTIAL**: published files never mixed, but the browser combines generations after a deploy (D1) |
| T29 | Delayed or cancelled refresh cannot replace newer with older | code inspection | **PARTIAL**: not reproducible here. `pull` has no cache bypass (D5). Builds cannot overlap |
| T30 | Rebuild does not confuse deploy time with observation time | acceptance (retrieved line unchanged after rebuild) | PASS |

S = `recent/test_snapshot.py`, F = `recent/test_fetch_firms.py`, W = `web/tests/recent.test.mjs`.

## I. Scientific integrity

`verify_baseline.py`: UNCHANGED, all 41 files (code, settings and 7 engine files). No file under `pipeline/` or `config/` changed between 43286b0 and HEAD. The published `site-data` release was only read. Historical values on Explore are identical to the pre-Task-2 build for Bangladesh, Southeast Australia and Africa savanna (story text, chart labels, calendar pixels). The confidence policy and the non-fire mask of the recent layer are unchanged.

## J. Defects and unverified claims

Claims in earlier messages and in `RECENT_FIRMS_RELIABILITY_REPORT.md` that the evidence does not support:

1. Report section 4, "Old and new files are never mixed": true for the files published on the site. Not true for what a visitor can see after a deploy (D1). The report never looked at browser caching, which the audit prompt asks about (6.3).
2. Report section 5, "One bad row never stops a good reply": false for a huge finite FRP (D4).
3. Report section 10, row "Empty valid response … Distinguished from API failure: PASS": distinguished only inside `status.json`. A product-wide empty answer reaches the site as complete with no notice (D2). The row should have been PARTIAL.
4. Report section 4, pull "keeps it only if it passes check": true, but files are written to disk before the check (D3).
5. Report section 4, "Rules that always hold … a fallback keeps the original publication metadata" is not claimed, but the Task 2 requirement asked for it and only the acquisition metadata is kept (R06).
6. Report section 12 does not mention that a failed copy of the previous snapshot plus a failed fetch still turns the layer off.
7. Claude's chat message of 11 Nov 17:14 listed WP3 as "Done in full". The browser cache part of the freshness question was never examined.
8. The pre-merge workflow simulation ran with no key, not a real API failure. Now verified with a real failed network request (this audit).

## K. Completion statistics

Requirement matrix (section C), 48 requirements:

| Status | Count |
| --- | --- |
| PASS — REPRODUCED | 30 (two of them for published files only, the browser side is R44) |
| PASS — DIRECTLY VERIFIED | 10 |
| PARTIAL | 4 (R06, R21, R30, R35) |
| FAIL | 3 (R44, R45, R46) |
| NOT EXECUTED | 0 |
| BLOCKED | 0 |
| NOT VERIFIABLE | 1 (R47) |

Verified completion = PASS / applicable = 40 / 48 = 83%. All 48 are applicable. NOT VERIFIABLE counts as not passed.

Failure matrix: 27 PASS, 3 PARTIAL, 0 FAIL, 0 NOT EXECUTED.

## L. Prioritized corrections

| ID | Priority | Root cause | File and function | Smallest correction | Regression test | Evidence to close |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | P1 | Data files are fetched with the browser's default cache, status with `no-cache`. Pages is reported to allow 10 minutes of caching [UNCERTAIN] | `web/src/lib/recent.js`, `gzJson`, `recentOverview`, `recentPoints` | Add the snapshot identity to every data URL, for example `?v=` + `encodeURIComponent(status.fetched_utc)`, and key the module cache by it. Status stays `no-cache` | `cache_mix.py` scenario: after the swap, `overview.json.gz?v=…` must be requested again and the map bar must show one snapshot's times. Unit test that URLs carry the version | browser run of the scenario passing |
| D2 | P1 | `days_without_data` is computed but never used. A whole product with zero rows is "complete" | `recent/snapshot.py` `attempt_result`, `web/src/lib/recent.js` `recentFreshness`, `text.js` | Treat a product with no rows on a day inside the window as missing coverage: name it in the incomplete notice ("no detections received from NOAA-21 on …, missing data, not no fire"), and treat a product with zero rows for the whole window as case B | fixture with NOAA-21 empty: publish state not "new", notice shown in the browser | tests and a browser state |
| D3 | P2 | Names from the downloaded `status.json` become paths before validation | `recent/snapshot.py`, `pull` | Before downloading, require status format 1 or 2 and every tile name to pass `tile_bounds`, and check each target path stays inside the download folder | hostile `status.json` with `../` names: nothing written outside | test passing |
| D4 | P2 | `round(f * 10)` overflows for FRP above about 1.8e307 | `recent/fetch_firms.py`, `parse_rows` | Reject FRP above a plausible ceiling (for example 100,000 MW) with the reason "frp implausibly large" | row with FRP 1e308 rejected, batch kept | test passing |
| D5 | P2 | `pull` requests can be answered from the CDN cache | `recent/snapshot.py`, `_get` / `pull` | Add a cache-busting query (the run id) and `Cache-Control: no-cache` to each request | unit test of the URLs | test, then one Website run log |
| D6 | P2 | Permissions declared for the whole workflow | `.github/workflows/pages.yml` | Workflow `contents: read`. Add `pages: write` and `id-token: write` only to the `deploy` job | YAML review, one green deploy | Website run green |
| D7 | P2 | Test workflow from D38 never removed | `.github/workflows/recent-firms.yml` | Delete it, the branch `feature/recent-firms` and the draft release `recent-firms-preview` (after judging) | none | workflow list |
| D8 | P3 | Various | `snapshot.py`, `fetch_firms.py`, `pages.yml` | Keep the earlier publication record inside a fallback's `publication.json` (R06). Drop format 1 support. Keep the first 80 characters of 4xx error bodies (masked). Consider `cancel-in-progress: false` for Pages. Document that a reload is needed to see a new snapshot and that the layer turns off if both the copy and the fetch fail | as each | as each |

Practical risk until the fixes: during the judging freeze no deploys happen, so D1 cannot occur. D2 occurs only if FIRMS answers a product with empty files. D3 needs write access to the live site. D4 needs an FRP no satellite can produce.

## M. Rollback assessment

Task 2 touched only the recent layer, its workflow steps, tests and docs. Reverting it changes no historical file or number. Fast rollback: Actions > Website > Disable workflow (the live site keeps its last deploy). Full rollback: `git revert -m 1 3cb148b` on a branch. That revert conflicts in one file, `docs/preflight/RECENT_FIRMS_RELIABILITY_REPORT.md`, which PR #5 edited later. The conflict is documentation only. Old website code reads the new `status.json` (format 2 only adds `files`) and ignores `publication.json`, so a mixed old/new state during rollback is harmless.

## N. Final GO/NO-GO decision

**CONDITIONAL PASS.** The primary implementation is correct and the acceptance scenario passes through the real production path. No P0 issue exists. Two P1 defects (D1 browser cache mixing, D2 product-wide empty answer shown as complete) must be fixed before final submission, and five P2 items are recommended. Task 2 is not a full PASS because R44, R45 and R46 fail and R47 cannot be verified here.
