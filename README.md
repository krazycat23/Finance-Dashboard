# Portable Executive Reporting Engine

> The company changes. The reporting engine does not.

A premium executive financial and commercial reporting application, built so it
can be pointed at a new company by changing configuration and data — never
components.

**Status: phase one.** Application foundation, design system, domain model,
metric layer, mock datasets, a production-quality Executive Overview, and
populated first-pass versions of the remaining pages.

---

## Setup

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and produce a production build |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Types only |
| `npm run verify` | **Consistency acceptance test** — see below |

### `npm run verify`

The most important command in the repository. It asserts, at the *selector*
level (i.e. on the numbers the pages actually render), that:

- the statements tie to each other — gross profit is revenue less cost of
  sales, EBITDA is gross profit less operating costs, and so on
- the balance sheet balances
- the cash flow bridge reconciles, and closing cash equals the balance sheet
  cash for the same period
- a metric shown on two pages is the same number on both — the sales ledger
  ties to P&L revenue, the DSO on the Balance Sheet equals the DSO on Cash Flow
- bridges and decompositions sum exactly to the movement they claim to explain
- **no chart plots an actual for a period that has not closed**

It runs the full set against several entity and period-basis combinations.
When this engine is pointed at a new company, **this is the acceptance test**.

---

## Why this exists in this shape

Most finance dashboards fail for one of two reasons, and both are design
choices rather than bugs:

1. **Per-page data.** Each screen computes its own numbers, and by the third
   screen they quietly contradict each other. A CFO finds that in ten seconds
   and stops trusting everything else on the page.
2. **Company-shaped code.** The chart of accounts, the fiscal calendar and the
   product hierarchy leak into components, so the next deployment is a rewrite.

Everything below is arranged against those two failures.

---

## Architecture

Dependencies point strictly downward. A component never imports mock data.

```
config/          application defaults, navigation, KPI boards
   |
domain/data/     ReportingDataset contract + active data service
domain/models/   canonical types: dimensions, facts, periods
domain/metrics/  MetricDefinition registry (format, favourable direction)
   |
data/mock/       MockDataAdapter -> ReportingDataset (active demo adapter)
   |
domain/selectors/  pure functions: facts + filters -> view models
   |
components/      typed, reusable primitives (no business logic)
   |
pages/           composition only
```

### Three rules, enforced throughout

1. **No business logic in visual components.** A component may know how to
   render a variance; it must never know that "Wholesale" exists.
2. **No formatting outside `utils/format.ts`.** Components receive a
   `MetricDefinition` and a raw number, and ask the formatter.
3. **One source of truth for every number.** All pages read the same dataset
   through the same selectors, so DSO on the Balance Sheet and DSO on Cash Flow
   are the same figure *by construction*, not by coincidence.

### Directory layout

```
src/
  app/
    App.tsx                  routing
    providers/               theme + global filters
  components/
    layout/                  AppShell, Sidebar, PageHeader, GlobalFilters
    ui/                      Panel, SegmentedControl, Select, Badge, Meter
    finance/                 KpiCard, VarianceValue, Sparkline, RankedBarList,
                             InsightList, RatioList
    charts/                  TrendChart, WaterfallChart, CompositionChart,
                             ColumnChart, HeatGrid, ChartFrame, chartTheme
    tables/                  DataTable, StatementTable
  config/
    company.ts               mock-generator defaults only
    navigation.ts
    kpiBoards.ts
  domain/
    data/                    ReportingDataset, adapter contract, active service
    models/                  Period, Entity, Account, FinanceRecord, SalesRecord...
    metrics/                 registry, variance semantics
    selectors/               core, kpi, statements, cashflow, sales, drivers,
                             forecast, operational, insights, dataQuality
    calendar.ts              fiscal calendar (the ONLY place fiscal maths lives)
  data/mock/                 MockDataAdapter + seeded demo data
  utils/format.ts            the only place a number becomes a string
  styles/tokens.css          semantic design tokens, light + dark
scripts/verify.ts            the consistency acceptance test
```

---

## The domain model

**Dimensions**: `Period, Entity, Account, Department, CostCentre, Location,
Channel, Product, Customer`.

**Facts**: `FinanceRecord` (actual / budget / forecast / priorYear by period ×
entity × account) and `SalesRecord` (revenue / units / orders / cost by period ×
entity × channel × product × location), plus a generic `OperationalRecord`.

Every dimension carries an `externalId` and a `mappingStatus`. That pair is the
onboarding seam: the client's raw ERP code is retained alongside the canonical
id, and the Data & Mapping page reports anything unmapped. The reporting layer
reads canonical ids only, so **an unmapped account is visible as an exception
rather than silently distorting a total**.

