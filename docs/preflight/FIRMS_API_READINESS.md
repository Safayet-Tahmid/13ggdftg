# NASA FIRMS API readiness

Checked 10 to 11 November 2026 from official NASA pages. Nothing in this document was obtained with a real key. No authenticated request has been made.

## 1. Sources (retrieved 10 Nov 2026 UTC)

- FIRMS Area API: https://firms.modaps.eosdis.nasa.gov/api/area/
- FIRMS MAP_KEY: https://firms.modaps.eosdis.nasa.gov/api/map_key/
- FIRMS data availability: https://firms.modaps.eosdis.nasa.gov/api/data_availability/
- FIRMS FAQ: https://www.earthdata.nasa.gov/data/tools/firms/faq
- VIIRS 375 m attributes: https://earthdata.nasa.gov/data/instruments/viirs/viirs-i-band-375-m-active-fire-data
- Suomi NPP transition notice: https://www.earthdata.nasa.gov/news/blog/transitioning-from-suomi-npp-viirs-omps-what-firms-users-need-know

## 2. Access (verified from documentation)

| Question | Answer | Status |
| --- | --- | --- |
| Is the Area API available? | Yes, `/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA]/[DAY_RANGE]` and `/[DATE]` | Documented |
| Key needed? | Yes, a free MAP_KEY | Documented |
| How issued | Sign-up form on the map_key page, key sent by email. Manage it by logging in at /download | Documented |
| Limit | 5000 transactions per 10-minute interval. Increases on request | Documented |
| Transaction counting | One request is one transaction, but large requests can count as several (example given: 7 days). Effect of area size not stated | Partly documented |
| Area | Box `west,south,east,north` or `world` | Documented |
| Days per request | 1 to 5. Without DATE: today back to today minus (DAY_RANGE - 1) | Documented |
| Format | CSV (other endpoints also offer JSON, KML, shapefile on other routes) | Documented for CSV |
| Usable from GitHub Actions | Nothing in the pages forbids it. It is an ordinary HTTPS GET | Interpretation |
| Check remaining transactions | "Check status" on the map_key page. Exact status URL not shown in the retrieved text | NOT VERIFIED |
| Sharing one key in a team | Not stated | NOT VERIFIED |

Budget: a scheduled job that fetches the whole world, 1 day, for 2 products every 3 hours is 16 requests a day. Even if each counts as 50 transactions it uses well under 1% of one 10-minute window per run. The limit is not a constraint for this design. The real transaction count per world request is measured in the first authenticated test.

## 3. Products

| Product id (SOURCE) | Satellite | Pixel | Confidence | FRP | Latency | Status on 11 Nov 2026 | Use in SHIFT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `VIIRS_NOAA20_NRT` | NOAA-20 (`satellite` = N20) | 375 m | low, nominal, high | MW | within about 3 h, best effort | Operating | **First choice.** SHIFT measured NOAA-20 against S-NPP: 1.00 to 1.05 (cells) and 0.96 to 1.02 (fire power), every year and every 2026 month |
| `VIIRS_NOAA21_NRT` | NOAA-21 (N21) | 375 m | low, nominal, high | MW | about 3 h | Operating | Second. Shown with the label "not tested against S-NPP by SHIFT" (D35) |
| `VIIRS_SNPP_NRT` | Suomi NPP (N) | 375 m | low, nominal, high | MW | none | **Stopped.** New FIRMS production ceased at 13:00 UTC on 2 Nov 2026. Historical data stays available | Do not use for recent data |
| `MODIS_NRT` | Terra (T), Aqua (A) | about 1 km | 0 to 100 | MW | about 3 h | Operating, both satellites drifting | Do not use. SHIFT measured Terra at about 40% of Aqua in 2026 and Aqua x k FAILED on fire power (orbit drift) |
| `*_SP` products | as above | | | | 2 to 3 month lag | Standard archive | Not recent. Not needed |
| `LANDSAT_NRT` | Landsat | 30 m | | | | US and Canada only | Not suitable (not global) |

VIIRS fields (FIRMS NRT): `latitude`, `longitude` (pixel centre), `bright_ti4`, `bright_ti5` (K), `scan`, `track`, `acq_date`, `acq_time` (UTC), `satellite`, `confidence` (l, n, h), `version` (the attribute page gives `1.0NRT` for NRT), `frp` (MW), `daynight` (D or N). There is no `type` field in NRT files, so persistent industrial heat cannot be removed by type. The exact text form of `acq_date` and `acq_time` (expected `YYYY-MM-DD` and `HHMM`) is NOT VERIFIED until the first real response.

