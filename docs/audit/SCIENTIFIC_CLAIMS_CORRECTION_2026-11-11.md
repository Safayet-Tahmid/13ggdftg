# Scientific claims correction, 11 November 2026

Team Squadron Zero · prepared by Claude, reviewed by the team before merge · branch `fix/scientific-validation-claims` from `main` 44e2d21. Revision 2 (same day) answers the team's eight required revisions: leakage explanation, sensitivity framing, no recalibration on the test set, evaluated against published bands, visible caveats beside 95% labels, the 4% metric, the Suomi NPP date, and evidence.

This is a wording and documentation correction. No computation, setting, factor, dataset or report value changed (`python docs/preflight/verify_baseline.py`: UNCHANGED). No new experiment was run. Every number quoted here comes from the published reports in `site_data.zip` (`data/validation/`) or from reading the code at commit 44e2d21.

## 1. The uncertainty-coverage issue, traced in the code

### 1.1 What is reported

`report_checks.json` `coverage.cells`: `calibrated_coverage_pct` 94.9 (hotspots) and 93.9 (fire power), over 73,193 and 73,191 cell-months of the 1,743 tested 2.5° cells (`tested_cells`), verify years 2012-2015, calibrate years 2016-2019, `accepted: true`. Fire-weighted figures: 93.6 and 93.6. The raw bootstrap band alone covered 40.2% and 46.7% (`factor_band_coverage_pct`).

Where it is computed: `pipeline/shift/checks.py`, `coverage_check()` (lines 258-358), called from `run_checks()` at line 872. The merged MODIS piece's production years are 2012-2019 (`prod`, line 262). `cal_years` = 2016-2019 and `ver_years` = 2012-2015 (lines 263-264, from `phase2_checks.coverage` in `config/settings.yaml` lines 435-439). `ver_fit` = production years without the verify years = 2016-2019 (line 265).

### 1.2 Which cells are evaluated, and how they are weighted

These two inputs are built in `run_checks()` before `coverage_check()` is called, and both use the verification years.

| Input | Code | Data it uses | Uses 2012-2015? |
| --- | --- | --- | --- |
| Evaluation cells (the 1,743 "tested cells") | lines 844-847: S-NPP rows outside the mask, `per_cell` = total S-NPP active cell-days over the overlap years divided by 12 × years, kept if at least `resolution.min_ref_cells_per_month` (10) | S-NPP, all overlap years 2012-2025 | **Yes** |
| Weights for the weighted 95th percentile and for the fire-weighted coverage | line 848: `weights` = total S-NPP active cell-days per cell, 2012-2025 | S-NPP, 2012-2025 | **Yes** |
| Cell-month filter | lines 297-298: a cell-month is kept only if `pred > 0` or `real > 0` | the observed S-NPP value of the verification month | **Yes** (conditions on the outcome) |

What this means:

- The evaluation set is chosen with the outcome variable (S-NPP fire) of the verification years. A cell that burned in 2012-2015 is more likely to pass the 10-a-month threshold. Sparse places, where bands are widest and least certain, are outside the test.
- The weights that set each group's 95th percentile (lines 300-303) and that produce the fire-weighted coverage come partly from the verification years.
- The filter drops cell-months where both the prediction and the observation are zero. Such months would always count as covered (zero log error), so on its own this filter tends to lower the unweighted coverage, not raise it. Its main effect is that the tested population is defined by observed fire.

### 1.3 Factor fitting compared with model selection

Two different things used the verification years in different ways. Keeping them apart matters, because fixing one does not fix the other.

**Factor fitting** is estimating k for a fixed model from a list of years.

| Step | Code | Data it uses | Uses 2012-2015? |
| --- | --- | --- | --- |
| Verification point predictions | lines 284-285: `wv = fit_weights(..., {g: ver_fit})`, `ver = preds(..., ver_years, k_model(... wv ...))` | factors fitted on 2016-2019 only | No |
| Factor-uncertainty part of the band | lines 286-290: `bootstrap(..., {g: ver_fit})` | 2016-2019 | No |
| Calibration residuals (band widths) | lines 280-281: for each of 2016-2019, `fit_weights(..., {g: prod}, drop=y)` | factors fitted on 2012-2019 without that one year | **Yes** |
| 95th percentile per group | lines 299-305 (weighted 95th percentile) | the residuals above, weighted as in 1.2 | **Yes**, through both |
| Group "level" (how much own data a factor had) | lines 276-278: `c.fit(g, ref, wprod, ...)`, `level = c.last_level` | production fit, 2012-2019 | **Yes** |
| Group "fire bin" (predicted fire amount) | line 279 `kc = k_model(... prod ...)`, line 293 `pred_cells` | production factors, 2012-2019 | **Yes** |

