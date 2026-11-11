"""Browser check of every download on the Explore page: CSV tables, PNG and SVG of every chart,
the printable brief, the share link and the FIRMS link. Each file is saved and checked (PNG
signature and size, SVG parses as XML, CSV header and rows).
Usage: python tests/browser/downloads_check.py http://127.0.0.1:8765/ outdir [hash]
"""
import json
import os
import sys
import xml.dom.minidom
from pathlib import Path

from playwright.sync_api import sync_playwright

base, out = sys.argv[1], Path(sys.argv[2])
route = sys.argv[3] if len(sys.argv) > 3 else "#explore?area=preset:se_australia&v=frp&m=2019-12"
out.mkdir(parents=True, exist_ok=True)
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
res = {"route": route, "errors": [], "console": [], "files": [], "other": {}}


def check(path: Path):
    b = path.read_bytes()
    kind, ok, detail = path.suffix.lstrip("."), False, ""
    if kind == "png":
        ok = b[:8] == b"\x89PNG\r\n\x1a\n" and len(b) > 2000
        if b[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big")
            detail = f"{w}x{h} px"
    elif kind == "svg":
        try:
            xml.dom.minidom.parseString(b); ok = True; detail = "valid XML"
        except Exception as e:  # noqa: BLE001
            detail = f"invalid XML: {e}"
    elif kind == "csv":
        lines = b.decode("utf-8", "replace").splitlines()
        ok = len(lines) > 1 and "," in lines[0]
        detail = f"{len(lines) - 1} rows, header: {lines[0][:90]}"
    return {"file": path.name, "bytes": len(b), "ok": ok, "detail": detail}


def grab(pg, click, label, timeout=8000):
    try:
        with pg.expect_download(timeout=timeout) as dl:
            click()
        d = dl.value
        p = out / d.suggested_filename
        d.save_as(p)
        r = check(p); r["button"] = label
    except Exception as e:  # noqa: BLE001 - a missing download is the finding
        r = {"button": label, "ok": False, "detail": f"no download: {type(e).__name__}"}
    res["files"].append(r)
    return r


with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    ctx = b.new_context(viewport={"width": 1400, "height": 950}, accept_downloads=True)
    pg = ctx.new_page()
    pg.add_init_script("window.__SHIFT_TEST__ = true; window.__printed = 0; window.print = () => { window.__printed += 1; };")
    pg.on("pageerror", lambda e: res["errors"].append(str(e)))
    pg.on("console", lambda m: res["console"].append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(base + route, wait_until="networkidle"); pg.wait_for_timeout(6000)

    # every chart card: PNG and SVG
    cards = pg.locator("section.card")
    for i in range(cards.count()):
        c = cards.nth(i)
        if c.locator(".card-tools").count() == 0:
            continue
        title = c.locator("h3").inner_text().strip()
        kind = c.evaluate("(el) => (el.querySelector('[data-export]') || {}).tagName || null")
        c.scroll_into_view_if_needed(); pg.wait_for_timeout(300)
        buttons = c.locator(".card-tools button").all_inner_texts()
        res["other"].setdefault("buttons_per_chart", {})[title] = buttons
        for btn in buttons:
            r = grab(pg, lambda: c.locator(".card-tools button", has_text=btn).click(), f"{title} / {btn} ({kind})")
            # the file must be the kind the button says
            if r.get("file") and not r["file"].endswith("." + btn.lower()):
                r["ok"] = False; r["detail"] += f" (button says {btn}, file is {r['file'].rsplit('.', 1)[-1]})"
    # the CSV buttons
    d = pg.locator(".downloads")
    d.scroll_into_view_if_needed()
    for i in range(d.locator(".buttons button.action:not(.ghost)").count()):
        btn = d.locator(".buttons button.action:not(.ghost)").nth(i)
        grab(pg, lambda: btn.click(), btn.inner_text().strip(), timeout=30000)
    # print, share, FIRMS link
    pg.locator(".downloads button", has_text="Print").click(); pg.wait_for_timeout(300)
    res["other"]["print_called"] = pg.evaluate("() => window.__printed")
    href = pg.locator(".downloads a").first.get_attribute("href")
    res["other"]["firms_link"] = href
    res["other"]["firms_link_ok"] = bool(href and href.startswith("https://firms.modaps.eosdis.nasa.gov/"))
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    pg.locator(".downloads button", has_text="Copy").first.click() if pg.locator(".downloads button", has_text="Copy").count() else None
    pg.wait_for_timeout(300)
    try:
        res["other"]["share_copied"] = pg.evaluate("() => navigator.clipboard.readText()")
    except Exception as e:  # noqa: BLE001
        res["other"]["share_copied"] = f"not readable: {type(e).__name__}"
    b.close()
res["summary"] = {"downloads": len(res["files"]), "ok": sum(1 for f in res["files"] if f["ok"]),
                  "failed": [f["button"] + ": " + f["detail"] for f in res["files"] if not f["ok"]]}
print(json.dumps(res, indent=1))
