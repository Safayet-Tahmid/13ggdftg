"""SHIFT recent detections (decision D38): fetch NASA FIRMS near-real-time VIIRS fire detections
from NOAA-20 and NOAA-21, check every row, and write two small static files for the website.

This is a SEPARATE layer. It never reads, writes or imports the historical pipeline
(pipeline/shift), its settings or the released `site-data`. Recent detections are raw FIRMS NRT
points. They are NOT on SHIFT's harmonised scale and are never added to the historical record.

Usage (the key comes from the environment, never from the command line):
    NASA_FIRMS_MAP_KEY=... python recent/fetch_firms.py --out web/public/data/recent
    python recent/fetch_firms.py --out OUT --from-csv DIR      # offline: read saved FIRMS CSVs

Outputs in OUT (all small static files, read by web/src/lib/recent.js):
    status.json          when it ran, the window, per product: requests, rows kept and rejected,
                         detections per day (a day with 0 worldwide means no data, not no fire)
    overview.json.gz     one row per 0.25 deg cell with detections: counts in the last 24 hours,
                         last 7 days and the whole window, strongest FRP, time of the latest one
    tiles/<N20E090>.json.gz   every detection in one 10 deg tile, loaded only when zoomed in
With --notfire (the site's notfire.json), detections in SHIFT's persistent non-fire cells (gas
flares, industry, volcanoes) are flagged and kept out of the overview counts.

status.json also lists every file it describes with its size and SHA-256 ("files"), so a later
build can check a snapshot is whole before it publishes it again (recent/snapshot.py). Every file
of one fetch carries the same "generation" id, so the website can refuse to combine files of two
fetches (for example an old overview from the browser cache with a new status).

Missing coverage (audit D2): a global product with no detection at all on a completed UTC day has
no data that day (VIIRS always sees fire somewhere on Earth), even if FIRMS answered with a valid,
empty file. Such days are listed in "suspect_days" and make the product incomplete, so the usual
fallback rules apply and the website names them. A day counts as completed only once it ended at
least LATENCY_HOURS before the fetch, so normal near-real-time delay is not called an outage.

Exit code: 0 all products fetched, 2 some product or chunk failed, 1 nothing usable,
3 no key (nothing fetched). Standard library only.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
WORLD = "world"                   # the area SHIFT requests. A bounding box "W,S,E,N" is also accepted
PRODUCTS = {"VIIRS_NOAA20_NRT": "N20", "VIIRS_NOAA21_NRT": "N21"}
# The historical record's last full day is 2026-10-28 (meta.last_data_day). The recent layer starts
# ON that day, so one day overlaps on purpose: it lets anyone compare the two sources for one day.
DEFAULT_FROM = "2026-10-28"
MAX_DAYS_PER_REQUEST = 5          # FIRMS Area API limit (DAY_RANGE 1..5)
REQUIRED = ("latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "daynight")
CONF = ("l", "n", "h")            # VIIRS confidence classes, stored as an index into this tuple
FORMAT = 1                        # overview and tile files
STATUS_FORMAT = 3                 # status.json: 2 added "files" (size, SHA-256), 3 adds "generation", "area", "suspect_days"
LATENCY_HOURS = 6                 # a UTC day is "completed" once it ended this long before the fetch
# Largest FRP accepted for one 375 m pixel (audit D4). Single VIIRS pixels report up to a few
# thousand MW in the largest fires. 1,000,000 MW is far above anything physical, so no real record
# is lost, and FRP x 10 stays an exact integer in JavaScript (below 2**53) and never overflows.
FRP_MAX_MW = 1_000_000


def mask(text: str, key: str) -> str:
    return text.replace(key, "***") if key else text


def chunks(first: date, last: date, size: int = MAX_DAYS_PER_REQUEST):
    """(start, n_days) pieces covering first..last inclusive, each at most `size` days."""
    d = first
    while d <= last:
        n = min(size, (last - d).days + 1)
        yield d, n
        d += timedelta(days=n)


def conf_code(v: str) -> int | None:
    v = (v or "").strip().lower()
    if v in ("l", "low"):
        return 0
    if v in ("n", "nominal"):
        return 1
    if v in ("h", "high"):
        return 2
    return None


def hhmm(v: str) -> int | None:
    v = (v or "").strip().replace(":", "")
    if not v.isdigit() or len(v) > 4:
        return None
    t = int(v)
    return t if t // 100 < 24 and t % 100 < 60 else None


def parse_rows(text: str, sat: str, first: date, last: date):
    """Check every row. Returns (kept rows as tuples, reasons for rejected rows)."""
    reader = csv.DictReader(io.StringIO(text))
    header = reader.fieldnames or []
    missing = [c for c in REQUIRED if c not in header]
    if missing:
        raise ValueError(f"CSV header lacks {missing}")
    kept, rejected = [], {}

    def reject(why):
        rejected[why] = rejected.get(why, 0) + 1

    for r in reader:
        try:
            lat, lon, frp = float(r["latitude"]), float(r["longitude"]), float(r["frp"])
        except (TypeError, ValueError):
            reject("not a number"); continue
        # float() accepts "nan", "inf" and "-inf", and every comparison with NaN is False, so a range
        # check alone lets NaN through. Reject anything that is not a finite number first.
        if not math.isfinite(lat):
            reject("latitude not finite"); continue
        if not math.isfinite(lon):
            reject("longitude not finite"); continue
        if not math.isfinite(frp):
            reject("frp not finite"); continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            reject("coordinates out of range"); continue
        if frp < 0:
            reject("negative frp"); continue
        if frp > FRP_MAX_MW:
            reject("frp above 1,000,000 MW (not a value one pixel can have)"); continue
        try:
            day = date.fromisoformat(r["acq_date"].strip())
        except (AttributeError, ValueError):
            reject("bad acq_date"); continue
        if not (first <= day <= last):
            reject("acq_date outside the window"); continue
        t = hhmm(r["acq_time"])
        if t is None:
            reject("bad acq_time"); continue
        c = conf_code(r["confidence"])
        if c is None:
            reject("unknown confidence"); continue
        if (r["satellite"] or "").strip() != sat:
            reject("other satellite"); continue
        dn = (r["daynight"] or "").strip().upper()
        if dn not in ("D", "N"):
            reject("bad daynight"); continue
        kept.append((day, t, round(lat, 4), round(lon, 4), c, round(frp, 1), 1 if dn == "D" else 0))
    return kept, rejected


def get(url: str, key: str, timeout: int = 180) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "SHIFT-recent-firms/1 (NASA Space Apps 2026)"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # noqa: BLE001 - network errors are reported, never raised with the URL
        return 0, type(e).__name__


def fetch_product(product: str, sat: str, first: date, last: date, key: str | None, csv_dir: Path | None, log,
                  area: str = WORLD):
    rows, rejected, requests = [], {}, []
    for start, n in chunks(first, last):
        if csv_dir:
            p = csv_dir / f"{product}_{start.isoformat()}_{n}.csv"
            status, body = (200, p.read_text(encoding="utf-8")) if p.exists() else (404, "")
            secs = 0.0
        else:
            url = f"{API}/{key}/{product}/{area}/{n}/{start.isoformat()}"
            t0 = time.time()
            status, body = get(url, key)
            secs = round(time.time() - t0, 1)
        first_line = body.splitlines()[0] if body else ""
        rec = {"from": start.isoformat(), "days": n, "http": status, "seconds": secs}
        if status != 200 or "latitude" not in first_line:
            rec["ok"] = False
            rec["reply_start"] = mask(body[:80], key or "")
            log(f"  {product} {start} +{n}d: FAILED http {status} {rec['reply_start']!r}")
        else:
            try:
                k, rj = parse_rows(body, sat, first, last)
            except ValueError as e:
                rec["ok"], rec["error"] = False, str(e)
                log(f"  {product} {start} +{n}d: FAILED {e}")
            else:
                rows += k
                for w, c in rj.items():
                    rejected[w] = rejected.get(w, 0) + c
                seen = sorted({r[0] for r in k})
                rec.update(ok=True, rows=len(k), rejected=sum(rj.values()),
                           dates_seen=[seen[0].isoformat(), seen[-1].isoformat()] if seen else None)
                log(f"  {product} {start} +{n}d: http 200, {len(k)} rows kept, {sum(rj.values())} rejected, {secs}s")
        requests.append(rec)
    # Duplicates: rows of one product that are identical after normalisation (day, time to the
    # minute, latitude and longitude to 4 decimals (about 11 m), confidence class, FRP to 0.1 MW and
    # day/night) are kept once. FIRMS can repeat a row in its reply. Two real detections are never
    # merged unless all seven fields agree, which for 375 m pixels means the same pixel and pass.
    # Rows of different satellites are never compared (each product is deduplicated on its own).
    before = len(rows)
    rows = sorted(set(rows))
    return rows, rejected, requests, before - len(rows)


def suspect_days(per_day: list, first: date, fetched: datetime, area: str) -> list:
    """Completed UTC days with no detection in a global product: missing data, not no fire.
    Only for the whole world. A small area can truly have no fire on a day."""
    if area != WORLD:
        return []
    out = []
    for k, n in enumerate(per_day):
        day = first + timedelta(days=k)
        end = datetime(day.year, day.month, day.day, tzinfo=timezone.utc) + timedelta(days=1)
        if n == 0 and fetched >= end + timedelta(hours=LATENCY_HOURS):
            out.append(day.isoformat())
    return out


def build(first: date, last: date, key: str | None, csv_dir: Path | None, log=print, area: str = WORLD,
          now: datetime | None = None):
    days = (last - first).days + 1
    cols = {k: [] for k in ("s", "d", "t", "la", "lo", "c", "f", "dn")}
    fetched = (now or datetime.now(timezone.utc)).replace(microsecond=0)
    status = {
        "format": STATUS_FORMAT,
        "fetched_utc": fetched.strftime("%Y-%m-%dT%H:%M:%SZ"),
        # one id for every file of this fetch: never reused, so two fetches can never be confused
        "generation": fetched.strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(6),
        "area": area,
        "window": {"from": first.isoformat(), "to": last.isoformat(), "days": days},
        "source": "NASA FIRMS Area API, near-real-time VIIRS 375 m active fire (raw detections, not harmonised)",
        "overlap_note": f"{first.isoformat()} is also the last full day of the SHIFT historical record (overlap kept on purpose)",
        "products": {},
    }
    sats = list(PRODUCTS.values())
    for si, (product, sat) in enumerate(PRODUCTS.items()):
        log(f"{product} ({sat}) {first} to {last}")
        rows, rejected, requests, dupes = fetch_product(product, sat, first, last, key, csv_dir, log, area)
        per_day = [0] * days
        for day, t, la, lo, c, f, dn in rows:
            k = (day - first).days
            per_day[k] += 1
            cols["s"].append(si); cols["d"].append(k); cols["t"].append(t)
            cols["la"].append(round(la * 1e4)); cols["lo"].append(round(lo * 1e4))
            cols["c"].append(c); cols["f"].append(round(f * 10)); cols["dn"].append(dn)
        ok_chunks = sum(1 for r in requests if r.get("ok"))
        status["products"][product] = {
            "satellite": sat,
            "requests": requests,
            "requests_ok": ok_chunks,
            "rows": len(rows),
            "rejected": rejected,
            "duplicates_removed": dupes,
            "per_day": per_day,
            # days with no detection (for the whole world: no data that day, or not yet delivered)
            "days_without_data": [(first + timedelta(days=k)).isoformat() for k, n in enumerate(per_day) if n == 0],
            # completed days with no detection in a global product: missing data (audit D2)
            "suspect_days": suspect_days(per_day, first, fetched, area),
        }
        status["products"][product]["complete"] = ok_chunks == len(requests) and not status["products"][product]["suspect_days"]
    status["satellites"] = sats
    status["complete"] = all(p["complete"] for p in status["products"].values())
    status["rows"] = len(cols["s"])
    data = {"format": FORMAT, "generation": status["generation"], "from": first.isoformat(), "days": days, "satellites": sats,
            "confidence": list(CONF), "scale": {"la": 1e-4, "lo": 1e-4, "f": 0.1}, **cols}
    return data, status


def load_notfire(path: Path) -> set:
    """SHIFT's persistent non-fire cells (0.05 deg centres) as (row, col) keys on a 0.05 deg grid."""
    d = json.loads(path.read_text())
    return {cell(lat, lon, 20) for lat, lon, *_ in d["cells"]}


