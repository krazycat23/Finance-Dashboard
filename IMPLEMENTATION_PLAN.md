# Implementation Plan — Portable Executive Reporting Engine

## 0. Guiding principle

> The company changes. The reporting engine does not.

Every company-specific fact (name, currency, fiscal calendar, chart of accounts,
entities, channels, products, KPI set) lives in **configuration or data**, never
in a component. A visual component may know *how* to render a variance; it must
never know that "Wholesale" exists.

This yields three hard rules enforced throughout:

1. **No business logic in visual components.** Pages compose primitives; the
   numbers arrive pre-computed from the selector layer.
2. **No formatting logic outside `utils/format.ts`.** Components receive a
   `MetricDefinition` and a raw number, and ask the formatter.
3. **One source of truth for every number.** All pages read the same generated
   dataset through the same selectors, so DSO on Balance Sheet and DSO on Cash
   Flow are the same figure by construction, not by coincidence.

Rule 3 is a direct response to the most common failure mode in finance
dashboards: per-page mock data that quietly contradicts itself. A CFO finds that
in ten seconds and stops trusting the whole product.

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + React 19 + TypeScript (strict) | Cleanest structure for a pure SPA; no server or SSR requirement exists, so Next.js would add routing/rendering ceremony for nothing. |
| Routing | React Router v7 (declarative) | Real URLs per page, nested layout route for the shell. |
| Styling | Tailwind CSS v4, CSS-first `@theme` tokens | Semantic tokens defined once in CSS, consumed by both Tailwind classes and the chart layer. Theme switching = swapping custom-property values on `<html>`, so charts and DOM change together. |
| Charts | Recharts | Composable, SVG, easy to wrap and to feed theme tokens. Wrapped so it can be swapped. |
| Icons | lucide-react | Restrained line icons at small sizes only. |
| State | React Context ×2 (theme, filters) | Nothing here justifies a state library. |

No auth, no database, no API, no cloud.

## 2. Layered architecture

```
config/          company + navigation + display settings   (swap per client)
   │
domain/models/   canonical types: dimensions, facts, periods
domain/metrics/  MetricDefinition registry (format, favourable direction)
   │
data/mock/       deterministic seeded generator -> canonical facts
   │
domain/selectors/  pure functions: facts + filters -> view models
   │
components/      dumb, typed, reusable primitives
   │
pages/           composition only
```

Dependencies point strictly downward. A component never imports mock data.

### 2.1 Canonical data model (`domain/models`)
Dimensions: `Period, Entity, Account, Department, CostCentre, Location, Channel,
Product, Customer`. Facts: `FinanceRecord` (actual/budget/forecast/priorYear by
period × entity × account) and `SalesRecord` (revenue/units/orders/cost by
period × entity × channel × product × location).

Accounts carry `statement` (`pnl|balance|cashflow`), `lineId`, `sign` and
`sortOrder` — this is the mapping seam a new company plugs into. The P&L
statement structure is *derived from the account dimension*, not hardcoded.

### 2.2 Metric layer (`domain/metrics`)
`MetricDefinition { id, name, format, favourableDirection, aggregation, ... }`.
`favourableDirection` is mandatory in practice: higher operating costs are
adverse, lower markdown is favourable. The UI asks the registry whether a
delta is good; it never assumes up = green.

### 2.3 Mock data (`data/mock`)
A seeded PRNG (mulberry32) generates **26 months** of finance history and
**52 weeks + prior year** of sales, then *derives* everything else:
Gross Profit = Revenue − COGS; EBITDA = GP − Opex; EBIT = EBITDA − D&A;
Net Profit = EBIT − Interest − Tax; balance sheet balances; cash flow bridge
ties to the movement in cash. Working-capital days are computed from the same
balances that the Balance Sheet page prints.

## 3. Design system

Tokens (`styles/tokens.css`) as semantic pairs, light and dark defined together:
`--surface-canvas / -panel / -raised`, `--border-subtle / -strong`,
`--text-primary / -secondary / -tertiary`, `--accent`, `--positive`,
`--negative`, `--series-1..5`.

**Colour rulebook (enforced):**
- Green/red are *semantic only* — variance and favourability. Never a series.
- Series colours are navy → slate → muted blue → light slate.
- Direction (▲▼) and sentiment (colour) are separate encodings, both always
  present, so the variance reads without colour perception.

