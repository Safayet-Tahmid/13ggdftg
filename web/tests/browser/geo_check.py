"""Map geography (12 Nov 2026): the maximum zoom holds for every input, district names and lines are drawn at it,
the fire layers stay visible, and the 3D globe draws no labels on its far side.
Usage: python tests/browser/geo_check.py http://127.0.0.1:8765/ OUTDIR   (serve a build of web/ first)"""
import json, sys, time
from playwright.sync_api import sync_playwright
base = sys.argv[1]; out = sys.argv[2]
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
WAIT = "() => { const m = window.__shiftMap; return !!(m && m.getSource('fires') && m.loaded()); }"
z = lambda pg: round(pg.evaluate("() => window.__shiftMap.getZoom()"), 3)
res = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    for label, vp, touch in [("desktop", {"width": 1280, "height": 800}, False), ("phone", {"width": 390, "height": 844}, True)]:
        c = b.new_context(viewport=vp, is_mobile=touch, has_touch=touch); pg = c.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.add_init_script("window.__SHIFT_TEST__ = true;")
        pg.goto(base + "#explore?area=preset:bangladesh", wait_until="networkidle"); pg.wait_for_function(WAIT, timeout=90000)
        r = {"maxZoom": pg.evaluate("() => window.__shiftMap.getMaxZoom()")}
        pg.evaluate("() => window.__shiftMap.jumpTo({ center: [90.4, 23.8], zoom: 14 })"); r["jumpTo_14"] = z(pg)
        pg.evaluate("() => window.__shiftMap.flyTo({ center: [90.4, 23.8], zoom: 13, duration: 0 })"); r["flyTo_13"] = z(pg)
        pg.evaluate("() => window.__shiftMap.fitBounds([[90.40, 23.80], [90.41, 23.81]], { duration: 0 })"); r["fitBounds_tiny"] = z(pg)
        pg.evaluate("() => window.__shiftMap.jumpTo({ center: [90.4, 23.8], zoom: 8.5 })"); pg.wait_for_timeout(500)
        if not touch:
            box = pg.locator(".maplibregl-canvas").bounding_box()
            pg.mouse.move(box["x"] + box["width"] * 0.7, box["y"] + box["height"] * 0.4)
            for _ in range(15): pg.mouse.wheel(0, -500); pg.wait_for_timeout(100)
            pg.wait_for_timeout(1500); r["wheel"] = z(pg)
            pg.evaluate("() => window.__shiftMap.jumpTo({ zoom: 8.5 })")
            pg.evaluate("() => window.__shiftMap.getCanvas().focus()")
            for _ in range(5): pg.keyboard.press("Equal"); pg.wait_for_timeout(400)
            pg.wait_for_timeout(800); r["keyboard_plus"] = z(pg)
        else:
            # pinch: two touch points moving apart, sent through CDP
            pg.evaluate("() => window.__shiftMap.jumpTo({ zoom: 8.5 })")
            cdp = c.new_cdp_session(pg)
            box = pg.locator(".maplibregl-canvas").bounding_box(); cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            def touch(t, d): cdp.send("Input.dispatchTouchEvent", {"type": t, "touchPoints": [] if t == "touchEnd" else
                                       [{"x": cx - d, "y": cy, "id": 1}, {"x": cx + d, "y": cy, "id": 2}]})
            for _ in range(3):
                touch("touchStart", 20)
                for d in range(20, 160, 10): touch("touchMove", d); pg.wait_for_timeout(16)
                touch("touchEnd", 0); pg.wait_for_timeout(600)
            r["pinch"] = z(pg)
        pg.evaluate("() => window.__shiftMap.jumpTo({ zoom: 8.5 })")
        for _ in range(4): pg.locator(".maplibregl-ctrl-zoom-in").click(force=True); pg.wait_for_timeout(500)
        pg.wait_for_timeout(600); r["zoom_button"] = z(pg)
        r["zoom_in_disabled_at_max"] = pg.evaluate("() => document.querySelector('.maplibregl-ctrl-zoom-in').disabled")
        # at the maximum zoom over Dhaka: district names and lines are drawn, recent points are still a layer to select
        pg.wait_for_timeout(2500)
        r["at_max"] = pg.evaluate("""() => { const m = window.__shiftMap; const q = (l) => m.queryRenderedFeatures({ layers: [l] });
          return { adm2_lines: q('geo-adm2-lines').length, adm2_names: [...new Set([...q('geo-adm2-labels'), ...q('geo-adm2-labels-big')].map((f) => f.properties.n))].slice(0, 10),
                   adm1_names: [...new Set([...q('geo-adm1-labels'), ...q('geo-adm1-labels-big')].map((f) => f.properties.n))],
                   fire_layers_visible: ['fires','firecells'].map((l) => m.getLayoutProperty(l, 'visibility') !== 'none'),
                   recent_points_layer_minzoom: m.getLayer('recent-pts').minzoom }; }""")
        pg.screenshot(path=f"{out}/max_{label}.png")
        # no names while the scale bar reads 3000 km or more: a small globe shows no names at all
        pg.evaluate("() => { const m = window.__shiftMap; m.setProjection({ type: 'globe' }); m.jumpTo({ center: [60, 20], zoom: 0 }); }")
        pg.wait_for_timeout(2500)
        r["small_globe"] = pg.evaluate("""() => ({ scale: document.querySelector('.maplibregl-ctrl-scale')?.textContent,
             names: window.__shiftMap.queryRenderedFeatures({ layers: ['geo-continents','geo-oceans','geo-countries-1','geo-countries-2','geo-countries-3'] }).length })""")
        # 3D globe: labels on the far side are not drawn
        pg.evaluate("() => { const m = window.__shiftMap; m.setProjection({ type: 'globe' }); m.jumpTo({ center: [90, 20], zoom: 1.7 }); }")
        pg.wait_for_timeout(3000)
        r["globe_label_lons"] = pg.evaluate("""() => window.__shiftMap.queryRenderedFeatures({ layers: ['geo-countries-1','geo-continents','geo-oceans'] })
             .map((f) => [f.properties.n, Math.round(f.geometry.coordinates[0])])""")
        pg.screenshot(path=f"{out}/globe_{label}.png")
        r["page_errors"] = errs; res[label] = r; print(label, json.dumps(r, ensure_ascii=False), flush=True)
        c.close()
    b.close()
