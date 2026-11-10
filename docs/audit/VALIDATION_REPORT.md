# SHIFT validation report

Audit of 8 November 2026. Record: final L3 of 7 November 2026 (2002-01-01 to 2026-10-28), published site data generated 2026-11-07T17:15:19Z from code commit `0f95990`.

> **Erratum E1, 11 November 2026.** Statements in this document that the calibrated 95% ranges were "verified on 2012-2015" and hold "94-95% of held-out months" overstate how independent that check was. The verification predictions were fitted without 2012-2015, but the 2012-2015 years were also used in the fits that set the range widths and sorted cells into groups, and in choosing the model. The reported figures (94.9% hotspots, 93.9% fire power, on the 1,743 tested 2.5° cells) are kept as reported, but they are not an independent estimate of coverage, and they do not show that the published ranges contain the true value 95% of the time. Full trace: `SCIENTIFIC_CLAIMS_CORRECTION_2026-11-11.md`. The original text below is kept as it was written, marked [E1] where it applies.

## 0. Where each number comes from

Every result below carries one of three labels.

- **[R] Pipeline report.** Measured by the pipeline on Colab, on the team's data, and stored in a report that ships with the website (`data/validation/` in `site_data.zip`). The audit read these files. It did not rerun the pipeline, because the raw FIRMS data (several GB) and the Level 2 cell-days live on the team's Google Drive and were not available to the audit environment.
- **[A] Audit measurement.** Computed during this audit by `validation/audit_site_data.py` from the published site data. Anyone can rerun it (see section 8). Output tables are in `validation/results/`.
- **[T] Test suite.** The automated tests in `pipeline/tests/`.

Nothing in this report is a result that was expected but not measured. Where something could not be verified, section 9 says so.

## 1. Automated tests [T]

`python -m pytest -q` in `pipeline/` on the audit machine (Python 3.13, the newest allowed package versions): **63 passed, 1 skipped** (the skipped test needs `h5py`, which this machine lacks). On Colab with `h5py`: 64 passed (reported by the team on 7 November). GitHub Actions runs the same suite on three dependency sets on every push (`.github/workflows/tests.yml`).

The tests build small synthetic worlds with known answers and check that each stage recovers them, for example that 2.5° factors remove a planted regional 2012 jump that 10° factors leave (`test_resolution_export.py`), that gap filling never writes zero fire, and that export files read back to the record exactly. They test the code's behaviour. They do not test the science on real data.

## 2. Agreement between sensors in the overlap years (out of sample)

MODIS-era factors cannot be tested before 2012, because there is no VIIRS then. The best available tests predict held-out VIIRS years from MODIS with factors fitted on other years.

### 2.1 Against simpler methods [R]

Source: `checks__simple_methods.csv` (`checks.py` `simple_methods`, line 363). Leave one year out over the merged-MODIS overlap years, plus backward (fit 2016-2019, predict 2012-2015), on 2.5° cells with at least 10 S-NPP hotspots a month, fire-weighted.

| Method | Score, hotspots | Score, fire power | Score | Backward error, hotspots (fw median) | Backward error, fire power | Global backward error, hotspots |
| --- | --- | --- | --- | --- | --- | --- |
| No harmonisation (join the records) | 27.3 | 56.6 | 42.0 | 63.2% | 17.6% | -62.5% |
| One global ratio | 52.6 | 53.8 | 53.2 | 17.8% | 21.2% | +1.8% |
| One ratio per 10° region, all months | 56.0 | 59.2 | 57.6 | 11.8% | 12.4% | +2.1% |
| v1 Florida line (fire power only) | 27.3 | 58.6 | 42.9 | 63.2% | 29.1% | -62.5% |
| **SHIFT** (2.5° cell and month, shrunk) | **69.6** | **69.0** | **69.3** | **4.0%** | **4.2%** | **+2.9%** |

"Score" is SHIFT's own metric: the share of held-out cell-months put in the same calendar class (low, normal, unusual, critical) as the real S-NPP month. SHIFT has the highest score and the lowest typical cell error of the methods tested. Its global total error (+2.9% hotspots, +6.1% fire power) is larger than that of the one-ratio methods, because a global ratio is fitted to make exactly that total right. Per-place accuracy and the global total pull in different directions here.

### 2.2 Factor resolution [R]

