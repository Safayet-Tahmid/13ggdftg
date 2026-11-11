"""SHIFT weather context (decision D39): fetch NASA POWER daily weather for the preset areas and
write one small static file per preset for the website.

This is a SEPARATE layer, like recent/. It never reads, writes or imports the historical pipeline
(pipeline/shift), its settings or the released `site-data`. Weather is context shown beside the
fire comparison. It is never used in the harmonised record, the anomaly classes or any score.

Every choice (variables, UTC days, the 3 x 3 point grid, missing days) is in
context/power_rules.json, which was committed before the first fetch. The manifest records the
SHA-256 of that file, so anyone can check which rules made the data.

Usage:
    python context/fetch_power.py --out web/public/context            # fetch and write
    python context/fetch_power.py --out OUT --cache DIR                # keep raw answers in DIR
    python context/fetch_power.py --out OUT --cache DIR --offline      # rebuild from DIR only

Outputs in OUT:
    power/<preset id>.json   daily area values from 2003-01-01, one array per parameter
                             (null = missing), plus the nine points used
    power/index.json         fetch time, period, source, rules SHA-256, and the size and
                             SHA-256 of every preset file

NASA POWER needs no key. Raw answers are only cached locally (never committed).
Exit code: 0 all presets written, 1 something failed (nothing is written then).
Standard library only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
RULES_PATH = HERE / "power_rules.json"
END_LAG_DAYS = 3          # the last day fetched is at most this many days before the fetch
PAUSE_S = 1.0             # be polite to the POWER servers between requests
USER_AGENT = "SHIFT-weather-context/1.0 (NASA Space Apps 2026, github.com/squadronzero/squadron-zero)"


def load_rules(path: Path = RULES_PATH) -> tuple[dict, str]:
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def grid_points(box: list[float]) -> list[tuple[float, float]]:
    """Nine points (lat, lon): the centres of the nine equal parts of the box [w, s, e, n]."""
    w, s, e, n = box
    pts = []
    for i in range(3):
        lat = s + (i + 0.5) * (n - s) / 3
        for j in range(3):
            lon = w + (j + 0.5) * (e - w) / 3
            pts.append((round(lat, 4), round(lon, 4)))
    return pts


def days_between(start: dt.date, end: dt.date) -> list[dt.date]:
    return [start + dt.timedelta(days=k) for k in range((end - start).days + 1)]


def request_url(rules: dict, lat: float, lon: float, start: dt.date, end: dt.date) -> str:
    q = {
        "parameters": ",".join(rules["parameters"]),
        "community": rules["source"]["community"],
        "latitude": f"{lat}",
        "longitude": f"{lon}",
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "time-standard": rules["source"]["time_standard"],
        "format": "JSON",
    }
    return rules["source"]["endpoint"] + "?" + urllib.parse.urlencode(q)


def fetch_json(url: str, tries: int = 4) -> dict:
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            time.sleep(5 * (k + 1))
    raise RuntimeError(f"POWER request failed after {tries} tries: {last}")


def point_series(answer: dict, params: list[str], days: list[dt.date]) -> dict[str, list[float | None]]:
    """One point's answer -> {param: [value or None per day]}. POWER marks missing with a fill value."""
    fill = answer.get("header", {}).get("fill_value", -999.0)
    got = answer["properties"]["parameter"]
    out = {}
    for p in params:
        series = got.get(p, {})
        vals = []
        for d in days:
            v = series.get(d.strftime("%Y%m%d"))
            vals.append(None if v is None or v == fill or v <= -998 else float(v))
        out[p] = vals
    return out


def area_series(points: list[dict[str, list[float | None]]], params: list[str], n_days: int,
                decimals: dict[str, int]) -> dict[str, list[float | None]]:
    """Mean of the points per day. A day is missing if ANY point is missing (rules: missing stays missing)."""
    out = {}
    for p in params:
        col = []
        for k in range(n_days):
            vals = [pt[p][k] for pt in points]
            col.append(None if any(v is None for v in vals) else round(sum(vals) / len(vals), decimals[p]))
        out[p] = col
    return out


