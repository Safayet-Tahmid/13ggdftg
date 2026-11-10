# SHIFT: Scientific Methodology, Validation, and Reproducibility of MODIS–VIIRS Active Fire Hotspot Harmonization

Independent audit, 8 November 2026 · Team Squadron Zero · NASA Space Apps Challenge 2026, Challenge 9

> **Erratum E1, 11 November 2026.** Statements in this document that the calibrated 95% ranges were "verified on 2012-2015" and hold "94-95% of held-out months" overstate how independent that check was. The verification predictions were fitted without 2012-2015, but the 2012-2015 years were also used in the fits that set the range widths and sorted cells into groups, and in choosing the model. The reported figures (94.9% hotspots, 93.9% fire power, on the 1,743 tested 2.5° cells) are kept as reported, but they are not an independent estimate of coverage, and they do not show that the published ranges contain the true value 95% of the time. Full trace: `SCIENTIFIC_CLAIMS_CORRECTION_2026-11-11.md`. The original text below is kept as it was written, marked [E1] where it applies.

This audit was carried out by the same AI system (Claude) that wrote SHIFT's code, at the team's request, with the instruction to review it critically and not to defend it. The reader should weigh it with that in mind. Every claim about the implementation cites a file and line. Every number cites a report or an audit table. Statements are marked as **[fact]** (established science, with a reference), **[code]** (what the implementation does), **[measured]** (a result from a report or from this audit) or **[hypothesis]** (an interpretation not tested here).

Companion documents in this folder: HARMONIZATION_EQUATIONS.md (the mathematics), VALIDATION_REPORT.md (all results), SCIENTIFIC_LIMITATIONS.md, REPRODUCIBILITY_GUIDE.md, NASA_JUDGING_EXPLANATION.md, SCIENTIFIC_IMPROVEMENT_PLAN.md.

---

## 1. Executive scientific summary

SHIFT is a calibrated overlap-period harmonisation, not a concatenation. It (1) turns every FIRMS detection into a hotspot, a 0.05° cell with fire on a UTC day, which removes most of the pixel-count difference, and (2) multiplies the MODIS years by a ratio of S-NPP to MODIS fire measured for each 2.5° cell and calendar month over 2012-2019, shrunk towards its 10° parent where fire is thin **[code]**.

What the evidence supports **[measured]**:
- The 2012 artefact is removed at global scale: raw joined record 2.64× step, SHIFT 0.972×, MODIS alone 0.964×. The 0.8% gap is at the noise level of the ratio itself (1.0%).
- On held-out VIIRS years SHIFT predicts S-NPP from MODIS with a typical 4% error per 2.5° cell (backward test), against 12% for the best simpler method and 63% for joining the records.
- Long-term trends 2003-2019 match MODIS alone within 0.62 percentage points a year in all test regions. The raw joined record is off by up to 15.6.
- The calibrated 95% ranges contain 94-95% of held-out months. [E1: not independently verified]
- The published website reproduces the pipeline's regional totals exactly.

What it does not support:
- That the factors are correct before 2012 beyond the stability seen in 2012-2019. This cannot be tested, and two regions (Florida, Amazon arc) show drifting ratios.
- Day-level accuracy before 2012 (median cell-day error 86%). The website labels those days indicative.
- Superiority over published state-of-the-art methods. None was implemented for comparison.

No scientific blocker was found for the product as defined (monthly, regional, with ranges). Two public statements overclaimed and were corrected during the audit. The weakest parts are the untestable pre-2012 assumption and the lack of a validation reference independent of MODIS.

## 2. Research problem and motivation

**[fact]** MODIS (Terra from 2000, Aqua from mid-2002) and VIIRS (S-NPP from 2012, NOAA-20 from 2018) both map active fires, but VIIRS 375 m data detect smaller fires and more fire pixels than MODIS 1 km data (Schroeder et al. 2014). A record joined at 2012 shows a jump that comes from the instrument. **[measured]** In SHIFT's global data the raw jump is 2.64× in hotspots. **[fact]** Long-term fire analysis needs one scale: the published global burned area decline of 1.35% a year over 1998-2015 (Andela et al. 2017) is smaller than the instrument jump, so an unharmonised record would reverse its sign.

