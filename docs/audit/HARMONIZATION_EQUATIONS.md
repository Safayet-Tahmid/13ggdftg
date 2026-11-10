# SHIFT harmonisation: the equations as implemented

Audit of 8 November 2026, code at commit `a720e72` plus the audit commit. Every equation below is read from the source code at the cited lines. Where the method is a heuristic rather than a derived statistical model, it is labelled as such. Nothing here was added to make the method look more formal than it is.

> **Erratum E1, 11 November 2026.** Statements in this document that the calibrated 95% ranges were "verified on 2012-2015" and hold "94-95% of held-out months" overstate how independent that check was. The verification predictions were fitted without 2012-2015, but the 2012-2015 years were also used in the fits that set the range widths and sorted cells into groups, and in choosing the model. The reported figures (94.9% hotspots, 93.9% fire power, on the 1,743 tested 2.5° cells) are kept as reported, but they are not an independent estimate of coverage, and they do not show that the published ranges contain the true value 95% of the time. Full trace: `SCIENTIFIC_CLAIMS_CORRECTION_2026-11-11.md`. The original text below is kept as it was written, marked [E1] where it applies.

Notation used throughout:

| Symbol | Meaning | Unit |
| --- | --- | --- |
| $g$ | a satellite or satellite group: Terra, Aqua, MODIS (Terra and Aqua merged), S-NPP, NOAA-20 | |
| $i$ | one detection (one FIRMS row) | |
| $c$ | a 0.05° grid cell (about 5.5 km at the equator) | |
| $C$ | a 2.5° factor cell, $P(C)$ its 10° parent tile | |
| $d$ | a UTC calendar day | |
| $m$, $y$ | calendar month (1 to 12), year | |
| $v$ | variable: hotspots (cells) or fire power (frp) | |

## 1. Detection filtering (Level 1)

A detection is kept when every condition holds (`pipeline/shift/ingest.py` `apply_filters`, line 29; thresholds in `config/settings.yaml` lines 57-72):

$$
\text{keep}_i = [\text{valid time}] \wedge [|\phi_i|\le 90,\ |\lambda_i|\le 180] \wedge [g_i \in \mathcal{G}] \wedge [0 \le \mathrm{FRP}_i \le 50000\ \mathrm{MW}] \wedge [\text{day/night} \in \{D,N\}] \wedge [\kappa_i \in \{\text{nominal},\text{high}\}] \wedge [\tau_i = 0 \text{ if known}] \wedge [c_i \notin M]
$$

- $\kappa_i$: confidence class. VIIRS uses its own l/n/h flag. MODIS numeric confidence $q$ is mapped to low if $q<30$, high if $q\ge 80$, nominal otherwise (`adapters/firms_csv.py` line 106). This mapping follows the MODIS Collection 6 user guide convention but the two "low" classes are different tests (about 4 to 5% of MODIS against about 11% of VIIRS fire detections, settings lines 249-252), so dropping "low" removes different shares of each record. The ratio $k$ below absorbs the average difference. It is not modelled separately.
- $\tau_i$: FIRMS `type`. Only 0 (presumed vegetation fire) is kept.
- $M$: the static non-fire mask, cells NASA labelled volcano, industry or offshore in at least two years, applied in every year (D22) plus single-year cells in 50 flare tiles (D26). Built in `static_mask.py` `masked_cells` (line 35) and `factors.py` `final_mask` (line 45).
- Duplicates: rows with identical (satellite, UTC time, latitude, longitude) are removed, archive rows preferred over NRT (`ingest.py` lines 25 and 126). This removes exact repeats only. Repeated observations of one fire by overlapping orbits are handled by the cell-day step, not here.

Failure modes: a real fire inside a masked cell is lost in every year. NRT rows lack `type`, so outside the mask they cannot be filtered by type.

## 2. Cell-day aggregation (Level 2): the hotspot unit

Per satellite $g$, cell $c$ and UTC day $d$ (`aggregate.py` `to_celldays`, line 24; grid `grid.py` line 12):

$$
c(\phi,\lambda) = \left\lfloor \tfrac{\phi+90}{0.05} \right\rfloor \cdot 7200 + \left\lfloor \tfrac{\lambda+180}{0.05} \right\rfloor
$$

$$
H_g(c,d) = \mathbb{1}\Big[\textstyle\sum_{i \in (g,c,d)} 1 > 0\Big], \qquad F_g(c,d) = \sum_{i \in (g,c,d)} \mathrm{FRP}_i \quad [\mathrm{MW}]
$$

$H$ is a **hotspot**: a 0.05° cell with at least one kept detection that day. This is the step that removes most of the pixel-count inflation (one fire is several 375 m VIIRS pixels but usually one 0.05° cell). It does **not** remove the sensitivity difference: VIIRS still finds small fires MODIS misses, so VIIRS has more hotspots. That difference is left to the factor $k$.

