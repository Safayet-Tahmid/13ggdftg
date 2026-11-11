"""Tests for recent/snapshot.py (Task 2, WP1 and WP5): a failed refresh keeps the last good snapshot,
never mixes two snapshots, never relabels old data as new. No network except a local test server."""
import gzip
import hashlib
import http.server
import json
import shutil
import sys
import threading
from datetime import date, datetime, timezone
from functools import partial
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import fetch_firms as F  # noqa: E402
import snapshot as S  # noqa: E402

HEAD = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
NOW = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)


def row(lat=23.1, lon=90.2, d="2026-11-01", t="0712", sat="N20", conf="n", frp="4.5", dn="D"):
    return f"{lat},{lon},330,0.4,0.4,{d},{t},{sat},VIIRS,{conf},2.0NRT,290,{frp},{dn}\n"


def fetch(tmp: Path, name: str, lat0: float = 10, failing=(), first="2026-11-01", last="2026-11-08", fetched=None):
    """Run the real fetch on saved CSVs. Returns (folder, exit code)."""
    csvdir = tmp / f"csv_{name}"; csvdir.mkdir()
    a, b = date.fromisoformat(first), date.fromisoformat(last)
    for product, sat in F.PRODUCTS.items():
        for start, n in F.chunks(a, b):
            if (product, start) in failing:
                continue
            rows = "".join(row(d=start.isoformat(), sat=sat, lat=lat0 + i, t=f"{i:02d}00") for i in range(3))
            (csvdir / f"{product}_{start.isoformat()}_{n}.csv").write_text(HEAD + rows)
    out = tmp / name
    code = F.main(["--out", str(out), "--from", first, "--to", last, "--from-csv", str(csvdir)])
    if fetched and (out / "status.json").exists():               # pretend the fetch ran at another time
        st = json.loads((out / "status.json").read_text())
        st["fetched_utc"] = fetched
        (out / "status.json").write_text(json.dumps(st, indent=1))
    return out, code


def files(d: Path) -> dict:
    return {p.relative_to(d).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(d.rglob("*")) if p.is_file()}


def pub(out: Path) -> dict:
    return json.loads((out / "publication.json").read_text())


def publish(cand, code, prev, out, now=NOW):
    return S.publish(cand, code, prev, out, now)


# ---------------------------------------------------------------- the checker

def test_a_fresh_fetch_passes_the_checks(tmp_path):
    d, code = fetch(tmp_path, "a")
    assert code == 0
    ok, probs, info = S.validate(d)
    assert ok, probs
    assert info["complete"] is True and info["rows"] == 12 and info["status_format"] == 2


@pytest.mark.parametrize("damage, expect", [
    ("tile_bytes", "SHA-256"),
    ("tile_missing", "files missing"),
    ("extra_file", "unexpected files"),
    ("truncated_gzip", "SHA-256"),
    ("nan_in_tile_v1", "out of range"),
    ("point_outside_tile_v1", "outside the tile"),
    ("count_mismatch_v1", "arrays differ"),
    ("bad_time", "fetched_utc"),
    ("rows_mismatch", "rows do not match"),
    ("future_detection", "after the fetch time"),
    ("unknown_product", "unknown products"),
])
def test_damaged_snapshots_are_rejected(tmp_path, damage, expect):
    d, _ = fetch(tmp_path, "a")
    st = json.loads((d / "status.json").read_text())
    tile = d / "tiles" / f"{next(iter(st['tiles']))}.json.gz"

    def v1():                                    # drop the checksums so the deeper checks are reached
        st.pop("files"); st["format"] = 1
    if damage == "tile_bytes":
        tile.write_bytes(tile.read_bytes()[:-1] + b"x")
    elif damage == "tile_missing":
        tile.unlink()
    elif damage == "extra_file":
        (d / "tiles" / "S90W180.json.gz").write_bytes(b"x")
    elif damage == "truncated_gzip":
        tile.write_bytes(tile.read_bytes()[:20])
    elif damage.endswith("_v1"):
        v1()
        t = json.loads(gzip.decompress(tile.read_bytes()))
        if damage == "nan_in_tile_v1":
            t["f"][0] = float("nan")
        elif damage == "point_outside_tile_v1":
            t["la"][0] = -450000                 # -45 degrees, far outside N10E090
        else:
            t["lo"].pop()
        tile.write_bytes(gzip.compress(json.dumps(t).encode()))
    elif damage == "bad_time":
        st["fetched_utc"] = "yesterday"
    elif damage == "rows_mismatch":
        st["rows"] += 1
    elif damage == "future_detection":
        st["fetched_utc"] = "2026-11-01T00:00:00Z"
    elif damage == "unknown_product":
        st["products"]["MODIS_NRT"] = st["products"]["VIIRS_NOAA20_NRT"]
    (d / "status.json").write_text(json.dumps(st))
    ok, probs, _ = S.validate(d)
    assert not ok
    assert any(expect in p for p in probs), probs