The challenge asks for a burning activity calendar from harmonised hotspots that lets responders, scientists and land managers examine historical patterns, unusual conditions and critical periods for a chosen area.

## 3. Satellite products and data provenance

**[code]** Sources (`config/settings.yaml` `fetch`, lines 530-558; `docs/DATA_CONTRACT.md`):

| Product | Satellite | Resolution | Source | Years in SHIFT |
| --- | --- | --- | --- | --- |
| MODIS Collection 6.1 active fire (MCD14ML archive, MCD14DL NRT) | Terra, Aqua | 1 km | FIRMS yearly world files `modis_<year>_all_countries.zip` | 2002-2025, 2026 from a FIRMS form download |
| VIIRS 375 m active fire (VNP14IMGT / VNP14IMGTDL) | Suomi NPP | 375 m | FIRMS yearly files `viirs-snpp_<year>_...` | 2012-2025, 2026 form download |
| VIIRS 375 m active fire (VJ114IMGT / NRT) | NOAA-20 | 375 m | FIRMS yearly files `viirs-jpss1_<year>_...` | 2018-2025, 2026 form download |
| GFED4.0 monthly burned area without small fires (MCD64A1-based) | Terra, Aqua (reflectance) | 0.25° | ORNL DAAC doi:10.3334/ORNLDAAC/1293 | 2003-2016, check only |
| MERRA-2 total cloud fraction, M2TMNXRAD v5.12.4 CLDTOT | reanalysis | about 0.5° | GES DISC | 2003 to 2026-08, cloud flag only |

Base URL `https://firms.modaps.eosdis.nasa.gov/data/country/zips/` (`fetch.py` line 43). FIRMS DOIs: MODIS doi:10.5067/FIRMS/MODIS/MCD14ML, S-NPP doi:10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002, NOAA-20 doi:10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002.

Fields read: latitude, longitude, acquisition date and time (UTC), satellite, confidence, FRP, day/night flag, type, scan, track (`adapters/firms_csv.py` `_to_l1`, line 82).

Coverage: global, 2002-01-01 to 2026-10-28 (the newest downloaded day is cut off and shown as no data). January to June 2002 is Terra only and not comparable (D20). **[measured]** 51,924,300 Level 3 rows: S-NPP 38.7 M, MODIS × k 12.3 M, NOAA-20 fill 0.50 M, Terra-only 0.27 M, Aqua fill 0.05 M, Terra fill 0.04 M, D19 fill 0.02 M (`report_harmonise.json`).

Refresh: manual. Yearly files are fetched once. The 2026 part is a FIRMS form download (about 30 October). There is no automatic update (D34). Raw files are not archived publicly. NOAA-21 is not used (D35).

## 4. MODIS–VIIRS observational differences

| Difference | Fact | What SHIFT does **[code]** |
| --- | --- | --- |
| Pixel size (1 km against 375 m at nadir) | One fire spans more VIIRS pixels | Counts 0.05° cell-days, not detections (`aggregate.py` line 24) |
| Detection sensitivity | VIIRS 375 m detects smaller fires (Schroeder et al. 2014). Monthly MODIS FRP is lower than VIIRS in low-biomass land because MODIS misses fires, while for fires both detect VIIRS FRP is lower (Fu et al. 2020) | Absorbed on average by the factor per 2.5° cell and calendar month. Not modelled by fire size |
| Overpass times | Terra about 10:30/22:30, Aqua and S-NPP about 13:30/01:30 | Merged MODIS (four looks) is fitted to S-NPP (two) per place and month. Terra's post-2020 drift handled by D19 (Aqua alone from 2020) |
| Day and night | Both kept. Counts per day/night are stored | Not separated in the factor |
| Repeated observations of one fire | Overlapping orbits, several detections | Cell-day counting gives one hotspot. FRP still adds up |
| Confidence semantics | MODIS low = numeric < 30, VIIRS low = its own class, different tests | Low dropped for both (D24). The remaining asymmetry is absorbed by the factor |
| FRP comparability | Retrievals differ between sensors (Li et al. 2018; Fu et al. 2020) | Separate factor for fire power. Fire power is presented as an index |
| Coverage changes, outages | Satellite gaps, S-NPP gap 28 Apr to 2 Jun 2026 | Zone-day status: primary, filled from a tested partner, or no data (D25) |
| Non-fire heat | Gas flares, industry, volcanoes | Type 0 only, plus a static mask in every year (D22, D26) |
| Sensor era change at 2012-01-20 | The core discontinuity | MODIS years multiplied by $k$, S-NPP native after |