For the merged MODIS group (Terra and Aqua) the cell-day is the union of the two satellites (`harmonise.py` `group_frame`, line 211):

$$
H_{\text{MODIS}}(c,d) = \mathbb{1}[H_{\text{Terra}} + H_{\text{Aqua}} > 0], \qquad F_{\text{MODIS}}(c,d) = F_{\text{Terra}}(c,d) + F_{\text{Aqua}}(c,d)
$$

So merged MODIS fire power adds up to four overpasses a day (Terra about 10:30 and 22:30, Aqua about 13:30 and 01:30 local time), while S-NPP has two (about 13:30 and 01:30). $F$ is a sum of instantaneous radiative power over detections and overpasses. It is **not** fire radiative energy. Monthly sums of $F$ are an intensity index in "MW summed over cell-days".

## 3. The cross-sensor factor (the harmonisation itself)

### 3.1 Monthly sums per factor cell

For factor cell $C$ (2.5°), calendar month $m$, year $y$, variable $v$ (`factors.py` class `Cube`, line 156):

$$
A_g(C,m,y) = \sum_{c \in C} \sum_{d \in (m,y)} X_{g,v}(c,d), \qquad X_{g,\text{cells}} = H_g,\ X_{g,\text{frp}} = F_g
$$

Days on which any satellite in the comparison was not fully working (qc coverage table) and zone-days judged data loss (D25) are left out of both sums (settings `factors.exclude_gap_days`, `exclude_data_loss`).

### 3.2 Fit sums over the overlap years

With year weights $w_y = 1$ for the fit years and 0 otherwise, and $a_g(m,y)=1$ when group $g$ saw anything that month anywhere (`factors.py` `Cube.fit`, line 192):

$$
S(C,m) = \sum_y w_y\, a_s(m,y)\, a_r(m,y)\, A_s(C,m,y), \qquad R(C,m) = \sum_y w_y\, a_s(m,y)\, a_r(m,y)\, A_r(C,m,y)
$$

$s$ is the source piece (D19: merged MODIS for 2000-2019, Aqua alone from 2020) and $r$ is the reference, S-NPP. The merged MODIS piece is fitted on **2012-2019** (version test MF3 chose "whole piece", `report_resolution.json`). The Aqua piece is fitted on 2020-2025.

### 3.3 Shrinkage of thin cells (heuristic)

For the chosen variant `fine_shrunk` (D28; `resolution.py` `k_variant` line 59, calling `Cube.fit(..., borrow=True)`, `factors.py` lines 206-211):

$$
k_{W}(m) = \frac{\sum_C R(C,m)}{\sum_C S(C,m)} \quad\text{(world; if } \textstyle\sum S < \mu \text{, the all-year world ratio)}
$$

$$
k_{P}(m) = \frac{R_P(m) + p_v\, k_W(m)}{S_P(m) + p_v}, \qquad R_P = \sum_{C \in P} R(C,\cdot),\ S_P = \sum_{C \in P} S(C,\cdot)
$$

$$
\boxed{\,k(C,m) = \frac{R(C,m) + p_v\, k_{P(C)}(m)}{S(C,m) + p_v}\,}
$$

- $p_v$: prior strength, 30 hotspots for cells and 300 MW for fire power (settings line 224). $\mu$: 30 hotspots or 300 MW (lines 222-223).
- Purpose: a cell with much fire keeps its own ratio, a cell with little fire takes its 10° parent's ratio, which itself leans on the world ratio.
- Status: a **ratio estimator with pseudo-count shrinkage**. It has the form of a Bayesian posterior mean for a ratio with a prior worth $p_v$ units of source fire, but $p_v$ is fixed by hand, not estimated (no empirical-Bayes fit of the prior). It is a heuristic. It was chosen over two alternatives by a rule committed before the run (`resolution.py` docstring lines 24-30; result in `counts__resolution_variants.csv`: score 70.96 against 69.98 unshrunk and 65.72 for 10° tiles).
- Assumptions: (A1) for a given place and calendar month, the ratio of S-NPP to MODIS fire is the same in every year, including the years before 2012 when it cannot be observed. (A2) the ratio is the same for big and small months of that place-month. (A3) the parent tile is a reasonable stand-in for a thin cell.
- When it fails: when a place's mix of fire sizes or fire types changes over time (the ratio then drifts, see the validation report, check A2: significant drift in the Amazon arc and Florida), when one month mixes very different fire regimes, and at cell edges where fire regimes change sharply.
- Each variable has its own factor: $k_{\text{cells}}$ and $k_{\text{frp}}$ are fitted separately (`harmonise.py` line 285 passes `fac(mseg, "cells")` and `fac(mseg, "frp")`).

