"""Headless browser check of the 2D map and 3D globe on the built site with the released data.
Usage: python3 globe_check.py http://127.0.0.1:8765/ outdir
"""
import json, sys, os
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
res = {"errors": [], "console": []}

WAIT_MAP = """() => { const m = window.__shiftMap; return !!(m && m.getSource('fires') && m.areTilesLoaded()
  && (m.querySourceFeatures('fires').length + m.querySourceFeatures('firecells').length) > 0); }"""

# The values of every rendered fire feature, keyed by cell centre: the map's own data, per projection.
VALUES = """(layer) => { const m = window.__shiftMap; const o = {};
  for (const f of m.queryRenderedFeatures({ layers: [layer] })) { const p = f.properties; o[p.lon + ',' + p.lat] = [p.cells, p.frp]; }
  return o; }"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1500, "height": 950})
    pg.add_init_script("window.__SHIFT_TEST__ = true;")
    pg.on("pageerror", lambda e: res["errors"].append(str(e)))
    pg.on("console", lambda m: res["console"].append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)

    pg.goto(base + "#explore?area=preset:se_australia&v=frp&m=2019-12", wait_until="networkidle")
    pg.wait_for_function(WAIT_MAP, timeout=60000)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{out}/1_2d_se_australia.png")

    # 2D values in view (squares at this zoom) and the projection
    v2 = pg.evaluate(VALUES, "firecells") or pg.evaluate(VALUES, "fires")
    res["proj_2d"] = pg.evaluate("() => window.__shiftMap.getProjection()?.type || 'mercator'")
    res["n2d"] = len(v2)

    # switch to the 3D globe
    pg.get_by_role("button", name="3D globe").click()
    pg.wait_for_timeout(2500)
    pg.wait_for_function(WAIT_MAP, timeout=60000)
    res["proj_3d"] = pg.evaluate("() => window.__shiftMap.getProjection()?.type")
    pg.screenshot(path=f"{out}/2_3d_se_australia.png")
    v3 = pg.evaluate(VALUES, "firecells") or pg.evaluate(VALUES, "fires")
    res["n3d"] = len(v3)
    common = set(v2) & set(v3)
    res["common_cells"] = len(common)
    res["mismatch"] = [k for k in common if v2[k] != v3[k]][:5]

    # click a cell on the globe: the panel opens with values
    cell = pg.evaluate("""() => { const m = window.__shiftMap; const f = m.queryRenderedFeatures({ layers: ['firecells', 'fires'] })
      .sort((a, b) => b.properties.frp - a.properties.frp)[0]; if (!f) return null;
      const pt = m.project([f.properties.lon, f.properties.lat]); return { x: pt.x, y: pt.y, p: f.properties }; }""")
    res["clicked"] = cell
    if cell:
        box = pg.locator(".map canvas").bounding_box()
        pg.mouse.click(box["x"] + cell["x"], box["y"] + cell["y"])
        pg.wait_for_selector(".cellpanel", timeout=10000)
        pg.wait_for_timeout(800)
        res["panel_3d"] = pg.inner_text(".cellpanel")
        pg.screenshot(path=f"{out}/3_3d_cell_panel.png")
        # same cell in 2D: panel stays, values must be identical
        pg.get_by_role("button", name="2D map").click()
        pg.wait_for_timeout(1500)
        res["panel_2d"] = pg.inner_text(".cellpanel")
        res["panel_equal"] = res["panel_2d"] == res["panel_3d"]

    # whole globe, gaps on, a MODIS-era month
    pg.get_by_role("button", name="3D globe").click()
    pg.get_by_role("button", name="Reset view").click()
    pg.select_option(".mapbar select >> nth=0", "2005-08")
    pg.get_by_label("Show satellite gaps").check()
    pg.wait_for_timeout(3000)
    pg.screenshot(path=f"{out}/4_3d_world_2005-08_gaps.png")
    res["hash"] = pg.evaluate("() => location.hash")

    # tilt and rotate (orbit), then playback two steps
    pg.evaluate("() => window.__shiftMap.jumpTo({ center: [25, -10], zoom: 3.2, pitch: 50, bearing: -20 })")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{out}/5_3d_africa_tilted.png")
    seen = [pg.input_value(".mapbar select >> nth=0")]
    pg.get_by_role("button", name="▶ Play months").click()
    import time; t0 = time.time()
    while time.time() - t0 < 4.2:
        v = pg.input_value(".mapbar select >> nth=0")
        if v != seen[-1]: seen.append(v)
        pg.wait_for_timeout(150)
    pg.get_by_role("button", name="❚❚ Pause").click()
    res["play"] = seen
    # gaps: March 2002 had days without satellite data
    pg.get_by_role("button", name="Reset view").click()
    pg.select_option(".mapbar select >> nth=0", "2002-03")
    pg.wait_for_timeout(3000)
    pg.screenshot(path=f"{out}/5b_gaps_2002-03.png")
    res["gap_zones"] = pg.evaluate("() => window.__shiftMap.querySourceFeatures('gaps').length")

    # satellite backdrop: tiles cannot load in this sandbox (no internet), the note must say so
    pg.select_option(".maptools select >> nth=0", "satellite")
    pg.wait_for_timeout(4000)
    res["imagery_note"] = pg.locator(".mapnote").all_inner_texts()
    res["legend"] = pg.inner_text(".maplegend")
    pg.screenshot(path=f"{out}/6_satellite_offline.png")

    # the story side still works: charts present
    res["cards"] = pg.locator(".card").count()

    # reload from the share link keeps 3D and backdrop
    pg.goto(base + res["hash"].replace("b=sat", "b=sat"), wait_until="networkidle")
    pg.wait_for_function(WAIT_MAP, timeout=60000)
    res["reload_proj"] = pg.evaluate("() => window.__shiftMap.getProjection()?.type")
    # dark theme on the globe
    pg.select_option("select[aria-label], .top-right select", "dark") if pg.locator(".top-right select").count() else None
    pg.wait_for_function(WAIT_MAP, timeout=60000); pg.wait_for_timeout(2000)
    pg.screenshot(path=f"{out}/7_dark_globe.png")
    # draw a box on the 2D map
    pg.get_by_role("button", name="2D map").click(); pg.wait_for_timeout(800)
    pg.get_by_role("tab", name="Draw").click()
    bb = pg.locator(".map canvas").bounding_box()
    a = pg.evaluate("() => window.__shiftMap.project([88, 21])"); c = pg.evaluate("() => window.__shiftMap.project([92.5, 26.5])")
    pg.mouse.move(bb['x'] + a['x'], bb['y'] + a['y']); pg.mouse.down(); pg.mouse.move(bb['x'] + c['x'], bb['y'] + c['y'], steps=8); pg.mouse.up()
    pg.wait_for_timeout(2500)
    res["drawn_area"] = pg.inner_text(".story h2")
    b.close()

res["console"] = [c for c in res["console"] if not any(x in c for x in ("TUNNEL", "GL Driver", "READ-usage"))]
res.pop("panel_2d", None); res.pop("legend", None)
print(json.dumps(res, indent=1, default=str))
