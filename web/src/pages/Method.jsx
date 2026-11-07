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
        <li>Carry the record past 1 November 2026, when Suomi NPP data delivery ends, with NOAA-20 tied to it.</li>
      </ol>
      <h3>What the Explore page works out</h3>
      <ul>
        <li><b>Now against the past:</b> the chosen dates against the same dates in every year from 2003, with the median of the complete years, the rank and the ratio. Years with a satellite gap in those dates are left out.</li>
        <li><b>When the fire season comes:</b> the average year for the area, smoothed over a month. The season runs from the day 10% of a normal year's fire has burned to the day 90% has, counted from the quietest point of the year.</li>
        <li><b>Each month against its normal:</b> the z score of log(1 + value) against the same month of the baseline years. Below -1 is low, up to 1 normal, up to 2 unusual, 2 and above critical.</li>
      </ul>
      <h3>What to keep in mind</h3>
      <ul>
        {last && <li>Data runs to {last}. There is no near-real-time feed in this version (D34).</li>}
        <li>Cloud and smoke hide fires from every satellite. A cloudy day can look like a quiet one; months cloudier than 90% of years carry a flag.</li>
        <li>January to June 2002 has Terra only and is not compared with later years.</li>
        <li>Areas are summed on a 1° grid, so the edges of any area are accurate to about 100 km.</li>
        <li>Before 2012 values carry the calibrated 95% range of their factor, wider where fire is sparse.</li>
        <li>Day-level and week-level values and dated critical periods before 20 January 2012 are indicative; months are tested (D30).</li>
        <li>About one in four unusual months in the MODIS years would not be unusual to VIIRS; those months are marked.</li>
        <li>Iberia is the one test region whose 2012 step differs from MODIS alone by more than 10% (about +12%).</li>
        <li>NOAA-21 (VIIRS since 2023) is not used: it was not tested against the others in time (D35).</li>
        <li>From February 2023 Aqua flies past its 13:45 science limit, so it no longer fills Suomi NPP gaps (D29).</li>
      </ul>
      <h3>Data</h3>
      <ul className="refs">
        <li>MODIS Collection 6.1 Active Fire Detections (MCD14ML, MCD14DL), NASA FIRMS. <a href="https://doi.org/10.5067/FIRMS/MODIS/MCD14ML">doi:10.5067/FIRMS/MODIS/MCD14ML</a></li>
        <li>VIIRS 375 m Active Fire, Suomi NPP (VNP14IMGT), NASA FIRMS. <a href="https://doi.org/10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002">doi:10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002</a></li>
        <li>VIIRS 375 m Active Fire, NOAA-20 (VJ114IMGT), NASA FIRMS. <a href="https://doi.org/10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002">doi:10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002</a></li>
        <li>GFED4 monthly burned area (check only). Giglio, Randerson and van der Werf (2013), Journal of Geophysical Research: Biogeosciences 118.</li>
        <li>MERRA-2 monthly total cloud fraction, M2TMNXRAD (cloud flag only), NASA GMAO via GES DISC.</li>
        <li>Giglio, Schroeder and Justice (2016), The collection 6 MODIS active fire detection algorithm and fire products. Remote Sensing of Environment 178.</li>
        <li>Schroeder, Oliva, Giglio and Csiszar (2014), The new VIIRS 375 m active fire detection data product. Remote Sensing of Environment 143.</li>
        <li>Country borders: Natural Earth, via world-atlas.</li>
      </ul>
      <p>We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS),
        part of NASA's Earth Science Data and Information System (ESDIS).</p>
      {meta && <p className="small">This release covers {meta.start} to {meta.end}, generated {meta.generated_utc.slice(0, 10)}.
        Code, every test and every decision: <a href="https://github.com/squadronzero/squadron-zero">github.com/squadronzero/squadron-zero</a>.
        To run offline, serve the site folder with any static server (for example <code>python -m http.server</code>) and open it in a browser.</p>}
      <p className="small">{T.notOfficial}.</p>
    </main>
  );
}
