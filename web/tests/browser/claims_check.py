"""Browser check of the corrected Validation and Method wording (11 Nov 2026).
Usage: python tests/browser/claims_check.py http://127.0.0.1:8765/ outdir [--no-validation]
With --no-validation the server must have no data/validation folder: the page must still render."""
import json, os, sys
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
no_val = "--no-validation" in sys.argv
os.makedirs(out, exist_ok=True)
res = {"errors": []}
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    for label, vp in [("desktop", {"width": 1400, "height": 950}), ("phone", {"width": 390, "height": 844})]:
        pg = b.new_page(viewport=vp)
        pg.on("pageerror", lambda e: res["errors"].append(str(e)))
        pg.goto(base + "#validation", wait_until="networkidle"); pg.wait_for_timeout(2500)
        r = {"heading": pg.inner_text("main h2")}
        cov = pg.locator(".facts p.coverage")
        r["coverage_present"] = cov.count() == 1
        if cov.count():
            r["coverage_text"] = cov.inner_text()
            q = pg.locator(".facts p.coverage .qualifier")
            r["qualifier_visible"] = q.is_visible()
            bn, bq = cov.locator("b").bounding_box(), q.bounding_box()
            r["qualifier_below_number_px"] = round(bq["y"] - bn["y"]) if bn and bq else None
            r["no_horizontal_overflow"] = pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")
        r["tables"] = pg.locator("main table").count()
        r["not_available_notes"] = pg.locator("text=Not available in this data release").count()
        pg.screenshot(path=f"{out}/validation_{label}.png", full_page=True)
        r["widest_elements"] = pg.evaluate("""() => [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 4).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))""")
        if not no_val:
            pg.close(); pg = b.new_page(viewport=vp); pg.on("pageerror", lambda e: res["errors"].append(str(e)))
            pg.goto(base + "#method", wait_until="networkidle"); pg.wait_for_timeout(1500)
            li = pg.locator("main li", has_text="calibrated 95% range for the MODIS-to-VIIRS conversion")
            r["method_range_bullet"] = li.inner_text() if li.count() else None
            li.scroll_into_view_if_needed() if li.count() else None
            pg.screenshot(path=f"{out}/method_{label}.png")
            pg.close(); pg = b.new_page(viewport=vp); pg.on("pageerror", lambda e: res["errors"].append(str(e)))
            pg.goto(base + "#switch", wait_until="networkidle"); pg.wait_for_timeout(2500)
            pg.screenshot(path=f"{out}/switch_{label}.png", full_page=True)
            r["switch_facts"] = pg.locator(".facts").all_inner_texts()
            # 95% range labels beside numbers in the explorer (a MODIS-era month, so ranges are shown)
            pg.close(); pg = b.new_page(viewport=vp); pg.on("pageerror", lambda e: res["errors"].append(str(e)))
            pg.goto(base + "#explore?area=preset:se_australia&v=frp&m=2009-12", wait_until="networkidle"); pg.wait_for_timeout(4000)
            body = pg.inner_text("body")
            r["explore_caveat_count"] = body.count("conversion error only")
            r["explore_full_caveat_present"] = "not a guaranteed bound" in body
            r["explore_bare_95_lines"] = [l.strip() for l in body.split("\n") if "95% range" in l and "conversion error" not in l][:6]
            figs = pg.locator("figure.chart")
            r["charts"] = figs.count()
            for i in range(figs.count()):
                if figs.nth(i).locator("svg").count() == 0:
                    continue
                svg = figs.nth(i).locator("svg").first
                bb = svg.bounding_box(timeout=5000)
                if not bb:
                    continue
                svg.scroll_into_view_if_needed()
                bb = svg.bounding_box()
                pg.mouse.move(bb["x"] + bb["width"] * 0.25, bb["y"] + bb["height"] * 0.5); pg.wait_for_timeout(400)
                hv = figs.nth(i).locator(".hover")
                r[f"chart{i}_hover"] = hv.inner_text() if hv.count() else None
                if hv.count():
                    hb = hv.bounding_box()
                    r[f"chart{i}_hover_inside_viewport"] = bool(hb and hb["x"] >= 0 and hb["x"] + hb["width"] <= vp["width"] + 1)
                figs.nth(i).screenshot(path=f"{out}/explore_chart{i}_{label}.png")
            r["explore_no_horizontal_overflow"] = pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")
            pg.screenshot(path=f"{out}/explore_{label}.png", full_page=True)
        res[label] = r
        pg.close()
    b.close()
print(json.dumps(res, indent=1))