Source: `counts__resolution_variants.csv`. 10° tiles: score 65.72, mean absolute regional 2012 gap 15.5%. 2.5° cells: 69.98 and 4.3%. 2.5° shrunk towards the 10° tile (chosen, D28): 70.96 and 5.4%. The shrunk variant was chosen by a rule committed before the run (score gain over 1 point, lower regional gap than the 10° factors, global backward error within ±10%).

### 2.3 Time scale [R]

Source: `daily__skill_by_scale.csv` (`daily.py`). Backward test, merged MODIS × k against S-NPP, UTC days, fire-weighted:

| Scale | Median error, hotspots | Correlation | Median error, fire power |
| --- | --- | --- | --- |
| 2.5° cell, day | 85.9% | 0.83 | 83.4% |
| 2.5° cell, week | 29.4% | 0.92 | 36.8% |
| 2.5° cell, month | 17.6% | 0.96 | 21.9% |
| Region, day | 49.7% | 0.87 | 60.6% |
| Region, week | 18.8% | 0.91 | 25.1% |
| Region, month | 12.7% | 0.98 | 16.3% |
| World, month | 1.7% | | 4.1% |

Reading: the harmonised MODIS years are reliable at month and region scale. Day-level values for a single cell are not. This is why days and weeks before 2012 are labelled "indicative" on the website (D30), and why the calendar's headline unit is the month. The local solar day did not beat the UTC day by the rule's margin, so UTC was kept.

### 2.4 The untouched 2026 test [R]

Source: `report_checks.json` `final_test_2026` (`checks.py` `final_test`, line 184). Factors fitted without any 2026 data, then used once to predict S-NPP for January to September 2026. Stored and never rerun (run 16 October 2026, commit `8553fc6`).

| Predictor | Global error, hotspots | Global error, fire power | Result (±10%) |
| --- | --- | --- | --- |
| NOAA-20 × fill factor | +0.07% | +0.99% | PASS |
| Aqua × factor (the post-2020 MODIS piece) | -4.47% | -18.97% | FAIL |

The Aqua failure is consistent with Aqua's orbit drift after 2022 (Aqua fire power per S-NPP fell to 0.47 by October 2026, `satellite_ratios`). It concerns the Aqua piece, not the merged piece used before 2012. No row of the record comes from the Aqua fill after February 2023 (D29). This is the only test of any MODIS factor on years entirely after its fit, and part of it failed. There is no equivalent test for the pre-2012 factors, and there cannot be one.

### 2.5 Uncertainty ranges [R]

Source: `report_checks.json` `coverage`. The raw bootstrap range of the factor covered only **40.2%** (hotspots) and **46.7%** (fire power) of held-out cell-months, far from 95%. The bootstrap therefore understated the real error. After recalibration by fallback level and fire amount (calibrated on 2016-2019, verified on 2012-2015), coverage was **94.9%** and **93.9%**, inside the 90-99% acceptance band. [E1: not an independent check, because 2012-2015 entered the calibration fits and the grouping] For areas (the ten test regions), the independent combination covered 92.9% and 94.2% and the fully correlated one 96.2% and 95.4%. The website uses the fully correlated form, the more cautious one.

## 3. Continuity across the 2012 sensor switch

### 3.1 The gate [R], recomputed [A]

Global 2012 step (2013-2015 over 2009-2011): raw joined record 2.640 (hotspots), MODIS alone 0.964, harmonised 0.972. Gap +0.8% for hotspots, -0.2% for fire power. PASS (limit ±5%). The audit recomputed every regional value from `l3__yearly_totals.csv` and got the same numbers as `l3__step_2012.csv` [A3].

Two qualifications the audit adds:

1. **The gate is partly in sample.** The merged-MODIS factor is fitted on 2012-2019, which contains the gate's 2013-2015 window. The gate shows that the ratio in those years matches the multi-year factor. It does not show the factor is right for 2009-2011.
2. **The noise floor.** The same statistic computed at years where no sensor changes (2015 to 2022) measures how much the S-NPP/MODIS ratio wanders between 3-year blocks [A3]. Globally the median absolute placebo gap is **1.0%** (hotspots) and **2.1%** (fire power), so the global gate result sits at noise level, which is what success looks like. In single regions the median placebo gaps are **about 3 to 10%** (fire power in Kalimantan 21%). A regional 2012 gap of a few percent therefore cannot be told apart from normal wandering.

