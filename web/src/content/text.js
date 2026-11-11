// EVERY LABEL AND SHORT SENTENCE ON THE SITE (safe to edit).
// Change wording here, not in the components. Keep the meaning of science words the same:
// "hotspots", "no data" (never "no fire"), "indicative", "95% range" are defined terms.
// Entries written as functions build a sentence from numbers: keep the ${...} parts.

// Shown beside every 95% range figure (scientific claims correction, 11 Nov 2026). Labels only: no calculation uses this.
export const RANGE_CAVEAT = 'The range covers only the MODIS-to-VIIRS conversion error. Its 95% coverage was not checked independently, so it is a guide, not a guaranteed bound (see Method).';
export const rangeShort = (p) => `95% range ±${p}% (conversion error only, not a guaranteed bound)`;

const T = {
  brand: 'SHIFT',
  tagline: 'One fire record from two generations of NASA satellites, 2002 to today',
  dataTo: (d) => `Record to ${d}`,
  recentTo: (t, stale) => `Recent detections to ${t}${stale ? ' (not current)' : ''}`,
  notOfficial: 'Team Squadron Zero · NASA Space Apps Challenge 2026 · not an official NASA product',

  views: { explore: 'Explore', switch: 'The 2012 switch', validation: 'Validation', method: 'Method and data' },
  theme: { system: 'Auto', light: 'Light', dark: 'Dark', label: 'Colour theme' },

  // ---------------------------------------------------------------- the two measures (D31)
  measures: { cells: 'Hotspots', frp: 'Fire power' },
  units: { cells: 'hotspots', frp: 'MW' },
  hotspotDefinition: 'A hotspot is a 0.05° grid cell (about 5 km) with fire on a day. Counting cells instead of raw '
    + 'detections stops the finer VIIRS pixels from inflating the count. Fire power is the fire radiative power (MW) of the '
    + 'detections, added up per day. Monthly and yearly fire power add those daily sums together, so they are an index of how '
    + 'much intense burning was seen, not an amount of energy. Neither number counts separate fires.',
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

  // ---------------------------------------------------------------- recent detections (D38)
  recent: {
    layer: 'Map layer',
    layers: { record: 'Harmonised record', recent: 'Recent detections' },
    period: 'Period',
    // The periods end at the newest detection in the snapshot, not at the current time (Task 2, WP3).
    periods: { '24h': '24 h to the newest detection', '7d': '7 days to the newest detection', all: 'Since 28 Oct' },
    fetched: (when, from, to) => `Retrieved from NASA FIRMS ${when}. Detections from ${from} to ${to} (the newest one). `
      + 'Periods end at the newest detection, not at the current time.',
    stale: (when) => `Recent observations are not current. Showing the last successful dataset, retrieved on ${when}.`,
    fallback: (when) => `The refresh of ${when} did not complete, so this earlier dataset is kept unchanged.`,
    feedLag: (h) => `The newest detection is ${h} hours older than the retrieval: FIRMS may be delayed.`,
    missing: (list) => `Incomplete: no data was received for ${list}. Missing data is not "no fire".`,
    missingItem: (m) => `${m.satellite === 'N21' ? 'NOAA-21' : m.satellite === 'N20' ? 'NOAA-20' : m.satellite} from ${m.from} (${m.days} day${m.days === 1 ? '' : 's'})`,
    unavailable: 'Recent detections are not available in this build (the last fetch failed or has not run). '
      + 'The harmonised record is not affected.',
    incomplete: 'Some recent data could not be fetched, so some days may be missing. Missing days are not "no fire".',
    zoomHint: 'Zoom in to see single detections. Click a cell to zoom to it.',
    tooMany: 'Showing the nearest areas only. Zoom in further to see every detection here.',
    loading: 'Loading detections…',
    updating: 'Recent detections are being updated, and the files on the server do not all belong to the same update yet. '
      + 'Nothing is shown rather than a mix. Reload in a few minutes. The harmonised record is not affected.',
    tilesMissing: 'Some single detections in view could not be loaded (the data may be updating). Reload in a few minutes.',
    cellTip: (n, fmax) => [`${n.toLocaleString()} detection${n === 1 ? '' : 's'}`, `strongest ${fmax.toLocaleString()} MW`, 'Click to zoom in'],
    pointTip: (d) => [`${d.frp.toLocaleString()} MW`, `${d.satellite}, ${d.time}`, `confidence ${d.confidence}`,
      ...(d.nonfire ? ['likely non-fire heat (gas flare, industry or volcano)'] : [])],
    legendTitle: (zoomedIn) => (zoomedIn ? 'Recent detections: fire power of each detection' : 'Recent detections per 0.25° cell'),
    legendUnitCells: 'detections of nominal or high confidence in the period',
    legendUnitPoints: 'MW, as reported by FIRMS for each 375 m pixel',
    legendRaw: 'Raw NASA FIRMS near-real-time detections. Not on the harmonised S-NPP scale and not added to any number '
      + 'on this page. S-NPP, SHIFT\'s reference satellite, stopped in NASA FIRMS on 2 Nov 2026 (13:00 UTC), so these come from NOAA-20 and NOAA-21.',
    legendLow: 'Faint ringed dots: low confidence. Grey: likely non-fire heat (SHIFT non-fire cells). Neither is counted in the overview.',
    legendOverlap: '28 Oct is also the last day of the harmonised record (one day of overlap, on purpose).',
    panel: {
      title: 'This detection',
      close: 'Close',
      where: 'Pixel centre',
      size: 'About 375 m across. A satellite pixel with a heat signal, not the outline of a fire.',
      time: 'Time of the satellite pass',
      satellite: 'Satellite',
      untested: 'NOAA-21 has not been tested against S-NPP by SHIFT.',
      tested: 'SHIFT measured NOAA-20 against S-NPP: 1.00 to 1.05 for hotspots.',
      confidence: 'Confidence (FIRMS)',
      frp: 'Fire radiative power (FIRMS)',
      daynight: 'Day or night pass',
      nonfire: 'Likely non-fire heat: this pixel is in a cell SHIFT marks as a persistent gas flare, industrial site or volcano.',
      limits: 'Not every detection is a wildfire: farm, land-clearing and other burning count too. This is a raw detection, '
        + 'not a harmonised value, and is never compared with the record as a number.',
      history: 'Show the history of this area (50 km around)',
      historyNote: 'The panel on the right then shows this area\'s burning calendar since 2002 and its usual fire season.',
      firms: 'This place on the NASA FIRMS map',
    },
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
    imageryAttribution: 'Imagery: NASA GIBS, part of NASA ESDIS',
    label: 'World map of harmonised fire activity',

    // ---- view controls (2D map, 3D globe, backdrop, playback)
    view: 'Map view',
    views: { '2d': '2D map', '3d': '3D globe' },
    basemap: 'Backdrop',
    basemaps: { standard: 'Plain', satellite: 'Satellite (Blue Marble)', daily: 'Satellite picture of one day' },
    imageryDay: 'Picture date',
    reset: 'Reset view',
    gaps: 'Show satellite gaps',
    play: 'Play months', pause: 'Pause', speed: 'Speed',
    speeds: { 2000: 'Slow', 1000: 'Normal', 500: 'Fast' },
    mapFailed: 'The map could not start on this device (it needs WebGL, for the 2D map and the 3D globe alike). '
      + 'Every chart, number and download beside it still works.',
    contextLost: 'The graphics card reset the map. It is being redrawn.',
    imageryOffline: 'The satellite picture could not be loaded (it needs the internet). The fire data on top is unaffected.',
    imageryTooEarly: 'Daily satellite pictures start on 24 Feb 2000.',
    imageryNote: 'The picture is a backdrop only. It is not SHIFT data, not live, and its date can differ from the fire month.',
    dateLine: 'Boxes cannot cross the date line (180°). Draw one box on each side instead.',
    keys: 'Keys: arrows move, + and − zoom, Shift with arrows tilts and turns (3D).',

    // ---- legend
    legendToggle: 'Legend',
    legendTitle: (v, ym) => `${v === 'frp' ? 'Fire power' : 'Hotspots'}, ${ym}, per 0.25° cell (about 25 km)`,
    legendUnit: { frp: 'MW summed over the days of the month (an index, not energy)', cells: 'hotspot cell-days in the month' },
    legendScale: 'S-NPP (VIIRS) scale throughout. Before 20 Jan 2012: MODIS put on that scale (an estimate).',
    legendSupport: 'Each square is a 0.25° grid cell, not a fire location. Zoomed out, cells are drawn as dots.',
    legendGaps: 'Hatched zones: 30° zones with at least one day without satellite data this month (no data is not zero).',
    summary: (ym, n, frp, cells, view) => `${view}, ${ym}: ${n.toLocaleString()} cells with fire, `
      + `${cells.toLocaleString()} hotspots and ${frp.toLocaleString()} MW summed fire power.`,

    // ---- the panel for one clicked cell
    cell: {
      title: 'This map cell',
      close: 'Close',
      where: 'Cell',
      size: '0.25° × 0.25° (about 25 km across). A grid cell, not the place of a fire.',
      month: 'Month',
      cells: 'Hotspots (S-NPP scale)',
      frp: 'Fire power (summed MW, an index)',
      source: 'Source',
      eras: {
        terra_only: 'MODIS Terra only, put on the S-NPP scale. Jan-Jun 2002: not comparable with later years (D20).',
        modis: 'MODIS (Terra and Aqua, Aqua alone from 2020) put on the S-NPP scale with a measured factor. An estimate, not a VIIRS observation.',
        switch: 'Mixed month: MODIS put on the S-NPP scale up to 19 Jan 2012, S-NPP observed from 20 Jan 2012.',
        viirs: 'VIIRS S-NPP observed (NOAA-20 fills days S-NPP missed).',
      },
      range: 'Calibrated 95% range of the factor (conversion error only)',
      rangeValue: (c, f, fc) => `hotspots ±${c}%, fire power ±${f}% (2.5° factor cell ${fc}, this calendar month). `
        + 'Wide ranges mean few fires to measure the factor with. Area totals have much narrower ranges. '
        + RANGE_CAVEAT,
      rangeNone: 'Not needed: the month is observed by S-NPP.',
      rangeMissing: 'No range for this factor cell and month.',
      cloud: 'Cloud',
      cloudYes: (t) => `Flagged: tile ${t} was cloudier than 90% of years this month, so some fire may have been hidden.`,
      cloudNo: (t) => `Not flagged (tile ${t}).`,
      cloudUnknown: 'No cloud data for this month.',
      zeroWithGaps: (n) => `Zero on the days with data. ${n} day${n > 1 ? 's' : ''} had no satellite data in this zone, so fire on those days is unknown, not zero.`,
      zone: 'Satellite days (30° zone)',
      zoneValue: (p, f, n) => `${p} primary, ${f} filled from a partner satellite, ${n} with no data.`,
      limits: 'Hotspots are not always wildfires: farm and land-clearing fires count too (known volcanoes, gas flares and '
        + 'industry are removed). Values are monthly sums for the whole cell.',
      firms: 'Original detections in this cell on NASA FIRMS',
    },
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
    modes: { month: 'Latest month so far', last30: 'Latest 30 days', custom: 'Your dates' },
    customHint: 'Pick dates below (up to one year) to compare them with the same dates in every other year.',
    tooLong: 'Choose at most one year of dates to compare with other years.',
    window: (a, b) => `${a} to ${b}`,
    vsMedian: (ratio) => ratio == null ? 'No normal to compare with'
      : ratio >= 1.15 ? `${ratio.toFixed(1)}× the normal` : ratio <= 0.87 ? `${Math.round(ratio * 100)}% of the normal` : 'About normal',
    rank: (r, n) => `Rank ${r} of ${n} years (1 = most fire)`,
    median: (v, b0, b1, n) => `Normal (median of ${n} years, ${b0} to ${b1}): ${v}`,
    monthShare: (pct, month) => `So far this month (to the last day with data) has had ${pct}% of the fire a normal ${month} brings in the whole month.`,
    left: (n) => `${n} year${n > 1 ? 's' : ''} left out because a satellite gap fell in these dates.`,
    targetGaps: (n) => `${n} day${n > 1 ? 's' : ''} in these dates had no satellite data, so this year may be undercounted.`,
    modisNote: 'Bars before 2012 are MODIS put on the VIIRS scale. The whisker is their calibrated 95% range. ' + RANGE_CAVEAT,
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
    label: (m) => `Monthly ${m}, with the 95% range of the MODIS years (conversion error only, not a guaranteed bound)`,
    total: 'monthly total', range: '95% range of the scaling (MODIS years, conversion error only)', viirs: 'VIIRS',
    rangeTip: (a, b) => `95% range ${a} to ${b} (conversion error only)`,
  },
  explainScale: 'Values are on the VIIRS (S-NPP) scale throughout. Before 20 January 2012 they are MODIS observations '
    + 'put on that scale with a factor measured for this place and month. The shaded band is that factor\'s calibrated 95% range. '
    + RANGE_CAVEAT,

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
    pngOnly: 'PNG image (this chart is drawn as a picture, so there is no SVG version)',
    note: 'Dates apply to the CSV files and to "Your dates" above. Raw satellite points are not stored here. The FIRMS link opens them. '
      + 'The range_95_pct column is the conversion-error range only, not a guaranteed 95% bound (see Method).',
  },
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default T;
