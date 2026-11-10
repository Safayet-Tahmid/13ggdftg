# SHIFT website: guide for editing the look (UI)

This is for any teammate who wants to restyle the site (for example to a NASA-like look) or
change its wording. You do not need to understand the science code to do it.

## 1. Which files you can change

| You want to change | Edit this file | Safe? |
| --- | --- | --- |
| Colours (page, map, charts), fonts, sizes, corner radius | `src/theme/tokens.css` | Yes, this is the main file |
| The font files | `src/theme/fonts.js` | Yes |
| Any label, button text or short sentence | `src/content/text.js` | Yes |
| The preset areas in the list | `src/content/places.js` | Yes |
| Layout, spacing, how panels sit on the page | `src/styles/layout.css` | Yes, keep the class names |
| The order of sections on Explore | `src/pages/Explore.jsx` (move the `<ChartCard>` blocks) | Yes, move whole blocks |
| How a chart looks inside (bars, axes) | `src/components/*.jsx` | Careful: keep what it shows |
| Long text on Method / Validation / 2012 pages | `src/pages/*.jsx` | Yes for wording, keep the numbers |
| Anything in `src/lib/` | | **No.** This is the engine. Ask the build chat |

The map and the charts read their colours from `tokens.css` at run time, so one change there
recolours everything, in light and dark mode.

## 2. Rules that must survive a restyle

1. **No NASA logos**, no "meatball", no NASA wordmark. A NASA-like style (dark navy, clean type) is fine.
2. **Works offline.** Never load anything from the internet: no Google Fonts links, no CDN
   scripts, no remote images. Install fonts with npm (see `src/theme/fonts.js`). The one
   exception is the optional satellite backdrop (NASA GIBS pictures). It is off by default, the
   plain backdrop ships with the site, and the map says so when the pictures cannot load.
3. **Colour-blind safe.** The four month classes (`--class-low/normal/unusual/critical`) must
   stay distinguishable. Test a screenshot at https://www.color-blindness.com/coblis-color-blindness-simulator/
4. **More fire = stronger colour.** `--ramp-1` to `--ramp-6` go light to dark (dark to light in dark mode).
5. **"No data" is never "no fire".** Keep the hatched no-data pattern visibly different from `--chart-zero`.
6. **Keep the words** "hotspots", "no data", "indicative", "95% range" with their meaning
   (definitions are in `text.js`). Do not round away or hide the uncertainty bands.
7. **Keep the credits**: the FIRMS and GIBS acknowledgements on the Method page and the map attribution.
8. Both themes must work: check light and dark with the "Colour theme" menu.
10. **Recent detections keep their own look.** `--recent-1` to `--recent-4` must stay clearly different
   from the record's `--ramp-*`, so nobody mistakes raw FIRMS points for harmonised values. Keep the
   fetch time, the "raw, not harmonised" sentence and the NOAA-21 "not tested" line.
9. **The map shows cells, not fires.** Keep the 0.25° squares, the legend sentences (units,
   S-NPP scale, "not a fire location") and the cell panel's source and range lines. Do not add
   flames, glows, pulsing dots or anything that suggests live fire. The satellite picture is a
   backdrop: keep its date and "not SHIFT data" note in the legend.

## 3. Running the site on your computer

You need Node.js 20 (https://nodejs.org, the LTS version) and Git.

```
git clone https://github.com/squadronzero/squadron-zero.git
cd squadron-zero/web
npm ci
npm run get-data      # downloads the real data once (about 150 MB)
npm run dev           # open the address it prints, usually http://localhost:5173
```

Every time you save a file the page updates by itself.

**No install at all:** on the GitHub page of the repo press **Code > Codespaces > Create
codespace on main**. It installs everything, downloads the data and opens the site in a
preview tab (a few minutes the first time). Edit files in the browser.

## 4. Sending your change

Do not push straight to `main`: `main` deploys the live site.

1. Make a branch, for example `ui-nasa-style` (in Codespaces: the branch name at the bottom left).
2. Commit your changes to that branch and push.
3. On GitHub, open a **Pull request** into `main`.
4. The check **"Website build check"** runs. Green tick = it builds. Red cross = open it and read the error.
5. Squadron Zero reviews and merges. The live site updates a few minutes later.

If you are not a collaborator on the repo, fork it, push to your fork and open the pull request from there.

## 5. Checklist before you open the pull request

- [ ] Explore page: pick Bangladesh, a country (Country tab), a typed box and a point. Charts appear.
- [ ] Light and dark themes both readable.
- [ ] The PNG and SVG buttons on a chart still download a picture.
- [ ] "Print or save a one-page brief" prints only the story column.
- [ ] Narrow window (phone width): nothing overflows.
- [ ] Turn the wifi off and reload `npm run preview` after `npm run build`: the site still works.
- [ ] Map: switch 2D map and 3D globe, rotate and tilt the globe, press Reset view. Click a cell: the panel opens.
- [ ] Map: Play months, Pause. Show satellite gaps on 2002-03. Satellite backdrop with and without wifi.
- [ ] No NASA logos anywhere.

## 6. Where things are (map of the code)

```
web/
  UI_GUIDE.md            this file
  index.html             page title and the little browser icon
  scripts/get-data.mjs   downloads the data for local work
  src/
    main.jsx             loads fonts, tokens, layout, then the app
    App.jsx              header, navigation, colour theme
    theme/               tokens.css (all colours and fonts), fonts.js, useTheme.js (reads tokens)
    content/             text.js (all wording), places.js (preset areas)
    styles/layout.css    layout and component styling
    pages/               Explore, Switch2012, Validation, Method
    components/          MapView (2D map and 3D globe), MapLegend, CellPanel, MapBoundary, AreaPicker,
                         Compare, Season, Calendar, MonthGrid, Trend, Downloads, ChartCard
    lib/                 ENGINE: data loading, areas, analysis, map geometry (geo.js), downloads,
                         share links (do not edit)
  tests/                 npm test (map helpers; with SHIFT_DATA_DIR also the map-equals-charts check)
```

Stuck? Paste the exact error text to the SHIFT Tutor Gem first. If it looks like a code
problem, send it to the build chat as a short message.
