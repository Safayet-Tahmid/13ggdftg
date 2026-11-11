"""Browser check of the recent-detections states (Task 2): fresh, not current (old), kept after a
failed refresh (fallback), incomplete, and not available. The historical record must work in every one.

Usage: python tests/browser/recent_states_check.py DIST SITE_DATA RECENT_SNAPSHOT OUTDIR
  DIST             the built site (web/dist, without data/)
  SITE_DATA        the unpacked site_data.zip (the historical record)
  RECENT_SNAPSHOT  one real snapshot folder written by recent/fetch_firms.py
The clock is fixed with Playwright (Date.now only, timers keep running), so "not current" is tested
without waiting for a real outage. recent/snapshot.py builds each state, exactly as the workflow does.
"""
import functools
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

dist, site_data, snap, out = (Path(a) for a in sys.argv[1:5])
out.mkdir(parents=True, exist_ok=True)
REPO = Path(__file__).resolve().parents[3]
SNAPSHOT = REPO / "recent" / "snapshot.py"
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
fetched = datetime.strptime(json.loads((snap / "status.json").read_text())["fetched_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
tmp = Path(tempfile.mkdtemp(prefix="recent_states_"))


def site(name: str, recent: Path | None) -> Path:
    root = tmp / name
    (root / "data").mkdir(parents=True)
    for p in dist.iterdir():
        if p.name != "data":
            (root / p.name).symlink_to(p.resolve())
    for p in site_data.iterdir():
        (root / "data" / p.name).symlink_to(p.resolve())
    if recent:
        shutil.copytree(recent, root / "data" / "recent")
    return root


def publish(name, candidate, code, previous, now):
    o = tmp / f"pub_{name}"
    r = subprocess.run([sys.executable, str(SNAPSHOT), "publish", "--candidate", str(candidate), "--fetch-exit", str(code),
                        "--previous", str(previous), "--out", str(o), "--now", now.strftime("%Y-%m-%dT%H:%M:%SZ")],
                       capture_output=True, text=True)
    return (o if o.exists() else None), r.stdout.strip()


# the incomplete state: the same detections, with NOAA-21's last request marked as failed
inc = tmp / "incomplete_src"
shutil.copytree(snap, inc)
st = json.loads((inc / "status.json").read_text())
st.pop("files", None); st["format"] = 1
p21 = st["products"]["VIIRS_NOAA21_NRT"]
p21["requests"][-1]["ok"] = False; p21["requests_ok"] -= 1; p21["complete"] = False; st["complete"] = False
(inc / "status.json").write_text(json.dumps(st, indent=1))

soon, later = fetched + timedelta(hours=2), fetched + timedelta(hours=13)
states = {}
states["fresh"] = (*publish("fresh", snap, 0, tmp / "none", soon), soon)
states["old"] = (*publish("old", snap, 0, tmp / "none", soon), later)                 # same files, reader 13 h later
states["fallback"] = (*publish("fallback", tmp / "none", 1, snap, soon), soon)       # refresh failed 2 h after the fetch
states["incomplete"] = (*publish("incomplete", inc, 2, tmp / "none", soon), soon)
states["unavailable"] = (*publish("unavailable", tmp / "none", 1, tmp / "none", soon), soon)

res = {"errors": [], "states": {}}
URL = "#explore?area=preset:africa_savanna&v=frp&m=2026-09&l=recent&rp=24h"
COUNT = "(l) => window.__shiftMap.queryRenderedFeatures({ layers: [l] }).length"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=GL)
    for name, (recent, decision, clock) in states.items():
        root = site(name, recent)
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{httpd.server_address[1]}/"
        r = {"decision": decision, "reader_clock_utc": clock.strftime("%Y-%m-%dT%H:%MZ")}
        pg = b.new_page(viewport={"width": 1400, "height": 950})
        pg.add_init_script("window.__SHIFT_TEST__ = true;")
        pg.clock.set_fixed_time(clock)
        pg.on("pageerror", lambda e, n=name: res["errors"].append(f"{n}: {e}"))
        pg.on("console", lambda m, n=name: res["errors"].append(f"{n} console {m.type}: {m.text}") if m.type == "error" else None)
        pg.goto(base + URL, wait_until="networkidle"); pg.wait_for_timeout(5000)
        r["badge"] = [t for t in pg.locator(".badge").all_inner_texts() if "Recent" in t]
        r["layer_option_disabled"] = pg.evaluate("() => document.querySelector('.maptools select option[value=recent]').disabled")
        r["layer_selected"] = pg.evaluate("() => document.querySelector('.maptools select').value")
        r["period_label"] = pg.evaluate("() => { const s = document.querySelectorAll('.mapbar select')[0]; return s ? s.options[s.selectedIndex].text : null }")
        r["mapbar"] = pg.inner_text(".mapbar") if pg.locator(".mapbar").count() else None
        r["notice"] = pg.inner_text(".recentnotice") if pg.locator(".recentnotice").count() else None
        r["mapnote"] = pg.inner_text(".mapnote") if pg.locator(".mapnote").count() else None
        r["recent_cells_drawn"] = pg.evaluate(COUNT, "recent-cells") if r["layer_selected"] == "recent" else 0
        pg.screenshot(path=str(out / f"{name}_recent.png"))
        if pg.locator(".mapbar").count():
            pg.locator(".mapbar").screenshot(path=str(out / f"{name}_mapbar.png"))
        # the historical record in the same build
        pg.select_option(".maptools select", "record"); pg.wait_for_timeout(3000)
        r["record_cells_drawn"] = pg.evaluate(COUNT, "fires") + pg.evaluate(COUNT, "firecells")
        r["story_has_rank"] = "Rank" in pg.inner_text(".story")
        pg.screenshot(path=str(out / f"{name}_record.png"))
        pg.close(); httpd.shutdown()
        res["states"][name] = r
    b.close()
shutil.rmtree(tmp)
print(json.dumps(res, indent=1))