### 3.2 Regional gaps [R] [A]

| Region | Gap, hotspots (record, `step_2012.csv`) | Gap, hotspots (resolution stage) | Gap, fire power (record) | Median placebo gap, hotspots |
| --- | --- | --- | --- | --- |
| Whole world | +0.8% | +0.9% | -0.2% | 1.0% |
| Central African savanna | +0.4% | +1.0% | +1.7% | 6.0% |
| Northern Australia | +0.6% | +1.0% | +2.5% | 2.9% |
| Amazon arc | +2.3% | +2.4% | +3.8% | 7.0% |
| Bangladesh | -1.2% | +7.2% | +1.6% | 7.0% |
| Punjab | -0.7% | +4.6% | +5.9% | 3.1% |
| Kalimantan | -2.9% | -3.1% | -2.2% | 3.4% |
| Java | +7.1% | +7.0% | -4.5% | 8.8% |
| Iberia | +9.2% | **+11.8%** (flagged) | +2.8% | 3.8% |
| Siberia | -8.7% | -8.7% | -7.9% | 4.9% |
| Florida | -9.1% | -7.0% | -0.6% | 7.9% |

The two hotspot columns differ because they are two computations: the record's own yearly totals over 0.25° cells in each box, and the resolution stage's 2.5° cells whose centre is in each box with factors refitted on the production years. No region exceeds ±10% in the record's own computation. Iberia does in the resolution stage's, and is flagged there with extra uncertainty. Before this audit, the website said Iberia was the only region past 10%. That sentence was corrected (section 10).

Florida's placebo gaps are all positive (+3 to +13%), which points to a steady drift of its S-NPP/MODIS ratio rather than noise (see 3.3).

### 3.3 Is the ratio stable over time? (the core assumption) [A2]

Source: `validation/results/A2_ratio_stationarity.csv`. Yearly S-NPP/MODIS ratio per region over the fit years 2012-2019. Theil-Sen trend with a 95% interval from resampling years.

| Region | Hotspots: CV | Trend %/yr (95% interval) | Fire power: CV | Trend %/yr (95% interval) |
| --- | --- | --- | --- | --- |
| Whole world | 4.1% | +0.02 (-0.83 to +2.29) | 4.7% | -0.55 (-1.98 to +3.51) |
| Florida | 7.5% | **+3.03 (+1.95 to +4.14)** | 7.5% | **+2.97 (+1.02 to +4.42)** |
| Amazon arc | 5.7% | **-1.81 (-3.26 to -0.65)** | 5.1% | -0.49 (-2.76 to +1.25) |
| Other eight regions | 3.8 to 11.2% | no interval excludes zero | 6.7 to 19.0% | no interval excludes zero |

Globally the ratio shows no trend in the fit years, but the interval is wide: a drift of about 2% a year cannot be excluded. If such a drift had run back to 2007 (8.5 years before the middle of the fit years), the pre-2012 global record would be off by about 15%. This is a sensitivity, not a measurement: nobody can measure the ratio before 2012.

Florida's and the Amazon's ratios do drift. A plausible physical reading, not tested here, is a change in the mix of fire sizes (smaller fires raise the VIIRS/MODIS ratio because VIIRS sees them and MODIS does not). The fixed per-place factor cannot follow such a change, so the MODIS years of these two regions carry more error than their calibrated range suggests.

The merged MODIS ratio for 2020-2025 (Terra drift years) moves in several regions (Java -9.3%/yr, Siberia +8.7%/yr for hotspots). This supports D19 (Aqua alone from 2020) and D29.

### 3.4 Are long-term trends preserved? [A4]

Source: `A4_trends_2003_2019.csv`. Theil-Sen trend of yearly totals 2003-2019, percent per year.

| Region | MODIS alone | SHIFT | Raw joined | SHIFT minus MODIS | Raw minus MODIS |
| --- | --- | --- | --- | --- | --- |
| Whole world, hotspots | -1.10 | -1.13 | +6.25 | -0.02 | +7.35 |
| Whole world, fire power | -1.27 | -1.66 | -2.44 | -0.39 | -1.17 |
| Amazon arc, hotspots | -6.69 | -7.15 | -1.18 | -0.46 | +5.51 |
| Siberia, hotspots | +12.49 | +12.89 | +17.24 | +0.40 | +4.75 |
| Java, hotspots | -0.63 | -0.04 | +14.97 | +0.58 | +15.60 |

