# Scientific claims correction, 11 November 2026

Team Squadron Zero · prepared by Claude, reviewed by the team before merge · branch `fix/scientific-validation-claims` from `main` 44e2d21.

This is a wording and documentation correction. No computation, setting, factor, dataset or report value changed (`python docs/preflight/verify_baseline.py`: UNCHANGED). No new experiment was run. Every number quoted here comes from the published reports in `site_data.zip` (`data/validation/`).

## 1. The uncertainty-coverage issue, traced in the code

What is reported: `report_checks.json` `coverage.cells`: `calibrated_coverage_pct` 94.9 (hotspots) and 93.9 (fire power), over 73,193 and 73,191 cell-months of the 1,743 tested 2.5° cells (`tested_cells`), verify years 2012-2015, calibrate years 2016-2019, `accepted: true`. Fire-weighted figures: 93.6 and 93.6.

Where it is computed: `pipeline/shift/checks.py`, `coverage_check()` (lines 258-358), called at line 872. The merged MODIS piece's production years are 2012-2019 (`prod`, line 262, no version-test restriction because `model.fit_years` is empty). `cal_years` = 2016-2019 and `ver_years` = 2012-2015 (lines 263-264, from `phase2_checks.coverage` in `config/settings.yaml` lines 435-439). `ver_fit` = production years without the verify years = 2016-2019 (line 265).

| Step | Code | Data it uses | Uses 2012-2015? |
| --- | --- | --- | --- |
| Verification point predictions | lines 284-285: `wv = fit_weights(..., {g: ver_fit})`, `ver = preds(..., ver_years, k_model(... wv ...))` | factors fitted on 2016-2019 only | No |
| Factor-uncertainty part of the band | lines 286-290: `bootstrap(..., {g: ver_fit})` | 2016-2019 | No |
| Calibration residuals (band widths) | lines 280-281: for each of 2016-2019, `fit_weights(..., {g: prod}, drop=y)` | factors fitted on 2012-2019 without that one year | **Yes** |
| 95th percentile per group | lines 300-305 (weighted 95th percentile) | the residuals above | **Yes**, through them |
| Group "level" (how much own data a factor had) | lines 276-278: `c.fit(g, ref, wprod, ...)`, `level = c.last_level` | production fit, 2012-2019 | **Yes** |
| Group "fire bin" (predicted fire amount) | line 279 `kc = k_model(... prod ...)`, line 293 `pred_cells` | production factors, 2012-2019 | **Yes** |
| Model and settings | `resolution_choice.json` (variant `fine_shrunk`), chosen partly on global backward error predicting 2012-2015 (`report_resolution.json` `why`) | 2012-2015 performance | **Yes** (model selection) |
| Acceptance band 90-99 % | `settings.yaml` line 439, fixed 15 Oct before the first run | none | No |
| Published table | lines 338-355: groups by each cell's typical 2003-2011 month and the production uncertainty `hw95_log` | production fit | not the same construction as the verified bands |

By type:

- **A. Point predictions:** clean. The verification predictions use factors fitted without 2012-2015.
- **B. Interval-width calibration:** leakage. The residuals that set the widths come from leave-one-year-out fits on 2012-2019, so 2012-2015 S-NPP data shaped every calibration fit.
- **C. Group or bin assignment:** leakage. The level and the fire bin of each verification cell-month come from the production fit, which includes the verification years' S-NPP data.
- **D. Model selection:** mild leakage. The resolution variant was chosen with a rule that included backward error on 2012-2015. The recalibration step itself was added after the raw bootstrap was found to cover only 40-47 % (adaptive development, `SCIENTIFIC_LIMITATIONS.md` section 12).
- **E. Reporting:** the acceptance band was fixed before the run (no leakage). But the coverage measures bands built per verification month with the 2016-2019 bootstrap, while the published ranges use a cell's typical MODIS-era month and the production uncertainty. The reported coverage describes a closely related band, not exactly the published one. It is measured only on the 1,743 tested cells (at least 10 S-NPP hotspots a month on average), so sparse places are outside it, and only in VIIRS-era years, so it says nothing directly about pre-2012 drift.

The direction and size of the effect are not established. Leakage of type B and C usually makes a coverage figure optimistic, but here it could also widen bands, and no clean experiment has been run.

