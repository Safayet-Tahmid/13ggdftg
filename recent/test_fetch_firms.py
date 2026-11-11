"""Tests for the recent-detections fetch (run: python -m pytest -q recent). No network, no key."""
import gzip
import hashlib
import json
import math
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import fetch_firms as F  # noqa: E402

HEAD = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"


def row(lat=23.1, lon=90.2, d="2026-10-29", t="0712", sat="N20", conf="n", frp="4.5", dn="D"):
    return f"{lat},{lon},330,0.4,0.4,{d},{t},{sat},VIIRS,{conf},2.0NRT,290,{frp},{dn}\n"


def test_chunks_cover_the_window_in_pieces_of_at_most_5_days():
    parts = list(F.chunks(date(2026, 10, 28), date(2026, 11, 11)))
    assert parts[0] == (date(2026, 10, 28), 5)
    assert sum(n for _, n in parts) == 15
    assert all(1 <= n <= 5 for _, n in parts)
    assert list(F.chunks(date(2026, 11, 1), date(2026, 11, 1))) == [(date(2026, 11, 1), 1)]


def test_every_bad_row_is_rejected_with_a_reason():
    text = HEAD + "".join([
        row(),                                   # kept
        row(conf="high"),                        # kept, word form of the class
        row(t="712"),                            # kept, 3-digit time
        row(lat=95),                             # out of range
        row(d="2026-10-20"),                     # outside the window
        row(t="2460"),                           # bad time
        row(conf="x"),                           # unknown confidence
        row(sat="N21"),                          # other satellite
        row(frp="-1"),                           # negative frp
        row(dn="?"),                             # bad day/night
        row(frp="abc"),                          # not a number
    ])
    kept, rej = F.parse_rows(text, "N20", date(2026, 10, 28), date(2026, 11, 11))
    assert len(kept) == 3
    assert kept[1][4] == 2 and kept[2][1] == 712
    assert sum(rej.values()) == 8
    assert set(rej) == {"coordinates out of range", "acq_date outside the window", "bad acq_time",
                        "unknown confidence", "other satellite", "negative frp", "bad daynight", "not a number"}


def test_missing_column_fails_the_whole_reply():
    try:
        F.parse_rows("latitude,longitude\n1,2\n", "N20", date(2026, 10, 28), date(2026, 11, 1))
    except ValueError as e:
        assert "acq_date" in str(e)
    else:
        raise AssertionError("expected a ValueError")


def test_key_is_masked():
    assert F.mask("Invalid MAP_KEY abc123", "abc123") == "Invalid MAP_KEY ***"


def make_csvs(tmp, first, last, failing=()):
    for product, sat in F.PRODUCTS.items():
        for start, n in F.chunks(first, last):
            if (product, start) in failing:
                continue
            rows = "".join(row(d=(start).isoformat(), sat=sat, lat=10 + i, t=f"{i:04d}") for i in range(3))
            rows += row(d=start.isoformat(), sat=sat, lat=10, t="0000")       # exact duplicate
            (tmp / f"{product}_{start.isoformat()}_{n}.csv").write_text(HEAD + rows)


def test_full_run_writes_overview_tiles_and_honest_status(tmp_path):
    first, last = date(2026, 10, 28), date(2026, 11, 8)                         # 12 days, 3 chunks
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    make_csvs(csvdir, first, last)
    nf = tmp_path / "notfire.json"                                                # one non-fire cell at 11.025, 90.225
    nf.write_text(json.dumps({"columns": ["lat", "lon"], "cells": [[11.025, 90.225, 2, 9]]}))
    code = F.main(["--out", str(tmp_path / "out"), "--from", "2026-10-28", "--to", "2026-11-08", "--area", "80,0,100,40",
                   "--from-csv", str(csvdir), "--notfire", str(nf)])
    assert code == 0
    st = json.loads((tmp_path / "out/status.json").read_text())
    assert st["complete"] is True and st["window"] == {"from": "2026-10-28", "to": "2026-11-08", "days": 12}
    p = st["products"]["VIIRS_NOAA20_NRT"]
    assert p["rows"] == 9 and p["duplicates_removed"] == 3
    assert p["per_day"][0] == 3 and p["per_day"][1] == 0
    assert "2026-10-29" in p["days_without_data"]
    assert st["rows"] == 18 and sum(st["tiles"].values()) == 18                  # every detection in a tile
    assert st["nonfire_flagged"] == 6                                            # lat 11 rows: 3 chunks x 2 sats
    assert st["latest_detection_utc"] == "2026-11-07T00:02Z"
    tile = json.loads(gzip.decompress((tmp_path / "out/tiles/N10E090.json.gz").read_bytes()))
    assert len(tile["la"]) == 18 and sum(tile["nf"]) == 6 and tile["f"][0] == 45
    ov = json.loads(gzip.decompress((tmp_path / "out/overview.json.gz").read_bytes()))
    assert sum(ov["n"]) == 12 and sum(ov["nf"]) == 6                             # non-fire kept out of counts
    assert sum(ov["n24"]) == 4 and sum(ov["n7"]) == 8                            # latest chunk, last two chunks
    assert max(ov["fmax"]) == 45


