# SHIFT: scientific limitations

Audit of 8 November 2026. Each limitation states what the problem is, what evidence shows its size, and what it means for a user. Ordered from most to least important for the challenge's purpose (comparing fire activity across the 2012 sensor change at month and region scale).

## 1. The core assumption cannot be tested before 2012

**What.** Every MODIS-era value is MODIS times a factor fitted on 2012-2019. That is only right if the ratio of S-NPP to MODIS fire for a place and calendar month was the same in 2003-2011 as in 2012-2019.

**Evidence.** The global ratio was stable over 2012-2019 (coefficient of variation 4.1%, trend +0.02% a year), but the 95% interval of the trend (-0.8 to +2.3% a year) cannot exclude a drift that would move the 2007 values by about 15% if it had continued backwards (VALIDATION_REPORT 3.3). Florida (+3.0% a year) and the Amazon arc (-1.8% a year, hotspots) show ratio drifts whose intervals exclude zero.

**Consequence.** Pre-2012 values for places whose fire regime changed (fire sizes, crop burning practices, deforestation) can be biased in a way the calibrated range does not fully cover. Global and most regional totals are consistent with MODIS alone (trend difference under 0.62 points a year), which limits but does not remove this risk.

## 2. Validation evidence is mostly internal

**What.** The strongest tests (leave one year out, backward 2012-2015, untouched 2026) all use S-NPP as the truth inside the VIIRS era. The 2012 gate is partly in sample (its 2013-2015 window lies inside the fit years 2012-2019). The external reference, GFED4.0 burned area, is derived from MODIS reflectance and ends in 2016. The known-events test does not separate methods (the raw joined record also hits 7-8 of 8).

**Consequence.** SHIFT is shown to be internally consistent and better than simpler ratio methods on held-out VIIRS years. It is not validated against an independent ground truth of fire activity.

## 3. Day-level values before 2012 are poor

**What.** Backward test, merged MODIS × k against S-NPP: median error 86% for a 2.5° cell on a day, 50% for a region on a day, 13% for a region in a month (`daily__skill_by_scale.csv`).

**Consequence.** Days and weeks before 20 January 2012, and any critical period dated from them, are labelled "indicative" (D30). Monthly values are the tested product. Users should not compare single days across the 2012 boundary.

## 4. MODIS-era months are flagged unusual too often

**What.** 21.3% of region-months before 2012 are flagged unusual or critical (fire power) against 13.5% from 2012. About 26% (regions) to 35% (single 2.5° cells) of MODIS-era unusual flags would not be unusual in S-NPP. An alternative baseline did not pass its rule.

**Consequence.** Pre-2012 "unusual" and "critical" months should be read with that false-alarm rate in mind. The website states it in the tooltip. A user comparing "how many critical months before and after 2012" would see an inflated count for the earlier period.

## 5. Fire power is an index, not an energy

**What.** Daily fire power is the sum of FRP (MW) over detections and overpasses. Merged MODIS adds up to four overpasses a day, S-NPP two. Overlapping orbits at high latitude can see one fire several times a day. Monthly and yearly values sum the daily sums. The FRP factor $k_{\text{frp}}$ (about 0.89 globally) absorbs the average difference. Published comparisons show VIIRS 375 m and MODIS FRP differ for the same fires, and the size of the difference depends on land cover (Fu et al. 2020, Li et al. 2018).

**Consequence.** Fire power values are comparable across the record as an index of how much intense burning was seen, at month and region scale. They are not fire radiative energy and should not be converted to emissions without a diurnal model.

## 6. Hotspots are not fires

**What.** A hotspot is a 0.05° cell with at least one detection on a UTC day. One large fire covers many cells and many days. Two small fires in one cell are one hotspot. There is no event identification (clustering) in SHIFT.

**Consequence.** The record measures burning activity, not the number of fires. The website never calls hotspots fires. The challenge's optional "number of fires detected and reported" is not met.

## 7. Detection sensitivity is handled only on average

**What.** VIIRS detects smaller and cooler fires than MODIS. Counting cells removes most of the pixel-size effect but not the sensitivity difference. The factor corrects the average difference per place and calendar month. It does not model detection probability as a function of fire size, scan angle, cloud, smoke or view geometry.

**Consequence.** Within a place-month, a year dominated by small fires is under-corrected and a year dominated by large fires over-corrected. This is one likely cause of limitation 1.

## 8. Regional 2012 gaps up to about ±10% remain

**What.** Iberia (+9.2% in the record, +11.8% in the resolution stage), Florida (-9.1% / -7.0%), Siberia (-8.7%). The regional noise of the same statistic in years without a sensor change is about 3 to 10%.

