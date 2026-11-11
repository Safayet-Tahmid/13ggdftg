"""Tests for the D39 weather context fetch (no network). Run: python -m pytest -q context"""
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

import fetch_power as fp

ROOT = Path(__file__).resolve().parents[1]


def test_rules_presets_match_the_website_presets():
    rules, _ = fp.load_rules()
    src = (ROOT / "web/src/content/places.js").read_text()
    site = {m.group(1): [float(x) for x in m.group(2).split(",")]
            for m in re.finditer(r"\{ id: '([^']+)', name: '[^']+', box: \[([^\]]+)\]", src)}
    assert {p["id"]: p["box"] for p in rules["presets"]} == site


def test_rules_fix_utc_and_the_five_parameters():
    rules, _ = fp.load_rules()
    assert rules["source"]["time_standard"] == "UTC"
    assert list(rules["parameters"]) == ["PRECTOTCORR", "RH2M", "T2M_MAX", "WS2M", "GWETROOT"]
    assert rules["period"]["start"] == "2003-01-01"


def test_grid_points_are_the_centres_of_nine_equal_parts():
    pts = fp.grid_points([0, 0, 3, 6])
    assert len(pts) == 9
    assert pts[0] == (1.0, 0.5) and pts[4] == (3.0, 1.5) and pts[8] == (5.0, 2.5)
    for lat, lon in fp.grid_points([88.0, 20.5, 92.7, 26.7]):
        assert 20.5 < lat < 26.7 and 88.0 < lon < 92.7


def test_request_asks_for_utc_days():
    rules, _ = fp.load_rules()
    url = fp.request_url(rules, 23.6, 90.35, dt.date(2026, 10, 1), dt.date(2026, 10, 3))
    assert "time-standard=UTC" in url and "community=AG" in url and "start=20261001" in url


def _answer(values: dict, fill=-999.0):
    return {"header": {"fill_value": fill}, "properties": {"parameter": values}}


def test_fill_values_and_absent_days_become_missing():
    days = fp.days_between(dt.date(2026, 1, 1), dt.date(2026, 1, 3))
    ans = _answer({"RH2M": {"20260101": 80.0, "20260102": -999.0}})
    s = fp.point_series(ans, ["RH2M"], days)
    assert s["RH2M"] == [80.0, None, None]


def test_area_day_is_missing_if_any_point_is_missing():
    a = {"P": [1.0, 2.0, None]}
    b = {"P": [3.0, None, 5.0]}
    out = fp.area_series([a, b], ["P"], 3, {"P": 2})
    assert out["P"] == [2.0, None, None]


def test_build_writes_files_with_the_rules_hash(tmp_path):
    rules, sha = fp.load_rules()
    params = list(rules["parameters"])

    def fake_fetch(url):
        q = dict(p.split("=") for p in url.split("?")[1].split("&"))
        start = dt.datetime.strptime(q["start"], "%Y%m%d").date()
        end = dt.datetime.strptime(q["end"], "%Y%m%d").date()
        days = fp.days_between(start, end)
        vals = {p: {d.strftime("%Y%m%d"): 1.0 for d in days} for p in params}
        vals["RH2M"][days[-1].strftime("%Y%m%d")] = -999.0     # newest day incomplete
        return _answer(vals)

    fp.PAUSE_S = 0
    code = fp.build(tmp_path, None, False, today=dt.date(2003, 1, 13), fetch=fake_fetch, only=["florida"])
    assert code == 0
    idx = json.loads((tmp_path / "power/index.json").read_text())
    assert idx["rules_sha256"] == sha
    body = (tmp_path / "power/florida.json").read_bytes()
    assert idx["files"]["florida"]["sha256"] == hashlib.sha256(body).hexdigest()
    data = json.loads(body)
    assert data["start"] == "2003-01-01" and data["end"] == "2003-01-09"   # 13 Jan - 3 days lag, last day cut
    assert len(data["values"]["RH2M"]) == 9 and len(data["points"]) == 9


def test_water_points_are_left_out_of_the_area(tmp_path):
    rules, _ = fp.load_rules()
    params = list(rules["parameters"])

    def fake_fetch(url):
        q = dict(p.split("=") for p in url.split("?")[1].split("&"))
        start = dt.datetime.strptime(q["start"], "%Y%m%d").date()
        end = dt.datetime.strptime(q["end"], "%Y%m%d").date()
        days = fp.days_between(start, end)
        sea = float(q["longitude"]) > -82            # the east column of Florida's box is the Atlantic here
        vals = {p: {d.strftime("%Y%m%d"): (-999.0 if (sea and p == "GWETROOT") else (5.0 if sea else 1.0)) for d in days}
                for p in params}
        return _answer(vals)

    fp.PAUSE_S = 0
    assert fp.build(tmp_path, None, False, today=dt.date(2003, 1, 13), fetch=fake_fetch, only=["florida"]) == 0
    data = json.loads((tmp_path / "power/florida.json").read_text())
    assert len(data["points"]) == 6 and len(data["water_points"]) == 3
    assert data["values"]["RH2M"][0] == 1.0                     # the sea points do not pull the mean