def test_low_confidence_is_drawn_but_not_counted(tmp_path):
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    for product, sat in F.PRODUCTS.items():
        (csvdir / f"{product}_2026-11-01_1.csv").write_text(HEAD + row(d="2026-11-01", sat=sat, conf="l") + row(d="2026-11-01", sat=sat, lat=-5))
    assert F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-01", "--from-csv", str(csvdir)]) == 0
    ov = json.loads(gzip.decompress((tmp_path / "o/overview.json.gz").read_bytes()))
    st = json.loads((tmp_path / "o/status.json").read_text())
    assert sum(ov["n"]) == 2 and st["rows"] == 4 and st["nonfire_flagged"] is None


def test_tile_names_match_the_site():
    assert F.tile_name(23.1, 90.2) == "N20E090"
    assert F.tile_name(-34.1, 150.1) == "S40E150"
    assert F.tile_name(-0.01, -0.01) == "S10W010"
    assert F.tile_name(0, 0) == "N00E000"


def test_a_failed_chunk_is_reported_not_hidden(tmp_path):
    first, last = date(2026, 10, 28), date(2026, 11, 8)
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    make_csvs(csvdir, first, last, failing={("VIIRS_NOAA21_NRT", date(2026, 11, 2))})
    code = F.main(["--out", str(tmp_path / "out"), "--from", "2026-10-28", "--to", "2026-11-08", "--area", "80,0,100,40", "--from-csv", str(csvdir)])
    assert code == 2
    st = json.loads((tmp_path / "out/status.json").read_text())
    assert st["complete"] is False
    assert st["products"]["VIIRS_NOAA21_NRT"]["requests_ok"] == 2
    assert st["products"]["VIIRS_NOAA20_NRT"]["complete"] is True


def test_no_key_means_nothing_is_fetched(monkeypatch, tmp_path, capsys):
    monkeypatch.delenv("NASA_FIRMS_MAP_KEY", raising=False)
    assert F.main(["--out", str(tmp_path / "o")]) == 3                          # 3 = no key, its own code
    assert not (tmp_path / "o").exists()
    assert "not set" in capsys.readouterr().out


def test_historical_pipeline_is_never_imported():
    src = (Path(__file__).parent / "fetch_firms.py").read_text()
    assert "import shift" not in src and "from shift" not in src


def test_total_failure_writes_nothing(tmp_path):
    csvdir = tmp_path / "csv"; csvdir.mkdir()                                   # no CSV at all: every request fails
    assert F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-02", "--from-csv", str(csvdir)]) == 1
    assert not (tmp_path / "o" / "status.json").exists()


# ---------------------------------------------------------------- Task 2, WP2: strict validation

