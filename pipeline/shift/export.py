"""Phase 3: the export stage (D5). Turns the harmonised record into small static files that the
website loads directly (GitHub Pages, and offline from a folder for the rehearsal).

Writes processed/global/site_data/ and one zip of it (site_data.zip) to upload as a GitHub
Release asset; the Pages workflow downloads it at build time. Nothing here is computed in the
browser that a judge could not trace back to a pipeline report.

  meta.json            record dates, grids, source legend, notes (2002 Terra only, partial 2026)
  daily/<tile>.bin.gz  per 10-degree tile: daily harmonised values per 1-degree cell
                       little-endian, columns: uint32 n | float32 cells[n] | float32 frp[n] |
                       uint16 day[n] (days since meta.start) | uint8 cell[n] (row*10+col inside
                       the tile, row from the south) | uint8 src[n]
  monthly/<YYYY-MM>.bin.gz  the map layer: monthly totals per 0.25-degree cell
                       uint32 n | uint32 cell25[n] | float32 cells[n] | float32 frp[n]
  zones.bin.gz         availability per 30-degree zone and day: uint8 [zones x days], codes in
                       meta.zone_status
  uncertainty.json     95% range (%) of the MODIS-era factor per factor cell and month: the calibrated
                       month range of stage checks (must-fix 5) when present, else the raw factor range
  cloud.json           months that were cloudier than 90% of years per factor cell (package option C),
                       so the website can warn that low fire may be hidden by cloud
  notfire.json         the "Not a fire" layer (D9): every masked non-fire cell, its type and years
  validation/          the pipeline reports and tables the validation page shows, including the
                       Phase 2 checks (2026 test, ranges, simple methods, events, burned area, cloud)

    python -m shift.run --dataset global --stage export     (after harmonise; ~10-20 min)
"""
from __future__ import annotations

import gzip
import json
import re
import shutil
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .provenance import stamp
from .config import Settings
from .factors import final_mask
from .harmonise import SOURCES, d29_guard
from .scan import NON_FIRE_TYPES
from .static_mask import masked_cells
from .tiles import tile_name

ZONE_STATUS = {"primary": 0, "filled: NOAA-20": 1, "filled: D19": 2, "filled: Aqua": 3, "filled: Terra": 4, "no data": 5}
VALIDATION_FILES = ["report_counts.json", "report_continuity.json", "report_selection.json", "report_frp.json",
                    "report_worldwide.json", "report_factors.json", "report_confidence.json", "report_nodata.json",
                    "report_places.json", "report_resolution.json", "report_harmonise.json", "report_qc.json",
                    "report_crosscheck.json", "l3/step_2012.csv", "l3/yearly_totals.csv",
                    "nodata/fill_test_scores.csv", "nodata/fill_test_by_gap_length.csv",
                    "places/borrowed_factor_test.csv", "places/bangladesh_calendar.csv",
                    "counts/resolution_variants.csv", "counts/resolution_region_steps.csv",
                    "counts/factors_variant_steps.csv", "qc/gaps.csv",
                    # Phase 2 checks (16-26 Oct, repeated 7 Nov on the final record)
                    "report_checks.json", "report_daily.json", "report_external.json",
                    "checks/phase2_summary.json", "checks/simple_methods.csv", "checks/critical_periods.csv",
                    "checks/critical_days_by_era.csv", "checks/month_range_calibration.csv",
                    "daily/skill_by_scale.csv", "external/gfed_monthly_regions.csv"]


