"""Second browser check: drawing on 2D and globe, story numbers equal across views, keyboard,
legend toggle, and the no-WebGL fallback. Usage: python3 globe_check2.py http://127.0.0.1:8765/ outdir"""
import json, sys, os
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
res = {"errors": [], "console": []}
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
WAIT = """() => { const m = window.__shiftMap; return !!(m && m.getSource('fires') && m.loaded()); }"""
STORY = "() => [...document.querySelectorAll('.story h2, .story .big, .story .stat b, .story .lead')].map(e => e.innerText).join(' | ')"

def drag(pg, a, c):
    bb = pg.locator(".map canvas").bounding_box()
    p1 = pg.evaluate(f"() => window.__shiftMap.project({a})"); p2 = pg.evaluate(f"() => window.__shiftMap.project({c})")
    pg.mouse.move(bb['x'] + p1['x'], bb['y'] + p1['y']); pg.mouse.down()
    pg.mouse.move(bb['x'] + p2['x'], bb['y'] + p2['y'], steps=10); pg.mouse.up()

with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    pg = b.new_page(viewport={"width": 1500, "height": 950})
    pg.add_init_script("window.__SHIFT_TEST__ = true;")
    pg.on("pageerror", lambda e: res["errors"].append(str(e)))
    pg.on("console", lambda m: res["console"].append(f"{m.type}: {m.text}") if m.type == "error" else None)
    pg.goto(base + "#explore?area=preset:bangladesh&v=cells&m=2024-03", wait_until="networkidle")
    pg.wait_for_function(WAIT, timeout=60000); pg.wait_for_timeout(2500)

    # story numbers in 2D, then in 3D: must be identical (one engine)
    s2 = pg.evaluate(STORY)
    pg.get_by_role("button", name="3D globe").click(); pg.wait_for_timeout(2500)
    s3 = pg.evaluate(STORY)
    res["story_equal_2d_3d"] = s2 == s3 and len(s2) > 0
    res["story_sample"] = s2[:160]

    # draw a box on the globe
    pg.evaluate("() => window.__shiftMap.jumpTo({ center: [90, 23], zoom: 4 })"); pg.wait_for_timeout(1500)
    pg.get_by_role("tab", name="Draw").click(); pg.wait_for_timeout(300)
    drag(pg, "[87, 21]", "[93, 27]"); pg.wait_for_timeout(3000)
    res["drawn_globe"] = pg.inner_text(".story h2")
    pg.screenshot(path=f"{out}/a_globe_drawn.png")
    story_globe = pg.evaluate(STORY)

    # same box on the flat map gives the same story
    pg.get_by_role("button", name="2D map").click(); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__shiftMap.jumpTo({ center: [90, 23], zoom: 4 })"); pg.wait_for_timeout(1000)
    pg.get_by_role("tab", name="Draw").click(); pg.wait_for_timeout(300)
    drag(pg, "[87, 21]", "[93, 27]"); pg.wait_for_timeout(3000)
    res["drawn_2d"] = pg.inner_text(".story h2")
    res["drawn_story_equal"] = pg.evaluate(STORY) == story_globe

    # date line: drag across 180 on the globe gives the note, area unchanged
    pg.get_by_role("button", name="3D globe").click(); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__shiftMap.jumpTo({ center: [180, -15], zoom: 3.5 })"); pg.wait_for_timeout(1500)
    pg.get_by_role("tab", name="Draw").click(); pg.wait_for_timeout(300)
    drag(pg, "[172, -20]", "[-172, -10]"); pg.wait_for_timeout(1500)
    res["dateline_msg"] = pg.locator("text=cannot cross the date line").count() > 0
    res["after_dateline_area"] = pg.inner_text(".story h2")

    # keyboard: focus the map, arrow keys move it
    pg.evaluate("() => window.__shiftMap.jumpTo({ center: [0, 0], zoom: 2 })"); pg.wait_for_timeout(500)
    pg.locator(".map canvas").focus(); c0 = pg.evaluate("() => window.__shiftMap.getCenter().lng")
    for _ in range(4): pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(1200)
    res["keyboard_moved"] = pg.evaluate("() => window.__shiftMap.getCenter().lng") != c0

    # legend can be closed and reopened
    pg.locator(".legendbox summary").click(); pg.wait_for_timeout(200)
    res["legend_closed"] = pg.evaluate("() => !document.querySelector('.legendbox').open")
    pg.locator(".legendbox summary").click(); pg.wait_for_timeout(200)
    res["legend_reopened"] = pg.evaluate("() => document.querySelector('.legendbox').open")

    # downloads still produce the daily CSV for the drawn box
    with pg.expect_download(timeout=30000) as d:
        pg.locator(".buttons .action").first.click()
    res["csv"] = d.value.suggested_filename
    b.close()

    # no WebGL: map replaced by a note, the story still works
    b = p.chromium.launch(args=["--disable-webgl", "--disable-webgl2", "--disable-gpu"])
    pg = b.new_page(viewport={"width": 1300, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + "#explore?area=preset:bangladesh&p=3d", wait_until="networkidle"); pg.wait_for_timeout(4000)
    res["nowebgl_note"] = pg.locator(".map-failed").count() > 0
    res["nowebgl_story"] = pg.inner_text(".story h2")
    res["nowebgl_cards"] = pg.locator(".card").count()
    res["nowebgl_errors"] = errs
    pg.screenshot(path=f"{out}/b_no_webgl.png")
    b.close()

# mobile size
with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    pg = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    pg.add_init_script("window.__SHIFT_TEST__ = true;")
    pg.goto(base + "#explore?area=preset:se_australia&m=2019-12&p=3d", wait_until="networkidle")
    pg.wait_for_function(WAIT, timeout=60000); pg.wait_for_timeout(2500)
    res["mobile_legend_open"] = pg.evaluate("() => document.querySelector('.legendbox').open")
    pg.screenshot(path=f"{out}/c_mobile_globe.png")
    b.close()

res["console"] = [c for c in res["console"] if not any(x in c for x in ("GL Driver", "READ-usage", "gibs"))]
print(json.dumps(res, indent=1))