This is harmonisation in the sense of calibrating one record to another's scale using a measured overlap relationship. It is not a physical correction of each instrument's detection probability.

## 5. Complete harmonisation methodology

Pipeline order (`docs/RUNBOOK.md`): fetch, ingest and aggregate → scan (non-fire cells) → qc (satellite health) → confscan, confidence (D24) → nodata (zone-day status, fill tests, D25) → places (D26) → factors (D21) → resolution (D28) → daily (time scales, day basis) → external (GFED, MERRA-2) → harmonise (the record, L3) → checks → export (website files).

Step by step, with what is lost or distorted:

1. **Filtering** (`ingest.py` `apply_filters`, line 29). Invalid time, coordinates, satellite, FRP outside 0-50,000 MW, day/night not D or N, low confidence, non-vegetation type, masked static cells. Each rejection is counted. Lost: low-confidence real fires (more for VIIRS), real fires in masked cells.
2. **Duplicates** (`ingest.py` lines 25 and 126). Exact repeats only, archive preferred over NRT.
3. **Cell-days** (`aggregate.py` line 24). Per satellite, 0.05° cell and UTC day: count, FRP sum, day and night counts. Lost: the number of detections inside a cell (kept as a column but not used by the factor), sub-cell location, time of day.
4. **Merged MODIS** (`harmonise.py` `group_frame`, line 211). Union of Terra and Aqua cell-days, FRP summed.
5. **Factors** (`factors.py` `Cube.fit`, line 192; `resolution.py` `k_variant`, line 59). Ratio of S-NPP to MODIS sums over 2012-2019 per 2.5° cell and month, shrunk towards the 10° parent, separate for hotspots and FRP, gap days and data-loss zone-days left out of the sums.
6. **Record** (`harmonise.py` `harmonise_month`, line 219). S-NPP native from 2012-01-20, MODIS × k before, fills from tested partners, no data where no satellite saw the 30° zone. Source code stored per row.
7. **Uncertainty** (`harmonise.py` line 362, `checks.py` line 258). Bootstrap range raised to measured errors, then recalibrated by fallback level and fire bin to 95% coverage.
8. **Export** (`export.py` line 133). Daily values summed to 1° cells in 10° tiles, monthly 0.25° map layers, zone status, ranges, cloud flags, reports.
9. **Website** (`web/src/lib/`). Sums for the chosen area, monthly classes, window comparisons, season timing, downloads.

## 6. Mathematical equations and assumptions

See HARMONIZATION_EQUATIONS.md. The central equation **[code]**:

$$
k(C,m) = \frac{R(C,m) + p\,k_{P(C)}(m)}{S(C,m) + p}, \qquad \tilde H(c,d) = k(C,m)\,H_{\text{MODIS}}(c,d) \text{ before 2012-01-20}
$$

Assumptions: (A1) the ratio per place and calendar month is the same in every year. (A2) It does not depend on how much fire a month has. (A3) A thin cell behaves like its parent. The shrinkage prior $p$ is set by hand (30 hotspots, 300 MW), so this is a heuristic ratio estimator, not a fitted hierarchical model.

## 7. Calibration and parameter justification