def test_a_snapshot_from_the_live_site_format_1_still_passes(tmp_path):
    d, _ = fetch(tmp_path, "a")
    st = json.loads((d / "status.json").read_text())
    st.pop("files"); st["format"] = 1           # what the site served before Task 2
    (d / "status.json").write_text(json.dumps(st))
    assert S.validate(d)[0]


# ---------------------------------------------------------------- what gets published (A to E)

def test_A_complete_fetch_is_published_as_new(tmp_path):
    prev, _ = fetch(tmp_path, "prev", lat0=30, fetched="2026-11-09T09:00:00Z")
    cand, code = fetch(tmp_path, "cand")
    out = tmp_path / "site"
    dec = publish(cand, code, prev, out)
    assert dec["state"] == "new" and pub(out)["state"] == "new"
    assert {k: v for k, v in files(out).items() if k != "publication.json"} == files(cand)


def test_B_partial_fetch_prefers_a_recent_complete_previous_snapshot(tmp_path):
    prev, _ = fetch(tmp_path, "prev", lat0=30, fetched="2026-11-09T03:00:00Z")        # 9 h old
    cand, code = fetch(tmp_path, "cand", failing={("VIIRS_NOAA21_NRT", date(2026, 11, 6))})
    assert code == 2
    out = tmp_path / "site"
    dec = publish(cand, code, prev, out)
    assert dec["attempt"]["result"] == "B" and "N21 2026-11-06 +3d" in dec["attempt"]["detail"]
    assert dec["state"] == "fallback"
    p = pub(out)
    assert p["state"] == "fallback" and p["snapshot_fetched_utc"] == "2026-11-09T03:00:00Z"
    assert {k: v for k, v in files(out).items() if k != "publication.json"} == {
        k: v for k, v in files(prev).items() if k != "publication.json"}


def test_B_partial_fetch_is_published_marked_incomplete_when_the_previous_is_old(tmp_path):
    prev, _ = fetch(tmp_path, "prev", lat0=30, fetched="2026-11-07T00:00:00Z")        # 60 h old
    cand, code = fetch(tmp_path, "cand", failing={("VIIRS_NOAA21_NRT", date(2026, 11, 6))})
    out = tmp_path / "site"
    dec = publish(cand, code, prev, out)
    assert dec["state"] == "incomplete"
    p = pub(out)
    assert p["complete"] is False
    assert p["missing"] == [{"product": "VIIRS_NOAA21_NRT", "satellite": "N21", "from": "2026-11-06", "days": 3}]
    st = json.loads((out / "status.json").read_text())
    assert st["products"]["VIIRS_NOAA21_NRT"]["per_day"][5:] == [0, 0, 0]   # missing days, shown as missing (status), not as fire-free


def test_B_without_a_previous_snapshot_publishes_the_incomplete_one(tmp_path):
    cand, code = fetch(tmp_path, "cand", failing={("VIIRS_NOAA20_NRT", date(2026, 11, 1))})
    out = tmp_path / "site"
    assert publish(cand, code, None, out)["state"] == "incomplete"
    assert pub(out)["missing"][0]["satellite"] == "N20"