**Model selection** is choosing which model, source pieces and band method to use, by comparing results.

| Choice | Where it was made | Evidence used | Uses 2012-2015 S-NPP outcomes? |
| --- | --- | --- | --- |
| Resolution variant `fine_shrunk` | stage `resolution`, `resolution.py` `judge()` (line 115): backward test fitted on 2016-2025 and predicting 2012-2015, plus leave-one-year-out over 2012-2025, a ±10% global backward error limit | `report_resolution.json` `why` | **Yes** |
| MODIS source pieces (D19) and fire-power method (D21) | stages `selection` and `frp`, the same backward test and score | `report_selection.json`, `report_frp.json` | **Yes** |
| Regional variant replacements | `resolution.py` `region_test()` (line 266): judged on each region's backward error 2012-2015 | `report_resolution.json` | **Yes** |
| Band method (level × fire-bin calibration on top of the bootstrap) | added in Phase 2 after the raw bootstrap was seen to cover only 40-47% on these same verification years | `SCIENTIFIC_LIMITATIONS.md` section 12 | **Yes** (adaptive development) |
| Prior strength 30 cells and 300 MW, monthly minimums | fixed settings in `config/settings.yaml` lines 222-225 | none recorded | [UNCERTAIN] no record shows they were tuned on test results |
| Acceptance band 90-99%, fire bins 30 and 300 | `settings.yaml` lines 435-439, fixed 15 Oct before the first run | none | No |

Consequence: even if every factor fit and every band width were rebuilt without 2012-2015, the test would still not be independent, because the variant, the source pieces and the band method were chosen after looking at 2012-2015 results. Removing the factor-fitting leakage turns the check into a cleaner sensitivity analysis. It does not turn it into an independent validation.

### 1.4 Evaluated bands are not the published bands

The coverage figure describes the bands built inside the check. The ranges shown on the website and in the downloads are built differently.

| | Evaluated band (the 94.9% and 93.9%) | Published pre-2012 range (`month_range_pct` in the L3 uncertainty table) |
| --- | --- | --- |
| Factor-uncertainty part | bootstrap of the fit on 2016-2019 (`hwf`, lines 286-290) | production bootstrap of the fit on 2012-2019 (`hw95_log`) |
| Fire bin | that verification month's own predicted hotspots (line 293) | the cell's typical 2003-2011 month, from production factors (lines 342-350) |
| Level | production fit level (line 278) | the factor's `source` mapped to a level (line 351) |
| Groups with no calibration value | global 95th percentile of the calibration residuals (line 306) | the largest calibrated value in the table (line 353) |
| Cells covered | the 1,743 tested cells only | every published cell, including sparse ones never tested |
| Years | 2012-2015 | 2002-2011 (MODIS era), where no VIIRS exists |

Both take the larger of the bootstrap half-width and the calibrated group value (line 309 and line 353). They share the calibration table, so they are closely related. But they are not identical, and no test has measured the coverage of the published ranges themselves.

### 1.5 By type

- **A. Point predictions:** clean. The verification predictions use factors fitted without 2012-2015.
- **B. Interval-width calibration:** leakage. The residuals that set the widths come from leave-one-year-out fits on 2012-2019, and their percentiles are weighted with 2012-2025 S-NPP fire.
- **C. Group or bin assignment:** leakage. The level and the fire bin of each verification cell-month come from the production fit, which includes the verification years' S-NPP data.
- **D. Evaluation population and weights:** leakage. Cells chosen, and cell-months kept, using S-NPP fire that includes 2012-2015.
- **E. Model selection:** leakage. Variant, source pieces, regional replacements and the band method were chosen with 2012-2015 performance in view.
- **F. Reporting:** the acceptance band was fixed before the run (no leakage). The reported coverage describes the evaluated bands (1.4), not the published ones. It is measured in VIIRS-era years only, so it says nothing directly about drift before 2012.

The direction and size of the combined effect are not established. Leakage of types B to E usually makes a coverage figure optimistic, the both-zero filter pushes the other way, and no clean experiment has been run.