| Decision | Method | Code | Rationale | External support | Alternatives tested | Limitation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hotspot unit | 0.05° cell-day | `aggregate.py` 24 | Removes pixel-count inflation, matches v1 | Indirect: the pixel-size difference is documented (Schroeder 2014) | Raw detections (score 27.3 hotspots, in "no harmonisation") | Sensitivity difference remains | Tested |
| Calibration period | 2012-2019 for merged MODIS | version test, `resolution.py` 211 | Terra and Aqua stable. 2018 processing change tested | Indirect | 2012-2017 only (score 68.10 against 68.64) | Pre-2012 untestable | Tested in sample period |
| Factor resolution | 2.5° shrunk to 10° | `resolution.py` 59 | Detection ratio varies with fire regime | Indirect: detection probability varies regionally with fire size (Giglio et al. 2016) | 10°, 2.5° unshrunk | Prior set by hand | Tested (backward, LOYO) |
| Per calendar month | yes | `factors.py` 192 | Season changes fire types | Indirect | One factor for all months (score lower, `simple_methods`) | Thin months use the fallback | Tested |
| Separate FRP factor | yes | `harmonise.py` 285 | FRP retrieval and overpass count differ | Li et al. 2018, Fu et al. 2020 (differences documented) | v1 line (score 58.6 on FRP) | Fire power stays an index | Tested |
| MODIS source pieces | merged to 2019, Aqua from 2020 | settings `counts.source_segments` | Terra orbit drift from 2020 | Project documents [not checked by this audit] | merged, Aqua, Terra alone | Aqua drifts after 2022 (2026 test FAIL on FRP) | Tested by rule (D19) |
| Confidence | drop low for both | settings 64-72 | Commission errors | MODIS C6 user guide convention | keep low (gain 1.22 < 2 needed) | Different tests per sensor | Tested (D24) |
| Gap filling | partner substitute or hybrid, never zero | `nodata.py` 361 | Missing is not zero | none needed | zero, scale, substitute, hybrid | 30° zones are coarse | Tested by simulated outages |
| Baseline | 2003 to last full year | `analysis.js` 21 | Comparable record (D20) | none | | Mixes eras (limitation 4) | Documented |
| Anomaly thresholds | z = -1, 1, 2 on log(1+x) | `selection.py` 105 | Simple and stated | convention | era-fair spread (failed rule) | MODIS-era false alarms 26-35% | Measured |
| Day basis | UTC | `daily.py` 79 | Local day did not win by the rule | none | local solar day | Date shifts far from Greenwich | Tested |
| Shrinkage prior | 30 hotspots, 300 MW | settings 224-225 | Order of the minimum for an own factor | none | not varied | Arbitrary | Documented only |

## 8. Validation experiments and results

Summary (detail and sources in VALIDATION_REPORT.md):

| Experiment | Result | Independent? |
| --- | --- | --- |
| Backward test 2012-2015 from 2016-2019 | 4.0% / 4.2% typical cell error, best of five methods | Out of sample in time, VIIRS era |
| Leave one year out | part of score 69.3 | Out of sample in time |
| Untouched 2026 | NOAA-20 PASS (0.07% / 0.99%), Aqua FAIL on FRP (-19%) | Out of sample, after the fit |
| Coverage of 95% ranges | 94.9% / 93.9% | Calibrated 2016-2019, verified 2012-2015. [E1: partly, 2012-2015 also entered the calibration fits] |
| 2012 gate | +0.8% / -0.2% | Partly in sample |
| Placebo gaps (audit) | global 1.0% / 2.1%, regions about 3-10% | Noise reference |
| Ratio stationarity (audit) | global stable, Florida and Amazon drift | Tests the core assumption within 2012-2019 |
| Trend preservation (audit) | within 0.62 points a year of MODIS alone | Partly by construction |
| GFED4.0 (pipeline and audit) | global PASS, SHIFT within about 7 points of MODIS alone, raw +21% to +708% | Burned area, MODIS-derived |
| Known events | 7 of 8 | Does not separate methods |
| Day-level skill | cell-day 86% error, region-month 12.7% | Out of sample |
| Website integrity (audit) | exact match to pipeline totals | Implementation check |

## 9. Historical time-series continuity assessment

