"""Tests for the map geography preparation (no network, no raw data needed). Run: python -m pytest -q geo"""
from shapely.geometry import LineString, Polygon

import prepare_geo as pg


def test_licence_rule():
    assert pg.licence_group("Public Domain") == "attrib"
    assert pg.licence_group("CC0 1.0 Universal (CC0 1.0) Public Domain Dedication") == "attrib"
    assert pg.licence_group("Creative Commons Attribution 3.0 Intergovernmental Organisations (CC BY 3.0 IGO)") == "attrib"
    assert pg.licence_group("Creative Commons Attribution 4.0 International (CC BY 4.0)") == "attrib"
    assert pg.licence_group("Open Government Canada 2.0") == "attrib"
    assert pg.licence_group("Etalab Open License 2.0") == "attrib"
    assert pg.licence_group("Open Data Commons Open Database License 1.0") == "odbl"
    assert pg.licence_group("Open Data Commons Public Domain Dedication and License (PDDL) v1.0") == "attrib"
    # share-alike, permission-only and unclear licences are left out
    assert pg.licence_group("Creative Commons Attribution-ShareAlike 2.0") is None
    assert pg.licence_group("Creative Commons Attribution-ShareAlike 3.0 Unported") is None
    assert pg.licence_group("Other - Direct Permission") is None
    assert pg.licence_group("National Institute of Statistics (INE) Data License") is None
    assert pg.licence_group("Federal Office of Topography swisstopo License") is None
    assert pg.licence_group("") is None


def test_packed_lines_round_trip():
    line = LineString([(90.0, 23.0), (90.5, 23.0), (90.5, 23.5), (90.5, 23.5)])
    pk = pg.packed(line)
    s = pg.SCALE
    assert pk[:2] == [90 * s, 23 * s]
    xs, ys, pts = pk[0], pk[1], [(pk[0] / s, pk[1] / s)]
    for i in range(2, len(pk), 2):
        xs += pk[i]; ys += pk[i + 1]; pts.append((xs / s, ys / s))
    assert pts == [(90.0, 23.0), (90.5, 23.0), (90.5, 23.5)]           # repeated point dropped


def test_tile_keys_and_cover():
    assert pg.tile_key(20, 90) == "N20E090"
    assert pg.tile_key(-30, -60) == "S30W060"
    assert sorted(pg.tile_key(a, b) for a, b in pg.tiles_for((88, 20.5, 92.7, 26.7), 10)) == ["N20E080", "N20E090"]


def test_label_point_is_inside_and_text_filter():
    poly = Polygon([(0, 0), (10, 0), (10, 1), (1, 1), (1, 10), (0, 10)])      # an L shape
    assert poly.contains(pg.label_point(poly))
    assert pg.ok_text("Cox's Bazar") and pg.ok_text("Kukës") and pg.ok_text("Москва")
    assert not pg.ok_text("تونس") and not pg.ok_text("臺北") and not pg.ok_text("")


def test_corrections_are_explicit():
    assert pg.CORRECTIONS == {("BGD", "ADM1", "Rajshani"): "Rajshahi"}
