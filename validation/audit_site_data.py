"""Independent checks of the published SHIFT record, run only on the public site data.

Written for the 8 Nov 2026 scientific audit (docs/audit/VALIDATION_REPORT.md). It reads the
files the website serves (site_data.zip from the GitHub release `site-data`), so anyone can
rerun it without the team's Google Drive. It never changes the record.

    python validation/audit_site_data.py /path/to/site_data_folder [--out validation/results]

Checks
  A1 export integrity        daily tiles summed per region and year vs the pipeline's yearly totals
  A2 ratio stationarity      S-NPP / MODIS per region and year over the fit years (the core assumption)
  A3 2012 step and noise     the gate's step gap, and the same gap at placebo years
  A4 trend preservation      Theil-Sen trend 2003-2019: harmonised vs MODIS alone vs raw joined
  A5 burned-area reference   fire per GFED4 burned area before and after 2012 (2003-2016)
  A6 suspicious low days     MODIS-era days far below their neighbours but not marked "no data"

Every number written by this script is measured from the files. Interpretation is in the report.
"""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

# The D18 test regions, [west, south, east, north] (config/settings.yaml regions.test)
REGIONS = {
    "florida": [-87.6, 24.5, -80.0, 31.0], "africa_savanna": [15.0, 4.0, 30.0, 12.0],
    "australia_savanna": [129.0, -17.0, 138.0, -11.0], "amazon_arc": [-64.0, -13.0, -52.0, -7.0],
    "siberia_boreal": [100.0, 55.0, 130.0, 65.0], "iberia_med": [-9.5, 36.0, 3.5, 44.0],
    "punjab_crop": [73.0, 27.0, 80.0, 32.0], "bangladesh": [88.0, 20.5, 92.7, 26.7],
    "kalimantan_peat": [109.0, -4.0, 118.0, 2.0], "java_volcanic": [105.0, -9.0, 115.0, -6.0],
    "global": [-180.0, -90.0, 180.0, 90.0],
}
ALIGNED = {k for k, b in REGIONS.items() if all(float(x).is_integer() for x in b)}
FIT_YEARS = list(range(2012, 2020))       # the merged-MODIS piece is fitted on 2012-2019 (D19, MF3 "whole piece")


# ---------------------------------------------------------------- reading the site files
def unpack_daily(b: bytes) -> pd.DataFrame:
    """Same layout as pipeline/shift/export.py pack_daily."""
    n = int(np.frombuffer(b[:4], "<u4")[0])
    o = 4
    cells = np.frombuffer(b[o:o + 4 * n], "<f4"); o += 4 * n
    frp = np.frombuffer(b[o:o + 4 * n], "<f4"); o += 4 * n
    day = np.frombuffer(b[o:o + 2 * n], "<u2"); o += 2 * n
    cell = np.frombuffer(b[o:o + n], "u1").astype("int16"); o += n
    src = np.frombuffer(b[o:o + n], "u1")
    return pd.DataFrame({"cells": cells.astype(float), "frp": frp.astype(float), "day": day, "cell": cell, "src": src})


def load_daily(site: Path, meta: dict) -> pd.DataFrame:
    """Every daily row of every tile, with the 1-degree cell centre."""
    parts = []
    for name, t in meta["tiles"].items():
        d = unpack_daily(gzip.open(site / "daily" / f"{name}.bin.gz").read())
        d["lat"] = t["lat0"] + d["cell"] // 10 + 0.5
        d["lon"] = t["lon0"] + d["cell"] % 10 + 0.5
        parts.append(d.drop(columns="cell"))
    out = pd.concat(parts, ignore_index=True)
    dates = pd.to_datetime(meta["start"]) + pd.to_timedelta(out["day"].astype(int), unit="D")
    out["year"], out["month"] = dates.dt.year.to_numpy(), dates.dt.month.to_numpy()
    return out


def in_box(df: pd.DataFrame, b) -> np.ndarray:
    return ((df["lon"] >= b[0]) & (df["lon"] <= b[2]) & (df["lat"] >= b[1]) & (df["lat"] <= b[3])).to_numpy()


# ---------------------------------------------------------------- statistics
def theil_sen(x: np.ndarray, y: np.ndarray) -> float:
    """Median of pairwise slopes (robust trend)."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    i, j = np.triu_indices(len(x), 1)
    dx = x[j] - x[i]
    ok = dx != 0
    return float(np.median((y[j] - y[i])[ok] / dx[ok])) if ok.any() else float("nan")


def pct_trend(years, values) -> float:
    """Theil-Sen trend of log(values) in % per year (0 = no trend)."""
    v = np.asarray(values, float)
    ok = v > 0
    if ok.sum() < 4:
        return float("nan")
    return float(100 * (np.exp(theil_sen(np.asarray(years)[ok], np.log(v[ok]))) - 1))


def bootstrap_ci(years, values, fn, n: int = 2000, seed: int = 8) -> tuple[float, float]:
    """95% interval of fn(years, values) resampling years with replacement."""
    rng = np.random.default_rng(seed)
    years, values = np.asarray(years), np.asarray(values, float)
    out = []
    for _ in range(n):
        idx = rng.integers(0, len(years), len(years))
        if len(np.unique(years[idx])) < 3:
            continue
        out.append(fn(years[idx], values[idx]))
    out = np.asarray([v for v in out if np.isfinite(v)])
    return (float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))) if len(out) else (float("nan"), float("nan"))


def step(series: pd.Series, at: int, k: int = 3) -> float:
    """mean(at+1 .. at+k) / mean(at-k .. at-1), the gate's form (2012: 2013-2015 over 2009-2011)."""
    a = series.reindex(range(at + 1, at + 1 + k)).mean()
    b = series.reindex(range(at - k, at)).mean()
    return float(a / b) if b and np.isfinite(a) and np.isfinite(b) else float("nan")


