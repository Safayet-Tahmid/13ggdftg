"""Browser check for audit D1: snapshot A is cached in the browser, snapshot B is deployed, the page
is reloaded normally. Everything shown must belong to B, or nothing is shown with an "updating" note.

Usage: python tests/browser/cache_mix_check.py DIST SITE_DATA SNAPSHOT_A SNAPSHOT_B OUTDIR
The server sends Cache-Control: max-age=600 on every file, as GitHub Pages is reported to.
Two cases:
  deploy       the whole folder changes from A to B, then a normal reload
  propagation  status.json is already B, but overview and tiles are still A on the server
               (a deploy still spreading through the CDN)
"""
import functools
import http.server
import json
import shutil
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

dist, data, A, B, out = (Path(a) for a in sys.argv[1:6])
out.mkdir(parents=True, exist_ok=True)
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
URL = "#explore?area=preset:africa_savanna&v=frp&m=2026-09&l=recent&rp=all"
COUNT = "(l) => window.__shiftMap.queryRenderedFeatures({ layers: [l] }).length"
st = {k: json.loads((p / "status.json").read_text()) for k, p in (("A", A), ("B", B))}
res = {"A": {k: st["A"].get(k) for k in ("fetched_utc", "latest_detection_utc", "generation")},
       "B": {k: st["B"].get(k) for k in ("fetched_utc", "latest_detection_utc", "generation")}, "cases": {}}


def site(name):
    root = Path(f"/tmp/cache_mix_{name}")
    shutil.rmtree(root, ignore_errors=True)
    (root / "data").mkdir(parents=True)
    for p in dist.iterdir():
        if p.name != "data":
            (root / p.name).symlink_to(p.resolve())
    for p in data.iterdir():
        (root / "data" / p.name).symlink_to(p.resolve())
    return root


def server(root, seen):
    class H(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header("Cache-Control", "max-age=600")
            super().end_headers()

        def translate_path(self, path):                 # a CDN ignores ?v= when it fetches the file itself
            return super().translate_path(path.split("?")[0])

        def log_message(self, f, *a):
            if "/data/recent/" in self.path:
                seen.append(self.path)
    h = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=str(root)))
    threading.Thread(target=h.serve_forever, daemon=True).start()
    return h, f"http://127.0.0.1:{h.server_address[1]}/"


def look(pg, tag, case):
    r = {"badge": [t for t in pg.locator(".badge").all_inner_texts() if "Recent" in t],
         "retrieved": [l for l in pg.inner_text(".mapbar").splitlines() if l.startswith("Retrieved")],
         "mapnote": pg.inner_text(".mapnote") if pg.locator(".mapnote").count() else None,
         "cells_drawn": pg.evaluate(COUNT, "recent-cells")}
    pg.screenshot(path=str(out / f"{case}_{tag}.png"))
    return r


with sync_playwright() as pw:
    br = pw.chromium.launch(args=GL)
    for case in ("deploy", "propagation"):
        root = site(case)
        shutil.copytree(A, root / "data/recent")
        seen = []
        h, base = server(root, seen)
        pg = br.new_page(viewport={"width": 1400, "height": 950})
        pg.add_init_script("window.__SHIFT_TEST__ = true;")
        pg.goto(base + URL, wait_until="networkidle"); pg.wait_for_timeout(4000)
        r = {"load1": look(pg, "load1", case), "load1_requests": sorted(set(seen))}
        seen.clear()
        if case == "deploy":
            shutil.rmtree(root / "data/recent"); shutil.copytree(B, root / "data/recent", copy_function=shutil.copy)   # new file times, as a deploy
        else:                                           # only status.json and publication.json have arrived
            shutil.copy(B / "status.json", root / "data/recent/status.json")   # copy() gives a new file time
            if (B / "publication.json").exists():
                shutil.copy(B / "publication.json", root / "data/recent/publication.json")
        pg.reload(wait_until="networkidle"); pg.wait_for_timeout(4000)
        r["load2"] = look(pg, "load2", case)
        r["load2_requests"] = sorted(set(seen))
        res["cases"][case] = r
        pg.close(); h.shutdown()
    br.close()

# verdicts
d2 = res["cases"]["deploy"]["load2"]
bf, bl = res["B"]["fetched_utc"].replace("T", " ").replace("Z", " UTC"), res["B"]["latest_detection_utc"].replace("T", " ").replace("Z", " UTC")
res["deploy_all_B"] = bool(d2["retrieved"]) and bf in d2["retrieved"][0] and bl in d2["retrieved"][0] and d2["cells_drawn"] > 0 \
    and any(bl in b for b in d2["badge"])
p2 = res["cases"]["propagation"]["load2"]
res["propagation_shows_nothing_mixed"] = p2["cells_drawn"] == 0 and bool(p2["mapnote"]) and "being updated" in p2["mapnote"]
print(json.dumps(res, indent=1))