def test_nonfinite_and_invalid_values_are_rejected_with_their_own_reason():
    text = HEAD + "".join([
        row(),                                   # kept
        row(lat="nan"),                          # NaN latitude
        row(lon="NaN"),                          # NaN longitude (a range check alone lets this through)
        row(frp="nan"),                          # NaN FRP
        row(frp="inf"),                          # +infinity
        row(lon="-Infinity"),                    # -infinity
        row(lat="-inf"),
        row(frp="-0.5"),                         # negative FRP
        row(d="2026-13-01"),                     # invalid date
        row(t="12:75"),                          # invalid time
        row(sat="Aqua"),                         # unsupported satellite
        row(conf="99"),                          # invalid confidence
    ])
    kept, rej = F.parse_rows(text, "N20", date(2026, 10, 28), date(2026, 11, 11))
    assert len(kept) == 1
    assert rej == {"latitude not finite": 2, "longitude not finite": 2, "frp not finite": 2, "negative frp": 1,
                   "bad acq_date": 1, "bad acq_time": 1, "other satellite": 1, "unknown confidence": 1}
    assert all(math.isfinite(x) for r in kept for x in (r[2], r[3], r[5]))


def test_one_bad_row_does_not_stop_a_good_reply(tmp_path):
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    for product, sat in F.PRODUCTS.items():
        (csvdir / f"{product}_2026-11-01_1.csv").write_text(HEAD + row(d="2026-11-01", sat=sat, frp="nan") + row(d="2026-11-01", sat=sat))
    assert F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-01", "--from-csv", str(csvdir)]) == 0
    st = json.loads((tmp_path / "o/status.json").read_text())
    assert st["rows"] == 2 and st["products"]["VIIRS_NOAA20_NRT"]["rejected"] == {"frp not finite": 1}
    assert "NaN" not in (tmp_path / "o/status.json").read_text()


def test_empty_valid_reply_for_a_small_area_is_a_real_zero(tmp_path):
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    for product in F.PRODUCTS:
        (csvdir / f"{product}_2026-11-01_1.csv").write_text(HEAD)              # header only: FIRMS had no detections
    assert F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-01", "--area", "88,20,93,27",
                   "--from-csv", str(csvdir)]) == 0                             # a small box can truly have no fire
    st = json.loads((tmp_path / "o/status.json").read_text())
    assert st["complete"] is True and st["rows"] == 0 and st["latest_detection_utc"] is None
    assert st["products"]["VIIRS_NOAA20_NRT"]["days_without_data"] == ["2026-11-01"]
    assert st["products"]["VIIRS_NOAA20_NRT"]["suspect_days"] == []


def test_duplicate_policy_merges_only_identical_rows_of_one_product(tmp_path):
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    for product, sat in F.PRODUCTS.items():
        rows = row(d="2026-11-01", sat=sat) * 2                                  # exact repeat: kept once
        rows += row(d="2026-11-01", sat=sat, t="0713")                           # same pixel, next minute: kept
        rows += row(d="2026-11-01", sat=sat, lat="23.10004")                     # same after rounding to 4 decimals: merged
        rows += row(d="2026-11-01", sat=sat, frp="4.6")                          # different FRP: kept
        (csvdir / f"{product}_2026-11-01_1.csv").write_text(HEAD + rows)
    assert F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-01", "--from-csv", str(csvdir)]) == 0
    st = json.loads((tmp_path / "o/status.json").read_text())
    for name in F.PRODUCTS:                                                      # NOAA-20 and NOAA-21 never merged
        assert st["products"][name]["rows"] == 3 and st["products"][name]["duplicates_removed"] == 2
    assert st["rows"] == 6


def test_edges_of_the_map_land_in_tiles_the_site_loads(tmp_path):
    assert F.tile_name(90, 10) == "N80E010" and F.tile_name(-90, 10) == "S90E010"
    assert F.tile_name(10, 180) == "N10W180" and F.tile_name(10, -180) == "N10W180"
    assert F.tile_name(10, 179.9999) == "N10E170"
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    for product, sat in F.PRODUCTS.items():
        rows = "".join(row(d="2026-11-01", sat=sat, lat=la, lon=lo) for la, lo in ((90, 180), (-90, -180), (0.0, 180), (89.9999, 179.9999)))
        (csvdir / f"{product}_2026-11-01_1.csv").write_text(HEAD + rows)
    assert F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-01", "--from-csv", str(csvdir)]) == 0
    st = json.loads((tmp_path / "o/status.json").read_text())
    assert st["rows"] == 8
    assert set(st["tiles"]) == {"N80W180", "S90W180", "N00W180", "N80E170"}     # never E180 or N90