Radius max 6px. Borders over shadows. Panels read as report sections, not
floating cards. Light canvas is off-white `#F7F9FB`; dark is layered navy, not
black.

Typography: editorial serif for page titles only; a clean sans for everything
else. Tabular lining figures on every number.

## 4. Component inventory (build before pages)

- **layout**: `AppShell`, `Sidebar`, `TopBar`, `GlobalFilters`, `PageHeader`, `ThemeToggle`
- **ui**: `Panel`, `PanelHeader`, `Tabs`, `SegmentedControl`, `Select`, `Badge`, `ProgressMeter`, `EmptyState`
- **finance**: `KpiCard`, `KpiStrip`, `MetricValue`, `VarianceCell`, `Sparkline`, `InsightList`, `RankedBarList`
- **charts**: `ChartFrame`, `useChartTheme`, `TrendChart`, `WaterfallChart`, `CompositionChart`, `ColumnChart`, `HeatGrid`
- **tables**: `DataTable` (generic, typed), `FinancialStatementTable` (subtotal/total hierarchy)

## 5. Build order

1. Scaffold + tokens + theme provider → verify build.
2. Shell, nav, routing, global filters → verify.
3. Domain models, metric registry, formatters, mock generator + consistency assertions → verify.
4. Component library → verify.
5. Executive Overview to production quality.
6. Remaining nine pages from the same primitives.
7. Typecheck, build, run, visual consistency pass.

## 6. Explicit non-goals for phase one

Commentary generation, anomaly detection, real forecasting models, scenario
engine, exports, integrations, AI mapping. Seams are left where these attach
(notably `domain/selectors` and the Data & Mapping page), but nothing is stubbed
speculatively.

## 7. Phase 1.5 — reporting data boundary (before ingestion)

### Target dependency direction

```
DataSource / adapter → ReportingDataset → ReportingDataProvider
                                  ↓              ↓
                         domain data service   filters / pages
                                  ↓
                              selectors
```

`ReportingDataset` is the single canonical contract consumed by the reporting engine. It owns periods, every reporting dimension, financial, sales, operational and weekly facts, scenario metadata, optional cash-flow facts and the future Data & Mapping result shapes. `MockDataAdapter` builds this contract from the existing seeded generator. It is an adapter selected at application composition time, never the reporting engine's store.

Selectors use the `ReportingDataService` boundary, initialised once by `ReportingDataProvider`; they must never import a concrete adapter. This keeps existing page selector call sites stable while allowing a Phase 2 adapter to replace the active dataset. The verification harness initialises the same service with `MockDataAdapter`, exercising precisely the production boundary.

### Scenario/version foundation

Finance facts move from scenario columns to a row-oriented scenario value contract. A `ScenarioDefinition` has a stable id, kind (`actual`, `budget`, `forecast`, `latestEstimate`, `user`), label, optional version and as-of date. Canonical records retain compatibility value fields while carrying the scenario/value form required for Original Budget, Revised Budget, forecast vintages and user scenarios. Selector defaults resolve named roles through the dataset's scenario catalogue rather than assuming fixed columns.

### Import, currency and mapping foundation

Facts gain optional lineage: source/reporting currency, import id, source row or reference, imported-at timestamp and mapping/configuration version. The dataset also exposes optional mapping statuses, data-quality issues, reconciliation results and import history. The current Data & Mapping page continues to render its demo presentation, but those demo values originate in the mock adapter contract rather than generic selectors.

### Calendar scope

The engine currently operates on monthly primary reporting periods. The configuration is therefore narrowed to `monthly`; weekly periods remain an optional supplementary fact grain for the Sales trend only. `4-4-5` and a weekly primary calendar are not advertised until an adapter supplies explicit period relationship links. Period records now carry calendar relationships (previous / prior-year / fiscal-year / quarter ids) so comparative windows do not use positional `index - 12` assumptions. A future imported custom calendar will populate these relationships directly.

### Incremental verification

1. Introduce domain contracts, adapter interface and provider/service; wrap the existing mock generator in `MockDataAdapter`.
2. Switch filters, selector modules and Data & Mapping support selectors to the active dataset boundary; remove all `@/data/mock` selector imports.
3. Replace mock-only scenario-engine dependencies with canonical cash-flow and scenario facts; move retail narrative assumptions into mock demo metadata.
4. Make verification discover representative entities and the reporting cut-off from the active dataset, then run typecheck, build and verify after each major step.
