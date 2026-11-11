# Weather context (decision D39)

NASA POWER daily weather for the 13 preset areas, shown on Explore as "Weather at the time" beside
"Now against the past". It compares the same dates in every year (median, difference, rank).

- **Context, not cause.** Weather is never used in the harmonised record, the month classes or any score.
- **Rules first.** `power_rules.json` was committed before the first fetch (af6119f). The water-point rule
  was added in 7a23d4c after the first run stopped on Iberia, before any weather value was looked at.
  Every output file records the SHA-256 of the rules that made it.
- **Separate layer.** Like `recent/`, nothing here reads or imports `pipeline/`, `config/` or the released site data.
  `python docs/preflight/verify_baseline.py` stays UNCHANGED.

| File | What it does |
| --- | --- |
| `power_rules.json` | Variables, UTC days, 3 x 3 point grid per preset, missing days, water points, normal, rank, provisional label |
| `fetch_power.py` | Fetches NASA POWER (no key) and writes `web/public/context/power/` (standard library only) |
| `test_fetch_power.py` | Tests without network: presets match the website, UTC, grid, missing days, water points, file hashes |

Refresh (any machine with internet, about 10 minutes):

```
python context/fetch_power.py --out web/public/context --cache /tmp/power_cache
```

Variables: PRECTOTCORR (rain), RH2M (humidity), T2M_MAX (daily maximum temperature), WS2M (wind at 2 m),
GWETROOT (root-zone soil wetness). Source: NASA POWER Daily API, community AG, from GMAO MERRA-2 and GEOS-IT.
The newest weeks are near-real-time values that NASA may revise.

The data was obtained from the National Aeronautics and Space Administration (NASA) Langley Research Center's
Prediction Of Worldwide Energy Resources (POWER) project funded through the NASA Earth Science Division.