def _gz(path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wb", compresslevel=9) as fh:
        fh.write(data)


def pack_daily(df: pd.DataFrame) -> bytes:
    df = df.sort_values(["cell", "day"])
    n = np.array([len(df)], "<u4")
    return (n.tobytes() + df["cells"].to_numpy("<f4").tobytes() + df["frp"].to_numpy("<f4").tobytes()
            + df["day"].to_numpy("<u2").tobytes() + df["cell"].to_numpy("u1").tobytes() + df["src"].to_numpy("u1").tobytes())


def unpack_daily(b: bytes) -> pd.DataFrame:
    n = int(np.frombuffer(b[:4], "<u4")[0])
    o = 4
    cells = np.frombuffer(b[o:o + 4 * n], "<f4"); o += 4 * n
    frp = np.frombuffer(b[o:o + 4 * n], "<f4"); o += 4 * n
    day = np.frombuffer(b[o:o + 2 * n], "<u2"); o += 2 * n
    cell = np.frombuffer(b[o:o + n], "u1"); o += n
    src = np.frombuffer(b[o:o + n], "u1")
    return pd.DataFrame({"cells": cells, "frp": frp, "day": day, "cell": cell, "src": src})


def pack_monthly(df: pd.DataFrame) -> bytes:
    df = df.sort_values("cell25")
    return (np.array([len(df)], "<u4").tobytes() + df["cell25"].to_numpy("<u4").tobytes()
            + df["cells"].to_numpy("<f4").tobytes() + df["frp"].to_numpy("<f4").tobytes())


def notfire_layer(settings: Settings, mask: np.ndarray | None) -> list:
    src = settings.path(settings["static_mask"]["sources_dir"])
    files = [f for f in sorted(src.glob("*.parquet")) if re.match(r"^[A-Z_0-9]+_\d{4}$", f.stem)] if src.exists() else []
    if not files or mask is None or not len(mask):
        return []
    allp = pd.concat([pd.read_parquet(f, columns=["cell_id", "type"]).assign(year=int(f.stem.rsplit("_", 1)[1]))
                      for f in files], ignore_index=True)
    per = allp.groupby("cell_id").agg(n_years=("year", "nunique"), type=("type", lambda s: int(s.mode().iloc[0])))
    per = per[per.index.isin(mask)]
    from .grid import cell_centre
    lat, lon = cell_centre(per.index.to_numpy("int64"), settings.resolution)
    return [[round(float(a), 3), round(float(b), 3), int(t), int(n)]
            for a, b, t, n in zip(lat, lon, per["type"], per["n_years"])]


def cloud_flags(settings: Settings, deg: float) -> dict:
    """checks/cloud_flags.parquet (written only when the cloud rule adopted the flag) as
    {cell name: ["YYYY-MM", ...]} on the factor grid. MERRA-2 reaches 2026-08, so later months
    carry no flag; `until` says so."""
    p = settings.processed_dir / "checks" / "cloud_flags.parquet"
    out = {"deg": deg, "until": None, "flags": {}}
    if not p.exists():
        return out
    c = pd.read_parquet(p)
    if not len(c):
        return out
    names = [tile_name(a, b, deg) for a, b in zip(c["lat0"], c["lon0"])]
    ym = [f"{int(y):04d}-{int(m):02d}" for y, m in zip(c["year"], c["month"])]
    for n, k in zip(names, ym):
        out["flags"].setdefault(n, []).append(k)
    out["flags"] = {n: sorted(set(v)) for n, v in out["flags"].items()}
    out["until"] = max(ym)
    full = settings.processed_dir / "external" / "cloud_monthly_fine.parquet"
    if full.exists():                     # the last month with cloud data, flagged or not
        t = pd.read_parquet(full, columns=["year", "month"])
        if len(t):
            y, m = t.sort_values(["year", "month"]).iloc[-1]
            out["until"] = f"{int(y):04d}-{int(m):02d}"
    return out


def run_export(settings: Settings) -> dict:
    cfg = settings.raw.get("export") or {}
    l3 = settings.processed_dir / (settings.raw.get("harmonise") or {}).get("out_subdir", "l3")
    parts = sorted(l3.glob("year=*/month=*/part.parquet")) if l3.exists() else []
    if not parts:
        return {"stage": "export", "note": "no L3 found: run stage harmonise first"}
    out = settings.processed_dir / cfg.get("out_subdir", "site_data")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    zp = settings.processed_dir / "nodata" / "zone_day_status.parquet"
    z = d29_guard(pd.read_parquet(zp), settings)
    zd = pd.to_datetime(z["date"])
    start, end = zd.min().normalize(), zd.max().normalize()
    nd = (end - start).days + 1
    print(f"[export] {len(parts)} L3 months -> {out}", flush=True)

    daily = {}
    monthly_sizes = 0
    for i, p in enumerate(parts):
        d = pd.read_parquet(p)
        day = (pd.to_datetime(d["date"]) - start).dt.days.to_numpy()
        lat1, lon1 = np.floor(d["lat"].to_numpy()), np.floor(d["lon"].to_numpy())
        t_lat, t_lon = np.floor(lat1 / 10) * 10, np.floor(lon1 / 10) * 10
        cell = ((lat1 - t_lat) * 10 + (lon1 - t_lon)).astype("int64")
        tid = ((t_lat + 90) / 10 * 36 + (t_lon + 180) / 10).astype("int64")
        x = pd.DataFrame({"tid": tid, "cell": cell, "day": day, "cells": d["cells_h"].to_numpy(float),
                          "frp": d["frp_h"].to_numpy(float), "src": d["src"].to_numpy("int64")})
        x = x.groupby(["tid", "cell", "day"], as_index=False).agg(cells=("cells", "sum"), frp=("frp", "sum"), src=("src", "max"))
        for t, g in x.groupby("tid"):
            daily.setdefault(int(t), []).append(g.drop(columns="tid"))
        ym = re.search(r"year=(\d+)/month=(\d+)", p.as_posix())
        mo = d.groupby("cell25", as_index=False).agg(cells=("cells_h", "sum"), frp=("frp_h", "sum"))
        b = pack_monthly(mo)
        _gz(out / "monthly" / f"{int(ym.group(1)):04d}-{int(ym.group(2)):02d}.bin.gz", b)
        monthly_sizes += len(b)
        if (i + 1) % 48 == 0:
            print(f"[export] {i + 1}/{len(parts)} months read", flush=True)

    tiles_meta = {}
    for t, frames in daily.items():
        df = pd.concat(frames, ignore_index=True)
        li, lo = divmod(t, 36)
        name = tile_name(-90 + li * 10, -180 + lo * 10, 10)
        _gz(out / "daily" / f"{name}.bin.gz", pack_daily(df))
        tiles_meta[name] = {"rows": int(len(df)), "lat0": -90 + li * 10, "lon0": -180 + lo * 10,
                            "cells_total": round(float(df["cells"].sum()), 1)}

    # availability per zone and day
    lat0 = z["zone"].str[1:3].astype(int) * np.where(z["zone"].str[0] == "N", 1, -1)
    lon0 = z["zone"].str[4:7].astype(int) * np.where(z["zone"].str[3] == "E", 1, -1)
    zk = ((lat0 + 90) // 30 * 12 + (lon0 + 180) // 30).to_numpy()
    arr = np.full((72, nd), 255, "u1")
    di = (zd - start).dt.days.to_numpy()
    arr[zk, di] = z["status"].map(ZONE_STATUS).fillna(255).astype("u1").to_numpy()
    _gz(out / "zones.bin.gz", arr.tobytes())

    # uncertainty of the MODIS-era factors
    unc = {}
    up = l3 / "l3_uncertainty.parquet"
    if up.exists():
        u = pd.read_parquet(up)
        u = u[u["segment"].astype(str).str.startswith("MODIS")]
        rcol = "month_range_pct" if "month_range_pct" in u.columns and u["month_range_pct"].notna().any() else "range_pct"
        for var, g in u.groupby("variable"):
            piv = g.pivot_table(index="tile", columns="month", values=rcol, aggfunc="first").reindex(columns=range(1, 13))
            unc[var] = {t: [None if not np.isfinite(v) else round(float(v), 1) for v in row] for t, row in piv.iterrows()}
    rep_h = settings.processed_dir / "report_harmonise.json"
    hrep = json.loads(rep_h.read_text()) if rep_h.exists() else {}
    fdeg = hrep.get("factor_resolution_deg", float((settings.raw.get("factors") or {}).get("tile_deg", 10)))
    basis = ("calibrated month range (checks, must-fix 5)" if up.exists() and rcol == "month_range_pct"
             else "factor range") if up.exists() else None
    (out / "uncertainty.json").write_text(json.dumps({"factor_deg": fdeg, "basis": basis, "range_pct": unc}, separators=(",", ":")))

    # cloud flag (package option C): months cloudier than 90% of years, per factor cell
    cloud = cloud_flags(settings, fdeg)
    (out / "cloud.json").write_text(json.dumps(cloud, separators=(",", ":")))

    mask = final_mask(settings, masked_cells(settings), float((settings.raw.get("factors") or {}).get("tile_deg", 10)))
    nf = notfire_layer(settings, mask)
    (out / "notfire.json").write_text(json.dumps({"columns": ["lat", "lon", "type", "years_labelled"],
                                                  "types": {str(k): v for k, v in NON_FIRE_TYPES.items()},
                                                  "cells": nf}, separators=(",", ":")))

    vdir = out / "validation"
    vdir.mkdir()
    copied = []
    for f in VALIDATION_FILES:
        src = settings.processed_dir / f
        if src.exists():
            shutil.copy(src, vdir / f.replace("/", "__"))
            copied.append(f)

    rec = settings.raw.get("record") or {}
    drop = int((settings.raw.get("nodata") or {}).get("drop_last_days", 1))
    last_data = (end - pd.Timedelta(days=drop)).date()
    meta = {"generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "start": str(start.date()), "end": str(end.date()), "days": int(nd),
            "last_data_day": str(last_data),
            "comparable_start": rec.get("comparable_start", "2003-01-01"),
            "terra_only_until": rec.get("terra_only_until", "2002-07-03"),
            "daily_grid_deg": 1.0, "tile_deg": 10, "map_grid_deg": 0.25, "zone_deg": 30,
            "sources": {str(k): v for k, v in SOURCES.items()}, "zone_status": {str(v): k for k, v in ZONE_STATUS.items()},
            "variables": {"cells": "hotspots: 0.05-degree cells with fire per day, S-NPP equivalent (D31)",
                          "frp": "fire radiative power, MW, S-NPP equivalent"},
            "notes": ["Jan-Jun 2002: Terra only, not comparable with later years (D20).",
                      f"Data to {last_data}. The newest day ({end.date()}) is cut off at download time and shown as no data. "
                      "No near-real-time feed (D34).",
                      "The last year is partial.",
                      "Values before 20 Jan 2012 are MODIS put on the S-NPP scale; ranges in uncertainty.json.",
                      "Dated critical periods and daily or weekly views before 20 Jan 2012 are indicative; months are tested (D30).",
                      "NOAA-21 is not used: it was not tested (D35)."],
            "decisions": {"D29": "D19 fill off from " + str((settings.raw.get("harmonise") or {}).get("d19_fill_off_from")),
                          "D30": "indicative before 2012-01-20", "D31": "hotspots label", "D34": "no NRT", "D35": "no NOAA-21"},
            "tiles": tiles_meta, "validation_files": copied, "provenance": stamp(settings),
            "record_info": (json.loads((settings.processed_dir / "l3" / "record_info.json").read_text())
                            if (settings.processed_dir / "l3" / "record_info.json").exists() else None)}
    (out / "meta.json").write_text(json.dumps(meta, indent=1))

    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    biggest = max((f for f in out.rglob("*") if f.is_file()), key=lambda f: f.stat().st_size)
    zpath = settings.processed_dir / "site_data.zip"
    if zpath.exists():
        zpath.unlink()
    shutil.make_archive(str(zpath.with_suffix("")), "zip", out)
    report = {"stage": "export", "files": int(sum(1 for f in out.rglob("*") if f.is_file())),
              "size_mb": round(size / 1e6, 1), "zip_mb": round(zpath.stat().st_size / 1e6, 1),
              "largest_file": {"name": biggest.relative_to(out).as_posix(), "mb": round(biggest.stat().st_size / 1e6, 2)},
              "daily_tiles": len(tiles_meta), "monthly_layers": len(parts), "notfire_cells": len(nf),
              "cloud_flagged_cell_months": int(sum(len(v) for v in cloud["flags"].values())),
              "uncertainty_basis": basis, "last_data_day": str(last_data),
              "validation_files": len(copied), "zip_path": str(zpath)}
    limit = float(cfg.get("max_site_mb", 900))
    ok = report["size_mb"] <= limit and report["largest_file"]["mb"] <= 95
    report["fits_github_pages"] = bool(ok)
    print(f"[export] {report['files']} files, {report['size_mb']} MB ({report['zip_mb']} MB zipped); largest "
          f"{report['largest_file']['name']} {report['largest_file']['mb']} MB; daily tiles {len(tiles_meta)}, "
          f"map layers {len(parts)}, not-a-fire cells {len(nf):,}", flush=True)
    print(f"[export] fits GitHub Pages (site <= {limit:g} MB, every file <= 95 MB): {'YES' if ok else 'NO'}", flush=True)
    return report
