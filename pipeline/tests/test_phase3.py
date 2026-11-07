"""Phase 3 additions on the pipeline side: the D29 guard (no Aqua-alone fill for S-NPP gaps from
Feb 2023) and the cloud flag file the website reads (package option C)."""
from types import SimpleNamespace

import pandas as pd

from shift.export import cloud_flags
from shift.harmonise import d29_guard


def test_d29_guard_turns_late_d19_fills_into_no_data_only():
    z = pd.DataFrame({"date": ["2022-12-31", "2023-01-31", "2023-02-01", "2026-05-01", "2026-05-01"],
                      "zone": ["N00E000"] * 5,
                      "status": ["filled: D19", "filled: D19", "filled: D19", "filled: D19", "filled: NOAA-20"]})
    s = SimpleNamespace(raw={"harmonise": {"d19_fill_off_from": "2023-02-01"}})
    out = d29_guard(z, s)
    assert list(out["status"]) == ["filled: D19", "filled: D19", "no data", "no data", "filled: NOAA-20"]
    assert list(z["status"])[2] == "filled: D19"                     # the input is not changed in place
    off = SimpleNamespace(raw={"harmonise": {}})                       # no setting: nothing changes
    assert list(d29_guard(z, off)["status"]) == list(z["status"])


def test_cloud_flags_on_the_factor_grid(tmp_path):
    s = SimpleNamespace(processed_dir=tmp_path)
    assert cloud_flags(s, 2.5) == {"deg": 2.5, "until": None, "flags": {}}   # rule not adopted: no file, no flags
    (tmp_path / "checks").mkdir()
    (tmp_path / "external").mkdir()
    pd.DataFrame({"lat0": [22.5, 22.5, -2.5], "lon0": [90.0, 90.0, 110.0], "year": [2019, 2004, 2015],
                  "month": [7, 6, 9], "cloud": [0.9, 0.8, 0.95], "thr": [0.85, 0.75, 0.9]}
                 ).to_parquet(tmp_path / "checks" / "cloud_flags.parquet", index=False)
    pd.DataFrame({"year": [2026, 2026], "month": [7, 8], "cloud": [0.5, 0.6]}
                 ).to_parquet(tmp_path / "external" / "cloud_monthly_fine.parquet", index=False)
    c = cloud_flags(s, 2.5)
    assert c["flags"] == {"N22E090": ["2004-06", "2019-07"], "S02E110": ["2015-09"]}
    assert c["until"] == "2026-08"                                      # last month with cloud data, flagged or not