def last_complete_day(series: dict[str, list[float | None]], days: list[dt.date]) -> int:
    """Index of the last day on which every parameter has a value."""
    for k in range(len(days) - 1, -1, -1):
        if all(series[p][k] is not None for p in series):
            return k
    return -1


def build(out: Path, cache: Path | None, offline: bool, today: dt.date | None = None,
          fetch=fetch_json, only: list[str] | None = None) -> int:
    rules, rules_sha = load_rules()
    params = list(rules["parameters"])
    decimals = {p: rules["parameters"][p]["decimals"] for p in params}
    today = today or dt.datetime.now(dt.timezone.utc).date()
    start = dt.date.fromisoformat(rules["period"]["start"])
    end = today - dt.timedelta(days=END_LAG_DAYS)
    days = days_between(start, end)
    presets = [p for p in rules["presets"] if not only or p["id"] in only]

    results = {}
    for pr in presets:
        pts = grid_points(pr["box"])
        answers = []
        for lat, lon in pts:
            key = f"{pr['id']}_{lat}_{lon}_{start:%Y%m%d}_{end:%Y%m%d}.json"
            cached = cache / key if cache else None
            if cached and cached.exists():
                ans = json.loads(cached.read_text())
            elif offline:
                print(f"missing in cache: {key}", file=sys.stderr)
                return 1
            else:
                ans = fetch(request_url(rules, lat, lon, start, end))
                if cached:
                    cached.parent.mkdir(parents=True, exist_ok=True)
                    cached.write_text(json.dumps(ans))
                time.sleep(PAUSE_S)
            answers.append(point_series(ans, params, days))
        water = [k for k, a in enumerate(answers) if all(v is None for v in a["GWETROOT"])]
        land = [a for k, a in enumerate(answers) if k not in water]
        if not land:
            print(f"{pr['id']}: every point is over water", file=sys.stderr)
            return 1
        series = area_series(land, params, len(days), decimals)
        last = last_complete_day(series, days)
        if last < 0:
            print(f"{pr['id']}: no complete day", file=sys.stderr)
            return 1
        series = {p: v[: last + 1] for p, v in series.items()}
        results[pr["id"]] = {
            "id": pr["id"], "name": pr["name"], "box": pr["box"],
            "points": [[lat, lon] for k, (lat, lon) in enumerate(pts) if k not in water],
            "water_points": [[lat, lon] for k, (lat, lon) in enumerate(pts) if k in water],
            "start": start.isoformat(), "end": days[last].isoformat(),
            "values": series,
        }
        missing = {p: sum(1 for v in series[p] if v is None) for p in params}
        print(f"{pr['id']:18s} {start} to {days[last]}  land points {len(land)}  missing days {missing}")

    fetched = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    dest = out / "power"
    dest.mkdir(parents=True, exist_ok=True)
    files = {}
    for pid, body in results.items():
        body = {**body, "fetched_utc": fetched}
        data = json.dumps(body, separators=(",", ":"), allow_nan=False).encode()
        (dest / f"{pid}.json").write_bytes(data)
        files[pid] = {"file": f"{pid}.json", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                      "end": body["end"]}
    index = {
        "decision": "D39", "fetched_utc": fetched, "rules_sha256": rules_sha,
        "source": rules["source"], "parameters": rules["parameters"], "comparison": rules["comparison"],
        "start": start.isoformat(), "files": files,
    }
    (dest / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    print(f"wrote {len(files)} preset files to {dest}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--cache", type=Path)
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--only", nargs="*", help="preset ids (default: all)")
    a = ap.parse_args(argv)
    if a.offline and not a.cache:
        ap.error("--offline needs --cache")
    return build(a.out, a.cache, a.offline, only=a.only)


if __name__ == "__main__":
    sys.exit(main())