Accounts carry a `statement` and a canonical `line`. The statement tables are
*generated by grouping on that line*, so a company with 4,000 GL accounts and
one with 40 render identically.

### The metric layer

```ts
interface MetricDefinition {
  id: string;
  name: string;
  format: "currency" | "percentage" | "number" | "bps" | "days" | "times";
  favourableDirection: "up" | "down" | "neutral";
  aggregation: "sum" | "average" | "weightedAverage" | "last" | "derived";
  precision?: number;
  deltaFormat?: MetricFormat;   // margins move in bps, revenue in %
}
```

`favourableDirection` is the most important field in the product. Higher
operating costs are adverse; lower markdown is favourable; DPO is neither. The
UI asks the registry and **never assumes up = green**.

Adding a metric for a new client is a registry entry, not a component change.

---

## How mock data works

`src/data/mock/` builds one coherent dataset at module load from a seeded PRNG
(deterministic — the demo must not reshuffle between screenshots).

The ordering is deliberate and mirrors a real close:

1. **Sales are generated first, bottom-up** — 48 months × entity × channel ×
   product × location, plus a weekly series produced by splitting each month
   with weights that sum to exactly 1 (so the weekly series re-aggregates to
   the monthly one without drift).
2. **The P&L derives revenue and cost of sales *from those sales records*.**
   This is what guarantees the Sales page and the P&L page can never disagree
   about the top line.
3. Operating costs, D&A, interest and tax are modelled on top.
4. Working-capital balances come from trailing flows and day targets.
5. Cash flow is built from EBITDA less working-capital movement, tax, interest,
   capex and financing.
6. **Closing cash is opening cash plus that movement** — cash is never invented
   independently of the cash flow statement.
7. Fixed assets and debt roll forward; retained earnings accumulate net profit
   less dividends.
8. One liability line absorbs the residual so the sheet balances exactly;
   `validate.ts` asserts that residual stays economically small (currently ~5%
   of total assets, which is where deferred tax and provisions genuinely sit).

Budget and forecast are produced by **running the same engine with different
parameters**, so the budget's own gross-margin arithmetic holds exactly as the
actual's does.

`src/data/mock/validate.ts` runs on load in development and warns in the
console if any identity breaks.

### Demonstration shape

- Group of four entities (Retail AU, Retail NZ, Wholesale, Digital)
- 4 channels, 6 product categories, 6 regions
- 33 months of actuals, 15 months of forward periods
- Reported as at **March 2026 — FY26 period 9** on a July fiscal year start:
  nine months of actuals with three still to go, which is the position an FP&A
  pack is most often produced in

---

## Design system

Tokens live in `src/styles/tokens.css` as semantic pairs — light and dark are
two valuations of one vocabulary, not two hard-coded palettes. Theme switching
stamps `data-theme` on `<html>`, so the DOM and the SVG charts change in the
same paint (`chartTheme.ts` reads resolved token values back off the document
rather than duplicating the palette in TypeScript).

### The colour rulebook

Colour does three different jobs here, and conflating them is why most finance
dashboards end up shouting:

| Palette | Job | Rule |
|---|---|---|
| `--positive` / `--negative` | **Semantic only** — variance and favourability | Never used as a chart series colour |
| `--series-*` | Scenario encoding (actual / last year / plan) | Low-chroma navy and slate; identity also carried by *form* — solid bar, muted bar, dashed line |
| `--cat-*` | Genuine categorical members (channels, entities) | Fixed order, never cycled |
| `--seq-*` | Ranked magnitude (cost composition) | One hue, light to dark |

The categorical and sequential palettes were validated with the `dataviz`
skill's checker (lightness band, chroma floor, colour-vision separation,
normal-vision floor, contrast against the surface) in **both** light and dark —
dark mode is a separately chosen set, not an automatic flip.

**Direction and sentiment are always encoded separately**: a glyph (▲▼–) says
which way the number moved, colour says whether that is good news. That is what
lets "Markdown ▼ 12.6%" read as favourable while "Opex ▲ 3.9%" reads as
adverse, and it means the variance is still legible without colour perception.

Radius maxes out at 6px. Borders carry structure; shadows are reserved for true
overlays. Light mode sits on an off-white canvas, dark mode on layered navy.

### Charting discipline

Enforced in the chart components, not left to the caller:

- **Actuals stop at the reporting cut-off.** Open periods carry no actual bar;
  a forecast continues as a distinct series inside a shaded, labelled region.
  `npm run verify` asserts this.
- **One axis, ever.** No dual-scale charts.
- **Percentage axes start at zero.** Truncating one multiplies the apparent
  movement.
