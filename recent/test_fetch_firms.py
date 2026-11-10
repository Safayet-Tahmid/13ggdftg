"""Tests for the recent-detections fetch (run: python -m pytest -q recent). No network, no key."""
import gzip
import json
import sys
from datetime import date
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


def test_full_run_writes_compact_file_and_honest_status(tmp_path):
    first, last = date(2026, 10, 28), date(2026, 11, 8)                         # 12 days, 3 chunks
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    make_csvs(csvdir, first, last)
    code = F.main(["--out", str(tmp_path / "out"), "--from", "2026-10-28", "--to", "2026-11-08", "--from-csv", str(csvdir)])
    assert code == 0
    st = json.loads((tmp_path / "out/status.json").read_text())
    d = json.loads(gzip.decompress((tmp_path / "out/recent.json.gz").read_bytes()))
    assert st["complete"] is True and st["window"] == {"from": "2026-10-28", "to": "2026-11-08", "days": 12}
    p = st["products"]["VIIRS_NOAA20_NRT"]
    assert p["rows"] == 9 and p["duplicates_removed"] == 3
    assert p["per_day"][0] == 3 and p["per_day"][1] == 0
    assert "2026-10-29" in p["days_without_data"]
    assert len(d["s"]) == len(d["la"]) == len(d["f"]) == st["rows"] == 18
    assert d["satellites"] == ["N20", "N21"] and d["confidence"] == ["l", "n", "h"]
    assert d["la"][0] == 100000 and d["f"][0] == 45                              # 10.0 deg, 4.5 MW


def test_a_failed_chunk_is_reported_not_hidden(tmp_path):
    first, last = date(2026, 10, 28), date(2026, 11, 8)
    csvdir = tmp_path / "csv"; csvdir.mkdir()
    make_csvs(csvdir, first, last, failing={("VIIRS_NOAA21_NRT", date(2026, 11, 2))})
    code = F.main(["--out", str(tmp_path / "out"), "--from", "2026-10-28", "--to", "2026-11-08", "--from-csv", str(csvdir)])
    assert code == 2
    st = json.loads((tmp_path / "out/status.json").read_text())
    assert st["complete"] is False
    assert st["products"]["VIIRS_NOAA21_NRT"]["requests_ok"] == 2
    assert st["products"]["VIIRS_NOAA20_NRT"]["complete"] is True


def test_no_key_means_nothing_is_fetched(monkeypatch, tmp_path):
    monkeypatch.delenv("NASA_FIRMS_MAP_KEY", raising=False)
    assert F.main(["--out", str(tmp_path)]) == 1
    assert not (tmp_path / "recent.json.gz").exists()


def test_historical_pipeline_is_never_imported():
    src = (Path(__file__).parent / "fetch_firms.py").read_text()
    assert "import shift" not in src and "from shift" not in src
