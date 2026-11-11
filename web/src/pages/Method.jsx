// Method and data: how the record is built, its limits, and every source.
import T from '../content/text.js';
import { dateOf, lastDataDay } from '../lib/data.js';
import { longDate } from '../lib/format.js';

export default function Method({ meta }) {
  const last = meta ? longDate(dateOf(meta, lastDataDay(meta))) : null;
  return (
    <main className="page prose">
      <h2>How SHIFT builds one record from two satellites</h2>
      <p>NASA's MODIS instruments (Terra and Aqua) have mapped active fires since 2000. The VIIRS instruments (Suomi NPP from
        2012, NOAA-20 from 2018) see the same fires with finer pixels and catch many small ones MODIS misses. SHIFT turns every
        detection from NASA FIRMS into a hotspot (a 0.05° cell with fire on a day), removes heat that is not fire, and puts the
        MODIS years on the VIIRS scale.</p>
      <h3>The steps</h3>
      <ol>
        <li>Count hotspots (burning 0.05° cells) instead of detections, so a finer sensor cannot inflate the count.</li>
        <li>Remove gas flares, industry, volcanoes and offshore platforms that NASA labelled as non-fire, in every year.</li>
        <li>For each 2.5° area and calendar month, measure the ratio of VIIRS to MODIS fire over 2012 to 2025. Areas with little fire lean on their 10° neighbourhood.</li>
        <li>Use Terra and Aqua together until 2019 and Aqua alone after, when Terra's orbit drifts.</li>
        <li>Fill satellite outages from a partner satellite flying close in time, tested to within 3 to 6 percent. Where no partner saw the area, the day is shown as no data.</li>
        <li>Carry the record past 2 November 2026, 13:00 UTC, when NASA FIRMS stopped producing Suomi NPP data (NASA FIRMS FAQ), with NOAA-20 tied to it.</li>
      </ol>
      <h3>What the Explore page works out</h3>
      <ul>
        <li><b>Now against the past:</b> the chosen dates against the same dates in every year from 2003, with the median of the complete years, the rank and the ratio. Years with a satellite gap in those dates are left out.</li>
        <li><b>When the fire season comes:</b> the average year for the area, smoothed over a month. The season runs from the day 10% of a normal year's fire has burned to the day 90% has, counted from the quietest point of the year.</li>
        <li><b>Weather at the time</b> (preset areas, D39): NASA POWER daily rain, humidity, daily maximum temperature, wind and
          root-zone soil wetness over the same dates as "Now against the past", against the same dates in the baseline years
          (median, difference and rank), plus rain in the 60 days before. UTC days, the mean of up to nine land points spread across the area (points over water are left out).
          The rules were written down before the data were fetched (context/power_rules.json). Weather is context only: it is
          never used in the harmonised record, the month classes or any score, and it does not show why fires burned.</li>
        <li><b>Each month against its normal:</b> the z score of log(1 + value) against the same month of the baseline years. Below -1 is low, up to 1 normal, up to 2 unusual, 2 and above critical.</li>
      </ul>
      <h3>What to keep in mind</h3>
      <ul>
        {last && <li>The harmonised record runs to {last}. From 28 October 2026 the map also offers <b>recent detections</b> (D38):
          raw NASA FIRMS near-real-time points from VIIRS on NOAA-20 and NOAA-21, fetched every few hours and labelled with the
          fetch time. Their periods (24 hours, 7 days) end at the newest detection, not at the current time. If a
          refresh fails, the last complete dataset is kept unchanged and marked as not current, and a dataset with
          missing days says which ones are missing. They are not on the harmonised scale, are never added to the record's numbers and are never given an
          anomaly score. NASA FIRMS stopped producing new data from S-NPP, the record's reference satellite, at 13:00 UTC on 2 November 2026. SHIFT measured
          NOAA-20 against S-NPP (1.00 to 1.05). NOAA-21 has not been tested against S-NPP by SHIFT. Detections in SHIFT's
          persistent non-fire cells are shown in grey, and low-confidence detections are drawn faint and not counted.</li>}
        <li>Cloud and smoke hide fires from every satellite. A cloudy day can look like a quiet one; months cloudier than 90% of years carry a flag.</li>
        <li>January to June 2002 has Terra only and is not compared with later years.</li>
        <li>Areas are summed on a 1° grid, so the edges of any area are accurate to about 100 km.</li>
        <li>Before 2012 every value carries a calibrated 95% range for the MODIS-to-VIIRS conversion, wider where fire is sparse.
          It covers only that conversion error, as measured in the years both sensors flew. It does not include fire hidden by cloud
          or smoke, false detections, any change in the VIIRS to MODIS ratio before 2012 (which cannot be measured), or the larger
          errors of single days and small areas. In a check on 2012 to 2015, about 94 to 95% of cell-months fell inside, but that
          check was not fully independent of how the ranges were set, and the ranges it checked are built a little differently
          from the published ones (see the Validation page). Read the range as a guide to the conversion error, not as a guaranteed
          95% bound on the true value.</li>
        <li>Day-level and week-level values and dated critical periods before 20 January 2012 are indicative; months are tested (D30).</li>
        <li>About one in four unusual months in the MODIS years would not be unusual to VIIRS; those months are marked.</li>
        <li>Three test regions keep a 2012 step near 10% after harmonising, depending on how it is measured: Iberia +9 to +12%
          (flagged, with extra uncertainty), Florida -7 to -9% and Siberia about -9%. Year-to-year wobble in the VIIRS to MODIS
          ratio is about 3 to 10% in single regions, so gaps of this size are at the edge of what can be told apart from noise.</li>
        <li>Unusual and Critical months are statistically extreme for that place and month. They are not fire danger ratings or emergency warnings.</li>
        <li>The weather comes from a reanalysis (a weather model guided by observations) on a grid of about 50 to 70 km, not from
          stations at the fires. The newest weeks are near-real-time values that NASA may revise, and are marked provisional.</li>
        <li>NOAA-21 (VIIRS since 2023) is not used: it was not tested against the others in time (D35).</li>
        <li>From February 2023 Aqua flies past its 13:45 science limit, so it no longer fills Suomi NPP gaps (D29).</li>
      </ul>
      <h3>Data</h3>
      <ul className="refs">
        <li>MODIS Collection 6.1 Active Fire Detections (MCD14ML, MCD14DL), NASA FIRMS. <a href="https://doi.org/10.5067/FIRMS/MODIS/MCD14ML">doi:10.5067/FIRMS/MODIS/MCD14ML</a></li>
        <li>VIIRS 375 m Active Fire, Suomi NPP (VNP14IMGT), NASA FIRMS. <a href="https://doi.org/10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002">doi:10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002</a></li>
        <li>VIIRS 375 m Active Fire, NOAA-20 (VJ114IMGT), NASA FIRMS. <a href="https://doi.org/10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002">doi:10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002</a></li>
        <li>Recent detections only: VIIRS 375 m Active Fire NRT, NOAA-20 and NOAA-21 (VJ214IMGT), from the NASA FIRMS Area API
          (VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT).</li>
        <li>GFED4 monthly burned area (check only). Giglio, Randerson and van der Werf (2013), Journal of Geophysical Research: Biogeosciences 118.</li>
        <li>MERRA-2 monthly total cloud fraction, M2TMNXRAD (cloud flag only), NASA GMAO via GES DISC.</li>
        <li>Giglio, Schroeder and Justice (2016), The collection 6 MODIS active fire detection algorithm and fire products. Remote Sensing of Environment 178.</li>
        <li>Schroeder, Oliva, Giglio and Csiszar (2014), The new VIIRS 375 m active fire detection data product. Remote Sensing of Environment 143.</li>
        <li>Weather context only: NASA POWER Daily API (v2.10.3, community AG, UTC), parameters PRECTOTCORR, RH2M, T2M_MAX, WS2M and
          GWETROOT, from GMAO MERRA-2 and GEOS-IT. Fetched for the preset areas on the date shown in the weather notes. <a href="https://power.larc.nasa.gov">power.larc.nasa.gov</a></li>
        <li>Country borders: Natural Earth, via world-atlas.</li>
        <li>Optional map backdrop (online only): NASA Blue Marble shaded relief and daily MODIS Terra or VIIRS S-NPP true colour
          pictures from NASA GIBS. A picture only, never used in any number.</li>
      </ul>
      <p>We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS),
        part of NASA's Earth Science Data and Information System (ESDIS). We acknowledge the use of imagery provided by
        services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).</p>
      <p>The weather data was obtained from the National Aeronautics and Space Administration (NASA) Langley Research Center's
        Prediction Of Worldwide Energy Resources (POWER) project funded through the NASA Earth Science Division.</p>
      {meta && <p className="small">This release covers {meta.start} to {meta.end}, generated {meta.generated_utc.slice(0, 10)}.
        Code, every test and every decision: <a href="https://github.com/squadronzero/squadron-zero">github.com/squadronzero/squadron-zero</a>.
        To run offline, serve the site folder with any static server (for example <code>python -m http.server</code>) and open it in a browser.</p>}
      <p className="small">{T.notOfficial}.</p>
    </main>
  );
}