def test_status_lists_every_file_with_its_checksum(tmp_path):
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    make_csvs(csvdir, date(2026, 11, 1), date(2026, 11, 2))
    assert F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-02", "--area", "80,0,100,40", "--from-csv", str(csvdir)]) == 0
    st = json.loads((tmp_path / "o/status.json").read_text())
    assert st["format"] == 3
    assert set(st["files"]) == {"overview.json.gz", *(f"tiles/{n}.json.gz" for n in st["tiles"])}
    for rel, meta in st["files"].items():
        b = (tmp_path / "o" / rel).read_bytes()
        assert meta["bytes"] == len(b) and meta["sha256"] == hashlib.sha256(b).hexdigest()


def test_24_hour_and_7_day_windows_end_at_the_newest_detection(tmp_path):
    # Newest detection 2026-11-08 23:59 (minute 11519 of the window). A detection is in "24 h" if it is
    # less than 1440 minutes older than the newest one, in "7 d" if less than 10080 minutes older.
    pts = [("2026-11-08", "2359"),   # age 0       24 h yes, 7 d yes
           ("2026-11-08", "0000"),   # age 1439    24 h yes, 7 d yes
           ("2026-11-07", "2359"),   # age 1440    24 h no,  7 d yes
           ("2026-11-02", "0000"),   # age 10079   24 h no,  7 d yes
           ("2026-11-01", "2359")]   # age 10080   24 h no,  7 d no
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    for product, sat in F.PRODUCTS.items():
        for start, n in F.chunks(date(2026, 11, 1), date(2026, 11, 8)):
            end = start + timedelta(days=n)
            body = "".join(row(d=d, t=tm, sat=sat, lat=10 + i) for i, (d, tm) in enumerate(pts)
                           if start <= date.fromisoformat(d) < end)
            (csvdir / f"{product}_{start.isoformat()}_{n}.csv").write_text(HEAD + body)
    assert F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-08", "--area", "80,0,100,40", "--from-csv", str(csvdir)]) == 0
    ov = json.loads(gzip.decompress((tmp_path / "o/overview.json.gz").read_bytes()))
    assert ov["latest_minute"] == 11519
    got = {cid // 1440 // 4 - 90: (ov["n24"][i], ov["n7"][i], ov["n"][i]) for i, cid in enumerate(ov["id"])}
    # each cell holds one detection from each of the two satellites
    assert got == {10: (2, 2, 2), 11: (2, 2, 2), 12: (0, 2, 2), 13: (0, 2, 2), 14: (0, 0, 2)}
    st = json.loads((tmp_path / "o/status.json").read_text())
    assert st["latest_detection_utc"] == "2026-11-08T23:59Z"


# ---------------------------------------------------------------- audit hotfix D2 and D4

def dense(csvdir, first, last, empty=(), now_day_rows=True):
    """Global fixtures: every product has detections on every day, except the (product, day) in empty."""
    for product, sat in F.PRODUCTS.items():
        for start, n in F.chunks(first, last):
            body = ""
            for k in range(n):
                d = start + timedelta(days=k)
                if (product, d) not in empty:
                    body += row(d=d.isoformat(), sat=sat, lat=10 + k, t="0300")
            (csvdir / f"{product}_{start.isoformat()}_{n}.csv").write_text(HEAD + body)


def test_D2_an_empty_global_product_on_completed_days_is_missing_data_not_zero_fire(tmp_path):
    first, last = date(2026, 11, 1), date(2026, 11, 8)
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    dense(csvdir, first, last, empty={("VIIRS_NOAA21_NRT", first + timedelta(days=k)) for k in range(8)})   # valid CSV, no rows
    code = F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-08", "--now", "2026-11-09T12:00:00Z",
                   "--from-csv", str(csvdir)])
    assert code == 2                                                             # not a complete, healthy snapshot
    st = json.loads((tmp_path / "o/status.json").read_text())
    p21 = st["products"]["VIIRS_NOAA21_NRT"]
    assert all(r["ok"] for r in p21["requests"])                                # every HTTP answer was a success
    assert p21["suspect_days"] == [f"2026-11-0{k}" for k in range(1, 9)] and p21["complete"] is False
    assert st["products"]["VIIRS_NOAA20_NRT"]["complete"] is True and st["complete"] is False