VIIRS confidence is a class, not a percentage. MODIS confidence is 0 to 100. The two are never mapped onto each other. Low-confidence night pixels in the South Atlantic Magnetic Anomaly are already removed by FIRMS.

## 4. Sample request (placeholder key only)

    https://firms.modaps.eosdis.nasa.gov/api/area/csv/YOUR_MAP_KEY/VIIRS_NOAA20_NRT/88,20.5,92.75,26.75/1

A small Bangladesh box, 1 day. In code the key is read from the environment variable `NASA_FIRMS_MAP_KEY` and the URL is never printed in full.

## 5. Authentication test

NOT PERFORMED. No key exists in this environment and none was asked for in chat. The test is defined so that a teammate or the next phase can run it without exposing the key:

1. One request: the box above, `VIIRS_NOAA20_NRT`, DAY_RANGE 1.
2. Pass when: HTTP 200, the first line is a CSV header containing `latitude,longitude,` and `frp`, every latitude is between 20.5 and 26.75 and every longitude between 88 and 92.75, every `confidence` is a VIIRS class (`l`, `n`, `h`, or the words low, nominal, high: the exact form is recorded at this first response), and every `satellite` is `N20`.
3. Fail signs: a body that is not CSV (FIRMS answers a bad key with a short text message), HTTP 4xx or 5xx.
4. Log only: status code, row count, header names, elapsed seconds, and the URL with the key replaced by `***`.

Zero rows is a valid answer (no fire that day), not a failure.

## 6. Acquisition strategy

| Option | Security | Fit | Verdict |
| --- | --- | --- | --- |
| A. Browser calls FIRMS | The key would ship in public JavaScript. Every visitor uses the team's quota. Breaks the offline demo | Poor | Rejected |
| B. GitHub Actions on a schedule writes a static, timestamped file into the site | Key stays a repository secret, used only on `main` | Matches D5 (static site) and the offline-first rule: the demo shows the last snapshot with its time | **Recommended** |
| C. Serverless proxy | Hides the key but adds a service, an account and a failure point | Gives nothing B lacks for a 3-hour refresh | Not needed |

Recommended design (for the next phase, not built here):

- Add a `schedule` (every 3 hours) to the existing `.github/workflows/pages.yml`. Before the build, a step runs `python recent/fetch_firms.py` with `NASA_FIRMS_MAP_KEY` from secrets.
- The step writes `web/public/data/recent/recent.json` (detections) and `recent/status.json` (time fetched, products, row counts, ok or failed). These files are never put in the `site-data` release.
- The step has `continue-on-error: true`. If FIRMS fails, `status.json` says "unavailable since <time>" and the historical site still builds and deploys.
- One workflow, one place that holds the secret, no new service. `pages.yml` never runs on pull requests, so pull requests (and forks) can never read the key.
- GitHub schedules can run late and stop after 60 days without repository activity. The freshness label on the page shows the real fetch time, so a late run is visible, not hidden.

## 7. Security plan

| Rule | How |
| --- | --- |
| Storage | Repository secret `NASA_FIRMS_MAP_KEY` (Settings, Secrets and variables, Actions). No secret of this name existed in the repository code before |
| Who can read it | Only the `build` job of `pages.yml`, through `env:` on the single fetch step |
| Permissions | `pages.yml` already has `contents: read`, `pages: write`, `id-token: write`. Nothing more needed |
| Pull requests | `web-check.yml` (the PR check) must never reference the secret. GitHub does not pass secrets to workflows from forks |
| Never | in `web/public/`, in `VITE_*` variables, in a URL the browser sees, in a committed file, in logs, in screenshots, in chat |
| Logging | The script masks the key (`***`) and never prints environment values. GitHub also masks registered secrets in logs |
| Failed key | Non-CSV body or 4xx: the step fails, `status.json` says "unavailable", the historical site deploys anyway |
| Rotation | Request a new key on the FIRMS map_key page, paste it over the old secret value, rerun the Website workflow, retire the old key |
| Testing without exposure | The test prints status code, rows and header names only |
| Local files | `.env` is already ignored by `.gitignore` (line 18). Do not create one in `web/` |

## 8. Failure and fallback

- FIRMS down or key wrong: the previous snapshot is not kept across a rebuild, so the recent mode shows "Recent detections unavailable, last attempt <time>" and the historical modes are unchanged.
- No detections in an area: shown as "no detections in the fetched passes", with the fetch time, never as "no fire".
- Offline demo: the site shows the snapshot built in at the last deploy, with its UTC time.