What the 94.9% and 93.9% do measure: the share of 2012-2015 cell-months, in 1,743 well-burning cells chosen with S-NPP data from 2012-2025, whose real S-NPP value fell inside a band built around a prediction from factors fitted on 2016-2019, where the band widths, the groups and the band method were set with the help of the 2012-2015 data.

What cannot be concluded: that SHIFT's published pre-2012 ranges contain the true VIIRS-equivalent value 95% of the time, for any place or month.

## 2. Claims reviewed

Status values: Supported · Supported with qualification · Overstated · Unsupported · Not independently verified.

| Claim | Location | Previous interpretation | Evidence | Correction | Status |
| --- | --- | --- | --- | --- | --- |
| "Every choice was tested on years the model never saw, under a rule written before the run." | `web/src/pages/Validation.jsx` heading | all tests fully held out | coverage (1.2 to 1.5), simple methods (model selection), gate (fit years include 2013-2015) reuse years | Heading "How SHIFT was tested, and what each test can and cannot show", lede explains differing independence and that no test reaches before 2012 | Overstated, corrected |
| "of held-out months fall inside the calibrated 95% range" | `Validation.jsx` facts | independently verified 95% coverage | section 1 | "of 2012 to 2015 cell-months fall inside the calibrated 95% range … on the N tested 2.5° cells", plus a visible qualifier naming the cell choice, the weights, the band widths, the groups and the model choice, and saying the published ranges are built differently | Not independently verified, qualified in place |
| "gap between SHIFT's 2012 step and the real change (MODIS alone)" | `Validation.jsx` facts | MODIS alone is the true change | MODIS alone is a single-sensor reference, not ground truth. Factors fitted on 2012-2019 include the 2013-2015 window (`VALIDATION_REPORT.md` 3.4 item 1) | "the step MODIS alone shows over the same years (one sensor, so no switch)", plus: continuity at the switch, not proof the factors are right before 2012 | Supported with qualification |
| "the real change, seen by MODIS alone" | `web/src/pages/Switch2012.jsx` | same | same | "the change MODIS alone shows … the reference SHIFT aims to match, not a ground truth" | Supported with qualification |
| SHIFT's score against the best simple method | `Validation.jsx` facts and table caption | independent comparison | the variant and settings were chosen on similar held-out tests (1.3) | added: lead may be a little optimistic. Caption fixed: the tests predict S-NPP in overlap years, not "MODIS-era months" | Supported with qualification |
| "No jump at 2012, region by region" | `Validation.jsx` heading | no regional jump | Iberia +9 to +12%, Florida and Siberia near -9% (`Method.jsx`, audit 3.2) | "The 2012 step, region by region" | Overstated, corrected |
| "of truly unusual months … that the MODIS years also flag" | `Validation.jsx` facts | MODIS-era flags | `anomaly_check`: leave-one-year-out MODIS-based predictions of 2012-2019 against S-NPP | "months S-NPP marks as unusual … that the MODIS-based prediction also marks (each year 2012 to 2019 predicted with that year left out)" | Supported, wording made precise |
| Known fire disasters flagged | `Validation.jsx` facts | discriminating test | 8 events. MODIS alone and the raw joined record have the same or higher hit rate (`known_events.summary`) | added: a small test, the alternatives flag them about as often | Supported with qualification |
| Untouched 2026 test | `Validation.jsx` | supports the whole record | tests NOAA-20 and Aqua links after fitting, January to September 2026 (`final_test_2026.months`) | added: it does not test the pre-2012 MODIS factors | Supported with qualification |
| GFED4 agreement | `Validation.jsx` | independent check | GFED4 is derived from MODIS (`VALIDATION_REPORT.md` section 4) | added: consistency check, not independent ground truth | Supported with qualification |
| "Typical error of 4% per 2.5° cell" on held-out years | `VALIDATION_REPORT.md`, `SCIENTIFIC_METHODOLOGY.md`, `NASA_JUDGING_EXPLANATION.md` (pitch Q5 and script) | a typical monthly error of 4% | `checks.py` `judge_preds` (lines 79-93) and `selection.score` (line 125). See 2.1 below | definition added beside every use: four-year total per cell, fire-weighted median, with the monthly figure (17.6%) beside it | Supported with qualification (metric was undefined, easy to misread as monthly) |
| Suomi NPP end date "1 November 2026" | `Validation.jsx`, `Method.jsx`, `README.md`, `docs/DATA_CONTRACT.md`, `docs/SCIENTIFIC_SPECIFICATION.md`, `docs/COLAB_GUIDE.md` | | NASA FIRMS FAQ: new FIRMS Suomi NPP production ceased at 13:00 UTC on 2 November 2026 | all set to "2 November 2026, 13:00 UTC (NASA FIRMS FAQ)" with the source. Two code comments (`config/settings.yaml` line 544, `pipeline/shift/counts.py` line 266) still say 1 Nov. They were left, because those files are under the scientific fingerprint and the comment does not change any result | Inaccurate date, corrected in docs and UI |
| "Before 2012 values carry the calibrated 95% range of their factor" | `web/src/pages/Method.jsx` | the range bounds the true value 95% of the time | the range covers conversion error only (`SCIENTIFIC_LIMITATIONS.md` 9), its coverage is not independently verified, and the published range is not the evaluated band | rewritten: what it covers, what it leaves out, check not fully independent, built differently from the checked bands, a guide not a guaranteed bound | Overstated, corrected |
| Standalone "95% range" labels beside numbers | `web/src/content/text.js` (cell panel, Compare note, Trend label, legend, tooltip, scale note) and `web/src/components/Compare.jsx` hover | a verified 95% bound | section 1 | each label now carries "conversion error only" and, where there is room, "not a guaranteed bound" with a pointer to the Method page. No calculation changed | Overstated, qualified in place |
| Coverage "calibrated on 2016-2019, verified on 2012-2015" | `docs/audit/VALIDATION_REPORT.md` 2.5 and summary | independent verification | section 1 | dated erratum E1 (revised), inline markers. Original text kept | Not independently verified |
| "Calibrated 95% ranges verified at 94-95%" and "Calibrated 2016-2019, verified 2012-2015" | `docs/audit/SCIENTIFIC_METHODOLOGY.md` | | section 1 | erratum E1, inline markers | Not independently verified |
| "This was verified on 2012-2015 … an empirical, calibrated interval" | `docs/audit/HARMONIZATION_EQUATIONS.md` 5 | | section 1 | erratum E1, inline marker | Not independently verified |
| "its error bands held the truth 95% of the time", "We tested it on years the model never saw" | `docs/audit/NASA_JUDGING_EXPLANATION.md` (pitch guide) | | section 1 | wording replaced (this file is used for Video 2), erratum note | Overstated, corrected |
| Coverage listed as "reported" | `docs/preflight/RECENT_FIRMS_BASELINE.md` 5 | | section 1 | row now says not independently verified | Corrected |
| Area ranges: "the website uses the fully correlated form" | `VALIDATION_REPORT.md` 2.5 | | `web/src/lib/analysis.js` `areaRange`: fire-weighted mean of cell percentages, equivalent to full correlation. The report's `areas.rule` field says "independent" (the pipeline's suggestion, not what the site uses) | none needed | Supported |

