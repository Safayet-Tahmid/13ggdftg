# Map geography (continents, oceans, countries, provinces, districts)

Added 12 Nov 2026 (Squadron Zero authorised the feature and its merge). The map shows more detail as you zoom in:

| Zoom | Shows |
| --- | --- |
| up to 3 | continent names (fade out between 2.4 and 3), ocean names (to 5.5), international land borders, coastlines |
| from 1.6 / 2.6 / 3.6 | country names, by Natural Earth label rank |
| from 4.5 | first-level units (ADM1: states, provinces, divisions): dashed lines, names in small capitals from 5 (large units) and 6 (all) |
| from 6.5 | second-level units (ADM2: districts, counties, departments): thin lines, names from 7 (units of 1,500 km² or more) and 7.8 (all) |
| 9 | the maximum zoom |

On narrow screens (under 600 px) the same lines are drawn, and the names start about 0.4 zoom later and are a little smaller.

**Context only.** Nothing here changes the fire record, the fire colours, the hotspot squares, any number or the pipeline. Boundary lines sit under the fire layers. Names sit on top but never take clicks (fire cells and recent detections stay selectable).

## The maximum zoom (9)

Chosen by measurement, not by taste:
- SHIFT's finest record cell is 0.25° (about 180 px wide at zoom 9). Areas are summed on 1° cells. Zooming closer adds no fire information.
- Single recent detections appear from zoom 6 and stay selectable up to 9.
- The selected area is framed at most at zoom 7 ("Focus on area"), below the limit.
- ADM2 is kept only where units average at least 300 km² (about 17 km across, at least 50 px at zoom 9). Bangladesh's districts (median about 2,000 km², about 45 km across) are about 130 px wide.

MapLibre's own `maxZoom` enforces the limit for wheel, pinch, keyboard, the zoom buttons, `flyTo` and `fitBounds` (checked in `web/tests/browser/geo_check.py`).

## Sources and licences

| Layer | Source | Licence |
| --- | --- | --- |
| Continents, oceans (label points) | Natural Earth 1:110m physical (regions, marine areas) | Public domain |
| Country names, international land borders | Natural Earth 1:50m admin 0 countries, 1:10m admin 0 land boundary lines | Public domain |
| ADM1 | geoBoundaries gbOpen ADM1 where the country's licence only asks for attribution, otherwise Natural Earth 1:10m admin 1 | per country, see `web/public/geo/index.json` |
| ADM2 | geoBoundaries gbOpen ADM2 | per country, see `web/public/geo/index.json` |
| Label fonts | Noto Sans (Regular, Italic, Bold) glyphs from openmaptiles/fonts v2.0 | SIL Open Font License 1.1 |
| Coastlines (existing) | Natural Earth via world-atlas | Public domain |

geoBoundaries: Runfola, D. et al. (2020) geoBoundaries: A global database of political administrative boundaries. PLoS ONE 15(4): e0231866. Each country's boundaries carry the source and licence that geoBoundaries lists, and `index.json` records them.

**Licence rule** (in `prepare_geo.py`):
- Public domain, CC0, PDDL, CC BY (any version) and government open licences that only ask for attribution: included.
- Open Database License 1.0 (for example India and Russia ADM2): included in separate files (`adm2/odbl/`), which are offered under ODbL 1.0 with attribution to their sources.
- Share-alike Creative Commons, "direct permission" and unclear national licences: left out. In 12 Nov 2026's data that is ADM2 for AUT, AZE, CHE, CYP, ESP, HRV, JPN, KGZ, OMN, SAU, TGO, TKM, TWN, URY and XKX. Those countries show ADM1 at district zoom.

**Other ADM2 left out:** countries whose ADM2 units average under 300 km² (communes, villages) show ADM1 at district zoom (40 countries, listed in `index.json` with the reason). About 15 small countries have no ADM2 in geoBoundaries gbOpen at all.

**Names.** As the source gives them. One obvious spelling error is corrected and listed in `index.json` ("Rajshani" to "Rajshahi", Bangladesh ADM1). Names in scripts that need right-to-left shaping (Arabic) or fonts that cannot ship offline (Chinese) are not drawn as labels. Their boundaries still are. This affects some ADM2 names in Tunisia, Morocco and Russia.

**Disputed boundaries.** Country names and international borders follow Natural Earth's de facto view. First- and second-level boundaries come from national or humanitarian sources and can follow a different view where countries disagree, so lines can differ or overlap there. SHIFT draws them as context and takes no position on any boundary.

## Rebuilding

```
# raw data (about 0.6 GB, not committed): Natural Earth GeoJSON from github.com/nvkelso/natural-earth-vector,
# geoBoundaries metadata from https://www.geoboundaries.org/api/current/gbOpen/ALL/ADM1/ and .../ADM2/
# (the simplifiedGeometryGeoJSON file of each country), noto-sans.zip from github.com/openmaptiles/fonts v2.0
python geo/prepare_geo.py RAW_DIR web/public/geo
python -m pytest -q geo
```

Output: about 18 MB in `web/public/geo/` (about 6 MB compressed): `tiles.json` and `world.json` (loaded with the map, 0.28 MB together),
69 ADM1 tiles of 30°, 370 ADM2 tiles of 10° (loaded only for the view, only when zoomed in), fonts, `index.json`
(sizes, SHA-256, source and licence per country; not loaded by the site).
