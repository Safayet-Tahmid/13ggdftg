# Recent FIRMS layer: preflight baseline

Audit date: 11 November 2026 (Asia/Dhaka), 10 November 2026 18:59 UTC. Team Squadron Zero.
Machine-readable copy: `baseline_manifest.json`. Re-check at any time with `python docs/preflight/verify_baseline.py`.

Status labels used below: COMPLETED AND VERIFIED, COMPLETED BUT NOT FULLY VERIFIED, BLOCKED, NOT STARTED, RECOMMENDED FOR NEXT PHASE.

## 1. Repository state (COMPLETED AND VERIFIED)

| Item | Value |
| --- | --- |
| Repository | https://github.com/squadronzero/squadron-zero (remote `origin`) |
| Baseline commit | `829ce0171b61c62c0509775bab7458057061122b`, "Merge pull request #1 from squadronzero/feature/globe-3d", 10 Nov 2026 12:24 (+06:00) |
| Remote `main` | Same commit. The commit named in the brief is the current `main` |
| Working tree at start | Clean. Nothing was stashed, reset or discarded |
| Branch created | `feature/recent-firms`, from `origin/main` at `829ce01`, upstream unset so nothing is pushed by accident |
| Pushed to GitHub | No. Waiting for Squadron Zero's authorisation |
| Other branches | `feature/globe-3d` (merged as PR #1, still on GitHub) |
| Tools | Python 3.13.18, Node 22.23.4, npm 10.9.9. CI uses Node 20 |
| Local Python packages | numpy 2.5.3, pandas 3.0.5, pyarrow 26.0.1, PyYAML 6.0.3, shapely 2.2.0, pytest 9.1.1. h5py not installed |
| Web packages | maplibre-gl 5.24.0, react 18.3.1, vite 5.4.11 |

## 2. Architecture and what a recent layer would touch

Historical path (must stay unchanged):

    FIRMS archive files (Drive, Colab) -> pipeline/shift (ingest, aggregate 0.05 deg, factors, resolution,
    harmonise, nodata, checks) -> export -> release `site-data` (site_data.zip, 745 files)
    -> .github/workflows/pages.yml unzips into web/public/data -> React site (web/src/lib reads it)

| Component | Affected by a recent layer? |
| --- | --- |
| `pipeline/shift/*`, `config/settings.yaml` | No. The recent layer must not import, call or edit them |
| Release `site-data` and its 745 files | No. Read only |
| `web/src/lib/data.js`, `analysis.js`, `area.js` | No change to existing functions. A separate loader for the recent file is acceptable |
| `web/src/components/MapView.jsx`, `pages/Explore.jsx`, `content/text.js`, `lib/geo.js` | Yes: a new map source and layer, a mode switch, wording, a freshness label |
| `.github/workflows/pages.yml` | Yes, if the recent file is built in at deploy time (recommended, see `FIRMS_API_READINESS.md`) |
| New acquisition script | Yes, new folder outside `pipeline/shift` (proposed `recent/`) |

Existing assets the recent layer can reuse without touching the science: `notfire.json` (persistent non-fire heat cells, to label recent detections that sit on gas flares or volcanoes) and the per-area normal season from `analysis.js` (for qualitative "in or out of the usual season" context).

## 3. Source and settings integrity (COMPLETED AND VERIFIED)

SHA-256 of 42 files (settings, requirements, every `pipeline/shift/*.py`, every `web/src/lib/*.js`) is in `baseline_manifest.json`. Key files:

| File | SHA-256 |
| --- | --- |
| `config/settings.yaml` | `1145c3610f07264099f49bdeca47c1369f696f785c3b51da30236426b19b48bb` |
| `pipeline/shift/factors.py` | `23b2181edab2a3e037656416be4034137fd039b1ae695848ecef8d29366fd1a3` |
| `pipeline/shift/resolution.py` | `b08ec03f6f1856f2ae6972d70b08ff2f814fdc95f6e6e06affbbec068d47c3c4` |
| `pipeline/shift/harmonise.py` | `f06dbf00e4b9135e57c0a5bc49bed651df3a3e14c0ab03faefc90644c099dba8` |
| `pipeline/shift/checks.py` | `64b8083e13a4fb7f691e2f0216d22152cc77f50b2fdd58c459871fb175488749` |
| `pipeline/shift/export.py` | `58cc748aedc7ce732b1ab9ecdc9939d0aedaded430f66a71e169045ad5085f25` |
| `pipeline/shift/aggregate.py` | `d1e2adcb9bca4ef41f034f0e772a80f046ff157a588dc713b0f30c4a36cbbbe2` |
| `pipeline/shift/grid.py` | `d4c195277f6494ba243585a6b5ec146119e488c5992c93e80bb08cb1cc2cfb1e` |

Two different settings hashes exist and both are correct. The file hash above covers the bytes of `settings.yaml`. The pipeline's own provenance hash covers the parsed settings (`provenance.settings_hash`, a sorted YAML dump). Recomputed today for the `global` dataset it is `ab498fb5…3bb`, which equals the value stored in the published data. No file under `config/` or `pipeline/shift/` changed between the data commit `0f95990` and `829ce01`.

## 4. Published data (COMPLETED AND VERIFIED)

| Item | Value |
| --- | --- |
| Release | tag `site-data`, title "SHIFT site data 15 Oct", first published 15 Oct 2026 |
| Asset | `site_data.zip`, 134,983,567 bytes, asset updated 7 Nov 2026 20:30 UTC |
| GitHub digest | `sha256:599a3bf4434e172325ba6bf1a0392f747e59d992c8c21a5f9d1bea2fc55b88ce` |
| SHA-256 computed locally | identical (asset downloaded and hashed) |
| Contents | 745 files. Record 2002-01-01 to 2026-10-29, last full data day 2026-10-28, 0.25 deg map grid |
| Provenance in `meta.json` | export run 7 Nov 2026 17:15 UTC, git commit `0f95990`, settings hash `ab498fb5…`, `code_or_settings_changed_since_commit: false` |

Finding: the release title still says "15 Oct" although the file was replaced on 7 Nov. This is a label only. Renaming it is optional and is not done here because editing a release triggers the website workflow.

## 5. Scientific baseline numbers

| Quantity | Value | Class |
| --- | --- | --- |
| 2012 gate (MODIS x k against S-NPP at the switch) | PASS, +0.8% cells, -0.2% fire power | Reported in existing artifacts (`report_checks.json`, gate true). Independently recomputed in the 8 Nov audit (`validation/audit_site_data.py`, A3) |
| Calibrated 95% month ranges | coverage 94.9% (cells), 93.9% (fire power) | Reported in existing artifacts (`report_checks.json` coverage). Not recomputed today |
| Geographic resolution | 2.5 deg factors pulled to the 10 deg parent (D28) | Reported (`report_resolution.json`). Code hash recorded |
| Sensor selection | MODIS Terra+Aqua to 2019, Aqua from 2020 (D19), reference S-NPP | Reported (`report_selection.json`). Covered by pipeline tests |
| Iberia flag | 11.8% step gap, flagged | Reported (`report_checks.json` summary) |
| Known events | 87.5% hit rate against a 16.5% base rate | Reported. The audit notes this test does not discriminate strongly |
| 2026 sensor test | NOAA-20 x k PASS, Aqua x k FAIL on fire power | Reported |
| Missing-data rule | zone-day status primary, filled or no data, never zero | Verified by automated tests (pipeline tests, web `zone-day status` test) |
| Map values equal the daily files behind the charts | equal within display rounding, 5 place-months | Verified by automated test with the released data (`web/tests/map.test.mjs`) |
| Published file integrity | exact | Independently recomputed (8 Nov audit A1, and the digest check above) |

Report consistency is not independent scientific reproduction. Only the rows marked "independently recomputed" were re-derived from the published files rather than read from the pipeline's own reports.

## 6. Test baseline at `829ce01`

| Component | Result | Evidence | Remaining gap |
| --- | --- | --- | --- |
| Pipeline tests | 63 passed, 1 skipped, 0 failed, exit 0, 179 s | `cd pipeline && python -m pytest -q -p no:cacheprovider`, run locally 11 Nov | Skip: `test_phase2_package.py:267` needs h5py (runs on Colab). Tests use small fixtures, not the full FIRMS archive |
| Validation tests | 5 passed, exit 0, 2 s | `python -m pytest -q validation` | Checks the audit script on fixtures. The full audit needs the released data |
| Web unit tests | 10 passed, 3 skipped without data. 13 passed with `SHIFT_DATA_DIR` set to the released data | `npm test` | The 3 data tests do not run in CI (no data there) |
| Production build | exit 0, built in 8 s | `npm ci && npm run build` | A build is not proof the page works in a browser |
| Browser checks | Not rerun today. Passed on 10 Nov on `7646107`, whose `web/` tree is identical to `829ce01` | `web/tests/browser/*.py` | Not in CI (they need the 135 MB data release) |
| CI `tests` at `829ce01` | success, run 42768301685. Three jobs (oldest allowed, newest allowed, Colab exact), each 63 passed 1 skipped and validation 5 passed | GitHub Actions log | Same h5py skip |
| CI `Website` at `829ce01` | success, run 42768301639, build and deploy | GitHub Actions | The site is live from this commit |

No failures. Nothing was changed to make a test pass.

`npm audit` (pre-existing, not fixed in this phase):
- critical: maplibre-gl up to 6.4.0, GHSA-jrc7-96c5-q579, a bypass of the library's HTML sanitiser in popups. The live site only puts numbers it computed itself into popups, so it is not exposed today. Any FIRMS-derived text must never go into `setHTML`. The fix is a major upgrade (6.x) and should be its own tested change after the event.
- high and moderate: vite and esbuild dev-server issues (affect `npm run dev` on a developer machine, not the published site), fflate 0.8.2 (used only by `npm run get-data`). Patch versions exist (vite 5.4.21, fflate 0.8.3).

## 7. Scientific invariants for every later phase

1. Factor files and factor code (`factors.py`, `resolution.py`, `calibrate.py`) keep their baseline hashes.
2. The 0.05 deg aggregation (`aggregate.py`, `grid.py`) keeps its baseline hash.
3. Sensor selection (`selection.py`, `harmonise.py`, D19, D29) keeps its baseline hash.
4. `config/settings.yaml` keeps file hash `1145c361…` and pipeline hash `ab498fb5…`.
5. The release `site-data` keeps digest `599a3bf4…`. The recent layer never uploads to it.
6. Every number on the existing Explore, 2012 switch, Validation and Method pages is unchanged (browser check comparison before and after).
7. Missing-data classes (primary, filled, no data) are unchanged.
8. Recent detections are never written into the historical record, its exports or its charts.
9. Recent and historical layers carry separate source and provenance labels in data and on screen.
10. When a fetch failed or coverage is incomplete, an area without recent detections is shown as "unknown", never as zero.
11. Recent VIIRS detection counts are never placed on the historical "hotspots" scale (0.05 deg cell-days) without a documented aggregation step, and never given a numerical anomaly score in this event.

How to check 1 to 5: `python docs/preflight/verify_baseline.py --zip <downloaded site_data.zip>` must print UNCHANGED. Matching hashes show the audited code did not change. They do not by themselves show the science is right.

## 8. Blockers and open items

| Item | Status |
| --- | --- |
| FIRMS MAP_KEY | DONE 11 Nov: key held in Colab Secrets (squadronzero10) |
| GitHub secret `NASA_FIRMS_MAP_KEY` | Added by Squadron Zero 11 Nov 01:41 (reported). Claude cannot list secrets. It is proven when the first scheduled fetch succeeds |
| Authenticated FIRMS test request | PASSED 11 Nov for NOAA-20 and NOAA-21 (run on Colab by Squadron Zero, see `FIRMS_API_READINESS.md` section 5) |
| Decision D34 ("no NRT for the event") | Open. The recent layer reverses D34. Squadron Zero decides (proposed D38) |
| Eligibility | NEEDS ORGANIZER CONFIRMATION (see `SPACE_APPS_ELIGIBILITY_NOTES.md`) |
| Branch on GitHub | Not pushed. Needs authorisation |