def cell(lat: float, lon: float, per_deg: int) -> tuple[int, int]:
    """(row, col) on a grid of 1/per_deg degrees. Multiplying (not dividing by 0.05) avoids float slips."""
    return (min(math.floor((lat + 90) * per_deg + 1e-9), 180 * per_deg - 1),
            min(math.floor((lon + 180) * per_deg + 1e-9), 360 * per_deg - 1))


def tile_name(lat: float, lon: float, deg: int = 10) -> str:
    """Same names as the site's daily tiles (web/src/lib/data.js tileName). The edges belong to the
    last tile inside the map: latitude 90 to the N80 row, and longitude 180 (the same meridian as
    -180) to the W180 column, so no detection lands in a tile the website never loads."""
    lat = min(lat, 90 - 1e-9)
    lon = -180.0 if lon >= 180 else lon
    a, b = int((lat // deg) * deg), int((lon // deg) * deg)
    return f"{'N' if a >= 0 else 'S'}{abs(a):02d}{'E' if b >= 0 else 'W'}{abs(b):03d}"


def write_web(data: dict, out: Path, nf_cells: set | None) -> dict:
    """Overview per 0.25 deg cell and one detail file per 10 deg tile. Values are copied, never rescaled."""
    first = date.fromisoformat(data["from"])
    n = len(data["s"])
    mins = [data["d"][i] * 1440 + (data["t"][i] // 100) * 60 + data["t"][i] % 100 for i in range(n)]
    latest = max(mins) if mins else 0
    cells, tiles = {}, {}
    nf_total = 0
    for i in range(n):
        lat, lon = data["la"][i] / 1e4, data["lo"][i] / 1e4
        nf = 0
        if nf_cells is not None and cell(lat, lon, 20) in nf_cells:
            nf = 1
            nf_total += 1
        t = tiles.setdefault(tile_name(lat, lon), {k: [] for k in ("la", "lo", "d", "t", "s", "c", "f", "dn", "nf")})
        for k in ("la", "lo", "d", "t", "s", "c", "f", "dn"):
            t[k].append(data[k][i])
        t["nf"].append(nf)
        r, q = cell(lat, lon, 4)
        cid = r * 1440 + q
        c = cells.setdefault(cid, [0, 0, 0, 0, 0, -1])   # n_24h, n_7d, n_all, frp_max x10, nonfire, last minute
        if nf:
            c[4] += 1
            continue
        if data["c"][i] == 0:                              # low confidence: shown as a point, not counted
            continue
        age = latest - mins[i]
        c[2] += 1
        if age < 7 * 1440:
            c[1] += 1
        if age < 1440:
            c[0] += 1
        c[3] = max(c[3], data["f"][i])
        c[5] = max(c[5], mins[i])
    ids = sorted(k for k, v in cells.items() if v[2] or v[4])
    ov = {"format": FORMAT, "generation": data["generation"], "from": data["from"], "grid_deg": 0.25, "latest_minute": latest,
          "note": "counts: nominal and high confidence, outside SHIFT non-fire cells; frp in 0.1 MW",
          "id": ids, **{k: [cells[i][j] for i in ids] for j, k in enumerate(("n24", "n7", "n", "fmax", "nf", "last"))}}
    total = 0
    with gzip.open(out / "overview.json.gz", "wb", compresslevel=9) as fh:
        fh.write(json.dumps(ov, separators=(",", ":"), allow_nan=False).encode())
    total += (out / "overview.json.gz").stat().st_size
    (out / "tiles").mkdir(exist_ok=True)
    for old in (out / "tiles").glob("*.json.gz"):
        old.unlink()
    index = {}
    for name, t in sorted(tiles.items()):
        p = out / "tiles" / f"{name}.json.gz"
        with gzip.open(p, "wb", compresslevel=9) as fh:
            fh.write(json.dumps({"format": FORMAT, "generation": data["generation"], "from": data["from"], "satellites": data["satellites"],
                                 "confidence": data["confidence"], "scale": data["scale"], **t},
                                separators=(",", ":"), allow_nan=False).encode())
        index[name] = len(t["la"])
        total += p.stat().st_size
    latest_utc = (datetime(first.year, first.month, first.day, tzinfo=timezone.utc) + timedelta(minutes=latest)) if n else None
    return {"overview_cells": len(ids), "tiles": index, "nonfire_flagged": nf_total if nf_cells is not None else None,
            "latest_detection_utc": latest_utc.strftime("%Y-%m-%dT%H:%MZ") if latest_utc else None,
            "web_bytes": total}


def file_list(out: Path) -> dict:
    """Size and SHA-256 of every data file of a snapshot (paths relative to OUT, "/" separated)."""
    files = {}
    for p in sorted([out / "overview.json.gz", *(out / "tiles").glob("*.json.gz")]):
        files[p.relative_to(out).as_posix()] = {"bytes": p.stat().st_size,
                                                 "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
    return files


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True)
    ap.add_argument("--from", dest="first", default=DEFAULT_FROM, help="first day, YYYY-MM-DD (UTC)")
    ap.add_argument("--to", dest="last", default=None, help="last day, default today (UTC)")
    ap.add_argument("--from-csv", default=None, help="read saved CSVs instead of calling FIRMS (tests)")
    ap.add_argument("--notfire", default=None, help="the site's notfire.json, to flag non-fire heat")
    ap.add_argument("--area", default=WORLD, help='"world" (default) or a box "W,S,E,N". Empty days are judged only for the world')
    ap.add_argument("--now", default=None, help="fetch time to record, YYYY-MM-DDTHH:MM:SSZ (tests only)")
    a = ap.parse_args(argv)
    if a.area != WORLD:
        try:
            w, s, e, n_ = (float(x) for x in a.area.split(","))
            assert -180 <= w < e <= 180 and -90 <= s < n_ <= 90
        except (ValueError, AssertionError):
            print('--area must be "world" or "W,S,E,N"'); return 1
    first = date.fromisoformat(a.first)
    last = date.fromisoformat(a.last) if a.last else datetime.now(timezone.utc).date()
    if last < first:
        print("nothing to fetch: --to is before --from"); return 1
    key = None
    if not a.from_csv:
        key = (os.environ.get("NASA_FIRMS_MAP_KEY") or "").strip()
        if not key:
            print("NASA_FIRMS_MAP_KEY is not set. Nothing fetched."); return 3
    now = datetime.strptime(a.now, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) if a.now else None
    data, status = build(first, last, key, Path(a.from_csv) if a.from_csv else None, area=a.area, now=now)
    if not any(p["requests_ok"] for p in status["products"].values()):
        # nothing usable: write nothing, so the site says "not available" instead of showing an empty map
        print("no request succeeded, nothing written"); return 1
    nf_cells = load_notfire(Path(a.notfire)) if a.notfire else None
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    status.update(write_web(data, out, nf_cells))
    status["files"] = file_list(out)
    (out / "status.json").write_text(json.dumps(status, indent=1, allow_nan=False))
    print(f"wrote {status['rows']} detections, {status['overview_cells']} overview cells, {len(status['tiles'])} tiles, "
          f"{status['web_bytes'] / 1e6:.2f} MB, complete={status['complete']}")
    return 0 if status["complete"] else 2


if __name__ == "__main__":
    sys.exit(main())