**[measured]** Global hotspots: raw joined trend 2003-2019 +6.25% a year (an artefact), MODIS alone -1.10%, SHIFT -1.13%. **[fact]** The published decline in global burned area is -1.35% a year (1998-2015, Andela et al. 2017). **[hypothesis]** SHIFT's decline is consistent with that human-driven decline. Different quantities and periods, so this is consistency, not proof.

Coverage and sampling changes were checked before treating differences as errors. Gap days are excluded from fits and marked in the record. The 2018 MODIS processing change was tested (MF3). Terra's drift led to D19 and Aqua's drift to D29. Cloud was tested as a cause of low months (low months cloudy 23.2% against 13.4%).

## 10. Burning-calendar aggregation methodology

**[code]** The calendar value is harmonised hotspots (or fire power) summed over the 1° cells whose centre is in the chosen area, per UTC day (`web/src/lib/data.js` line 142). Months and years are sums of those days. Missing data are gaps (hatched), never zeros. Classes are z-scores of log(1+month) against the area's own 2003 to last-full-year months (`analysis.js` line 21). Window comparisons use the same dates in every year, drop years with gaps, and rank the target among all usable years (`analysis.js` line 93).

**[measured]** Site totals equal the pipeline's yearly totals exactly. The cut-off day is no data in every zone. Daily, monthly and CSV outputs agree in browser tests. Hotspots are never called fires.

Meets the challenge objective at month and region scale: harmonised hotspot calendar from 2002, area selection by preset, country, coordinates or drawing, current period against the historical median, accessible colours, CSV and image downloads. Not met: "number of fires reported" (no event identification, no reported-fire data) and live data.

## 11. Comparison against alternative techniques

| Method | Validity | Continuity at 2012 | Detection bias | Cost | Data needs | Interpretability | Uncertainty | Use for responders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Raw concatenation | Invalid across 2012 | 2.64× jump | Uncorrected | None | FIRMS | High but misleading | None | Misleading |
| MODIS only | Valid, consistent | No switch | Misses small fires | Low | FIRMS | High | Sampling only | Valid but coarser, Terra/Aqua ageing after 2020 |
| VIIRS only | Valid from 2012 | n/a | Best detection | Low | FIRMS | High | Sampling only | Short baseline (14 years) |
| Common grid, no calibration | Partly | Still jumps (cell counts 2.7× higher) | Sensitivity uncorrected | Low | FIRMS | High | None | Misleading |
| One global ratio | Partly | Global yes, regional no | Average only | Low | Overlap years | High | Simple | Regional errors 18% |
| One ratio per 10° region | Better | Regional gaps up to 15.5% | Regional average | Low | Overlap | High | Simple | 12% error |
| **SHIFT** (2.5° cell × month, shrunk, gap rules) | Best measured of these | Global 0.8%, regions under ±10% | Place-month average | Moderate (several hours on free Colab for the full chain) | Overlap, gap tests | Moderate | Calibrated 95% ranges | Month and region |
| Quantile mapping / detection-probability models (literature) | Potentially better for distributions | Not tested here | Can model fire size | Higher | Coincident overpasses | Lower | Model-based | Not compared |

**A. Valid advantages.** Place-and-season-specific calibration, removal of pixel inflation before calibration, tested gap rules that never write zero for missing data, calibrated ranges, NOAA-20 continuity past Suomi NPP, full provenance.

**B. Measured advantages.** Lower backward error and higher category agreement than four simpler methods, no global 2012 artefact, trends preserved relative to MODIS alone, calibrated coverage of 94-95%.

**C. Supported by code but not validated experimentally.** The shrinkage prior strength, the season timing on the website, the area uncertainty combination for areas outside the test regions, the cloud flag's usefulness to users, the country and point areas.

**D. Weak or possibly incorrect assumptions.** Ratio stationarity before 2012 (drifts in Florida and Amazon arc), FRP sums as a comparable intensity measure, 30° zones for availability, UTC days for daily comparisons.

**E. Demonstrably better than simpler alternatives?** Yes, against the four simpler methods tested, on held-out VIIRS years, by the team's metric and by backward error. Not demonstrated against published advanced methods.

