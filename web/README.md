# SHIFT website

React + MapLibre (D6), static files only (D5). The data comes from the pipeline's `export` stage
(`site_data.zip`), published as the GitHub release `site-data`; the workflow
`.github/workflows/pages.yml` downloads it, builds this folder and publishes it on GitHub Pages.
`.github/workflows/web-check.yml` builds every pull request so UI changes are checked before they reach `main`.

**Restyling or rewording the site? Read [UI_GUIDE.md](UI_GUIDE.md).** Colours and fonts are in
`src/theme/tokens.css`, every label in `src/content/text.js`, and the engine in `src/lib/` stays untouched.

## Views

- **Explore**: one map with two views, a flat 2D map and a 3D globe (MapLibre 5 globe projection),
  drawing the same monthly fire layer (0.25° cells, coloured by the chosen measure), the "heat that
  isn't fire" layer and, on request, the 30° zones with days of no satellite data. Click a cell for
  its values, source era, calibrated range, cloud flag and satellite days. Play months steps through
  the published monthly files. Backdrop: plain (bundled), NASA Blue Marble, or the NASA true-colour
  picture of one day (both from NASA GIBS, online only). Area by preset,
  country, typed box corners, point with a radius, or a drawn box; the address keeps the area and dates
  so a result can be shared. For the area: now against the past (this month so far, the last 30 days or
  any dates against the same dates in every year since 2003: median, rank, ratio; D32), the usual fire
  season and where today sits in it, the daily calendar since 2002 (days before 2012 indicative, D30),
  each month against its normal with cloud flags, monthly totals with the calibrated 95% range,
  downloads (daily, monthly with classes, hotspots per 1° cell and day for the search CSV, D33),
  PNG/SVG of every chart, a FIRMS link for the original points, and a printable one-page brief.
- **The 2012 switch**: raw vs harmonised, year by year.
- **Validation**: the pipeline's own test results, including the Phase 2 checks.
- **Method and data**: sources, limits, decisions D29 to D35.

## Local or offline (the demo works with the wifi off)

    cd web
    npm ci
    npm run get-data          # or: mkdir -p public/data && unzip /path/to/site_data.zip -d public/data
    npm run dev               # live editing at http://localhost:5173
    npm run build && cd dist && python -m http.server 8000      # the offline rehearsal build

The basemap (Natural Earth borders) and the font are bundled, so nothing is fetched from the
internet at run time. Only the FIRMS link and the optional satellite backdrop (NASA GIBS) reach outside.

## Tests

    npm test                                          # map helpers (no data needed)
    SHIFT_DATA_DIR=public/data npm test               # also: map values equal the daily files behind the charts
