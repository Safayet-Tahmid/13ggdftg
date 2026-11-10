"""Browser check of the recent-detections layer (D38) on the built site.
Needs dist/data with the released site data AND dist/data/recent from recent/fetch_firms.py.
Usage: python tests/browser/recent_check.py http://127.0.0.1:8765/ outdir [--no-recent]
With --no-recent, the server must have no data/recent folder: the layer must be refused cleanly.
"""
import json, os, sys
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
no_recent = "--no-recent" in sys.argv
os.makedirs(out, exist_ok=True)
res = {"errors": [], "console": []}
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => { const m = window.__shiftMap; return !!(m && m.getSource('fires') && m.loaded()); }"
STORY = "() => document.querySelector('.story').innerText"
COUNT = "(l) => window.__shiftMap.queryRenderedFeatures({ layers: [l] }).length"
LAYER = ".maptools select >> nth=0"

with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    pg = b.new_page(viewport={"width": 1500, "height": 950})
    pg.add_init_script("window.__SHIFT_TEST__ = true;")
    pg.on("pageerror", lambda e: res["errors"].append(str(e)))
    pg.on("console", lambda m: res["console"].append(m.text) if m.type == "error" else None)
    pg.goto(base + "#explore?area=preset:africa_savanna&v=frp&m=2026-09", wait_until="networkidle")
    pg.wait_for_function(READY, timeout=60000); pg.wait_for_timeout(8000)
    story_before = pg.evaluate(STORY)
    fires_before = pg.evaluate(COUNT, "fires") + pg.evaluate(COUNT, "firecells")
    res["badges"] = pg.locator(".badge").all_inner_texts()
    res["recent_option_disabled"] = pg.evaluate("() => document.querySelector('.maptools select option[value=recent]').disabled")

    if no_recent:
        res["record_story_ok"] = len(story_before) > 500
        b.close()
        res["console"] = [c for c in res["console"] if "status.json" not in c and "404" not in c]
        print(json.dumps(res, indent=1)); sys.exit(0)

    # switch to recent detections: record layers hidden, overview drawn, story untouched
    pg.select_option(LAYER, "recent"); pg.wait_for_timeout(3500)
    res["vis"] = pg.evaluate("() => ['fires','firecells','recent-cells','recent-pts'].map(l => window.__shiftMap.getLayoutProperty(l, 'visibility'))")
    res["overview_cells_drawn"] = pg.evaluate(COUNT, "recent-cells")
    res["record_drawn_in_recent_mode"] = pg.evaluate(COUNT, "fires") + pg.evaluate(COUNT, "firecells")
    res["story_unchanged_by_layer"] = pg.evaluate(STORY) == story_before
    res["mapbar"] = pg.inner_text(".mapbar")
    res["legend"] = pg.inner_text(".maplegend")[:300]
    res["hash"] = pg.evaluate("() => location.hash")
    pg.screenshot(path=f"{out}/1_recent_overview_world.png")
    n7 = res["overview_cells_drawn"]
    pg.select_option(".mapbar select >> nth=0", "24h"); pg.wait_for_timeout(2500)
    res["cells_24h_vs_7d"] = [pg.evaluate(COUNT, "recent-cells"), n7]
    pg.select_option(".mapbar select >> nth=0", "7d"); pg.wait_for_timeout(1500)

    # globe and zoom in over central Africa: single detections load
    pg.get_by_role("button", name="3D globe").click(); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__shiftMap.jumpTo({ center: [22.5, 5], zoom: 7.2 })")
    pg.wait_for_timeout(6000)
    res["points_drawn_zoomed"] = pg.evaluate(COUNT, "recent-pts")
    res["legend_zoomed"] = pg.inner_text(".maplegend")[:120]
    pg.screenshot(path=f"{out}/2_recent_points_globe_africa.png")

    # hover popup is plain text, click opens the panel
    pt = pg.evaluate("""() => { const m = window.__shiftMap; const f = m.queryRenderedFeatures({ layers: ['recent-pts'] })
      .sort((a, b) => b.properties.frp - a.properties.frp)[0]; if (!f) return null;
      const s = m.project(f.geometry.coordinates); return { x: s.x, y: s.y, p: f.properties }; }""")
    res["clicked_point"] = pt and pt["p"]
    if pt:
        bb = pg.locator(".map canvas").bounding_box()
        pg.mouse.move(bb["x"] + pt["x"], bb["y"] + pt["y"]); pg.wait_for_timeout(500)
        res["popup_text"] = pg.locator(".tip").all_inner_texts()
        res["popup_has_html_tags_from_data"] = pg.evaluate("() => [...document.querySelectorAll('.tip *')].some(e => !['B','DIV'].includes(e.tagName) && !e.className.includes('maplibregl'))")
        pg.mouse.click(bb["x"] + pt["x"], bb["y"] + pt["y"]); pg.wait_for_timeout(800)
        res["panel"] = pg.inner_text(".recentpanel") if pg.locator(".recentpanel").count() else None
        res["panel_matches_clicked_point"] = bool(res["panel"]) and f"{pt['p']['frp']} MW" in res["panel"]
        pg.screenshot(path=f"{out}/3_recent_detection_panel.png")
        if res["panel"]:
            pg.get_by_role("button", name="Show the history of this area (50 km around)").click()
            pg.wait_for_timeout(5000)
            res["history_area"] = pg.inner_text(".story h2")
            pg.screenshot(path=f"{out}/4_history_of_detection_area.png")

    # back to the record: exactly as before for the same area (a fresh page: a hash change alone does not reload)
    pg.close(); pg = b.new_page(viewport={"width": 1500, "height": 950}); pg.add_init_script("window.__SHIFT_TEST__ = true;")
    pg.on("pageerror", lambda e: res["errors"].append(str(e)))
    pg.goto(base + "#explore?area=preset:africa_savanna&v=frp&m=2026-09&l=recent", wait_until="networkidle")
    pg.wait_for_function(READY, timeout=60000); pg.wait_for_timeout(3000)
    res["reload_keeps_recent"] = pg.input_value(LAYER) == "recent"
    pg.select_option(LAYER, "record"); pg.wait_for_timeout(8000)
    res["back_to_record_story_identical"] = pg.evaluate(STORY) == story_before
    res["back_to_record_layers_visible"] = pg.evaluate("() => ['fires','firecells'].map(l => window.__shiftMap.getLayoutProperty(l, 'visibility'))")
    res["recent_drawn_in_record_mode"] = pg.evaluate(COUNT, "recent-cells") + pg.evaluate(COUNT, "recent-pts")
    # the other pages still load
    for tab in ["The 2012 switch", "Validation", "Method and data"]:
        pg.get_by_role("link", name=tab).first.click() if pg.get_by_role("link", name=tab).count() else pg.get_by_text(tab).first.click()
        pg.wait_for_timeout(1500)
    res["method_mentions_d38"] = "recent detections" in pg.inner_text("main").lower()
    b.close()

res["console"] = [c for c in res["console"] if not any(x in c for x in ("GL Driver", "READ-usage", "gibs"))]
print(json.dumps(res, indent=1, default=str))