What the 94.9 % and 93.9 % do measure: the share of 2012-2015 tested-cell months whose real S-NPP value fell inside a calibrated band built around a prediction from factors fitted on 2016-2019, where the band widths and groups were set with the help of fits that included 2012-2015.

What cannot be concluded: that SHIFT's published pre-2012 ranges contain the true VIIRS-equivalent value 95 % of the time, for any place or month.

## 2. Claims reviewed

Status values: Supported · Supported with qualification · Overstated · Unsupported · Not independently verified.

| Claim | Location | Previous interpretation | Evidence | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| "Every choice was tested on years the model never saw, under a rule written before the run." | `web/src/pages/Validation.jsx` heading | all tests fully held out | coverage (B, C), simple methods (D), gate (fit years include 2013-2015) reuse years | Heading "How SHIFT was tested, and what each test can and cannot show", lede explains differing independence and that no test reaches before 2012 | Overstated, corrected |
| "of held-out months fall inside the calibrated 95% range" | `Validation.jsx` facts | independently verified 95 % coverage | section 1 | "of 2012 to 2015 cell-months fall inside the calibrated 95% range … on the N tested 2.5° cells" plus a visible qualifier beside the number | Not independently verified, qualified in place |
| "gap between SHIFT's 2012 step and the real change (MODIS alone)" | `Validation.jsx` facts | MODIS alone is the true change | MODIS alone is a single-sensor reference, not ground truth. Factors fitted on 2012-2019 include the 2013-2015 window (`docs/audit/VALIDATION_REPORT.md` 3.4 item 1) | "the step MODIS alone shows over the same years (one sensor, so no switch)", plus: continuity at the switch, not proof the factors are right before 2012 | Supported with qualification |
| "the real change, seen by MODIS alone" | `web/src/pages/Switch2012.jsx` | same | same | "the change MODIS alone shows … the reference SHIFT aims to match, not a ground truth" | Supported with qualification |
| SHIFT's score against the best simple method | `Validation.jsx` facts and table caption | independent comparison | the variant and settings were chosen on similar held-out tests | added: lead may be a little optimistic. Caption fixed: the tests predict S-NPP in overlap years, not "MODIS-era months" | Supported with qualification (caption wording was inaccurate) |
| "No jump at 2012, region by region" | `Validation.jsx` heading | no regional jump | Iberia +9 to +12 %, Florida and Siberia near -9 % (`Method.jsx`, audit 3.2) | "The 2012 step, region by region" | Overstated, corrected |
| "of truly unusual months … that the MODIS years also flag" | `Validation.jsx` facts | MODIS-era flags | `anomaly_check` (`checks.py` 118): leave-one-year-out MODIS-based predictions of 2012-2019 against S-NPP | "months S-NPP marks as unusual … that the MODIS-based prediction also marks (each year 2012 to 2019 predicted with that year left out)" | Supported, wording made precise |
| Known fire disasters flagged | `Validation.jsx` facts | discriminating test | 8 events. MODIS alone and the raw joined record have the same or higher hit rate (`known_events.summary`) | added: a small test, the alternatives flag them about as often | Supported with qualification |
| Untouched 2026 test | `Validation.jsx` | supports the whole record | tests NOAA-20 and Aqua links after fitting | added: it does not test the pre-2012 MODIS factors | Supported with qualification |
| GFED4 agreement | `Validation.jsx` | independent check | GFED4 is derived from MODIS (`VALIDATION_REPORT.md` section 4) | added: consistency check, not independent ground truth | Supported with qualification |
| "NASA stopped delivering Suomi NPP data on 1 November 2026" | `Validation.jsx` | | NASA FIRMS FAQ: new FIRMS production ceased 13:00 UTC 2 Nov 2026 | "NASA FIRMS stopped producing new Suomi NPP data at 13:00 UTC on 2 November 2026" | Inaccurate date for FIRMS, corrected. (The Method page's "delivery ends 1 November" matches NASA's Earthdata notice about S-NPP data products in general and is left as it is.) |
| "Before 2012 values carry the calibrated 95% range of their factor" | `web/src/pages/Method.jsx` | the range bounds the true value 95 % of the time | the range covers conversion error only (`SCIENTIFIC_LIMITATIONS.md` 9) and its coverage is not independently verified | rewritten: what it covers, what it leaves out, check not fully independent, a guide not a guaranteed bound | Overstated, corrected |
| Coverage "calibrated on 2016-2019, verified on 2012-2015" | `docs/audit/VALIDATION_REPORT.md` 2.5 and summary | independent verification | section 1 | dated erratum E1, inline markers. Original text kept | Not independently verified |
| "Calibrated 95% ranges verified at 94-95%" and "Calibrated 2016-2019, verified 2012-2015" | `docs/audit/SCIENTIFIC_METHODOLOGY.md` | | section 1 | erratum E1, inline markers | Not independently verified |
| "This was verified on 2012-2015 … an empirical, calibrated interval" | `docs/audit/HARMONIZATION_EQUATIONS.md` 5 | | section 1 | erratum E1, inline marker | Not independently verified |
| "its error bands held the truth 95% of the time", "We tested it on years the model never saw" | `docs/audit/NASA_JUDGING_EXPLANATION.md` (pitch guide) | | section 1 | wording replaced (this file is used for Video 2), erratum note | Overstated, corrected |
| Coverage listed as "reported" | `docs/preflight/RECENT_FIRMS_BASELINE.md` 5 | | section 1 | row now says not independently verified | Corrected |
| Area ranges: "the website uses the fully correlated form" | `VALIDATION_REPORT.md` 2.5 | | `web/src/lib/analysis.js` `areaRange`: fire-weighted mean of cell percentages, equivalent to full correlation. The report's `areas.rule` field says "independent" (the pipeline's suggestion, not what the site uses) | none needed | Supported |
| Calibrated range label in charts and the cell panel ("Calibrated 95% range of the factor") | `web/src/content/text.js` | | a label, explained on the Method page | none | Supported with qualification (via Method page) |

