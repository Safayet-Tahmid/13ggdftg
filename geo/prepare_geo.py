"""SHIFT map geography: continents, oceans, countries, provinces (ADM1) and districts (ADM2).

Turns open boundary data into small static files for the website (web/public/geo/). Run once
during development. The website never calls a geographic service: everything ships with the
site, so the map keeps working offline. This is map context only. Nothing here touches the fire
record, the pipeline or any number.

Sources (downloaded into RAW before running, see geo/README.md):
  Natural Earth (public domain)      continents, oceans, country names, international land
                                     borders, ADM1 where geoBoundaries cannot be used
  geoBoundaries gbOpen (per country) ADM1 and ADM2, each country under its own licence

Licence rule (decided 12 Nov 2026, Squadron Zero authorised the work):
  ATTRIB  public domain, CC0, PDDL, CC BY (any version), government open licences that only ask
          for attribution: included.
  ODBL    Open Database License 1.0: included in SEPARATE files that are offered under ODbL 1.0.
  anything else (share-alike CC, "direct permission", unclear national licences): left out. The
          country then shows Natural Earth ADM1 (public domain) at district zoom instead.

Usage:  python geo/prepare_geo.py RAW_DIR web/public/geo
Needs:  shapely 2 (pip install shapely). Writes index.json with sizes, SHA-256 and the licence
        and source of every country's boundaries.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

from shapely import get_parts
from shapely.geometry import LineString, MultiLineString, Point, box, mapping, shape
from shapely.ops import linemerge, polylabel, unary_union

# ---- display settings (map zoom levels are in web/src/geo/layers.js)
TOL = {"borders": 0.004, "adm1": 0.01, "adm2": 0.006}        # simplification, degrees (0.006 = about 670 m, 2 px at zoom 9)
DIGITS = 3                                                   # about 110 m, under 1 px at the maximum zoom
TILE = {"adm1": 30, "adm2": 10}                              # tile size, degrees
# ADM2 only where its units are district-like: a mean area of at least this many km2 (about
# 17 km across, 60 px or more at the maximum map zoom). Smaller units (communes, villages)
# would be unreadable clutter and heavy to load; those countries show ADM1 at district zoom.
ADM2_MIN_MEAN_KM2 = 300
GLYPH_FONTS = ["Noto Sans Regular", "Noto Sans Italic", "Noto Sans Bold"]
# Latin, Latin-1, Latin Extended A/B, IPA, combining marks, Greek, Cyrillic, Latin Extended
# Additional (Vietnamese), general punctuation. Labels needing anything else are not drawn
# (the boundary still is): right-to-left scripts need a shaping plugin that cannot ship offline.
GLYPH_BLOCKS = [0, 1, 2, 3, 4, 30, 32]

ATTRIB = re.compile(r"public domain|cc0|pddl|creative commons attribution(?!.*sharealike)|cc by|open government|"
                    r"etalab|data license germany|singapore open data", re.I)
ODBL = re.compile(r"open database license", re.I)

# Obvious spelling errors in a source name, corrected and listed in index.json.
CORRECTIONS = {("BGD", "ADM1", "Rajshani"): "Rajshahi"}


def licence_group(text: str) -> str | None:
    if ODBL.search(text or ""):
        return "odbl"
    if "sharealike" in (text or "").replace("-", "").replace(" ", "").lower():
        return None
    return "attrib" if ATTRIB.search(text or "") else None


def rnd(geom):
    """GeoJSON geometry with rounded coordinates."""
    def r(c):
        return [round(c[0], DIGITS), round(c[1], DIGITS)]
    m = mapping(geom)
    if m["type"] == "LineString":
        return {"type": "LineString", "coordinates": [r(c) for c in m["coordinates"]]}
    if m["type"] == "MultiLineString":
        return {"type": "MultiLineString", "coordinates": [[r(c) for c in l] for l in m["coordinates"]]}
    if m["type"] == "Point":
        return {"type": "Point", "coordinates": r(m["coordinates"])}
    raise ValueError(m["type"])


def lines_only(geom):
    """Keep the line parts of a geometry (intersections can return points)."""
    parts = [g for g in get_parts(geom) if isinstance(g, LineString) and not g.is_empty and g.length > 0]
    if not parts:
        return None
    return parts[0] if len(parts) == 1 else MultiLineString(parts)


def merge(geom):
    """Join touching line pieces (a single line is returned as it is)."""
    if geom.geom_type == "LineString":
        return geom
    if geom.geom_type == "MultiLineString":
        return linemerge(geom)
    return lines_only(geom) or geom


def label_point(geom):
    """A point well inside the largest part of a (multi)polygon."""
    polys = [g for g in get_parts(geom) if g.geom_type == "Polygon"]
    if not polys:
        return geom.representative_point()
    big = max(polys, key=lambda p: p.area)
    try:
        return polylabel(big, tolerance=max(big.length / 400, 1e-4))
    except Exception:
        return big.representative_point()


def area_km2(geom) -> float:
    c = geom.centroid
    return geom.area * 111.32 ** 2 * max(0.05, math.cos(math.radians(c.y)))


def ok_text(name: str) -> bool:
    return bool(name) and all(ord(ch) // 256 in GLYPH_BLOCKS for ch in name)


def tile_key(lat0: float, lon0: float) -> str:
    return f"{'N' if lat0 >= 0 else 'S'}{abs(int(lat0)):02d}{'E' if lon0 >= 0 else 'W'}{abs(int(lon0)):03d}"


def tiles_for(bounds, size):
    w, s, e, n = bounds
    for lat0 in range(int(math.floor(s / size) * size), int(math.ceil(n / size) * size), size):
        for lon0 in range(int(math.floor(w / size) * size), int(math.ceil(e / size) * size), size):
            if -90 <= lat0 < 90 and -180 <= lon0 < 180:
                yield lat0, lon0


SCALE = 10 ** DIGITS


def packed(line: LineString) -> list[int]:
    """One line as integers: first point, then differences (decoded by web/src/geo/decode.js)."""
    q = [(round(x * SCALE), round(y * SCALE)) for x, y in line.coords]
    out = [q[0][0], q[0][1]]
    for (x0, y0), (x1, y1) in zip(q, q[1:]):
        if (x1, y1) != (x0, y0):
            out += [x1 - x0, y1 - y0]
    return out


def add_lines(store, lines, size, props=None):
    """Clip lines to tiles and add them to store[tile]["l"] in the packed form."""
    if lines is None or lines.is_empty:
        return
    for lat0, lon0 in tiles_for(lines.bounds, size):
        part = lines_only(lines.intersection(box(lon0, lat0, lon0 + size, lat0 + size)))
        if part is not None:
            for g in get_parts(part):
                pk = packed(g)
                if len(pk) >= 4:
                    store[tile_key(lat0, lon0)]["l"].append(pk)


def add_label(store, pt, size, props):
    lat0 = math.floor(pt.y / size) * size
    lon0 = math.floor(pt.x / size) * size
    store[tile_key(max(-90, min(lat0, 90 - size)), max(-180, min(lon0, 180 - size)))]["p"].append(
        [round(pt.x * SCALE), round(pt.y * SCALE), props["n"], props["a"]])


def write(path: Path, obj) -> dict:
    data = json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def load(p: Path):
    return json.loads(p.read_text())


def main(raw: Path, out: Path) -> int:
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    index = {"generated_by": "geo/prepare_geo.py", "files": {}, "countries": {}, "corrections": [],
             "settings": {"adm2_min_mean_km2": ADM2_MIN_MEAN_KM2, "simplify_deg": TOL, "digits": DIGITS, "tile_deg": TILE, "glyph_blocks": GLYPH_BLOCKS}}

    # ---- world: continents, oceans, country labels, international land borders (Natural Earth)
    world = []
    for f in load(raw / "ne_110m_geography_regions_polys.geojson")["features"]:
        p = f["properties"]
        if p.get("FEATURECLA") == "Continent":
            name = p["NAME"].title().replace("Australia", "Australia (Oceania)")
            world.append({"type": "Feature", "properties": {"k": "continent", "n": name},
                          "geometry": rnd(label_point(shape(f["geometry"])))})
    for f in load(raw / "ne_110m_geography_marine_polys.geojson")["features"]:
        p = f["properties"]
        if (p.get("featurecla") or "").lower() == "ocean":
            world.append({"type": "Feature", "properties": {"k": "ocean", "n": p["name"].title()},
                          "geometry": rnd(label_point(shape(f["geometry"])))})
    for f in load(raw / "ne_50m_admin_0_countries.geojson")["features"]:
        p = f["properties"]
        # Natural Earth's short name for every unit ("China", not "People's Republic of China"),
        # as Natural Earth draws it (de facto view, SHIFT takes no position). Antarctica is
        # already named as a continent.
        name = p.get("NAME") if ok_text(p.get("NAME") or "") else p.get("NAME_EN")
        if name == "Antarctica":
            continue
        if not ok_text(name or ""):
            continue
        world.append({"type": "Feature", "properties": {"k": "country", "n": name, "r": int(p.get("LABELRANK") or 9),
                                                        "z": float(p.get("MIN_LABEL") or 5)},
                      "geometry": {"type": "Point", "coordinates": [round(p["LABEL_X"], DIGITS), round(p["LABEL_Y"], DIGITS)]}})
    borders = unary_union([shape(f["geometry"]) for f in load(raw / "ne_10m_admin_0_boundary_lines_land.geojson")["features"]])
    borders = lines_only(merge(borders).simplify(TOL["borders"], preserve_topology=False))
    # packed like the tiles: border lines as integer differences, places as [x, y, name, kind, rank, minLabel]
    places = [[round(f["geometry"]["coordinates"][0] * SCALE), round(f["geometry"]["coordinates"][1] * SCALE), f["properties"]["n"],
               f["properties"]["k"], f["properties"].get("r", 0), f["properties"].get("z", 0)] for f in world]
    lines = [pk for g in get_parts(borders) for pk in [packed(g)] if len(pk) >= 4]
    index["files"]["world.json"] = write(out / "world.json", {"v": 1, "scale": SCALE, "l": lines, "places": places})

    # ---- ADM1: geoBoundaries where the licence allows (ATTRIB only), else Natural Earth
    gb1 = {x["boundaryISO"]: x for x in load(raw / "gb_all_adm1.json")}
    gb2 = {x["boundaryISO"]: x for x in load(raw / "gb_all_adm2.json")}
    ne1 = defaultdict(list)
    for f in load(raw / "ne_10m_admin_1_states_provinces.geojson")["features"]:
        ne1[f["properties"]["adm0_a3"]].append(f)
    adm1 = defaultdict(lambda: {"l": [], "p": []})
    countries = sorted(set(ne1) | set(gb1))
    for iso in countries:
        meta = gb1.get(iso)
        use_gb = meta is not None and licence_group(meta["boundaryLicense"]) == "attrib" and (raw / "adm1" / f"{iso}.geojson").exists()
        if use_gb:
            feats = load(raw / "adm1" / f"{iso}.geojson")["features"]
            units = []
            for f in feats:
                name = f["properties"].get("shapeName") or ""
                fixed = CORRECTIONS.get((iso, "ADM1", name))
                if fixed:
                    index["corrections"].append({"country": iso, "level": "ADM1", "source": name, "shown": fixed})
                    name = fixed
                units.append((name, shape(f["geometry"])))
            src = {"dataset": "geoBoundaries gbOpen ADM1", "source": meta["boundarySource"], "licence": meta["boundaryLicense"],
                   "licence_source": meta.get("licenseSource"), "year": meta.get("boundaryYearRepresented"),
                   "type": meta.get("boundaryCanonical"), "units": len(units)}
        elif ne1.get(iso):
            units = [(f["properties"].get("name_en") or f["properties"].get("name") or "", shape(f["geometry"])) for f in ne1[iso]]
            src = {"dataset": "Natural Earth 10m admin 1", "licence": "Public domain", "units": len(units)}
        else:
            continue
        geoms = [g.buffer(0) if not g.is_valid else g for _, g in units]
        lines = lines_only(merge(unary_union([g.boundary for g in geoms])).simplify(TOL["adm1"], preserve_topology=False))
        add_lines(adm1, lines, TILE["adm1"])
        for (name, _), g in zip(units, geoms):
            if ok_text(name):
                add_label(adm1, label_point(g), TILE["adm1"], {"n": name, "a": round(area_km2(g))})
        index["countries"].setdefault(iso, {})["adm1"] = src

    # ---- ADM2: geoBoundaries only, by licence group
    adm2 = {"attrib": defaultdict(lambda: {"l": [], "p": []}), "odbl": defaultdict(lambda: {"l": [], "p": []})}
    for iso, meta in sorted(gb2.items()):
        group = licence_group(meta["boundaryLicense"])
        entry = index["countries"].setdefault(iso, {})
        if group is None:
            entry["adm2"] = {"excluded": True, "licence": meta["boundaryLicense"],
                             "reason": "licence is share-alike, unclear or permission-only: district zoom shows ADM1"}
            continue
        if float(meta.get("meanAreaSqKM") or 0) < ADM2_MIN_MEAN_KM2:
            entry["adm2"] = {"excluded": True, "licence": meta["boundaryLicense"], "mean_km2": round(float(meta["meanAreaSqKM"]), 1),
                             "reason": f"units smaller than {ADM2_MIN_MEAN_KM2} km2 on average (not district-like): district zoom shows ADM1"}
            continue
        p = raw / "adm2" / f"{iso}.geojson"
        if not p.exists():
            continue
        units = [(f["properties"].get("shapeName") or "", shape(f["geometry"])) for f in load(p)["features"]]
        geoms = [g.buffer(0) if not g.is_valid else g for _, g in units]
        lines = lines_only(merge(unary_union([g.boundary for g in geoms])).simplify(TOL["adm2"], preserve_topology=False))
        add_lines(adm2[group], lines, TILE["adm2"])
        labelled = 0
        for (name, _), g in zip(units, geoms):
            if ok_text(name):
                add_label(adm2[group], label_point(g), TILE["adm2"], {"n": name, "a": round(area_km2(g))})
                labelled += 1
        entry["adm2"] = {"dataset": "geoBoundaries gbOpen ADM2", "group": group, "source": meta["boundarySource"],
                         "licence": meta["boundaryLicense"], "licence_source": meta.get("licenseSource"),
                         "year": meta.get("boundaryYearRepresented"), "type": meta.get("boundaryCanonical"),
                         "units": len(units), "labelled": labelled}

    for key, t in adm1.items():
        index["files"][f"adm1/{key}.json"] = write(out / "adm1" / f"{key}.json", {"v": 1, "scale": SCALE, **t})
    for group, store in adm2.items():
        for key, t in store.items():
            index["files"][f"adm2/{group}/{key}.json"] = write(out / "adm2" / group / f"{key}.json", {"v": 1, "scale": SCALE, **t})
    index["tiles"] = {"adm1": sorted(adm1), "adm2_attrib": sorted(adm2["attrib"]), "adm2_odbl": sorted(adm2["odbl"])}

    # ---- glyphs for the labels (Noto Sans, SIL Open Font License, from openmaptiles/fonts v2.0)
    with zipfile.ZipFile(raw / "noto.zip") as z:
        for font in GLYPH_FONTS:
            for b in GLYPH_BLOCKS:
                name = f"{font}/{b * 256}-{b * 256 + 255}.pbf"
                data = z.read(name)
                (out / "fonts" / font).mkdir(parents=True, exist_ok=True)
                (out / "fonts" / name).write_bytes(data)
                index["files"][f"fonts/{name}"] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

    # what the website needs to find and cache-bust tiles (index.json is provenance, not loaded by the site)
    index["files"]["tiles.json"] = write(out / "tiles.json", {"tiles": index["tiles"],
                                                             "v": {k: v["sha256"][:10] for k, v in index["files"].items() if k.endswith(".json")}})
    total = sum(v["bytes"] for v in index["files"].values())
    index["total_bytes"] = total
    (out / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n")
    n2 = sum(1 for c in index["countries"].values() if c.get("adm2", {}).get("dataset"))
    x2 = sorted(k for k, c in index["countries"].items() if c.get("adm2", {}).get("excluded") and "licence is" in c["adm2"]["reason"])
    print(f"world {index['files']['world.json']['bytes'] / 1e6:.2f} MB, adm1 tiles {len(adm1)}, "
          f"adm2 tiles {len(adm2['attrib'])} + {len(adm2['odbl'])} (ODbL), countries with ADM2 {n2}, excluded {x2}, "
          f"total {total / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]), Path(sys.argv[2])))
