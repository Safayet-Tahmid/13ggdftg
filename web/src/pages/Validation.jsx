// Validation: the pipeline's own test results, read from the reports that ship with the data.
// Every number here is copied from a report file; nothing is recomputed in the browser.
import { useEffect, useMemo, useState } from 'react';
import { csv, json } from '../lib/data.js';

export const REGION_NAMES = { global: 'Whole world', bangladesh: 'Bangladesh', africa_savanna: 'Central African savanna',
  australia_savanna: 'Northern Australia', amazon_arc: 'Amazon deforestation arc', siberia_boreal: 'Siberian boreal forest',
  iberia_med: 'Iberian Peninsula', punjab_crop: 'Punjab crop burning', kalimantan_peat: 'Kalimantan peatlands', java_volcanic: 'Java',
  florida: 'Florida' };

const get = (o, ...path) => path.reduce((a, k) => (a == null ? a : a[k]), o);
const one = (v) => (v == null ? '' : `${(+v).toFixed(1)}%`);
const pct = (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${(+v).toFixed(1)}%`);
const yes = (v) => (v == null ? '' : v ? 'PASS' : 'FAIL');
const LINKS = { 'S-NPP <- NOAA-20': 'VIIRS S-NPP ← NOAA-20', 'S-NPP <- D19': 'VIIRS S-NPP ← MODIS', 'MODIS <- Aqua': 'MODIS ← Aqua alone', 'MODIS <- Terra': 'MODIS ← Terra alone' };
const LEVELS = { 'own month': 'Its own data, that month', 'own all-year': 'Its own data, whole year', 'zone (without the tile)': 'Its 30° neighbourhood', 'world (without the tile)': 'The whole world' };
const EVENTS = { russia_2010: 'Russia 2010 heatwave fires', greece_2007: 'Greece 2007', indonesia_2006: 'Indonesia 2006 peat fires',
  indonesia_2015: 'Indonesia 2015 peat fires', amazon_2019: 'Amazon 2019', australia_2019_20: 'Australia Black Summer 2019-20',
  pantanal_2020: 'Pantanal 2020', canada_2023: 'Canada 2023' };
const METHODS = { 'no harmonisation': 'Nothing (join the records)', 'one global ratio': 'One ratio for the world',
  'one ratio per 10-degree region, all months': 'One ratio per 10° region', 'v1 Florida line': 'Our v1 Florida line', SHIFT: 'SHIFT' };

function Table({ rows, cols, labels, fmt = {} }) {
  if (!rows?.length) return <p className="muted small">Not available in this data release.</p>;
  return (
    <div className="tablewrap"><table>
      <thead><tr>{cols.map((c) => <th key={c} scope="col">{labels?.[c] || c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{fmt[c] ? fmt[c](r[c], r) : r[c] ?? ''}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

export default function Validation() {
  const [d, setD] = useState({});
  useEffect(() => {
    const load = (k, p, f) => f(`validation/${p}`).then((v) => setD((o) => ({ ...o, [k]: v }))).catch(() => {});
    load('harm', 'report_harmonise.json', json);
    load('checks', 'report_checks.json', json);
    load('res', 'counts__resolution_region_steps.csv', csv);
    load('fill', 'nodata__fill_test_scores.csv', csv);
    load('borrow', 'places__borrowed_factor_test.csv', csv);
    load('simple', 'checks__simple_methods.csv', csv);
  }, []);
  const g = get(d.harm, 'gate_2012_step', 'global');
  const ck = d.checks || {};
  const anom = get(ck, 'anomaly_rule', 'regions') || get(ck, 'anomaly_rule') || get(d.harm, 'anomaly_rule');
  const fillRows = useMemo(() => {
    const out = {};
    (d.fill || []).filter((r) => r.variable === 'frp').forEach((r) => { (out[r.link] ||= { link: r.link })[r.method] = r.abs_error_pct; });
    return Object.values(out);
  }, [d.fill]);
  const test26 = Object.entries(get(ck, 'final_test_2026', 'predictors') || {}).map(([name, v]) => ({
    name, cells: get(v, 'cells', 'global_error_pct'), frp: get(v, 'frp', 'global_error_pct'), pass: v.pass }));
  const simple = (d.simple?.length ? d.simple : ck.simple_methods) || [];
  const events = get(ck, 'known_events', 'table') || [];
  const evSum = get(ck, 'known_events', 'summary', 'SHIFT frp');
  const cover = get(ck, 'coverage', 'cells') || [];
  const ba = ck.burned_area;
  const cloud = ck.cloud;
  const crit = get(ck, 'critical_periods', 'critical_days_by_era') || {};
  const ratios = Object.entries(get(ck, 'satellite_ratios') || {}).filter(([k]) => k.startsWith('NOAA-20 per'));
  const coverOf = (v) => cover.find((r) => r.variable === v)?.calibrated_coverage_pct;

  return (
    <main className="page">
      <h2>How SHIFT was tested, and what each test can and cannot show</h2>
      <p className="lede">A harmonised record is only useful if the sensor of origin no longer matters. These are the tests,
        copied straight from the pipeline's reports. Each test's rule was written into the settings before its run. The tests do
        not all have the same independence: some years serve more than one step, and the note beside each result says where.
        There is no VIIRS before 2012, so no test can check the MODIS-era values directly. The tests use the years when both
        sensors flew.</p>
      <div className="facts">
        {g && <p><b>{pct(g.cells_gap_pct)}</b><span>gap between SHIFT's 2012 step and the step MODIS alone shows over the same years (one sensor, so no switch), hotspots,
          whole world. Gate: within ±5%. The factors were fitted on 2012 to 2019, which includes the 2013 to 2015 side of this
          comparison, so this shows continuity at the switch, not that the factors are right before 2012.</span></p>}
        {g && <p><b>{pct(g.frp_gap_pct)}</b><span>the same for fire power</span></p>}
        {simple.length > 0 && <p><b>{simple.find((r) => r.method === 'SHIFT')?.score ?? '–'}</b>
          <span>SHIFT's score against {Math.max(...simple.filter((r) => r.method !== 'SHIFT').map((r) => +r.score || 0)).toFixed(1)} for the best simple method (higher is better).
            SHIFT's own settings were chosen on held-out tests of this kind, so its lead may be a little optimistic.</span></p>}
        {evSum && <p><b>{events.filter((e) => e['SHIFT frp hit']).length} of {events.length}</b><span>known fire disasters flagged as unusual or critical (chance: {evSum.base_rate_pct}%). A small test: MODIS alone and the
          raw joined record flag them about as often.</span></p>}
        {cover.length > 0 && <p className="coverage"><b>{one(coverOf('cells'))}</b><span>of 2012 to 2015 cell-months fall inside the calibrated
          95% range (hotspots; fire power {one(coverOf('frp'))}){ck.tested_cells ? `, on the ${(+ck.tested_cells).toLocaleString('en-GB')} tested 2.5° cells` : ''}.
          <em className="qualifier"> Not a fully independent check. The 2012 to 2015 years were left out of the fit that made these
          predictions, but they were also used to choose and weight the tested cells, in the fits that set the range widths and sorted
          the cells into groups, and in choosing the model. The ranges checked here are also built a little differently from the
          published pre-2012 ranges, which have not been checked themselves. Coverage on truly unseen data could be higher or lower,
          and it has not been measured.</em></span></p>}
        {get(anom, 'plain', 'caught_pct') != null && <p><b>{get(anom, 'plain', 'caught_pct')}%</b><span>of the months S-NPP marks as unusual in the test regions that the MODIS-based prediction also marks (each year 2012 to
          2019 predicted with that year left out). False alarms {get(anom, 'plain', 'false_alarm_pct')}% (for single 2.5° cells {get(ck, 'anomaly_rule', 'plain', 'caught_pct')}% and {get(ck, 'anomaly_rule', 'plain', 'false_alarm_pct')}%)</span></p>}
      </div>

      <h3>The 2012 step, region by region</h3>
      <p className="small">The 2012 step (average of 2013 to 2015 against 2009 to 2011), SHIFT compared with MODIS alone. A gap near zero means the switch left no mark. Iberia is flagged: its gap is above 10%.</p>
      <Table rows={d.res} cols={['region', 'coarse', 'fine_shrunk']}
        labels={{ region: 'Region', coarse: 'Gap, 10° factors', fine_shrunk: 'Gap, final 2.5° factors' }}
        fmt={{ region: (v) => REGION_NAMES[v] || v, coarse: pct, fine_shrunk: pct }} />

      <h3>SHIFT against simpler methods</h3>
      <p className="small">Each method predicts S-NPP months from MODIS in years when both flew and that the fit did not use (leave one
        year out, and a backward test that fits on later years and predicts 2012 to 2015). Score out of 100. SHIFT's resolution and
        settings were chosen on tests of this kind, so this table is not fully independent of that choice.</p>
      <Table rows={simple} cols={['method', 'score_cells', 'score_frp', 'score']}
        labels={{ method: 'Method', score_cells: 'Hotspots', score_frp: 'Fire power', score: 'Score' }}
        fmt={{ method: (v) => METHODS[v] || v }} />

      <h3>The untouched 2026 test</h3>
      <p className="small">2026 data was locked away until the model was final, then predicted once. The result is stored and never rerun.
        Aqua fails on fire power because its orbit has drifted since 2022; no value in the record comes from Aqua alone after Feb 2023 (D29).
        This tests the satellite links used from 2020 on. It does not test the MODIS factors used before 2012.</p>
      <Table rows={test26} cols={['name', 'cells', 'frp', 'pass']}
        labels={{ name: 'Satellite used to predict S-NPP', cells: 'Hotspots error', frp: 'Fire power error', pass: 'Result' }}
        fmt={{ cells: pct, frp: pct, pass: yes }} />

      <h3>Known fire disasters</h3>
      <p className="small">Months of well-known fire events, and whether SHIFT's fire power marks them as unusual or critical (z of 1 or more).</p>
      <Table rows={events} cols={['event', 'months', 'SHIFT frp max z', 'SHIFT frp hit']}
        labels={{ event: 'Event', months: 'Months', 'SHIFT frp max z': 'Highest z', 'SHIFT frp hit': 'Flagged' }}
        fmt={{ event: (v) => EVENTS[v] || String(v).replace(/_/g, ' '), 'SHIFT frp hit': (v) => (v ? 'yes' : 'no'), 'SHIFT frp max z': (v) => (v == null ? '' : (+v).toFixed(1)) }} />

      <h3>Against burned area (GFED4)</h3>
      <p className="small">{ba ? `The 2012 step in SHIFT agrees with the burned-area record for the whole world: ${yes(ba.global_pass)}. Regions passing for both measures: ${ba.regions_passing_both ?? '–'} (the failures also fail for MODIS alone). GFED4 is itself built from MODIS data, so this is a consistency check, not independent ground truth.` : 'Not available in this data release.'}</p>

      <h3>Cloud</h3>
      <p className="small">{cloud ? `Low-fire months are cloudy ${cloud.cloudy_share_low_months_pct}% of the time against ${cloud.cloudy_share_all_months_pct}% overall, so cloudy months carry a flag in the monthly view (${cloud.flag_shown ? 'shown' : 'not shown'}).` : 'Not available in this data release.'}</p>

      {crit && Object.keys(crit).length > 0 && <>
        <h3>Days before 2012 are indicative</h3>
        <p className="small">Runs of critical days are about twice as frequent in the MODIS years as the same rule shows from 2012, so dated critical periods and daily or weekly views before 20 January 2012 are labelled indicative (D30). Months are tested.</p>
        <Table rows={Object.entries(crit).map(([k, v]) => ({ k, ...v }))} cols={['k', 'median_before', 'median_from_2012']}
          labels={{ k: 'Series', median_before: 'Critical days a year before 2012', median_from_2012: 'From 2012' }}
          fmt={{ median_before: (v) => (v == null ? '' : (+v).toFixed(1)), median_from_2012: (v) => (v == null ? '' : (+v).toFixed(1)) }} />
      </>}

      {ratios.length > 0 && <>
        <h3>NOAA-20 carries the record on</h3>
        <p className="small">NASA FIRMS stopped producing new Suomi NPP data at 13:00 UTC on 2 November 2026. NOAA-20 sees the same fire as Suomi NPP every year (ratio near 1), so it can take over.</p>
        <Table rows={ratios.map(([k, v]) => ({ k: k.replace(' per ', ' ÷ '), ...Object.fromEntries(Object.entries(v.by_year || {}).map(([y, x]) => [y, x == null ? '' : (+x).toFixed(2)])) }))}
          cols={['k', ...Object.keys(ratios[0][1].by_year || {})]} labels={{ k: 'Ratio' }} />
      </>}

      <h3>Filling satellite outages</h3>
      <p className="small">Real outages were simulated on days when both satellites worked, and each month rebuilt. Error of the month's fire power total.</p>
      <Table rows={fillRows} cols={['link', 'none', 'scale', 'substitute', 'hybrid']}
        labels={{ link: 'Gap in ← filled from', none: 'Counted as zero fire', scale: 'Month scaled up', substitute: 'Partner satellite', hybrid: 'Partner, cautious' }}
        fmt={{ link: (v) => LINKS[v] || v, none: one, scale: one, substitute: one, hybrid: one }} />

      <h3>How good is a borrowed factor?</h3>
      <p className="small">Places with little fire borrow their factor from a wider area. Each tested place was rebuilt without its own data to measure that honestly.</p>
      <Table rows={d.borrow} cols={['level', 'fw_median_abs_total_error_pct', 'tiles_within_limit_pct']}
        labels={{ level: 'Factor from', fw_median_abs_total_error_pct: 'Typical error', tiles_within_limit_pct: 'Places within ±10%' }}
        fmt={{ level: (v) => LEVELS[v] || v, fw_median_abs_total_error_pct: one, tiles_within_limit_pct: one }} />

      <p className="small">Every pipeline stage writes a full report; they ship with this site's data (folder <code>data/validation</code>) and are described in the
        {' '}<a href="https://github.com/squadronzero/squadron-zero">code repository</a>.</p>
    </main>
  );
}
