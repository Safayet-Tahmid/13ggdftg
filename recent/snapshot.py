"""SHIFT recent detections (D38): publish a recent-detections snapshot only when it is whole, and
keep the last good one when a refresh fails (Task 2, WP1).

A snapshot is one folder written by recent/fetch_firms.py: status.json, overview.json.gz and
tiles/*.json.gz. The website reads it from data/recent/. This script never fetches from FIRMS,
never needs the FIRMS key, and never reads or writes the historical record.

Commands:
    pull     --site URL --to DIR      copy the snapshot the live website serves now (public, read only)
    check    DIR                      exit 0 if DIR is a whole, consistent snapshot, 1 if not
    publish  --candidate DIR --fetch-exit N --previous DIR --out DIR [--now ISO]
                                      decide what the next build serves and write it to OUT

What publish serves (the attempt is the fetch that just ran):
    A  complete new snapshot          the new snapshot                         state "new"
    B  partial (a chunk or a product  the previous snapshot if it is whole,    state "fallback"
       failed)                        complete and at most 24 h old
                                      otherwise the new one, marked incomplete state "incomplete"
    C  every request failed           the previous snapshot if it is whole     state "fallback"
    D  new snapshot fails the checks  the previous snapshot if it is whole     state "fallback"
    E  no key                         the previous snapshot if it is whole     state "fallback"
    no usable snapshot at all         nothing: the site says "not available"   (no folder)

A served snapshot is always one fetch's files, byte for byte, with that fetch's own status.json
(so its fetched_utc stays the time it was really fetched). The only file added is
publication.json, which says what this build decided and why. Old and new files are never mixed.
The folder is assembled next to OUT, checked again, then swapped in with a rename.
Standard library only.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import fetch_firms as F  # noqa: E402  (product names and confidence classes only)

PUBLICATION_FORMAT = 1
FALLBACK_FOR_PARTIAL_MAX_AGE_H = 24       # B: a previous complete snapshot is preferred only if this fresh
TIME_FMT = "%Y-%m-%dT%H:%M:%SZ"
KNOWN = dict(F.PRODUCTS)                  # product -> satellite code
DATA_KEYS = ("la", "lo", "d", "t", "s", "c", "f", "dn", "nf")
OV_KEYS = ("n24", "n7", "n", "fmax", "nf", "last")
STATUS_FORMATS = (1, 2, 3)
TILE_NAME = re.compile(r"^[NS][0-9]{2}[EW][0-9]{3}$")
MAX_TILES = 18 * 36                       # every 10-degree tile on Earth
# size limits for what pull() downloads (audit D3). The real snapshot of 11 Nov is about 11 MB:
# status.json 40 KB, overview 1.5 MB, largest tile about 0.6 MB.
MAX_BYTES = {"status.json": 2_000_000, "publication.json": 200_000, "overview.json.gz": 20_000_000, "tile": 20_000_000}
MAX_TOTAL_BYTES = 200_000_000


def utc(s: str) -> datetime:
    return datetime.strptime(s, TIME_FMT).replace(tzinfo=timezone.utc)


def now_utc(s: str | None = None) -> datetime:
    return utc(s) if s else datetime.now(timezone.utc).replace(microsecond=0)


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def is_int(x, lo=None, hi=None) -> bool:
    return isinstance(x, int) and not isinstance(x, bool) and (lo is None or x >= lo) and (hi is None or x <= hi)


def read_gz_json(p: Path):
    return json.loads(gzip.decompress(p.read_bytes()))


def tile_bounds(name: str):
    """N20E090 -> (20, 90). None if the name is not a 10-degree tile name."""
    try:
        a = int(name[1:3]) * (1 if name[0] == "N" else -1 if name[0] == "S" else None)
        b = int(name[4:7]) * (1 if name[3] == "E" else -1 if name[3] == "W" else None)
    except (TypeError, ValueError, IndexError):
        return None
    if len(name) != 7 or a % 10 or b % 10 or not (-90 <= a <= 90 and -180 <= b <= 180):
        return None
    return a, b


# ---------------------------------------------------------------------------------------- check

def validate(d: Path) -> tuple[bool, list[str], dict]:
    """Check one snapshot folder. Returns (ok, problems, info). Never raises on bad data."""
    probs: list[str] = []
    info: dict = {}
    try:
        _validate(d, probs, info)
    except Exception as e:  # noqa: BLE001 - any unexpected shape is a failed check, not a crash
        probs.append(f"unreadable snapshot: {type(e).__name__}: {e}"[:300])
    return not probs, probs, info


def _validate(d: Path, probs: list, info: dict) -> None:
    sp = d / "status.json"
    if not sp.is_file():
        probs.append("status.json missing"); return
    s = json.loads(sp.read_text(encoding="utf-8"))
    if not isinstance(s, dict):
        probs.append("status.json is not an object"); return
    if s.get("format") not in STATUS_FORMATS:
        probs.append(f"status format {s.get('format')!r} not supported"); return
    for k in ("fetched_utc", "window", "source", "products", "satellites", "complete", "rows", "tiles",
              "overview_cells", "latest_detection_utc"):
        if k not in s:
            probs.append(f"status lacks {k}")
    if probs:
        return
    try:
        fetched = utc(s["fetched_utc"])
    except (TypeError, ValueError):
        probs.append("fetched_utc is not a UTC time"); return
    w = s["window"]
    try:
        first, last = date.fromisoformat(w["from"]), date.fromisoformat(w["to"])
    except (TypeError, ValueError, KeyError):
        probs.append("window dates are not valid"); return
    days = (last - first).days + 1
    if w.get("days") != days or days < 1:
        probs.append("window days do not match from and to")
    if not str(s["source"]).startswith("NASA FIRMS"):
        probs.append("source is not NASA FIRMS")
    if not s["products"] or not set(s["products"]) <= set(KNOWN):
        probs.append(f"unknown products {sorted(set(s['products']) - set(KNOWN))}")
    sats = s["satellites"]
    if not isinstance(sats, list) or not sats or any(x not in KNOWN.values() for x in sats):
        probs.append("unknown satellites")
    prod_rows = 0
    for name, p in s["products"].items():
        if p.get("satellite") != KNOWN.get(name):
            probs.append(f"{name}: satellite does not match the product")
        if not is_int(p.get("rows"), 0) or not isinstance(p.get("complete"), bool):
            probs.append(f"{name}: rows or complete missing"); continue
        if not isinstance(p.get("per_day"), list) or len(p["per_day"]) != days or not all(is_int(x, 0) for x in p["per_day"]):
            probs.append(f"{name}: per_day does not cover the window")
        elif sum(p["per_day"]) != p["rows"]:
            probs.append(f"{name}: per_day does not add up to rows")
        prod_rows += p["rows"]
    if not is_int(s["rows"], 0) or s["rows"] != prod_rows:
        probs.append("rows do not match the products")
    if s["complete"] is not all(p.get("complete") is True for p in s["products"].values()):
        probs.append("complete flag does not match the products")
    if (s["latest_detection_utc"] is None) != (s["rows"] == 0):
        probs.append("latest detection missing or set without detections")
    if s["latest_detection_utc"]:
        latest = datetime.strptime(s["latest_detection_utc"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
        if latest > fetched + timedelta(minutes=5):
            probs.append("latest detection is after the fetch time")
        if not (datetime(first.year, first.month, first.day, tzinfo=timezone.utc) <= latest
                < datetime(last.year, last.month, last.day, tzinfo=timezone.utc) + timedelta(days=1)):
            probs.append("latest detection is outside the window")
    gen = s.get("generation")
    if s["format"] >= 3:
        if not isinstance(gen, str) or not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}", gen):
            probs.append("generation id missing or not valid")
        if s.get("area") != F.WORLD and not isinstance(s.get("area"), str):
            probs.append("area missing")
        for name, p in s["products"].items():
            sus = p.get("suspect_days")
            if not isinstance(sus, list) or not set(sus) <= set(p.get("days_without_data") or []):
                probs.append(f"{name}: suspect days are not days without data")
            elif p.get("complete") is not (all(r.get("ok") for r in p.get("requests", [])) and not sus):
                probs.append(f"{name}: complete flag does not match its requests and suspect days")
    tiles = s["tiles"]
    if not isinstance(tiles, dict) or not all(is_int(v, 0) for v in tiles.values()):
        probs.append("tile index is not a list of counts"); return
    if sum(tiles.values()) != s["rows"]:
        probs.append("tile counts do not add up to rows")
    info.update(fetched_utc=s["fetched_utc"], complete=s["complete"], rows=s["rows"], status_format=s["format"],
                status_sha256=sha256(sp), missing=missing_coverage(s), generation=gen)

    # files on disk against what status describes: nothing missing, nothing extra
    on_disk = {p.relative_to(d).as_posix() for p in d.rglob("*") if p.is_file()}
    expected = {"overview.json.gz", *(f"tiles/{n}.json.gz" for n in tiles)}
    extra = on_disk - expected - {"status.json", "publication.json"}
    missing = expected - on_disk
    if missing:
        probs.append(f"files missing: {sorted(missing)[:5]}")
    if extra:
        probs.append(f"unexpected files: {sorted(extra)[:5]}")
    if s["format"] >= 2:
        files = s.get("files")
        if not isinstance(files, dict) or set(files) != expected:
            probs.append("status files list does not match the tile index")
        else:
            for rel, meta in files.items():
                p = d / rel
                if p.is_file() and (p.stat().st_size != meta.get("bytes") or sha256(p) != meta.get("sha256")):
                    probs.append(f"{rel}: size or SHA-256 differs from status")
    if probs:
        return

    # overview
    ov = read_gz_json(d / "overview.json.gz")
    n_ids = len(ov.get("id", []))
    if ov.get("format") != F.FORMAT or ov.get("from") != w["from"]:
        probs.append("overview format or start day differs from status")
    if gen is not None and ov.get("generation") != gen:
        probs.append("overview belongs to another fetch (generation differs)")
    if n_ids != s["overview_cells"] or any(len(ov.get(k, [])) != n_ids for k in OV_KEYS):
        probs.append("overview arrays have different lengths")
    else:
        lm = ov.get("latest_minute")
        if not is_int(lm, 0, days * 1440 - 1):
            probs.append("overview latest minute outside the window")
        for i in range(n_ids):
            row = [ov[k][i] for k in OV_KEYS]
            if (not is_int(ov["id"][i], 0, 720 * 1440 - 1) or not all(is_int(x, 0) for x in row[:5])
                    or not is_int(row[5], -1) or not row[0] <= row[1] <= row[2]):
                probs.append(f"overview cell {i} is not valid"); break

    # tiles: every point inside its own tile, every field in range, counts as the index says
    for name, count in tiles.items():
        b = tile_bounds(name)
        if b is None:
            probs.append(f"tile name {name!r} is not valid"); continue
        t = read_gz_json(d / "tiles" / f"{name}.json.gz")
        if t.get("format") != F.FORMAT or t.get("from") != w["from"] or t.get("satellites") != sats:
            probs.append(f"tile {name}: header differs from status"); continue
        if gen is not None and t.get("generation") != gen:
            probs.append(f"tile {name}: belongs to another fetch (generation differs)"); continue
        if any(len(t.get(k, [])) != count for k in DATA_KEYS):
            probs.append(f"tile {name}: {count} detections in the index, arrays differ"); continue
        a0, b0 = b
        for i in range(count):
            la, lo, dd, tt = t["la"][i], t["lo"][i], t["d"][i], t["t"][i]
            if not (is_int(la) and is_int(lo) and is_int(dd, 0, days - 1) and is_int(tt, 0, 2359) and tt % 100 < 60
                    and is_int(t["s"][i], 0, len(sats) - 1) and is_int(t["c"][i], 0, len(F.CONF) - 1)
                    and is_int(t["f"][i], 0) and t["dn"][i] in (0, 1) and t["nf"][i] in (0, 1)):
                probs.append(f"tile {name}: detection {i} has a value out of range"); break
            lat, lon = la / 1e4, lo / 1e4
            in_lat = a0 <= lat <= a0 + 10
            in_lon = b0 <= lon <= b0 + 10 or (b0 == -180 and lon == 180)
            if not (in_lat and in_lon):
                probs.append(f"tile {name}: detection {i} at {lat},{lon} is outside the tile"); break


def missing_coverage(s: dict) -> list[dict]:
    """What an incomplete snapshot lacks, per product: failed requests, and completed days on which a
    global product had no detection at all (suspect days, grouped into runs of consecutive days)."""
    out = []
    for name, p in s.get("products", {}).items():
        for r in p.get("requests", []):
            if not r.get("ok"):
                out.append({"product": name, "satellite": p.get("satellite"), "from": r.get("from"), "days": r.get("days"),
                            "reason": "request failed"})
        run = None
        for d in sorted(p.get("suspect_days") or []):
            day = date.fromisoformat(d)
            if run and day == run["_last"] + timedelta(days=1):
                run["days"] += 1; run["_last"] = day
            else:
                run = {"product": name, "satellite": p.get("satellite"), "from": d, "days": 1,
                       "reason": "no detections on a completed day", "_last": day}
                out.append(run)
    for m in out:
        m.pop("_last", None)
    return out


# ---------------------------------------------------------------------------------------- publish

def attempt_result(candidate: Path, fetch_exit: int) -> tuple[str, str, dict | None]:
    """Classify the fetch that just ran: (letter, detail, info of a valid candidate or None)."""
    if fetch_exit == 3:
        return "E", "no FIRMS key in this build", None
    if not (candidate / "status.json").is_file():
        return "C", f"every FIRMS request failed (fetch exit {fetch_exit})", None
    ok, probs, info = validate(candidate)
    if not ok:
        return "D", "new snapshot failed the checks: " + "; ".join(probs[:3]), None
    if fetch_exit != 0 or not info["complete"]:
        miss = ", ".join(f"{m['satellite']} {m['from']} +{m['days']}d" for m in info["missing"]) or "unknown part"
        return "B", f"partial: missing {miss}", info
    return "A", "complete", info


def decide(candidate: Path, fetch_exit: int, previous: Path | None, now: datetime) -> dict:
    letter, detail, cinfo = attempt_result(candidate, fetch_exit)
    pinfo = None
    if previous and (previous / "status.json").is_file():
        ok, probs, info = validate(previous)
        pinfo = info if ok else None
        prev_note = None if ok else "previous snapshot rejected: " + "; ".join(probs[:3])
    else:
        prev_note = "no previous snapshot"
    base = {"attempt": {"result": letter, "detail": detail}, "previous_note": prev_note}
    if letter == "A":
        return {**base, "serve": "candidate", "state": "new", "info": cinfo}
    if letter == "B":
        if pinfo and pinfo["complete"]:
            age_h = (now - utc(pinfo["fetched_utc"])).total_seconds() / 3600
            if age_h <= FALLBACK_FOR_PARTIAL_MAX_AGE_H:
                return {**base, "serve": "previous", "state": "fallback", "info": pinfo}
            base["previous_note"] = f"previous complete snapshot is {age_h:.0f} h old, too old to prefer"
        return {**base, "serve": "candidate", "state": "incomplete", "info": cinfo}
    if pinfo:
        return {**base, "serve": "previous", "state": "fallback", "info": pinfo}
    return {**base, "serve": None, "state": "none", "info": None}


def publish(candidate: Path, fetch_exit: int, previous: Path | None, out: Path, now: datetime) -> dict:
    dec = decide(candidate, fetch_exit, previous, now)
    staging = out.parent / f".{out.name}.staging"
    old = out.parent / f".{out.name}.old"
    for p in (staging, old):
        if p.exists():
            shutil.rmtree(p)
    if dec["serve"] is None:
        if out.exists():
            shutil.rmtree(out)
        return dec
    src = candidate if dec["serve"] == "candidate" else previous
    shutil.copytree(src, staging, ignore=shutil.ignore_patterns("publication.json"))
    info = dec["info"]
    pub = {
        "format": PUBLICATION_FORMAT,
        "state": dec["state"],
        "decided_utc": now.strftime(TIME_FMT),
        "snapshot_fetched_utc": info["fetched_utc"],
        "generation": info.get("generation"),
        "status_sha256": info["status_sha256"],
        "complete": info["complete"],
        "missing": info["missing"],
        "attempt": dec["attempt"],
    }
    if dec["serve"] == "previous":
        prev_pub = previous / "publication.json"
        if prev_pub.is_file():
            try:
                pub["previous_publication_state"] = json.loads(prev_pub.read_text(encoding="utf-8")).get("state")
            except ValueError:
                pub["previous_publication_state"] = "unreadable"
    (staging / "publication.json").write_text(json.dumps(pub, indent=1, allow_nan=False), encoding="utf-8")
    ok, probs, _ = validate(staging)
    if not ok:                                    # should not happen: the source was checked already
        shutil.rmtree(staging)
        if out.exists():
            shutil.rmtree(out)
        return {**dec, "serve": None, "state": "none", "staging_problems": probs}
    if out.exists():
        out.rename(old)
    staging.rename(out)
    if old.exists():
        shutil.rmtree(old)
    dec["publication"] = pub
    return dec


# ---------------------------------------------------------------------------------------- pull

def _get(url: str, limit: int, timeout: int = 60, tries: int = 3) -> tuple[int, bytes]:
    """GET with revalidation headers, a size limit and retries. Returns (http code, body)."""
    req = urllib.request.Request(url, headers={"User-Agent": "SHIFT-recent-snapshot/2", "Accept-Encoding": "identity",
                                               "Cache-Control": "no-cache", "Pragma": "no-cache"})
    code = 0
    for _ in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                length = r.headers.get("Content-Length")
                if length and int(length) > limit:
                    return -1, b""
                body = r.read(limit + 1)
                return (-1, b"") if len(body) > limit else (r.status, body)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 404, b""
            code = e.code
        except Exception:  # noqa: BLE001 - network problems: try again, then report
            code = 0
    return code, b""


def _safe_names(s) -> list[str] | None:
    """The relative paths a snapshot may contain, or None if the status is not safe to follow.
    Only "overview.json.gz" and "tiles/<N20E090>.json.gz" with a valid 10-degree tile name."""
    if not isinstance(s, dict) or s.get("format") not in STATUS_FORMATS or not isinstance(s.get("tiles"), dict):
        return None
    names = list(s["tiles"])
    if len(names) > MAX_TILES or not all(isinstance(n, str) and TILE_NAME.fullmatch(n) and tile_bounds(n) for n in names):
        return None
    rels = ["overview.json.gz", *(f"tiles/{n}.json.gz" for n in names)]
    files = s.get("files")
    if s["format"] >= 2 and (not isinstance(files, dict) or set(files) != set(rels)):
        return None
    return rels


def pull(site: str, to: Path, request_id: str | None = None) -> tuple[bool, str]:
    """Copy the snapshot the live site serves into TO, keep it only if it passes validate().

    Audit D3: every name is checked before anything is written, every target must lie inside the
    download folder, files are created new (never through an existing link), sizes are limited.
    Audit D5: each request carries "Cache-Control: no-cache" and a query unique to this run, and
    status.json is read again at the end. If it changed during the copy (a deploy in between, or a
    cache answering with an older status), the copy is dropped. A cached but complete older snapshot
    can still pass, so the copy is never treated as new: publish() only serves it as a fallback,
    with its own fetch time."""
    rid = request_id or os.environ.get("GITHUB_RUN_ID") or uuid.uuid4().hex
    q = f"?shift_pull={rid}"
    base = site.rstrip("/") + "/data/recent/"
    tmp = to.parent / f".{to.name}.download"
    for p in (tmp,):
        if p.is_symlink() or p.is_file():
            p.unlink()
        elif p.exists():
            shutil.rmtree(p)
    code, status_body = _get(base + "status.json" + q, MAX_BYTES["status.json"])
    if code != 200:
        return False, f"no previous snapshot on the live site (status.json http {code})"
    try:
        s = json.loads(status_body)
    except ValueError:
        return False, "previous status.json is not readable"
    rels = _safe_names(s)
    if rels is None:
        return False, "previous status.json rejected before download: unsupported format or unsafe file names"
    tmp.mkdir(parents=True)
    root = tmp.resolve()
    total = len(status_body)

    def write(rel: str, body: bytes) -> bool:
        target = (tmp / rel)
        if not target.resolve().is_relative_to(root):
            return False
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "xb") as fh:              # exclusive create: never follows an existing file or link
            fh.write(body)
        return True

    write("status.json", status_body)
    code, body = _get(base + "publication.json" + q, MAX_BYTES["publication.json"])
    if code == 200:
        write("publication.json", body)
    for rel in rels:
        code, body = _get(base + rel + q, MAX_BYTES["overview.json.gz" if rel == "overview.json.gz" else "tile"])
        total += len(body)
        if code != 200 or total > MAX_TOTAL_BYTES or not write(rel, body):
            shutil.rmtree(tmp)
            return False, f"previous snapshot incomplete or too large on the live site ({rel} http {code})"
    code, again = _get(base + "status.json" + q + "-end", MAX_BYTES["status.json"])
    if code != 200 or again != status_body:
        shutil.rmtree(tmp)
        return False, "previous snapshot changed during the copy (a deploy in between or a stale cache), not used"
    ok, probs, _ = validate(tmp)
    if not ok:
        shutil.rmtree(tmp)
        return False, "previous snapshot rejected: " + "; ".join(probs[:3])
    if to.is_symlink() or to.is_file():
        to.unlink()
    elif to.exists():
        shutil.rmtree(to)
    tmp.rename(to)
    return True, f"previous snapshot copied ({len(rels) + 1} files)"


# ---------------------------------------------------------------------------------------- cli

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("pull"); a.add_argument("--site", required=True); a.add_argument("--to", required=True)
    c = sub.add_parser("check"); c.add_argument("dir")
    p = sub.add_parser("publish")
    p.add_argument("--candidate", required=True); p.add_argument("--fetch-exit", type=int, required=True)
    p.add_argument("--previous", default=None); p.add_argument("--out", required=True)
    p.add_argument("--now", default=None, help="UTC time to decide at, YYYY-MM-DDTHH:MM:SSZ (tests)")
    p.add_argument("--summary", default=None, help="append a short markdown summary to this file")
    args = ap.parse_args(argv)
    if args.cmd == "pull":
        ok, msg = pull(args.site, Path(args.to))
        print(msg)
        return 0 if ok else 1
    if args.cmd == "check":
        ok, probs, info = validate(Path(args.dir))
        print("OK" if ok else "NOT OK", json.dumps({"problems": probs[:10], "fetched_utc": info.get("fetched_utc"),
                                                    "complete": info.get("complete"), "rows": info.get("rows")}))
        return 0 if ok else 1
    dec = publish(Path(args.candidate), args.fetch_exit, Path(args.previous) if args.previous else None,
                  Path(args.out), now_utc(args.now))
    line = (f"recent detections: attempt {dec['attempt']['result']} ({dec['attempt']['detail']}); "
            f"serving {dec['state']}"
            + (f", fetched {dec['info']['fetched_utc']}, complete={dec['info']['complete']}" if dec.get("info") and dec["state"] != "none" else "")
            + (f"; {dec['previous_note']}" if dec.get("previous_note") else ""))
    print(line)
    if args.summary:
        with open(args.summary, "a", encoding="utf-8") as fh:
            fh.write(f"### Recent detections\n\n{line}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
