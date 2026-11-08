# SHIFT for the judges: what we can claim and how we back it

Prepared from the scientific audit of 8 November 2026. Every number is in VALIDATION_REPORT.md with its source. Each answer has a plain version, a technical version, the evidence, and the limit that stops it from overclaiming.

## Q1. What exact scientific problem does SHIFT solve?

**Plain.** NASA has watched fires from space with MODIS since 2000 and with the sharper VIIRS since 2012. If you join the two records, fire seems to more than double in 2012. That jump is the camera, not the planet. SHIFT removes it, so you can compare any year with any other year for any place.

**Technical.** A harmonised daily and monthly record of active fire hotspots and fire radiative power, 2002 to October 2026, global at 0.05° detection scale, on the S-NPP VIIRS 375 m scale, with the sensor switch removed and its remaining uncertainty quantified.

**Evidence.** Raw joined record: global hotspots step 2.64× at 2012. SHIFT: 0.972× against 0.964× for MODIS alone.

**Limit.** The product is tested at month and region scale. Days before 2012 are indicative.

## Q2. Why are raw MODIS and VIIRS hard to compare?

**Plain.** VIIRS pixels are about seven times smaller in area, so it sees small fires MODIS misses and splits one fire into more detections. The satellites also pass at different times of day, and MODIS flew on two satellites.

**Technical.** Pixel size (1 km against 375 m at nadir), detection sensitivity (minimum detectable fire), overpass times (Terra 10:30 and 22:30, Aqua and S-NPP 13:30 and 01:30), different confidence tests, and FRP retrieval differences.

**Evidence.** Schroeder et al. 2014 (VIIRS 375 m algorithm), Giglio et al. 2016 (MODIS Collection 6). In SHIFT's data S-NPP sees 2.7 times as many hotspots as merged MODIS globally.

**Limit.** None of these is modelled physically. They are corrected together, on average, by the factor (Q3).

## Q3. What harmonisation technique did we implement?

**Plain.** Two steps. First, count burning 5 km squares per day instead of raw detections, so a sharper camera cannot inflate the count. Second, for every square of about 280 km and every calendar month, measure from 2012-2019 how much fire VIIRS sees for each unit MODIS sees, and use that ratio to put the MODIS years on the VIIRS scale. Squares with little fire borrow the ratio of their wider area.

**Technical.** Hotspot $H$ = 0.05° cell-day with at least one kept detection. Factor $k(C,m) = (R + p\,k_P)/(S + p)$ per 2.5° cell $C$ and calendar month $m$, with $S$, $R$ the merged MODIS and S-NPP sums over 2012-2019, shrunk towards the 10° parent $k_P$ with a fixed prior ($p$ = 30 hotspots or 300 MW). Separate factors for hotspots and fire power. Gap days filled from tested partner satellites or marked "no data", never zero. NOAA-20 carries the record past Suomi NPP. Details: HARMONIZATION_EQUATIONS.md.

**Limit.** It is a calibrated ratio method with a hand-set shrinkage, not a physical model of detection.

## Q4. Why is it scientifically reasonable?

**Plain.** The two cameras flew together for years, so we can measure how they differ at each place and season instead of guessing one number for the world.

**Technical.** Overlap-period calibration is the standard first approach to sensor continuity. The ratio is measured per place and calendar month because detection differences depend on fire size and type, which vary by region and season. Counting cells removes the pixel-size effect before the ratio is fitted, so the factor only has to carry the sensitivity difference.

**Evidence.** Finer factors beat coarser ones on held-out years: score 70.96 (2.5° shrunk) against 65.72 (10° tiles), regional 2012 gap 5.4% against 15.5%.

**Limit.** It assumes the ratio for a place and month did not change between 2003 and 2019. That holds globally in 2012-2019 but not in Florida or the Amazon arc.

## Q5. What quantitative evidence shows it works?

**Plain.** We hid years from the model and asked it to predict them. It did better than every simpler method, and its error bands held the truth 95% of the time.

**Technical and evidence.**
- Backward test (fit 2016-2019, predict 2012-2015): typical error per 2.5° cell 4.0% for hotspots and 4.2% for fire power, against 11.8% and 12.4% for the best simple method (one ratio per 10° region) and 63% for joining the records.
- Calendar classes of held-out months: 69.3% agreement against 57.6% for the best simple method.
- Calibrated 95% ranges contained 94.9% (hotspots) and 93.9% (fire power) of held-out months.
- Untouched 2026 test: NOAA-20 predicted S-NPP within 0.07% and 0.99%.
- Region-month error 12.7% (hotspots), world-month 1.7%.

