"""Tests of the audit statistics (validation/audit_site_data.py) on inputs with known answers."""
import gzip
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import audit_site_data as a  # noqa: E402


def test_theil_sen_and_percent_trend():
    x = np.arange(2003, 2020)
    assert abs(a.theil_sen(x, 2.0 * x + 5) - 2.0) < 1e-12
    y = 100 * 1.03 ** (x - x[0])                        # +3% a year exactly
    assert abs(a.pct_trend(x, y) - 3.0) < 1e-9
    y_out = y.copy()
    y_out[5] *= 10                                       # one wild year barely moves a median of slopes
    assert abs(a.pct_trend(x, y_out) - 3.0) < 0.5


def test_step_matches_the_gate_definition():
    s = pd.Series({2009: 1.0, 2010: 2.0, 2011: 3.0, 2012: 99.0, 2013: 4.0, 2014: 4.0, 2015: 4.0})
    assert a.step(s, 2012) == 2.0                        # mean(2013-2015) / mean(2009-2011) = 4 / 2


def test_unpack_daily_reads_the_export_layout(tmp_path):
    n = 3
    cells = np.array([1.0, 2.5, 0.5], "<f4"); frp = np.array([10, 20, 30], "<f4")
    day = np.array([0, 1, 2], "<u2"); cell = np.array([0, 11, 99], "u1"); src = np.array([0, 3, 1], "u1")
    b = np.array([n], "<u4").tobytes() + cells.tobytes() + frp.tobytes() + day.tobytes() + cell.tobytes() + src.tobytes()
    d = a.unpack_daily(b)
    assert d["cells"].tolist() == [1.0, 2.5, 0.5] and d["cell"].tolist() == [0, 11, 99] and d["src"].tolist() == [0, 3, 1]
    # load_daily turns cell numbers into 1-degree centres inside the 10-degree tile (row from the south)
    site = tmp_path
    (site / "daily").mkdir()
    (site / "daily" / "S10W020.bin.gz").write_bytes(gzip.compress(b))
    meta = {"start": "2002-01-01", "days": 3, "tiles": {"S10W020": {"lat0": -10, "lon0": -20}}}
    full = a.load_daily(site, meta)
    assert full["lat"].tolist() == [-9.5, -8.5, -0.5] and full["lon"].tolist() == [-19.5, -18.5, -10.5]


def test_ratio_stationarity_flags_a_planted_drift():
    years = list(range(2012, 2020))
    rows = []
    for reg, drift in (("stable", 0.0), ("drifting", 0.03)):
        for i, y in enumerate(years):
            m = 1000.0
            rows.append({"region": reg, "year": y, "MODIS_cells": m, "S-NPP_cells": 2.5 * m * (1 + drift) ** i,
                         "MODIS_frp": m, "S-NPP_frp": 0.9 * m})
    out = a.a2_ratio(pd.DataFrame(rows)).set_index(["region", "variable"])
    assert abs(out.loc[("stable", "cells"), "trend_pct_per_year_2012_2019"]) < 1e-6
    assert abs(out.loc[("drifting", "cells"), "trend_pct_per_year_2012_2019"] - 3.0) < 0.01
    assert out.loc[("drifting", "cells"), "implied_bias_2007_pct_if_trend_continued"] < -20


def test_main_runs_on_a_tiny_site(tmp_path):
    site, out = tmp_path / "site", tmp_path / "out"
    (site / "daily").mkdir(parents=True)
    (site / "validation").mkdir()
    days = 9131                                          # 2002-01-01 .. 2026-12-31
    meta = {"start": "2002-01-01", "end": "2026-12-31", "last_data_day": "2026-12-30", "days": days,
            "tiles": {"N00E010": {"lat0": 0, "lon0": 10}}}
    (site / "meta.json").write_text(json.dumps(meta))
    k = np.arange(0, days, 7, dtype="<u2")
    n = len(k)
    b = (np.array([n], "<u4").tobytes() + np.ones(n, "<f4").tobytes() + np.ones(n, "<f4").tobytes()
         + k.tobytes() + np.full(n, 55, "u1").tobytes() + np.zeros(n, "u1").tobytes())
    (site / "daily" / "N00E010.bin.gz").write_bytes(gzip.compress(b))
    (site / "zones.bin.gz").write_bytes(gzip.compress(np.zeros((72, days), "u1").tobytes()))
    yrs = range(2002, 2027)
    yt = pd.DataFrame([{"region": "global", "year": y, "cells_h": 2.0, "frp_h": 1.0, "cells_h_est": 2.0, "frp_h_est": 1.0,
                        "MODIS_cells": 1.0, "MODIS_frp": 1.0, "S-NPP_cells": 2.0 if y >= 2012 else 0.0,
                        "S-NPP_frp": 1.0 if y >= 2012 else 0.0} for y in yrs])
    yt.to_csv(site / "validation" / "l3__yearly_totals.csv", index=False)
    pd.DataFrame([{"region": "global", "year": y, "month": 1, "ba_ha": 1.0} for y in range(2003, 2017)]).to_csv(
        site / "validation" / "external__gfed_monthly_regions.csv", index=False)
    summary = a.main([str(site), "--out", str(out)])
    assert (out / "A3_steps_and_placebos.csv").exists() and summary["daily_rows"] == n
    st = pd.read_csv(out / "A3_steps_and_placebos.csv").set_index("variable")
    assert st.loc["cells", "gap_2012_pct"] == 0.0 and st.loc["cells", "step_raw_joined"] == 2.0