Across all 22 region-variable pairs SHIFT's trend stays within **0.62 percentage points a year** of MODIS alone. The raw joined record departs by up to 15.6 points a year (hotspots), always upwards for hotspots. For fire power the raw record departs in both directions (-4.9 to +5.2 points a year), because merged MODIS adds more overpasses of FRP than S-NPP and the size of that effect varies by region.

Caution: this test is partly built in. Before 2012 SHIFT is MODIS times a fixed factor, so its trend there matches MODIS by construction. The informative part is 2012-2019, where SHIFT is S-NPP itself. It shows that S-NPP and MODIS rise and fall together in that period, which is check A2 seen another way. The test cannot detect a trend that MODIS itself gets wrong.

The global decline of about 1.1% a year in hotspots agrees in sign and rough size with the published human-driven decline in global burned area of 1.35 ± 0.49% a year over 1998-2015 (Andela et al. 2017). The quantities differ (hotspots against burned area), so this is consistency, not validation.

## 4. Independent reference data

### 4.1 Burned area, GFED4.0 [R] [A5]

GFED4.0 monthly burned area without small fires (MCD64A1-based, ORNL DAAC doi:10.3334/ORNLDAAC/1293), 2003-2016, per test region.

- Pipeline check B [R] (`checks.py` `gfed_check`, line 677): the 2012 step in fire per unit burned area, judged against the largest step MODIS alone shows at other years. Global: PASS. Regions passing for both variables: 7 of 10. Of the three failures, Africa and Siberia (hotspots) also fail for MODIS alone. Java (fire power) fails for both.
- Audit [A5]: shift of log(fire/burned area) between 2003-2011 and 2013-2016. Global hotspots: raw joined **+186%**, MODIS alone **+4.2%**, SHIFT **+5.6%**. In every region SHIFT stays within about 7 percentage points of MODIS alone, while the raw record jumps by +21% to +708% for hotspots.

Limits: GFED4.0 is derived from MODIS surface reflectance (MCD64A1), so it is not independent of the MODIS instrument, only of the active fire algorithm. It ends in 2016. Burned area and hotspots measure different things (area burned over a month, against fire seen at overpass), and their ratio changes for real reasons (Amazon -40% for both MODIS alone and SHIFT). This check can show that SHIFT adds no 2012 artefact beyond what MODIS alone shows. It cannot show which record is "true".

### 4.2 Known fire disasters [R]

Eight events chosen by the team before the run (Russia 2010, Greece 2007, Indonesia 2006 and 2015, Amazon 2019, Australia 2019-20, Pantanal 2020, Canada 2023). SHIFT fire power marks 7 of 8 as unusual or critical (base rate for other months 16.5%). Amazon 2019 is missed (z = 0.5): the season was the highest since 2010 but below the mid-2000s, which the harmonised record shows.

This test does **not** separate methods: the raw joined record also hits 7 of 8 (fire power) and 8 of 8 (hotspots), and MODIS alone 7 of 8. Big disasters are big in any record. It shows SHIFT keeps them. It is not evidence for the harmonisation.

### 4.3 Calendar balance across eras [R]

Share of region-months flagged unusual or critical (`report_checks.json` `known_events.era_balance_d18_regions`): SHIFT fire power 21.3% before 2012 against 13.5% from 2012. Raw joined hotspots 4.2% against 26.0%. SHIFT is far better balanced than the raw record but not balanced: MODIS-era months are flagged about 1.6 times as often. The anomaly test measured why: MODIS × k months have more year-to-year noise than S-NPP months, and about 26% (regions) to 35% (single cells) of MODIS-era unusual flags would not be unusual to VIIRS. An "era-fair" baseline that widens the spread for MODIS-era months did not pass its rule (false alarms fell only 2.2 points, needed 5). The website shows this rate in every tooltip of a pre-2012 unusual month.

Daily critical periods are worse (median 5.8 critical days a year before 2012 against 1.5 from 2012, MODIS alone 2.75 and 2.55). Hence D30: dated critical periods before 2012 are indicative.

## 5. Generalisation