def test_B_a_whole_product_missing_is_identified(tmp_path):
    cand, code = fetch(tmp_path, "cand", failing={("VIIRS_NOAA21_NRT", s) for s, _ in F.chunks(date(2026, 11, 1), date(2026, 11, 8))})
    assert code == 2
    out = tmp_path / "site"
    dec = publish(cand, code, None, out)
    assert dec["state"] == "incomplete"
    assert {m["satellite"] for m in pub(out)["missing"]} == {"N21"} and len(pub(out)["missing"]) == 2
    assert json.loads((out / "status.json").read_text())["products"]["VIIRS_NOAA21_NRT"]["complete"] is False


def test_C_total_outage_keeps_the_previous_snapshot_byte_for_byte(tmp_path):
    prev, _ = fetch(tmp_path, "prev", fetched="2026-11-08T21:00:00Z")
    cand, code = fetch(tmp_path, "cand", failing={(p, s) for p in F.PRODUCTS for s, _ in F.chunks(date(2026, 11, 1), date(2026, 11, 8))})
    assert code == 1 and not cand.exists()
    out = tmp_path / "site"
    dec = publish(cand, code, prev, out)
    assert dec["attempt"]["result"] == "C" and dec["state"] == "fallback"
    assert {k: v for k, v in files(out).items() if k != "publication.json"} == files(prev)   # status.json too
    st = json.loads((out / "status.json").read_text())
    assert st["fetched_utc"] == "2026-11-08T21:00:00Z"                     # never relabelled as new
    p = pub(out)
    assert p["decided_utc"] == "2026-11-09T12:00:00Z" and p["snapshot_fetched_utc"] == "2026-11-08T21:00:00Z"
    assert S.validate(out)[0]


def test_C_total_outage_without_a_previous_snapshot_publishes_nothing(tmp_path):
    out = tmp_path / "site"
    dec = publish(tmp_path / "nothing", 1, tmp_path / "no_prev", out)
    assert dec["state"] == "none" and not out.exists()


def test_D_corrupt_new_snapshot_is_not_published(tmp_path):
    prev, _ = fetch(tmp_path, "prev", lat0=30, fetched="2026-11-09T09:00:00Z")
    cand, code = fetch(tmp_path, "cand")
    t = next((cand / "tiles").glob("*.json.gz"))
    t.write_bytes(b"not gzip")
    out = tmp_path / "site"
    dec = publish(cand, code, prev, out)
    assert dec["attempt"]["result"] == "D" and dec["state"] == "fallback"
    assert files(out)["status.json"] == files(prev)["status.json"]


def test_E_missing_key_keeps_the_previous_snapshot(tmp_path, monkeypatch):
    prev, _ = fetch(tmp_path, "prev", fetched="2026-11-09T09:00:00Z")
    monkeypatch.delenv("NASA_FIRMS_MAP_KEY", raising=False)
    code = F.main(["--out", str(tmp_path / "cand")])
    assert code == 3
    out = tmp_path / "site"
    dec = publish(tmp_path / "cand", code, prev, out)
    assert dec["attempt"]["result"] == "E" and dec["state"] == "fallback"
    assert "key" in pub(out)["attempt"]["detail"] and "MAP_KEY=" not in json.dumps(pub(out))


def test_corrupt_previous_snapshot_is_never_published(tmp_path):
    prev, _ = fetch(tmp_path, "prev")
    next((prev / "tiles").glob("*.json.gz")).unlink()
    out = tmp_path / "site"
    dec = publish(tmp_path / "nothing", 1, prev, out)
    assert dec["state"] == "none" and not out.exists()
    assert "rejected" in dec["previous_note"]