def test_D2_one_missing_completed_day_is_flagged_but_normal_latency_is_not(tmp_path):
    first, last = date(2026, 11, 1), date(2026, 11, 8)
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    # NOAA-20 has no detection on 4 Nov (a completed day) and none yet on 8 Nov (today, still arriving)
    dense(csvdir, first, last, empty={("VIIRS_NOAA20_NRT", date(2026, 11, 4)), ("VIIRS_NOAA20_NRT", date(2026, 11, 8)),
                                      ("VIIRS_NOAA21_NRT", date(2026, 11, 8))})
    code = F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-08", "--now", "2026-11-08T05:00:00Z",
                   "--from-csv", str(csvdir)])
    st = json.loads((tmp_path / "o/status.json").read_text())
    p20 = st["products"]["VIIRS_NOAA20_NRT"]
    assert p20["suspect_days"] == ["2026-11-04"]                                # 8 Nov is the current day: not judged
    assert set(p20["days_without_data"]) == {"2026-11-04", "2026-11-08"}
    assert st["products"]["VIIRS_NOAA21_NRT"]["suspect_days"] == [] and code == 2
    # an empty 8 Nov is judged only once it ended 6 h before the fetch (normal near-real-time delay)
    assert F.suspect_days([5, 0], date(2026, 11, 7), datetime(2026, 11, 9, 5, 59, tzinfo=timezone.utc), "world") == []
    assert F.suspect_days([5, 0], date(2026, 11, 7), datetime(2026, 11, 9, 6, 0, tzinfo=timezone.utc), "world") == ["2026-11-08"]
    assert F.suspect_days([0, 0], date(2026, 11, 7), datetime(2026, 11, 20, tzinfo=timezone.utc), "10,10,20,20") == []


def test_D4_absurd_frp_is_rejected_without_stopping_the_batch(tmp_path):
    text = HEAD + row(frp="1e308") + row(frp="1000000.1") + row(frp="5000") + row(frp="150000") + row(frp="0")
    kept, rej = F.parse_rows(text, "N20", date(2026, 10, 28), date(2026, 11, 11))
    assert [r[5] for r in kept] == [5000.0, 150000.0, 0.0]                      # high but valid values stay
    assert rej == {"frp above 1,000,000 MW (not a value one pixel can have)": 2}
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    for product, sat in F.PRODUCTS.items():
        (csvdir / f"{product}_2026-11-01_1.csv").write_text(HEAD + row(d="2026-11-01", sat=sat, frp="1e308")
                                                            + row(d="2026-11-01", sat=sat, frp="999999.9"))
    # before the fix this run crashed with OverflowError and wrote nothing
    assert F.main(["--out", str(tmp_path / "o"), "--from", "2026-11-01", "--to", "2026-11-01", "--area", "80,0,100,40",
                   "--from-csv", str(csvdir)]) == 0
    tile = json.loads(gzip.decompress((tmp_path / "o/tiles/N20E090.json.gz").read_bytes()))
    assert tile["f"] == [9999999, 9999999] and max(tile["f"]) < 2 ** 53


def test_every_file_of_a_fetch_carries_one_generation_id(tmp_path):
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    dense(csvdir, date(2026, 11, 1), date(2026, 11, 3))
    F.main(["--out", str(tmp_path / "a"), "--from", "2026-11-01", "--to", "2026-11-03", "--from-csv", str(csvdir)])
    F.main(["--out", str(tmp_path / "b"), "--from", "2026-11-01", "--to", "2026-11-03", "--from-csv", str(csvdir)])
    ga = json.loads((tmp_path / "a/status.json").read_text())["generation"]
    gb = json.loads((tmp_path / "b/status.json").read_text())["generation"]
    assert ga != gb                                                              # same data, two fetches, two ids
    for f in [tmp_path / "a/overview.json.gz", *(tmp_path / "a/tiles").glob("*.json.gz")]:
        assert json.loads(gzip.decompress(f.read_bytes()))["generation"] == ga


def test_area_must_be_world_or_a_box(tmp_path):
    assert F.main(["--out", str(tmp_path / "o"), "--area", "../../etc", "--from-csv", str(tmp_path)]) == 1