### 3.4 Applying the factor: the harmonised record (L3)

For a 0.05° cell $c$ in factor cell $C$, day $d$ in month $m$ (`harmonise.py` `harmonise_month` line 219, `take` line 244):

$$
\tilde H(c,d) =
\begin{cases}
H_{\text{S-NPP}}(c,d) & d \ge \text{2012-01-20, S-NPP working} \\
f_{\text{N20}}(C_{10},m)\, H_{\text{NOAA-20}}(c,d) & \text{S-NPP missing in the zone, NOAA-20 working} \\
k(C,m)\, H_{\text{MODIS}}(c,d) & \text{2002-07-04} \le d < \text{2012-01-20} \\
k(C,m)\, f_{\text{Aqua}}(C_{10},m)\, H_{\text{Aqua}}(c,d) & \text{MODIS era, one MODIS satellite missing (hybrid rule)} \\
\text{no data} & \text{no satellite saw the 30° zone}
\end{cases}
$$

and the same with $F$ and the fire-power factors. $f$ are fill factors per 10° tile from stage `nodata` (same ratio estimator), $C_{10}$ the 10° tile. The source of every value is stored (`SOURCES`, `harmonise.py` line 61). Rows are then summed to 0.25° cells (L3, 51,924,300 rows).

So for a MODIS-era hotspot, the record value is **not 1**: it is $k(C,m)$, an expected number of S-NPP-scale hotspots per MODIS hotspot. A single day's value is a scaled observation, which is why day-level values before 2012 are labelled indicative (D30).

### 3.5 Gap rules (D25, D29)

Each 30° zone and day gets a status: primary, filled from a partner, or no data (`nodata.py` `run_nodata`, line 361). A fill is used only where simulated outages showed it beats month scaling (rule in settings lines 311-324). From 1 February 2023 the D19 (Aqua) fill for S-NPP gaps is turned into "no data" (`harmonise.py` `d29_guard`, line 169). "No data" is never written as zero fire.

## 4. Uncertainty of the factor

Per factor cell and month (`harmonise.py` `uncertainty_table`, line 362):

$$
h_0(C,m) = \tfrac12 \ln\frac{k_{97.5}}{k_{2.5}} \quad\text{(200 bootstrap resamples of years, seed 26)}
$$

raised to at least the measured error of borrowed factors, combined in quadrature with the Iberia flag and the confidence drift of the tile. Stage `checks` then recalibrates (`checks.py` `coverage_check`, line 258): for each fallback level $\ell$ and fire bin $b$ (under 30, 30-300, over 300 predicted hotspots a month), the 95th percentile of the absolute log error on the calibration years 2016-2019 (leave one year out), $q_{95}(\ell,b)$, and

$$
h(C,m) = \max\big(h_0(C,m),\ q_{95}(\ell,b)\big), \qquad \text{range}_{95}(C,m) = 100\,(e^{h}-1)\ \%
$$

This was verified on 2012-2015 (backward fit from 2016-2019): 94.9% of held-out cell-months for hotspots and 93.9% for fire power fell inside (target 90-99%). [E1: the verification predictions exclude 2012-2015, but the residuals behind $q_{95}$ come from leave-one-year-out fits on 2012-2019 and the level and bin come from the production fit, so this is not an independent coverage estimate.] Status: an empirical, calibrated interval. It covers the error of the factor only, not detection omission, cloud or commission errors.

The website combines cells into an area range as a fire-weighted mean of cell ranges (`web/src/lib/analysis.js` `areaRange`, line 69):

$$
\text{range}_{95}(\text{area},m) = \frac{\sum_{C} W(C)\,\text{range}_{95}(C,m)}{\sum_C W(C)}, \qquad W(C) = \text{harmonised hotspots in } C \text{ before 2012}
$$

This is equivalent to assuming the cell errors are fully correlated, which is conservative. The checks stage measured that the independent combination already covers 92.9% (hotspots) and 94.2% (fire power) of region-months, and the correlated one 96.2% and 95.4%.

## 5. The 2012 gate statistic

For a region with yearly sums $Y$ (`harmonise.py`, gate from line 557):

$$
\text{step}(Y) = \frac{\overline{Y}_{2013-2015}}{\overline{Y}_{2009-2011}}, \qquad \text{gap} = 100\left(\frac{\text{step}(\tilde H)}{\text{step}(H_{\text{MODIS}})} - 1\right)\ \%
$$

PASS if the global gap is within ±5% for both variables (settings line 506). Result: +0.8% (hotspots), -0.2% (fire power). The raw joined record steps by 2.64× for hotspots.