def test_fallback_of_a_fallback_keeps_the_first_fetch_time(tmp_path):
    prev, _ = fetch(tmp_path, "prev", fetched="2026-11-08T21:00:00Z")
    site1, site2 = tmp_path / "site1", tmp_path / "site2"
    publish(tmp_path / "nothing", 1, prev, site1)
    publish(tmp_path / "nothing", 1, site1, site2, now=datetime(2026, 11, 10, 0, 0, tzinfo=timezone.utc))
    p = pub(site2)
    assert p["state"] == "fallback" and p["previous_publication_state"] == "fallback"
    assert p["snapshot_fetched_utc"] == "2026-11-08T21:00:00Z"
    assert files(site2)["status.json"] == files(prev)["status.json"]


def test_repeated_refreshes_never_mix_snapshots(tmp_path):
    out = tmp_path / "site"
    a, ca = fetch(tmp_path, "a", lat0=10)                   # tiles N10E090, N20E090
    publish(a, ca, None, out)
    publish(tmp_path / "nothing", 1, out, out)            # outage: the live snapshot (out) is kept
    b, cb = fetch(tmp_path, "b", lat0=-40)                  # entirely different tiles
    publish(b, cb, out, out.parent / "site_next")
    nxt = out.parent / "site_next"
    assert set(json.loads((nxt / "status.json").read_text())["tiles"]) == set(json.loads((b / "status.json").read_text())["tiles"])
    assert {k for k in files(nxt) if k.startswith("tiles/")} == {k for k in files(b) if k.startswith("tiles/")}
    # publishing again over an existing folder replaces it whole, and leaves no staging folder behind
    publish(a, ca, None, nxt)
    assert {k for k in files(nxt) if k.startswith("tiles/")} == {k for k in files(a) if k.startswith("tiles/")}
    assert sorted(p.name for p in tmp_path.iterdir() if p.name.startswith(".")) == []
    assert S.validate(nxt)[0]


# ---------------------------------------------------------------- pull from the live site (local server)

@pytest.fixture
def server(tmp_path):
    root = tmp_path / "www"; (root / "data").mkdir(parents=True)
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield root, f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


def test_pull_copies_the_served_snapshot_whole(tmp_path, server):
    root, url = server
    d, code = fetch(tmp_path, "a")
    publish(d, code, None, root / "data" / "recent")
    ok, msg = S.pull(url, tmp_path / "prev")
    assert ok, msg
    assert files(tmp_path / "prev") == files(root / "data" / "recent")


def test_pull_without_a_served_snapshot_returns_nothing(tmp_path, server):
    _, url = server
    ok, msg = S.pull(url, tmp_path / "prev")
    assert not ok and "no previous snapshot" in msg and not (tmp_path / "prev").exists()


def test_pull_rejects_a_served_snapshot_that_is_damaged(tmp_path, server):
    root, url = server
    d, code = fetch(tmp_path, "a")
    publish(d, code, None, root / "data" / "recent")
    next((root / "data" / "recent" / "tiles").glob("*.json.gz")).unlink()
    ok, msg = S.pull(url, tmp_path / "prev")
    assert not ok and not (tmp_path / "prev").exists()


# ---------------------------------------------------------------- the command line the workflow runs

def test_publish_command_writes_a_summary_and_never_fails(tmp_path):
    summary = tmp_path / "summary.md"
    code = S.main(["publish", "--candidate", str(tmp_path / "none"), "--fetch-exit", "1", "--previous", str(tmp_path / "none2"),
                   "--out", str(tmp_path / "site"), "--now", "2026-11-09T12:00:00Z", "--summary", str(summary)])
    assert code == 0
    assert "serving none" in summary.read_text()
    assert S.main(["check", str(tmp_path / "site")]) == 1        # the workflow then removes the folder


def test_snapshot_code_never_touches_the_key_or_the_record():
    src = (Path(__file__).parent / "snapshot.py").read_text()
    assert "NASA_FIRMS_MAP_KEY" not in src
    assert "import shift" not in src and "from shift" not in src and "pipeline" not in src