**F. Evidence needed to call it state of the art.** Comparison with a published harmonisation method on the same data, validation against independent reference data (for example Landsat-based burned area), a fully out-of-sample gate, a physically based detection model or evidence that one is not needed, peer review.

**G. What a skeptical NASA scientist would challenge.** "Your gate is in sample." "How do you know the ratio held in 2005?" "FRP sums from different overpass counts are not comparable." "Your score is your own metric." "GFED is MODIS too." "Your rules were fixed before each run, but you chose which runs to do after seeing results." "Why a fixed prior of 30?" "Hotspots are not fires." Each is answered with its limitation in NASA_JUDGING_EXPLANATION.md and SCIENTIFIC_LIMITATIONS.md.

## 12. Uncertainty and scientific limitations

See SCIENTIFIC_LIMITATIONS.md (14 items). The three that matter most: the untestable pre-2012 ratio, validation that is internal to the VIIRS era, and poor day-level accuracy before 2012.

## 13. Reproducibility and code references

See REPRODUCIBILITY_GUIDE.md: file inventory, data flow, versions, parameters, hidden constants, schemas, provenance, rebuild steps. Tests: 63 passed, 1 skipped on the audit machine (64 passed on Colab). Audit checks: `validation/audit_site_data.py`, results in `validation/results/`.

## 14. Conclusions supported by the available evidence

**[measured]** SHIFT removes the 2012 MODIS-to-VIIRS artefact from the global hotspot and fire power record and keeps long-term trends consistent with MODIS alone. At month and region scale its MODIS-era values predict held-out S-NPP months with errors of a few percent per 2.5° cell and about 13% per region-month, better than every simpler method tested. Its calibrated ranges are honest for the factor error. The published calendar reproduces the record exactly.

**[hypothesis, untested]** The same accuracy holds for 2003-2011.

## 15. Remaining research and validation requirements

See SCIENTIFIC_IMPROVEMENT_PLAN.md. In order: put the measured ratio drift into the pre-2012 uncertainty, run a fully out-of-sample gate, compare with independent burned-area references, strict JSON, then detection-probability modelling and event identification.

## 16. References

- Andela, N., et al. (2017). A human-driven decline in global burned area. *Science* 356(6345), 1356-1362. https://doi.org/10.1126/science.aal4108
- Fu, Y., et al. (2020). Fire detection and fire radiative power in forests and low-biomass lands in Northeast Asia: MODIS versus VIIRS fire products. *Remote Sensing* 12(18), 2870. https://www.mdpi.com/2072-4292/12/18/2870
- Giglio, L., Schroeder, W., & Justice, C. O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. *Remote Sensing of Environment* 178, 31-41. https://doi.org/10.1016/j.rse.2016.02.054
- Giglio, L., Schroeder, W., Hall, J. V., & Justice, C. O. (2018). MODIS Collection 6 Active Fire Product User's Guide, Revision B. https://www.earthdata.nasa.gov/sites/default/files/imported/MODIS_C6_Fire_User_Guide_B.pdf
- Giglio, L., Randerson, J. T., & van der Werf, G. R. (2013). Analysis of daily, monthly, and annual burned area using the fourth-generation global fire emissions database (GFED4). *Journal of Geophysical Research: Biogeosciences* 118, 317-328. https://doi.org/10.1002/jgrg.20042
- Li, F., Zhang, X., Kondragunta, S., & Csiszar, I. (2018). Comparison of fire radiative power estimates from VIIRS and MODIS observations. *Journal of Geophysical Research: Atmospheres* 123, 4545-4563.
- Schroeder, W., Oliva, P., Giglio, L., & Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment. *Remote Sensing of Environment* 143, 85-96. https://doi.org/10.1016/j.rse.2013.12.008
- Gelaro, R., et al. (2017). The Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2). *Journal of Climate* 30, 5419-5454. https://doi.org/10.1175/JCLI-D-16-0758.1
- NASA FIRMS data: MODIS doi:10.5067/FIRMS/MODIS/MCD14ML; VIIRS S-NPP doi:10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002; VIIRS NOAA-20 doi:10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002.
- GFED4.0 monthly burned area, ORNL DAAC. doi:10.3334/ORNLDAAC/1293.