- **Waterfall geometry is exact.** Bars land where the arithmetic says; the
  value axis is truncated to the bridge range (disclosed in a footnote) so the
  drivers are legible, and dashed connectors join the steps.
- **A legend is always present for two or more series**, and every chart ships
  a hover tooltip.
- **The heat grid prints its value in every cell and carries an explicit
  scale** — colour is a second reading, never the only one.

### Finance presentation conventions

- Negatives in parentheses: `(1,245)`
- Tabular lining figures on every number
- Variance columns read **favourable positive, adverse negative** on every
  line, costs included — so an overspend never prints as a positive number in
  red
- Statement bodies carry no currency symbol; the panel caption states `$'000`
  once
- Subtotals and totals get weight and a rule, not a colour wash

---

## Configuring a new company

A new company is an adapter plus data, not a replacement of application source
files. An adapter returns one `ReportingDataset`: its company profile (name,
currency, locale, scale and calendar metadata), dimensions, facts, scenario
catalogue/roles, forecast presentation inputs, and Data & Mapping results.
`ReportingDataProvider` activates that dataset; formatting, branding, filters
and selectors all resolve from the active profile. Changing dataset identity
remounts reporting state and advances the selector-cache revision, preventing
entity, period or computed values leaking between companies.

1. Implement a `ReportingDataAdapter` that returns a `ReportingDataset`.
   `MockDataAdapter` is the reference implementation.
2. Populate the scenario catalogue and explicit role ids (`actual`, `budget`,
   `forecast`); additional budget revisions and forecast vintages can coexist.
3. Populate typed mapping summaries, unmapped members, issues,
   reconciliations and import history for Data & Mapping.
4. **`src/config/navigation.ts`** — reorder or hide sections.
5. **`src/config/kpiBoards.ts`** — which operational metrics the client tracks
   and how they group. A configured metric with no data is reported as
   *awaiting data*, never rendered as a zero.
6. **`src/domain/metrics/registry.ts`** — add or adjust metric definitions
   (unit, precision, favourable direction).
7. **Dimensions** — supply the client's
   entities, accounts, channels, products, locations. The chart of accounts maps
   to canonical statement lines via `Account.line`; this is the main onboarding
   task and the Data & Mapping page tracks its completeness.
8. **Run `npm run verify`.** If the client's data does not satisfy the
   identities, it is reported before anyone sees a dashboard.

Fiscal calendar maths lives only in `src/domain/calendar.ts`. Nothing else may
infer a fiscal year from a date, so a July-start and a January-start company
produce identical downstream behaviour.

Phase 2 attaches raw files → staging → mapping → validation →
`ReportingDataset` at the adapter boundary.

## Local file onboarding (Phase 2)

Data & Mapping includes a local company-onboarding panel. CSV and XLSX files
are parsed in the browser (each workbook sheet becomes a staged dataset), then
profiled, classified and mapped before activation. The ingestion domain keeps
raw staged rows immutable and exposes deterministic column suggestions,
account-rule precedence, calendar relationships, validation issues and real
raw-to-canonical reconciliations. `ImportedCompanyAdapter` turns a validated
workspace into the same `ReportingDataset` used by every existing page.

`ImportWorkspaceStore` abstracts browser persistence; the IndexedDB
implementation keeps company profiles, sources, staging metadata and mappings
local so uploaded finance data is never sent to an external service. Phase 2
does not include cloud connectors, APIs or authentication.

---

## Pages

| Page | State |
|---|---|
| Executive Overview | Production quality |
| Sales | Populated |
| Profit & Loss | Populated |
| Balance Sheet | Populated |
| Cash Flow | Populated |
| Forecasts | Populated |
| KPIs | Populated, configuration-driven |
| Variance Analysis | Populated |
| Data & Mapping | Populated |
| Reports | Shell |
| Settings | Shell |

---

## Deliberately not built yet

Automated management commentary, anomaly detection, real forecasting models, a
scenario engine, Excel/PDF/PowerPoint export, source-system integrations, and
AI-assisted mapping.

Seams are left where these attach — `domain/selectors/insights.ts` produces a
structured finding before rendering it to prose, and the Data & Mapping page's
suggestion tables are the attachment point for AI-assisted mapping — but
nothing is stubbed speculatively.

## Known gaps in this phase

- Reports and Settings are shells.
- Receivables ageing uses a fixed profile applied to the reported receivables
  balance; it needs an AR sub-ledger feed to be real.
- Risks and opportunities on the Forecasts page are illustrative.
- The bundle is not yet code-split (single ~760 kB chunk).