- **Regions.** Ten contrasting test regions (savanna, deforestation, boreal, Mediterranean, crop burning, peat, volcanic, small fires under monsoon cloud). Results above.
- **Thin cells.** Places with little fire borrow their factor. Measured by rebuilding tested places without their own data (`places__borrowed_factor_test.csv`): typical error 3.5% with the place's own monthly data, 9.2% when borrowing from the 30° neighbourhood, 15.4% from the world. Only 19-36% of places are within ±10% when they borrow. The website's ranges include these errors.
- **Seasons.** The factor is per calendar month, so seasonal differences in the ratio are kept. Months with little fire use the fallback chain.
- **Cloud.** Scaling errors were 20.1% in clearer-than-usual months, 27.3% in usual months and 22.7% in cloudier ones (no monotonic growth with cloud). Low-fire months are cloudy 23.2% of the time against 13.4% overall, so a cloud flag is shown.
- **High- and low-fire places.** Calibrated ranges are set separately for three fire bins because errors are much larger in thin cells (95% half-width in log units 1.95 in the thinnest bin at the own-month level, `checks__month_range_calibration.csv`).

## 6. The website calendar [A]

| Check | Result |
| --- | --- |
| Daily tiles summed per region and year equal the pipeline's yearly totals (8 regions with whole-degree boxes, 25 years, both variables) [A1] | **Exact**: maximum difference 0.0000% |
| The cut-off day (2026-10-29) is "no data" in every zone | Yes: status 5 in all 72 zones |
| Days with any "no data" zone in the whole record | 12, including the cut-off day |
| Global days below 40% of their 31-day median [A6] | MODIS era: 10, all marked "no data". VIIRS era: 1, not marked |
| Effect of not applying the monthly gap multiplier on the site | Yearly totals with and without it differ by under 0.01% for every region before 2026 (0.04 to 0.87% in 2026) |
| Calendar values are hotspots, never "fires" | Yes. Labels say hotspots. The definition is shown. Fire power is now defined as a daily-summed index (section 10) |
| Dates | UTC calendar days (D30 rule result) |
| Map area and calendar area | Not identical: the calendar sums 1° cells whose centre is inside the drawn shape. Stated on the page |
| CSV downloads | Checked in a headless browser on 7-8 November: daily CSV covers exactly the chosen dates, monthly CSV matches the grid classes, cell CSV contains only cells in the area |

## 7. What the validation supports

Measured:
- At month and region scale, MODIS-era values predicted from MODIS match held-out S-NPP months with a typical error of 4% per 2.5° cell (backward test), better than every simpler method tested.
- The record has no 2012 artefact at global scale (gap +0.8%, within the 1.0% noise of the ratio itself), and long-term trends follow MODIS alone within 0.6 points a year in every test region, while the raw joined record is off by up to 15.6 points a year.
- The calibrated 95% ranges hold 94-95% of held-out months. [E1: reported coverage, not independently verified]

Not supported:
- That the factors are right before 2012 beyond the stability seen in 2012-2019. The core assumption cannot be tested directly.
- Day-level accuracy before 2012 (median cell-day error 86%).
- That SHIFT is better than published multi-sensor methods. None was implemented for comparison.

## 8. How to rerun the audit checks

```
gh release download site-data -p site_data.zip --repo squadronzero/squadron-zero   # or download it in a browser
mkdir site && unzip -q site_data.zip -d site
pip install pandas numpy
python validation/audit_site_data.py site --out validation/results
python -m pytest -q validation
```

Run time about 15 seconds. Results on 8 November 2026 are committed in `validation/results/`.

## 9. What could not be verified

- The pipeline runs themselves (raw FIRMS files and Level 2 on Drive). Every [R] number is as reported by the pipeline.
- Whether the FIRMS yearly archive files would be identical if downloaded again (FIRMS may reprocess).
- MODIS-era factor accuracy before 2012 (no reference sensor exists).
- Behaviour of the method in regions outside the ten test regions, beyond the global numbers.
- The NASA Aqua status figures quoted in project documents (taken from those documents, not checked by the audit).

## 10. Changes made during the audit

- Website, Method page: the Iberia sentence now gives the measured range for the three regions near 10% (Iberia +9 to +12%, Florida -7 to -9%, Siberia about -9%) and the regional noise of about 3 to 10%.
- Website, hotspot definition: fire power is now defined as daily-summed FRP and its monthly and yearly sums as an index, not an energy.
- Added `validation/audit_site_data.py`, its tests and its results.
