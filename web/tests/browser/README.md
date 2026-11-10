# Browser checks for the 2D map and 3D globe

Run against a built site that has the released data in `dist/data` (Python with Playwright and Chromium):

    npm run build && npm run get-data   # or link an unpacked site_data folder to dist/data
    cd dist && python -m http.server 8765 &
    python tests/browser/globe_check.py  http://127.0.0.1:8765/ /tmp/shots
    python tests/browser/globe_check2.py http://127.0.0.1:8765/ /tmp/shots2

They check: the same cells and values in 2D and 3D, the cell panel equal in both views, the story
column equal in both views, boxes drawn on the flat map and on the globe, the date-line refusal,
keyboard control, month playback, the gap hatching, the legend toggle, the satellite note when
pictures cannot load, the share link keeping the globe, a phone-size screen, and the no-WebGL note.
They are not run by GitHub Actions (they need the 135 MB data release).

`recent_check.py` tests the recent-detections layer (needs `dist/data/recent` from `recent/fetch_firms.py`):
the record story unchanged by the layer switch, overview and period filter, single detections on the
globe, plain-text popup, detection panel, the "history of this area" link, and (with `--no-recent`
and no recent folder) a clean refusal.
