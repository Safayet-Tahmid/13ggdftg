// EVERY LABEL AND SHORT SENTENCE ON THE SITE (safe to edit).
// Change wording here, not in the components. Keep the meaning of science words the same:
// "hotspots", "no data" (never "no fire"), "indicative", "95% range" are defined terms.
// Entries written as functions build a sentence from numbers: keep the ${...} parts.

const T = {
  brand: 'SHIFT',
  tagline: 'One fire record from two generations of NASA satellites, 2002 to today',
  dataTo: (d) => `Data to ${d}`,
  notOfficial: 'Team Squadron Zero · NASA Space Apps Challenge 2026 · not an official NASA product',

  views: { explore: 'Explore', switch: 'The 2012 switch', validation: 'Validation', method: 'Method and data' },
  theme: { system: 'Auto', light: 'Light', dark: 'Dark', label: 'Colour theme' },

  // ---------------------------------------------------------------- the two measures (D31)
  measures: { cells: 'Hotspots', frp: 'Fire power' },
  units: { cells: 'hotspots', frp: 'MW' },
  hotspotDefinition: 'A hotspot is a 0.05° grid cell (about 5 km) with fire on a day. Counting cells instead of raw '
    + 'detections stops the finer VIIRS pixels from inflating the count. Fire power is the heat the fires give off, in megawatts.',
  whatIsHotspot: 'What is a hotspot?',

  // ---------------------------------------------------------------- choosing the area
  area: {
    heading: 'Area',
    modes: { preset: 'Preset', country: 'Country', box: 'Coordinates', point: 'Point', draw: 'Draw' },
    preset: 'Preset area',
    country: 'Country',
    countryPick: 'Choose a country…',
    west: 'West', south: 'South', east: 'East', north: 'North',
    lat: 'Latitude', lon: 'Longitude', radius: 'Radius (km)',
    apply: 'Show',
    drawHint: 'Press and drag on the map to draw a box.',
    drawing: 'Drag on the map…',
    draw: 'Draw a box on the map',
    tooBig: (n, max) => `This area needs ${n} data files; the most one view can load is ${max}. Pick a smaller area.`,
    edgeNote: 'Areas are summed on a 1° grid (about 100 km), so the edges of an area are approximate.',
    tested: 'One of SHIFT\'s ten tested regions: its own checks are on the Validation page.',
    share: 'Copy share link',
    copied: 'Link copied',
  },

  // ---------------------------------------------------------------- the map
  map: {
    month: 'Map month',
    notFire: 'Show heat that isn\'t fire',
    kinds: { industry: 'gas flares, industry', volcano: 'volcanoes', offshore: 'offshore' },
    fireTip: (frp, cells) => `<b>${frp} MW</b> fire power<br>${cells} hotspots (S-NPP scale)`,
    notFireTip: (kind, years) => `<b>${kind}</b><br>Labelled non-fire by NASA in ${years} year${years > 1 ? 's' : ''}. Left out of every year.`,
    notFireKinds: { 1: 'Volcano', 2: 'Gas flare or industry', 3: 'Offshore platform' },
    attribution: 'Fire data: NASA FIRMS (MODIS, VIIRS) · Borders: Natural Earth',
    label: 'World map of harmonised fire activity',
  },

  // ---------------------------------------------------------------- the explore story
  loading: 'Loading the daily record…',
  noFire: 'No fire was recorded in this area.',
  loadError: 'The fire data could not be loaded. If you opened the file directly, serve the folder instead (see Method and data).',
  lede: (u, c, b0, b1, gaps) => `${u} unusual and ${c} critical months since ${b0}, judged against this area's own ${b0} to ${b1} normal.`
    + (gaps > 0 ? ` ${gaps} days had no satellite data and are shown as gaps, not as quiet days.` : ''),

  headings: {
    now: 'Now against the past',
    season: 'When the fire season comes',
    calendar: 'Every day since 2002',
    months: 'Each month against its normal',
    trend: 'Monthly totals',
    downloads: 'Download and share',
  },

  // ---------------------------------------------------------------- compare (D32)
  compare: {
    modes: { month: 'This month so far', last30: 'Last 30 days', custom: 'Your dates' },
    customHint: 'Pick dates below (up to one year) to compare them with the same dates in every other year.',
    tooLong: 'Choose at most one year of dates to compare with other years.',
    window: (a, b) => `${a} to ${b}`,
    vsMedian: (ratio) => ratio == null ? 'No normal to compare with'
      : ratio >= 1.15 ? `${ratio.toFixed(1)}× the normal` : ratio <= 0.87 ? `${Math.round(ratio * 100)}% of the normal` : 'About normal',
    rank: (r, n) => `Rank ${r} of ${n} years (1 = most fire)`,
    median: (v, b0, b1, n) => `Normal (median of ${n} years, ${b0} to ${b1}): ${v}`,
    monthShare: (pct, month) => `So far this month has had ${pct}% of the fire a normal ${month} brings in the whole month.`,
    left: (n) => `${n} year${n > 1 ? 's' : ''} left out because a satellite gap fell in these dates.`,
    targetGaps: (n) => `${n} day${n > 1 ? 's' : ''} in these dates had no satellite data, so this year may be undercounted.`,
    modisNote: 'Bars before 2012 are MODIS put on the VIIRS scale; the whisker is their calibrated 95% range.',
    chartLabel: 'The same dates in every year',
  },

  // ---------------------------------------------------------------- season
  season: {
    none: 'Too little fire here to define a season.',
    runs: (a, b, len) => `The fire season usually runs from ${a} to ${b} (${len} days hold 80% of a year's fire).`,
    peak: (d) => `It usually peaks around ${d}.`,
    core: (a, b) => `Half of a normal year's fire burns between ${a} and ${b}.`,
    sharp: (pct) => `${pct}% of a year's fire falls in its busiest 90 days.`,
    now: (d) => `On ${d}:`,
    inSeason: 'Inside the usual season.',
    outSeason: (n) => `Outside the usual season; it usually starts in about ${n} days.`,
    next30: (pct) => `The next 30 days usually bring ${pct}% of a year's fire.`,
    soFar: (ratio, d) => ratio == null ? '' : `Since the quiet point (${d}) this fire year has had ${ratio >= 1 ? `${ratio.toFixed(1)}×` : `${Math.round(ratio * 100)}% of`} the fire a normal year has had by now.`,
    gaps: 'Some days of this fire year had no satellite data.',
    basis: (b0, b1) => `Average year ${b0} to ${b1}, smoothed over a month. A guide to timing, not a forecast.`,
    chartLabel: 'The average year, with the usual season shaded',
  },

  // ---------------------------------------------------------------- calendar and month grid
  calendar: {
    label: 'Daily fire calendar, one row per year',
    noFire: 'no fire seen', more: 'more fire', noData: 'no data', viirs: 'VIIRS from 20 Jan 2012',
    indicative: 'days before 2012: indicative',
    tipNoData: 'No data: a satellite outage covered this area. Not the same as no fire.',
    srcTerra: 'Terra only, not comparable', srcModis: 'MODIS put on the VIIRS scale', srcViirs: 'VIIRS (S-NPP)',
    filled: ', partly filled from a partner satellite',
    tipIndicative: 'Day-level values before 20 Jan 2012 are indicative; the months are tested (D30).',
  },
  classes: { low: 'Below normal', normal: 'Normal', unusual: 'Unusual', critical: 'Critical' },
  monthGrid: {
    label: 'Monthly anomaly classes, one row per year',
    notClassed: 'not classed', before2012: 'before 2012, lower confidence', cloudy: 'cloudier than 90% of years',
    terra: 'Terra only: not compared with later years',
    incomplete: (n) => `Not classed: ${n ? `${n} day(s) without data` : 'month not complete'}`,
    tooFew: 'Too few years to judge',
    classed: (cls, month, z) => `${cls} for ${month} (z = ${z})`,
    falseAlarm: (pct) => `MODIS years: about ${pct}% of such flags are not unusual in VIIRS (measured)`,
    cloudTip: 'Cloudier than 90% of years here: some fire may have been hidden by cloud.',
    cloudUntil: (ym) => `Cloud data reaches ${ym}; later months carry no cloud flag.`,
  },
  trend: {
    label: (m) => `Monthly ${m}, with the 95% range of the MODIS years`,
    total: 'monthly total', range: '95% range of the scaling (MODIS years)', viirs: 'VIIRS',
    rangeTip: (a, b) => `95% range ${a} to ${b}`,
  },
  explainScale: 'Values are on the VIIRS (S-NPP) scale throughout. Before 20 January 2012 they are MODIS observations '
    + 'put on that scale with a factor measured for this place and month; the shaded band is that factor\'s calibrated 95% range.',

  // ---------------------------------------------------------------- downloads
  downloads: {
    from: 'From', to: 'To',
    whole: 'Whole record',
    daily: 'Daily totals (CSV)',
    monthly: 'Monthly table with classes (CSV)',
    cells: 'Hotspots per 1° cell and day (CSV)',
    cellsBusy: 'Preparing…',
    cellsCut: (n) => `Only the first ${n.toLocaleString()} rows fit; choose fewer dates or a smaller area.`,
    firms: 'Original detections on NASA FIRMS (online)',
    print: 'Print or save a one-page brief',
    png: 'PNG', svg: 'SVG',
    note: 'Dates apply to the CSV files and to "Your dates" above. Raw satellite points are not stored here; the FIRMS link opens them.',
  },
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default T;