**Consequence.** Small regional steps at 2012 cannot be confidently attributed to either sensor or fire. Iberia carries extra uncertainty.

## 9. Uncertainty ranges cover the factor only

**What.** The calibrated 95% range covers the error of converting MODIS to the S-NPP scale. It does not cover omission under cloud or smoke, commission errors, the unknown pre-2012 ratio drift (limitation 1) or area edge effects. Before calibration the bootstrap covered only 40-47% of held-out months, which shows how easily uncertainty is underestimated.

**Consequence.** The shaded band is an honest minimum, not a total uncertainty.

## 10. Spatial and temporal granularity of the website

- Areas are summed on 1° cells (whose centre is inside the area). Edges can be off by up to about 50 km on each side, and the box shown on the map is not exactly the area summed.
- "No data" is decided per 30° zone and day: an outage anywhere in a large zone marks the whole zone.
- UTC days: for longitudes far from Greenwich a night overpass can fall on the next or previous UTC date. Tested against the local solar day, the difference was too small to switch (rule fixed before the run).
- Areas needing more than 40 daily tiles (Russia) cannot be loaded at once.

## 11. Data currency and sensors

- The record ends on 28 October 2026. There is no near-real-time feed (D34), so "the latest month" on 13-14 November is October.
- NOAA-21 is not used (D35). NOAA-20 carries the record past the end of Suomi NPP data (NOAA-20/S-NPP ratio 1.00-1.05 for hotspots every year).
- January-June 2002 is Terra only and not comparable (D20).

## 12. Method development was adaptive

**What.** Each choice was decided by a rule committed to git before its run. But the sequence of tests was not fixed in advance: for example the 2.5° factor test (D28) was designed after the first record (D27) showed regional jumps, and the gate was then passed again on the new record. This is a standard "garden of forking paths" risk: a method shaped by looking at the same data it is judged on.

**Consequence.** The out-of-sample tests (backward, leave one year out, the untouched 2026 test) limit this risk, but the gate result should not be presented as a one-shot confirmation.

## 13. Reproducibility depends on outside services

The pipeline downloads FIRMS yearly archives at run time and keeps raw data on a private Google Drive. FIRMS can reprocess its archives. GFED and MERRA-2 need an Earthdata login. Exact byte-for-byte reproduction of the 7 November record is therefore not guaranteed, though the code, settings, seeds and run provenance (git commit and settings hash in every report) are recorded. See REPRODUCIBILITY_GUIDE.

## 14. Implementation notes found by the audit (minor)

- The pipeline writes `NaN` into some JSON reports. Browsers reject it, which hid every Phase 2 check on the website until a reader-side fix on 8 November. The pipeline should write strict JSON.
- The website's monthly totals do not apply the pipeline's gap-scaling multiplier. Measured effect under 0.01% on yearly totals before 2026.
- The export keeps, for each 1° cell-day, the highest source code of the 0.25° rows it combines. A cell-day mixing native and filled values is shown as filled.

## 15. Added 11 November 2026: the coverage check is not independent

**What.** The 94.9% and 93.9% coverage of the calibrated 95% ranges was measured on 2012-2015 with predictions from factors fitted on 2016-2019. Factor fitting for those predictions was clean. Everything else around it used 2012-2015: the 1,743 evaluated cells and their weights were chosen from S-NPP fire over 2012-2025, cell-months were kept only if fire was predicted or observed, the range widths and groups came from fits that included 2012-2015, and the model (2.5° variant, source pieces, band method) was selected with 2012-2015 results in view (`checks.py` `run_checks` lines 844-848, `coverage_check` lines 258-358).

**Evaluated is not published.** The bands that were checked use the 2016-2019 bootstrap and each verification month's own fire bin. The published pre-2012 ranges use the production bootstrap and each cell's typical 2003-2011 month, and they also cover sparse cells that were never tested. The two share a calibration table but are not identical. No test has measured the coverage of the published ranges.

**Consequence.** The figures are a useful sign that the calibration is roughly right, not an independent estimate of coverage. Every 95% label on the website now says it covers conversion error only and is not a guaranteed bound. A clean refit on 2012-2019 would only be a sensitivity analysis, because the model was chosen with those years in view. The only genuine outer holdout is S-NPP data no part of SHIFT has used. Both are described in `SCIENTIFIC_CLAIMS_CORRECTION_2026-11-11.md` section 3. The bands will not be recalibrated on a test set and then reported as validated on it.