---

## Final independent verdict

Scores are the auditor's judgement on the evidence above (10 = no material weakness found).

| Category | Score / 10 | Evidence | Major weaknesses |
| --- | --- | --- | --- |
| Data provenance | 7 | FIRMS products with DOIs, provenance stamp (commit, settings hash, versions) on every report | Raw files not archived publicly; 2026 from form downloads; FIRMS may reprocess |
| Preprocessing integrity | 7 | Every rejection counted by reason; tested filters; non-fire mask in every year | Exact duplicates only; confidence asymmetry absorbed, not modelled |
| Spatial comparability | 7 | Cell-day unit; 2.5° factors beat 10° (regional gap 5.4% against 15.5%) | Sensitivity difference only averaged; 1° area edges on the site |
| Temporal comparability | 7 | Global gate at noise level; trends within 0.62 points a year of MODIS alone | Pre-2012 assumption untestable; day level poor before 2012; regional gaps near ±10% |
| Sensor bias management | 7 | Per-place, per-month factors; D19, D29 for orbit drift; NOAA-20 tied in | No detection-probability model; FRP overpass counts differ |
| Statistical justification | 6 | Rules committed before each run; out-of-sample selection | Hand-set prior; bespoke score; adaptive sequence of tests |
| Validation quality | 6 | Backward, leave-one-year-out, untouched 2026, coverage, GFED, placebo noise | Truth is VIIRS-era only; gate partly in sample; events test not discriminating; GFED is MODIS-derived |
| Uncertainty assessment | 7 | Calibrated 95% ranges reported at 94-95% [E1: not independently verified]; flags for cloud, era, no data | Factor error only; bootstrap alone covered 40-47% |
| Reproducibility | 7 | Code, settings, 64 tests, CI, provenance, public audit script | Needs FIRMS downloads, Colab and Drive; not byte-reproducible |
| Suitability for the NASA challenge | 8 | Calendar, area selection, median comparison, downloads, accessible colours, offline | No live data; no fire counts or reported fires |

### Prioritised correction plan

- **P0:** none outstanding. Two public overclaims corrected on 8 November (Iberia sentence, fire power units).
- **P1:** pre-2012 drift in the uncertainty; fully out-of-sample gate; flag drifting regions; independent reference; strict JSON; a discriminating events test.
- **P2:** independent area ranges; finer no-data zones; 0.25° area sums; gap multiplier on the site; era-balanced anomaly baseline; NOAA-21; NRT.
- **P3:** detection-probability model; quantile mapping comparison; fire radiative energy; event identification; a pre-2012 bridge sensor.

Details, files and validation steps: SCIENTIFIC_IMPROVEMENT_PLAN.md.

### 1. The strongest claims SHIFT can make now

1. Joining MODIS and VIIRS creates a 2.6× jump in global hotspots at 2012. SHIFT removes it: its 2012 step matches MODIS alone within 0.8%, inside the 1% year-to-year noise of the sensor ratio.
2. On years it never saw, SHIFT predicts VIIRS from MODIS with a typical error of 4% per 2.5° cell, three times better than one ratio per region and fifteen times better than joining the records.
3. SHIFT's long-term trends match MODIS alone, the one instrument that flew throughout, within 0.62 percentage points a year in all ten test regions and the world.
4. Its 95% ranges contain 94-95% of held-out months [E1: in a check that was not fully independent], and missing satellite days are shown as gaps, never as quiet days.
5. It does this for any area on Earth, monthly from 2003 to October 2026, in a website that works offline.

### 2. Evidence needed before calling SHIFT a highly reliable, state-of-the-art harmonised record

1. A test of the factors before 2012 against data independent of MODIS (for example Landsat-based burned area in selected regions), or a demonstration that the ratio was stable before 2012 by an independent route.
2. A fully out-of-sample 2012 test (factors fitted without 2013-2015) that still passes.
3. Comparison on the same data with at least one published multi-sensor harmonisation method.
4. Pre-2012 uncertainty that includes the measured ratio drift, verified by a longer backward test.
5. Independent review of the method and code.