# ---------------------------------------------------------------- the checks
def a1_integrity(daily: pd.DataFrame, yt: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for reg in sorted(ALIGNED):
        m = in_box(daily, REGIONS[reg])
        s = daily[m].groupby("year")[["cells", "frp"]].sum()
        ref = yt[yt["region"] == reg].set_index("year")
        j = s.join(ref[["cells_h", "frp_h"]], how="outer").fillna(0.0)
        for var, col in (("cells", "cells_h"), ("frp", "frp_h")):
            d = (j[var] - j[col]).abs() / j[col].where(j[col] > 0)
            rows.append({"region": reg, "variable": var, "years": int(len(j)),
                         "max_abs_diff_pct": round(float(100 * d.max()), 4) if d.notna().any() else None,
                         "total_site": round(float(j[var].sum()), 1), "total_pipeline": round(float(j[col].sum()), 1)})
    return pd.DataFrame(rows)


def a2_ratio(yt: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for reg, g in yt.groupby("region"):
        g = g.set_index("year")
        for var in ("cells", "frp"):
            r = (g[f"S-NPP_{var}"] / g[f"MODIS_{var}"]).replace([np.inf, -np.inf], np.nan)
            fit = r.reindex(FIT_YEARS).dropna()
            late = r.reindex(range(2020, 2026)).dropna()
            if len(fit) < 4:
                continue
            tr = pct_trend(fit.index, fit.values)
            lo, hi = bootstrap_ci(fit.index.to_numpy(), fit.to_numpy(), pct_trend)
            rows.append({"region": reg, "variable": var, "ratio_mean_2012_2019": round(float(fit.mean()), 3),
                         "cv_pct_2012_2019": round(float(100 * fit.std(ddof=1) / fit.mean()), 1),
                         "trend_pct_per_year_2012_2019": round(tr, 2), "trend_ci95_lo": round(lo, 2), "trend_ci95_hi": round(hi, 2),
                         # if the same trend ran backwards, the 2003-2011 mid-point (2007) sits 8.5 years before the
                         # fit mid-point (2015.5): the implied bias of a constant factor there (a hypothesis, not a measurement)
                         "implied_bias_2007_pct_if_trend_continued": round(float(100 * ((1 + tr / 100) ** -8.5 - 1)), 1)
                         if np.isfinite(tr) else None,
                         "trend_pct_per_year_2020_2025": round(pct_trend(late.index, late.values), 2) if len(late) >= 4 else None})
    return pd.DataFrame(rows)


def a3_steps(yt: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for reg, g in yt.groupby("region"):
        g = g.set_index("year")
        for var in ("cells", "frp"):
            h, m = g[f"{var}_h"], g[f"MODIS_{var}"]
            raw = pd.concat([m[m.index < 2012], g[f"S-NPP_{var}"][g.index >= 2012]])
            row = {"region": reg, "variable": var,
                   "step_raw_joined": round(step(raw, 2012), 3), "step_modis_alone": round(step(m, 2012), 3),
                   "step_harmonised": round(step(h, 2012), 3)}
            row["gap_2012_pct"] = round(100 * (row["step_harmonised"] / row["step_modis_alone"] - 1), 1)
            # placebo gaps at VIIRS-era years: the same statistic where no sensor changes, so it shows how much
            # the S-NPP/MODIS ratio wanders from one 3-year block to the next (the noise the 2012 gap sits in)
            plac = []
            for y in range(2015, 2023):
                hs, ms = step(h, y), step(m, y)
                if np.isfinite(hs) and np.isfinite(ms) and ms:
                    plac.append(100 * (hs / ms - 1))
            row["placebo_gaps_2015_2022_pct"] = " ".join(f"{p:+.1f}" for p in plac)
            row["placebo_abs_median_pct"] = round(float(np.median(np.abs(plac))), 1) if plac else None
            rows.append(row)
    return pd.DataFrame(rows)


def a4_trends(yt: pd.DataFrame, y0: int = 2003, y1: int = 2019) -> pd.DataFrame:
    rows = []
    for reg, g in yt.groupby("region"):
        g = g.set_index("year").loc[y0:y1]
        for var in ("cells", "frp"):
            m, h = g[f"MODIS_{var}"], g[f"{var}_h"]
            raw = pd.concat([m[m.index < 2012], g[f"S-NPP_{var}"][g.index >= 2012]])
            t = {k: pct_trend(s.index, s.values) for k, s in (("modis_alone", m), ("harmonised", h), ("raw_joined", raw))}
            lo, hi = bootstrap_ci(h.index.to_numpy(), (h / m).to_numpy(), pct_trend)
            rows.append({"region": reg, "variable": var, "years": f"{y0}-{y1}",
                         **{f"trend_{k}_pct_per_year": round(v, 2) for k, v in t.items()},
                         "harmonised_minus_modis_pp": round(t["harmonised"] - t["modis_alone"], 2),
                         "raw_minus_modis_pp": round(t["raw_joined"] - t["modis_alone"], 2),
                         "ratio_trend_ci95": f"{lo:+.2f} to {hi:+.2f}"})
    return pd.DataFrame(rows)


def a5_gfed(yt: pd.DataFrame, gfed: pd.DataFrame) -> pd.DataFrame:
    ba = gfed.groupby(["region", "year"])["ba_ha"].sum()
    rows = []
    for reg, g in yt.groupby("region"):
        g = g.set_index("year")
        if reg not in ba.index.get_level_values(0):
            continue
        b = ba.loc[reg]
        yrs = [y for y in range(2003, 2017) if y in b.index and b[y] > 0]
        b = b.reindex(yrs)
        for var in ("cells", "frp"):
            m = g[f"MODIS_{var}"].reindex(yrs)
            h = g[f"{var}_h"].reindex(yrs)
            raw = pd.concat([m[m.index < 2012], g[f"S-NPP_{var}"].reindex([y for y in yrs if y >= 2012])])
            row = {"region": reg, "variable": var}
            for name, s in (("raw_joined", raw), ("modis_alone", m), ("harmonised", h)):
                lr = np.log(s / b).replace([np.inf, -np.inf], np.nan)
                pre, post = lr[lr.index < 2012].dropna(), lr[lr.index >= 2013].dropna()
                row[f"{name}_shift_pct"] = round(float(100 * (np.exp(post.mean() - pre.mean()) - 1)), 1) \
                    if len(pre) >= 3 and len(post) >= 2 else None
            rows.append(row)
    return pd.DataFrame(rows)


def a6_low_days(daily: pd.DataFrame, meta: dict, zones: np.ndarray) -> pd.DataFrame:
    """Global daily totals: days below 40% of the centred 31-day median, by era, and how many
    of them the site marks as "no data" in at least one 30-degree zone."""
    s = daily.groupby("day")["cells"].sum().reindex(range(meta["days"]), fill_value=0.0)
    med = s.rolling(31, center=True, min_periods=15).median()
    low = (s < 0.4 * med) & (med > 0)
    any_nd = (zones == 5).any(axis=0)
    dates = pd.to_datetime(meta["start"]) + pd.to_timedelta(np.arange(meta["days"]), unit="D")
    era = np.where(dates < pd.Timestamp("2012-01-20"), "MODIS era (2002 to 19 Jan 2012)", "VIIRS era")
    last = pd.Timestamp(meta.get("last_data_day", meta["end"]))
    keep = dates <= last
    df = pd.DataFrame({"era": era, "low": low.to_numpy(), "nd": any_nd, "keep": keep})[keep]
    out = df.groupby("era").agg(days=("low", "size"), low_days=("low", "sum"),
                                low_days_marked_no_data=("low", lambda x: int((x & df.loc[x.index, "nd"]).sum())))
    out["low_days_not_marked"] = out["low_days"] - out["low_days_marked_no_data"]
    return out.reset_index()


def main(argv=None) -> dict:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("site", help="folder with meta.json, daily/, validation/ (unzipped site_data.zip)")
    ap.add_argument("--out", default="validation/results")
    a = ap.parse_args(argv)
    site, out = Path(a.site), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    meta = json.loads((site / "meta.json").read_text())
    yt = pd.read_csv(site / "validation" / "l3__yearly_totals.csv")
    gfed = pd.read_csv(site / "validation" / "external__gfed_monthly_regions.csv")
    zones = np.frombuffer(gzip.open(site / "zones.bin.gz").read(), "u1").reshape(72, meta["days"])
    print("reading daily tiles ...", flush=True)
    daily = load_daily(site, meta)
    results = {"A1_export_integrity": a1_integrity(daily, yt), "A2_ratio_stationarity": a2_ratio(yt),
               "A3_steps_and_placebos": a3_steps(yt), "A4_trends_2003_2019": a4_trends(yt),
               "A5_gfed_reference": a5_gfed(yt, gfed), "A6_low_days": a6_low_days(daily, meta, zones)}
    summary = {"site_generated_utc": meta.get("generated_utc"), "record": [meta["start"], meta.get("last_data_day")],
               "daily_rows": int(len(daily)), "tables": {}}
    for name, df in results.items():
        df.to_csv(out / f"{name}.csv", index=False)
        summary["tables"][name] = f"{name}.csv ({len(df)} rows)"
        with pd.option_context("display.width", 220, "display.max_columns", 30, "display.max_rows", 60):
            print(f"\n== {name}\n{df.to_string(index=False)}")
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    main()