### 2.1 The 4% figure, defined

| Part | Definition | Code |
| --- | --- | --- |
| Test | Backward test: factors fitted on 2016-2019 (the merged MODIS piece's fit years after 2015), predicting 2012-2015 | `simple_methods`, `bw = run([y for y in bw_fit if y in piece], [y for y in bw_test if y in piece])` |
| Variable | Hotspots (S-NPP-equivalent 0.05° active cell-days) and, separately, fire power (MW) | `cells` and `frp` cubes |
| Spatial unit | 2.5° cell | `tile_name(..., fine)` |
| Temporal aggregation | Per cell, the predicted total over all 48 months of 2012-2015 against the observed S-NPP total. Monthly errors of opposite sign cancel | `selection.score`: `total_error_pct = 100 × (Σ pred − Σ real) / Σ real` |
| Scale | Signed percent, then its absolute value | `t["err"].abs()` |
| Across cells | Fire-weighted median over the 1,743 tested cells. Weights: S-NPP active cell-days per cell, 2012-2025 (includes the test years, see 1.2) | `wmedian(t["err"].abs(), w)` |
| Result | 4.0% hotspots, 4.2% fire power. Best simple method 11.8% and 12.4% | `checks__simple_methods.csv` |
| Context | Share of cells (unweighted) within ±10%: 61.3% hotspots, 50.8% fire power. Typical error of a single cell-month in the backward test: 17.6% hotspots and 21.9% fire power (`daily__skill_by_scale.csv`, cell and month scale: the median of each cell's monthly absolute errors, then the fire-weighted median across the 1,743 cells) | |

So "4%" is the typical error of a 2.5° cell's four-year total, not of a single month or day. Independence: the point predictions are out of sample in time, but the cell choice, the weights and the model choice used 2012-2015 (sections 1.2 and 1.3).

## 3. Proposed follow-up analyses (not run)

No genuine outer holdout exists for the merged MODIS piece. Every overlap year it could be tested on (2012-2019) was used in fitting, in band calibration or in model selection. So a clean refit on those years can only be a **sensitivity analysis**: it shows how much the reported coverage depends on the leakage in section 1. It cannot be reported as independent validation of the published ranges.

### 3.1 Sensitivity analysis on 2012-2019 (retrospective, fixed variant)

**Question.** How much does the coverage change when every factor fit, band width, group and weight is built without the evaluation years?

**Data.** The existing cubes (`counts/fine_monthly.parquet`, L2 cell-days on the team's Drive). No new download.

**Design.** Variant `fine_shrunk`, prior 30 cells / 300 MW, source pieces and band method fixed exactly as published, and declared as chosen with 2012-2015 in view.

- Run 1: factor fit, calibration residuals (leave-one-year-out within 2016-2019 only), level and fire-bin assignment, evaluation cells and weights all from 2016-2019. Evaluate on 2012-2015.
- Run 2 (mirror): the same from 2012-2015, evaluate on 2016-2019.
- Evaluation cells chosen by a rule that uses only the build years, and kept for all months of the evaluation years, with no filter on the observed value.
- Bands built the way the published ranges are built (typical-month bin, `hw95_log` from the build years), so the published construction is what gets measured (section 1.4).

**Leakage controls.** One function builds every fit from an explicit year list, asserted to be disjoint from the evaluation years. The analysis plan, bins and metrics are committed before the run. Results are stored once.

**Comparison.** The current reported coverage. The raw bootstrap band. A naive band (global 95th percentile of the build-year residuals).

**Metrics.** Coverage, unweighted and fire-weighted. Median band width (percent). Interval score (Winkler score) per variable. All by fire bin (under 30, 30-300, over 300), by level, by the ten test regions, and by evaluation year.

**How it would be reported.** As measured, labelled "sensitivity analysis, fixed variant chosen with these years in view, not independent validation". If coverage falls outside 90-99%, that number is reported as it is.

### 3.2 Genuine outer holdout (prospective)

The only data no part of SHIFT has used are S-NPP observations not yet looked at. The final 2026 test used January to September 2026 (`final_test_2026.months`). S-NPP FIRMS production ran until 13:00 UTC on 2 November 2026, so October 2026 S-NPP data is a candidate [UNCERTAIN: confirm October 2026 S-NPP was not loaded into any fit or check before using it].

- It tests the Aqua piece (used from 2020), not the merged Terra and Aqua piece behind the pre-2012 record.
- It is one month, in one season, for each cell. Coverage would carry wide sampling error, and a seasonal pattern could not be separated from a model error.
- The method, bands and metrics would be frozen and committed before the data is opened, then run once.

### 3.3 What is not allowed

The bands will not be recalibrated on 2012-2015, or on any evaluation set, and then reported as validated on that same set. If any analysis above finds poor coverage, the measured value is published as a failure. Any change to the band method would need a fresh outer holdout that the changed method has never seen before its coverage could be reported as tested.

### 3.4 Limits shared by both

Neither analysis reaches before 2012. Neither can show whether the VIIRS to MODIS ratio drifted in the MODIS era (`SCIENTIFIC_IMPROVEMENT_PLAN.md` item 1).

**Effort.** About half a day of code and tests for 3.1, plus one Colab run. After the event.

## 4. Other issues found, not fixed here

- `NASA_JUDGING_EXPLANATION.md` and `SCIENTIFIC_METHODOLOGY.md` still say "on held-out years" for the backward test. That is accurate for the point predictions, and the definition in 2.1 is now beside each use.
- The 2012 gate is partly in sample (already disclosed). A fully out-of-sample gate remains on the improvement plan.
- Two code comments still give 1 November for the Suomi NPP end (section 2). They can be fixed when the pipeline code is next changed.
- The published bands and the evaluated bands are built differently (1.4). Measuring the published construction belongs to the analysis in 3.1.
