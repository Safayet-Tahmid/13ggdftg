# Independent validation checks

`audit_site_data.py` recomputes SHIFT's continuity and integrity checks from the **published** website data, so anyone can rerun them without the team's Google Drive. It was written for the scientific audit of 8 November 2026 (`docs/audit/`). It reads files and writes tables. It never changes the record.

```
gh release download site-data -p site_data.zip --repo squadronzero/squadron-zero   # or download in a browser
mkdir site && unzip -q site_data.zip -d site
pip install pandas numpy
python validation/audit_site_data.py site --out validation/results     # about 15 seconds
python -m pytest -q validation                                         # tests of the statistics
```

| Check | Output | Question it answers |
| --- | --- | --- |
| A1 | `A1_export_integrity.csv` | Do the website's daily files add up to the pipeline's yearly totals? |
| A2 | `A2_ratio_stationarity.csv` | Was the S-NPP/MODIS ratio stable over the fit years 2012-2019 (the core assumption)? |
| A3 | `A3_steps_and_placebos.csv` | The 2012 gate per region, and the same statistic at years with no sensor change (the noise floor) |
| A4 | `A4_trends_2003_2019.csv` | Do SHIFT's long-term trends match MODIS alone? How far off is the raw joined record? |
| A5 | `A5_gfed_reference.csv` | Fire per unit burned area (GFED4.0) before and after 2012 |
| A6 | `A6_low_days.csv` | Days far below their neighbours that are not marked "no data" |

The results committed here were produced on 8 November 2026 from the site data generated 2026-11-07T17:15:19Z. Interpretation is in `docs/audit/VALIDATION_REPORT.md`.