Interpretation that must go with it: because $\tilde H = H_{\text{S-NPP}}$ after 2012 and $k\,H_{\text{MODIS}}$ before, the gap equals the ratio of $\overline{H_{\text{S-NPP}}/H_{\text{MODIS}}}$ over 2013-2015 to the fitted factor. The fit years 2012-2019 **include** 2013-2015, so the gate is a consistency check that the ratio in those years matches the multi-year factor. It is not an out-of-sample test. The out-of-sample tests are in section 7.

## 6. Anomaly classes (calendar colours)

For an area, calendar month $m$, year $y$ with value $V$ (`web/src/lib/analysis.js` `monthly`, line 21; same thresholds as `selection.py` `classify`, line 105):

$$
z = \frac{\ln(1+V_{y,m}) - \mu_m}{\max(\sigma_m, 0.05)}, \quad \mu_m, \sigma_m = \text{mean and SD of } \ln(1+V) \text{ over complete months of 2003 to the last full year}
$$

$$
\text{class} = \text{low } (z<-1),\ \text{normal } (-1\le z<1),\ \text{unusual } (1 \le z < 2),\ \text{critical } (z \ge 2)
$$

Months with any no-data day, incomplete months and the Terra-only months of 2002 are not classed. At least 5 baseline years are required. Status: a standard log-normal z rule. It assumes roughly log-normal month totals. The $+1$ offset matters for small values. The thresholds are conventional, not fitted.

## 7. Out-of-sample tests used to choose and check the model

Prediction for test year $y$ from fit years $\mathcal F$ not containing $y$ (`resolution.py` `predict_v`, `checks.py` `preds`):

$$
\hat A_r(C,m,y) = k_{\mathcal F}(C,m)\, A_s(C,m,y)
$$

- Leave one year out over 2012-2019, and backward: fit 2016-2019 (2016-2025 for some stages), predict 2012-2015.
- Category agreement: the share of held-out cell-months whose class (section 6, with an S-NPP baseline) is the same for $\hat A_r$ as for the real $A_r$ (`selection.py` `score`, line 110). The headline "score" is the fire-weighted mean over tested 2.5° cells of the leave-one-year-out and backward agreements, averaged over the two variables (`checks.py` `judge_preds`, line 79). This metric is SHIFT's own. It rewards getting the calendar colour right, which is what the website shows, but it is not a standard skill score.
- Backward total error: $100\,(\sum \hat A_r / \sum A_r - 1)$ per cell, summarised as a fire-weighted median of its absolute value.

## 8. Website calculations

| Quantity | Formula | Code |
| --- | --- | --- |
| Area membership | 1° cells whose centre lies in the box or country polygon. If none, the cell containing the area's centre | `web/src/lib/area.js` `boxCells` line 42, `countryArea` line 75 |
| Daily area value | $\sum_{c\in\text{area}} \tilde H(c,d)$ from the exported 1° daily tiles | `web/src/lib/data.js` `areaSeries` line 142 |
| No-data day | any 30° zone touched by the area has status "no data" | same |
| Window against other years (D32) | same calendar dates in every year from 2003, years with a no-data day left out. Median of the baseline years without the target year, rank among all usable years with the target | `analysis.js` `compareWindow` line 93 |
| Season | mean value per day of year over the baseline years (Feb 29 folded), 31-day circular moving average, cumulated from the quietest day. Start and end at 10% and 90%, peak at the maximum | `analysis.js` `season` line 137 |
| Cloud flag on a month | MERRA-2 cloud above the 90th percentile of 2003-2025 for that cell and month, in factor cells holding at least half the area's fire | `analysis.js` `cloudMonths` line 56, `pipeline/shift/checks.py` `cloud_check` line 733 |

The season and window calculations are descriptive statistics, not forecasts.

## 9. Worked example (real annual totals, simplified)

The production factor is per 2.5° cell and month, so this example uses one global factor only to show the arithmetic. Numbers are from `validation/l3__yearly_totals.csv` in the published site data.

1. Global S-NPP hotspots 2013-2019 divided by merged MODIS hotspots 2013-2019 gives $k \approx 2.732$.
2. Merged MODIS hotspots in 2010: 2,381,182.
3. One-factor estimate for 2010: $2.732 \times 2{,}381{,}182 \approx 6{,}505{,}378$ S-NPP-scale hotspots.
4. The record (cell-and-month factors) has 6,513,018 for 2010, 0.12% higher.

For fire power the same steps give $k \approx 0.894$ and an estimate 3.5% below the record. The factor for fire power is below 1 because merged MODIS adds up to four overpasses of FRP a day against two for S-NPP, and because, for fires seen by both, published comparisons find lower FRP from VIIRS 375 m than from MODIS (Fu et al. 2020, see the methodology report, references).
