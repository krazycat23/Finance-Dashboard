# Real-world ingestion findings

## Supplied workbooks assessed

| Workbook | Structure | Likely use | Ingestion treatment |
|---|---|---|---|
| `AUG TB.xlsx` | `Sheet2`, 7,160 rows; `Entity`, GL description, Cost Centre and three monthly columns | Actual trial balance | Detect header at row 2; unpivot `2026-07`–`2026-09`; retain GL and cost-centre codes as strings. |
| `FY26 Final TB.xlsx` | `PY TB`, 9,838 rows; three dimensions plus 12 monthly columns | Actual trial balance | Unpivot financial months. Empty Cognos cache sheet must be ignored. |
| `FY27 Budget TB.xlsx` | `Sheet2`, 4,267 rows; three dimensions plus 12 monthly columns | Original budget | Unpivot financial months into a named budget scenario. |
| `Weekly sales since 07.xlsx` | One 52-week wide table by fiscal year; one merge, explanatory notes in final column | Weekly sales history | Header starts at row 2; unpivot Week columns; note that an uploaded calendar is needed to resolve week dates. |
| `Weekly Sales FY26.xlsx` | Multiple pivot-style reports, filters/title rows, merged headers, formulas/cached values, repeated headers, grand totals and an FX table | Sales analysis / reference | Table selection must be explicit when confidence is low. Totals and `Grand Total` rows must be excluded from transactional staging, never silently treated as detail. |

## Generic improvements required

- Header and range detection must inspect several rows and score plausible headers.
- XLSX staging must preserve raw cells, formula presence and source row numbers.
- Wide date/period columns need a generic unpivot configuration.
- Financial period strings such as `202701` and `FY27 P01` must remain period tokens until calendar confirmation.
- Identifier columns must remain strings so `001240` and `1240` cannot collapse.
- Pivot reports require a user-confirmed table range; only rectangular detail tables should auto-stage.

## Manual configuration still expected

- GL-to-reporting-line rules and sign convention.
- Calendar confirmation for fiscal period/week tokens.
- Selection of a detail table from a multi-table pivot worksheet.
- Scenario/version naming for budget and forecast files.

## GL mapping and sign findings

`FF_GL_PL_Mapping(1).xlsx` is the authoritative P&L mapping source: 347 GL
codes with a three-level P&L hierarchy and an explicit income/cost convention.
It matches 341 of the 381 FY26 trial-balance account codes; the remaining 40
are retained as unmapped exceptions rather than assigned by description.

Source TB signs are natural accounting signs: Gross Sales (`1000`) is positive,
whereas markdowns (`2060`) and operating costs (`5905`) are negative. The
ingestion rule now has an explicit `sourceMultiplier`, so cost-account rules
store positive canonical magnitudes while retaining source values and lineage
for reconciliation. This is a configuration transformation, not a dashboard
calculation change.

## Calendar interpretation

`FY27_Fin_Calendar(1).xlsx` is an authoritative 52-week Jul–Jun FY27 calendar:
week 1 starts 29 June 2026 and week 52 ends 27 June 2027. It maps weeks
`202701`–`202752` to fiscal months and quarters. FY26 trial-balance data is
monthly Jul–Jun; an FY26 weekly equivalent is not included in the supplied
calendar and must not be invented.

## Deliberately unsupported in this pass

- Deriving missing FX rates or silently converting NZD/AUD.
- Treating pivot totals/subtotals as transactions.
- Guessing an ambiguous header/table range with high confidence.