**Limit.** All of these use VIIRS-era years as truth. The score is our own metric. The Aqua part of the 2026 test failed on fire power (-19%) because of orbit drift. That piece is not used after February 2023.

## Q6. How do we know it does not create artificial trends?

**Plain.** We compared long-term trends with MODIS alone, which flew the whole time with the same camera. SHIFT follows it. The raw joined record does not.

**Technical and evidence.** Theil-Sen trends 2003-2019: SHIFT within 0.62 percentage points a year of MODIS alone in all ten test regions and the world, for both variables. The raw joined record is off by up to 15.6 points a year. Global hotspots decline about 1.1% a year, in line with the published decline in global burned area of 1.35% a year over 1998-2015 (Andela et al. 2017). The year-to-year S-NPP/MODIS ratio in 2012-2019 has no global trend (CV 4.1%).

**Limit.** Before 2012 SHIFT follows MODIS by construction, so this cannot detect an error MODIS itself makes. The ratio's trend interval does not rule out a slow drift.

## Q7. How is this different from merging two datasets?

**Plain.** Merging just puts the records end to end, and you get the 2012 cliff. SHIFT measures the difference between the cameras place by place and season by season, corrects for it, tests the correction on years it never saw, and shows you the leftover uncertainty.

**Evidence.** Raw joined: 2.64× step, 63% backward error, trends off by up to 15.6 points a year. SHIFT: 0.97× step (MODIS alone 0.96×), 4% backward error, trends within 0.62 points.

**Limit.** None needed beyond those in Q4 and Q5.

## Q8. Why does long-term comparability matter for responders, scientists and land managers?

**Plain.** "Is this season worse than usual?" only has an answer if "usual" was measured the same way. Without harmonising, every year since 2012 looks like a record and every year before looks quiet.

**Technical.** Baselines, anomalies and trends over 2003-2025 need one measurement scale. SHIFT gives each area its own normal, the rank of the current period among 23+ years, the usual season dates, and calibrated uncertainty, with no-data days shown as gaps.

**Example from the live site.** Southeast Australia, September 2019 to February 2020: rank 1 of 23 years, 5.5 times the normal hotspots and 32 times the normal fire power.

**Limit.** The record ends 28 October 2026. There is no live feed in this version.

## Q9. What are the important limitations?

1. The ratio cannot be measured before 2012. Its stability is assumed and was tested only within 2012-2019 (and fails in Florida and the Amazon arc).
2. Validation uses VIIRS-era years and a MODIS-derived burned-area product. There is no independent ground truth.
3. Days before 2012 are indicative (median cell-day error 86%).
4. MODIS-era months are flagged unusual about 1.6 times as often as VIIRS-era months (26-35% of those flags are false alarms).
5. Hotspots are not fires, and fire power is an index, not energy.
6. Three test regions keep a 2012 step near ±10% (Iberia, Florida, Siberia).

## Q10. How would we validate or improve it with more time?

- Test against ground-truth burned-area records independent of MODIS (for example MTBS in the USA).
- Fit the gate with factors from 2016-2019 only, so it is fully out of sample.
- Add the measured ratio drift to the uncertainty of the MODIS years.
- Model detection probability against fire size and view angle from coincident Aqua and S-NPP overpasses, instead of one ratio per place and month.
- Add a near-real-time month and NOAA-21.

Full list: SCIENTIFIC_IMPROVEMENT_PLAN.md.

## 90-second scientific explanation (for the demo)

> Satellites have watched Earth's fires for 25 years, but with two different cameras. MODIS started in 2000. VIIRS, which is much sharper, joined in 2012. Put the two records end to end and fire seems to jump 2.6 times in 2012. That jump is the camera, not the planet.
>
> SHIFT fixes it in two steps. First we count burning five-kilometre squares instead of raw detections, so a sharper camera can't inflate the count. Second, using the eight years both cameras flew together, we measure for every square about 280 kilometres across and every month how much fire VIIRS sees for each unit MODIS sees, and put the MODIS years on the VIIRS scale.
>
> We tested it on years the model never saw. It predicted them with a typical error of four percent, three times better than one ratio per region and fifteen times better than simply joining the records. The 2012 jump disappears. Long-term trends match MODIS alone, the one camera that flew the whole time.
>
> And we tell you where we are unsure: every value before 2012 carries a calibrated range, days with no satellite are shown as gaps, not as quiet days, and day-by-day values before 2012 are marked indicative.
>
> The result is a burning-activity calendar for any place on Earth, from 2002 to October 2026, that answers one question honestly: is this fire season unusual for this place?
