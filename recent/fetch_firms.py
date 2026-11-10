"""SHIFT recent detections (decision D38): fetch NASA FIRMS near-real-time VIIRS fire detections
from NOAA-20 and NOAA-21, check every row, and write two small static files for the website.

This is a SEPARATE layer. It never reads, writes or imports the historical pipeline
(pipeline/shift), its settings or the released `site-data`. Recent detections are raw FIRMS NRT
points. They are NOT on SHIFT's harmonised scale and are never added to the historical record.

Usage (the key comes from the environment, never from the command line):
    NASA_FIRMS_MAP_KEY=... python recent/fetch_firms.py --out web/public/data/recent
    python recent/fetch_firms.py --out OUT --from-csv DIR      # offline: read saved FIRMS CSVs

Outputs in OUT:
    recent.json.gz   the detections, column by column (see FORMAT below)
    status.json      when it ran, the window, per product: requests, rows kept and rejected,
                     detections per day (a day with 0 worldwide means no data, not no fire)

Exit code: 0 all products fetched, 2 some product or chunk failed, 1 nothing usable.
Standard library only.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
PRODUCTS = {"VIIRS_NOAA20_NRT": "N20", "VIIRS_NOAA21_NRT": "N21"}
# The historical record's last full day is 2026-10-28 (meta.last_data_day). The recent layer starts
# ON that day, so one day overlaps on purpose: it lets anyone compare the two sources for one day.
DEFAULT_FROM = "2026-10-28"
MAX_DAYS_PER_REQUEST = 5          # FIRMS Area API limit (DAY_RANGE 1..5)
REQUIRED = ("latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "daynight")
CONF = ("l", "n", "h")            # VIIRS confidence classes, stored as an index into this tuple
FORMAT = 1


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
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            reject("coordinates out of range"); continue
        if frp < 0:
            reject("negative frp"); continue
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


def fetch_product(product: str, sat: str, first: date, last: date, key: str | None, csv_dir: Path | None, log):
    rows, rejected, requests = [], {}, []
    for start, n in chunks(first, last):
        if csv_dir:
            p = csv_dir / f"{product}_{start.isoformat()}_{n}.csv"
            status, body = (200, p.read_text(encoding="utf-8")) if p.exists() else (404, "")
            secs = 0.0
        else:
            url = f"{API}/{key}/{product}/world/{n}/{start.isoformat()}"
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
    # the same detection can come back in two overlapping requests: keep it once
    before = len(rows)
    rows = sorted(set(rows))
    return rows, rejected, requests, before - len(rows)


def build(first: date, last: date, key: str | None, csv_dir: Path | None, log=print):
    days = (last - first).days + 1
    cols = {k: [] for k in ("s", "d", "t", "la", "lo", "c", "f", "dn")}
    status = {
        "format": FORMAT,
        "fetched_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": {"from": first.isoformat(), "to": last.isoformat(), "days": days},
        "source": "NASA FIRMS Area API, near-real-time VIIRS 375 m active fire (raw detections, not harmonised)",
        "overlap_note": f"{first.isoformat()} is also the last full day of the SHIFT historical record (overlap kept on purpose)",
        "products": {},
    }
    sats = list(PRODUCTS.values())
    for si, (product, sat) in enumerate(PRODUCTS.items()):
        log(f"{product} ({sat}) {first} to {last}")
        rows, rejected, requests, dupes = fetch_product(product, sat, first, last, key, csv_dir, log)
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
            # no detection anywhere on Earth on a day means the product had no data that day
            "days_without_data": [(first + timedelta(days=k)).isoformat() for k, n in enumerate(per_day) if n == 0],
            "complete": ok_chunks == len(requests),
        }
    status["satellites"] = sats
    status["complete"] = all(p["complete"] for p in status["products"].values())
    status["rows"] = len(cols["s"])
    data = {"format": FORMAT, "from": first.isoformat(), "days": days, "satellites": sats,
            "confidence": list(CONF), "scale": {"la": 1e-4, "lo": 1e-4, "f": 0.1}, **cols}
    return data, status


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True)
    ap.add_argument("--from", dest="first", default=DEFAULT_FROM, help="first day, YYYY-MM-DD (UTC)")
    ap.add_argument("--to", dest="last", default=None, help="last day, default today (UTC)")
    ap.add_argument("--from-csv", default=None, help="read saved CSVs instead of calling FIRMS (tests)")
    a = ap.parse_args(argv)
    first = date.fromisoformat(a.first)
    last = date.fromisoformat(a.last) if a.last else datetime.now(timezone.utc).date()
    if last < first:
        print("nothing to fetch: --to is before --from"); return 1
    key = None
    if not a.from_csv:
        key = (os.environ.get("NASA_FIRMS_MAP_KEY") or "").strip()
        if not key:
            print("NASA_FIRMS_MAP_KEY is not set. Nothing fetched."); return 1
    data, status = build(first, last, key, Path(a.from_csv) if a.from_csv else None)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(data, separators=(",", ":")).encode()
    with gzip.open(out / "recent.json.gz", "wb", compresslevel=9) as fh:
        fh.write(raw)
    status["file_bytes"] = (out / "recent.json.gz").stat().st_size
    (out / "status.json").write_text(json.dumps(status, indent=1))
    ok = sum(p["requests_ok"] for p in status["products"].values())
    print(f"wrote {status['rows']} detections, {status['file_bytes'] / 1e6:.2f} MB, complete={status['complete']}")
    if ok == 0:
        return 1
    return 0 if status["complete"] else 2


if __name__ == "__main__":
    sys.exit(main())