## 3. Proposed experiment for an independent coverage estimate (not run)

**Hypothesis.** The calibrated bands, built without any use of the verification years, contain the real S-NPP value in 90-99 % of verification cell-months.

**Data.** The existing cubes (`counts/fine_monthly.parquet`, L2 cell-days on the team's Drive). No new download.

**Split.** Two-way, then repeated:

- Run 1: model selection, factor fit, calibration residuals, level and fire-bin assignment all on 2016-2019 only. Calibration residuals by leave-one-year-out *within* 2016-2019 (each year predicted from the other three). Verification on 2012-2015 with factors from 2016-2019.
- Run 2 (mirror): everything on 2012-2015, verification on 2016-2019.
- Report both. The fixed variant (`fine_shrunk`, p = 30 cells / 300 MW) is used as-is and declared as pre-selected, because re-running the variant choice inside each split would be a second experiment.

**Leakage controls.** One function builds every fit from an explicit year list, asserted to be disjoint from the verification years. The level and fire bin of a verification cell-month come from the calibration-split fit and from MODIS only (no S-NPP of the verification years). The acceptance band and bins are written to `settings.yaml` and committed before the run. Results are stored once (`allow_rerun: false`, as for the 2026 test).

**Comparison.** The same bands as published (current method). The raw bootstrap band. A naive band (global 95th percentile of the calibration residuals).

**Metrics.** Coverage, unweighted and fire-weighted. Median band width (percent). Interval score (Winkler score) per variable. All by fire bin (under 30, 30-300, over 300), by level, by the ten test regions, and by verification year.

**Failure criteria.** Coverage outside 90-99 % in either run for either variable. Or any fire bin below 85 %. Or a region below 80 % with at least 48 cell-months.

**Impact on public claims.** If it passes, the Validation page can say "independently verified on held-out years". If it fails, the bands are widened by the measured shortfall per bin (a rule fixed before the run), and the page says so. Either way, it still says nothing about drift before 2012 (`SCIENTIFIC_IMPROVEMENT_PLAN.md` item 1).

**Effort.** About half a day of code and tests, plus one Colab run. After the event.

## 4. Other issues found, not fixed here

- `docs/audit/NASA_JUDGING_EXPLANATION.md` and `SCIENTIFIC_METHODOLOGY.md` still say "on held-out years" for the backward test. That is accurate for the point predictions, so it was left.
- The 2012 gate is partly in sample (already disclosed). A fully out-of-sample gate remains on the improvement plan.
- The published bands and the verified bands are built slightly differently (section 1, E). Aligning them belongs to the experiment above.
