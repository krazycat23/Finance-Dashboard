# Phase 2 runtime integration — freeze assessment

## Persistence model

Strategy A: persist the last successfully activated `ReportingDataset` snapshot on
the existing workspace, alongside the editable onboarding decisions. Activation
uses `buildImportedDataset()` again; the preview is not accepted as an alternate
transformation path. Saving must succeed before publishing the company.

IndexedDB `finance-dashboard-imports` is upgraded from version 1 to version 2
without deleting workspaces. A separate `runtime` object store remembers the last
active company (including an explicit demo selection). Snapshots carry
`activationSchemaVersion: 1`. An incompatible snapshot is not silently loaded or
replaced with demo: startup displays an error and requires an explicit choice.

The canonical snapshot does not duplicate workbook bytes. Existing staged rows
and source previews remain in the workspace because review/restaging needs them.
Draft edits do not mutate the previously activated snapshot. Reporting continues
to use the last activation until the draft is reviewed and reactivated. Returning
to Data & Mapping loads the latest saved decisions rather than stale provider
workspace state.

`ReportingRuntime` is shared by the React provider and integration verification.
Startup waits for restoration. Company switching publishes a new data-service
revision and remounts dataset-dependent UI state, resetting filters to the active
dataset's defaults. No period/entity selection is carried across companies.

## Reporting boundary

Module availability is resolved centrally. Unsupported selectors return `null`
through `selectAvailable`, and route guards avoid mounting unsupported pages.
Imported Overview, P&L and Sales use the existing selectors and display reported
values without invented comparative metrics or demo narratives. Demo rendering
remains unchanged. Forecast reporting additionally requires an existing forecast
configuration; forecast facts alone do not justify creating forecast assumptions.

The weekly selector now resolves its reporting window using calendar dates and
the existence of reported facts for imported datasets. It no longer excludes all
imported weeks because their IDs differ from demo IDs or `isActual` is unset by
the calendar importer. No calendar/parsing/transformation code was changed.

## Activation evidence

The review presents source ranges, mapping decisions, hierarchy-role resolution,
scenarios, calendar output, sales facts, production coverage and reconciliation,
capabilities and blocking messages. The same runtime activation gate is used by
the button and controller, including valid reporting period/entity requirements.

Unavailable production evidence is labelled unavailable, not recomputed in React.
Configured authoritative/rule/manual definitions are distinguished from detected
GL provenance coverage. Authoritative GL provenance remains authoritative when
a hierarchy role supplies the separate canonical calculation role.

Finance reconciliation captures independent evidence at the point each stage
exists: selected raw rows, prepared/unpivoted rows, sign-normalised values,
mapped/unmapped values, and separately read canonical facts. Each record carries
source file, sheet/dataset, scenario and period scope. The default monetary
tolerance is $0.01. A reconciliation failure blocks activation; an unavailable
comparison is never labelled as a pass.

## Verification completed in this pass

* `npm run typecheck` passed.
* `npm run verify` passed with 133 consistency checks.
* `npm run verify:runtime` passed two browser workflows: activation/refresh/
  Demo → A → B → Demo → A switching, and live weekly-sales reporting from
  external uploaded calendar tokens.
* `npm run build` passed. Vite reports the existing large JavaScript chunk
  warning; this is a delivery-performance warning, not an ingestion result.

## Resolved correctness blockers

* CSV is now read in raw mode, so fiscal tokens and identifiers remain source
  strings. `202701`, `001` and `0040` retain their exact values. XLSX formatted
  strings behave consistently. Genuine Excel dates normalise to canonical month
  IDs, while six-digit fiscal tokens resolve only through the authoritative
  calendar mapping.
* Canonical arithmetic keeps Gross Sales, Markdowns and Returns on distinct
  lines. Net Sales is derived as gross sales less contra-revenue (plus any
  already-net generic revenue), then drives Gross Profit and EBITDA. Markdown
  and return statement variances are inverse/adverse when their magnitude rises.
* Reconciliation is independently evidential. Wide-source tests prove raw
  selected totals/magnitudes, unpivot preservation, explicit sign adjustment,
  mapped-plus-unmapped equality, and final facts independently read from the
  canonical record collection.

## Remaining non-core limitations

* A standalone sales-only import still needs a canonical reporting-month source;
  the runtime intentionally blocks activation instead of inventing one.
* The current onboarding surface retains a compact wide-table configuration
  summary rather than a richer configuration editor. Existing configurations
  remain supported and verified.
* `npm audit` reports existing high-severity SheetJS `xlsx` advisories with no
  registry-provided fix. Dependency replacement/remediation is outside
  ingestion-v1 correctness scope.
* Vite reports a large JavaScript chunk warning during the production build.

## Freeze decision

**ingestion-v1 FROZEN.** The three known core correctness blockers are resolved,
the importer rejects unresolved periods and reconciliation failures, and no known
core Phase 2 correctness blocker remains. The adversarial benchmark has not
been opened or tuned against.
