# North House — design system

The reporting product's visual system. Two themes, one set of components.
Read this before redesigning a page; it exists to stop the pack drifting
section to section.

- **North House — Sand** (default) — `[data-theme="sand"]`, alias `light`
- **North House — Obsidian** — `[data-theme="obsidian"]`, alias `dark`

Obsidian is not an inversion of Sand. Each theme selects its own values for
the same semantic roles. There is exactly one component tree; the theme only
changes token values, so **never** write a light component and a dark one.

Source of truth: `src/styles/tokens.css`, `src/styles/typography.css`.
Components name a role (`surface-panel`, `text-secondary`, `series-2`) and
never a colour.

---

## Typography

Two faces, self-hosted variable woff2 (`public/fonts`, `src/styles/fonts.css`).

| | |
|---|---|
| Display / editorial | **Source Serif 4** — page titles, KPI figures, section numerals, the final statement result |
| UI / finance | **IBM Plex Sans** — navigation, controls, filters, labels, tables |

Eight roles, all defined in `typography.css`. Use the class, never a raw
size/weight pair:

`.type-display` `.type-heading` `.type-section` `.type-section-number`
`.type-kpi` (+ `-lead`, `-sm`) `.type-body` (+ `-lead`) `.type-table`
(+ `-head`) `.type-caption` `.type-control` `.type-label`

Every figure carries tabular lining numerals (`.tnum`, or the type role).

---

## Sand palette

| Role | Value |
|---|---|
| Canvas | `#f4efe4` warm ivory |
| Panel (statement stock) | `#fbf8f1` |
| Inset / sunken | `#e8e0cf` / `#ece5d6` |
| Navigation | `#eae1cd` |
| Borders subtle / default / strong | `#e2dac9` / `#d0c5ae` / `#b3a68b` |
| Text primary / secondary / tertiary | `#1b211d` / `#565c52` / `#857e6e` |
| Accent | `#17362a` deep forest |
| Warm accent | `#a9772f` brass |
| Positive / negative / caution | `#2f6b47` / `#9d3b30` / `#8c6a1c` |
| Series 1–5 | forest → sage → stone |
| Plate ground / ink | `#e7ddc7` / `#17362a` |

## Obsidian palette

| Role | Value |
|---|---|
| Canvas | `#131211` warm near-black |
| Panel (statement stock) | `#191715` graphite |
| Inset / sunken | `#221f1b` / `#0e0d0c` |
| Navigation | `#161413` |
| Borders subtle / default / strong | `#2a2723` / `#36312a` / `#4c453a` |
| Text primary / secondary / tertiary | `#efe7d9` / `#b4ab98` / `#8b8271` |
| Accent | `#c08a4a` muted bronze |
| Positive / negative / caution | `#85a56c` olive / `#c2685c` / `#c19a4c` |
| Series 1–5 | ivory → bronze → warm stone |
| Plate ground / ink | `#2b2620` / `#15130f` |

Neither theme uses pure white or pure black anywhere.

---

## Section numbering

Every reporting section carries a numeral: `01`, `02`, … in document order.

- Page sections: display serif, 26px, tertiary, set **beside** the heading so
  the numeral never indents the content beneath it.
- Navigation: `.type-section-number`, `aria-hidden`, so a link's accessible
  name stays the plain destination ("Sales", not "03 Sales").
- Ranked lists and numbered commentary use the same numeral treatment.

---

## Canvas and the statement band

Three tonal levels create depth. A page must never be one flat field.

1. **Canvas** — the page ground. Charts, ranked lists and analysis tables sit
   directly on it with no container.
2. **Statement band** (`StatementBand`) — a full-bleed shift to the panel tone
   for the anchor statement of a page. No radius, no shadow, no border box; it
   reads as a change of paper stock, not as a card. One per page at most.
3. **Plate** (`EditorialPlate`) — the brand block: its own ground, a drawn
   mark, and a caption band in plate ink. Swap in licensed photography later
   via its `imageSrc` prop; nothing else changes.

---

## Charts

- The canvas **is** the chart background. No white or dark rectangle behind a
  chart unless it is structurally necessary.
- Horizontal gridlines only, hairline weight. No vertical grid, no tick marks.
- Axis text at caption size in the UI face.
- Square bars — no rounded corners anywhere.
- Primary series at full series strength and a wider bar; comparison series
  narrowed and set back. Plan/budget is a thin dashed reference line.
- Identity is carried by **form as well as colour** (solid fill / muted fill /
  dashed rule), and any chart with two or more series carries a legend.
- Direct labels where a reader would otherwise have to hover (bridges).
- Three palettes, each for one job: `--series-*` (ranked scenarios),
  `--cat-*` (unordered members), `--seq-*` (magnitude). `--positive` and
  `--negative` are **semantic only** and never a series colour.

## Tables

- Tabular numerals, numeric columns right-aligned.
- A rule under the header, hairline separators between rows, a single hairline
  between column groups. No vertical grid, no zebra, no boxed cells.
- Three row ranks, by rule and weight only — never a colour wash:
  `detail` → `subtotal` (rule above, semibold, more air) → `total` (rule
  above, the accountant's double rule below, a size larger, label in the
  display serif).
- Rows that are zero in every scenario stay visible but are set back to
  tertiary. Never hide real data.
- Favourable/adverse is carried by a **word as well as a colour**, and by a
  sign that reads favourable-positive on every line including costs.
- Immaterial entries in a ranked analysis lose their bar; a two-pixel bar is
  noise pretending to be a finding.

## Spacing and dividers

- Page gutter `px-8 lg:px-12`; content column capped at `1760px`.
- Sections separated by a strong top rule; paired rows share one rule with a
  hairline between the columns.
- Hierarchy comes from rules, weight and whitespace. If something needs to be
  separated, use a rule — not a border on four sides.
- Radii: `0`–`2px`. Components are square.

---

## Page patterns

Every *reporting* page is: **masthead → KPI band → numbered sections**, with
the sections in varied spreads rather than a repeating stack. No two
consecutive sections share a shape.

The Overview is the exception, and deliberately so. It is the cover and the
contents, not a report, and following the reporting pattern made it read as a
second copy of the Sales page. It has no masthead, no KPI band and no
numerals — see **The cover** below.

| Page | Shape |
|---|---|
| Overview | cover band · figures · contents spread · movements · bridge · result |
| Sales | 01\|02 65/35 · 03\|04 55/45 · 05 paired · 06 |
| P&L | 01 statement band · 02\|03 40/60 · 04\|05 40/60 · 06 |
| Forecast | 01 · 02\|03 55/45 · 04\|05 60/40 · 06 |
| Variance | 01 · 02\|03 55/45 · 04 · 05\|06 50/50 |
| Cash Flow | 01 · 02\|03 55/45 · 04 statement band · 05\|06 60/40 |
| Balance Sheet | 01 statement band · 02\|03 50/50 · 04\|05 60/40 · 06 |
| KPIs | one section per configured board · focus detail 60/40 |
| Reports | library table · not-configured list |
| Settings | 50/50 pairs of ruled label/value lists |
| Data & Mapping | masthead only — density and workflow win over composition |

A page has **at most one** `StatementBand`: the statement that anchors it.

### The cover

The Overview inverts, and is the only page that may. The rules it does not
share with the rest of the system:

- **The cover ground.** `--cover-ground` / `--cover-on`, full-bleed to both
  edges of the measure. Sand inverts *down* onto deep forest; Obsidian inverts
  *up* onto warm bronze-brown, because its plate ink is darker than its canvas
  and reusing it would make the cover vanish into the page. A 2px
  `--accent-warm` rule closes the band in both themes.
- **Sentiment on the cover.** `--positive-cover` / `--negative-cover`, a light
  pair. Favourability still decides the colour; only the ground changed.
  `VarianceValue` takes `ground="cover"`.
- **The silhouette.** The trailing twelve months drawn as bare columns along
  the foot of the band — no axis, no grid, no labels, and drawn with layout
  rather than a charting library. It is indexed to the strongest month, not to
  zero: a year of monthly revenue sits within a fifth of itself, so a
  zero-based silhouette is a row of identical bricks. The foot of the band says
  it is indexed, and it is never offered as a chart.
- **No numerals.** A cover is not chapter one.

The contents spread is the page's organising idea: every other page listed in
navigation order, each with a live reading taken from the same selector the
destination page calls, so a line here cannot disagree with the page it opens.
Pages the dataset cannot support are listed *without* a reading rather than
dropped — a contents page that hides chapters is not a contents page.

---

## What to avoid

- Rounded SaaS cards, floating panels, glassmorphism, gradients of any kind
  (including tinted area fills under sparklines).
- Generic blue SaaS palettes; rainbow categorical palettes.
- Boxed charts, spreadsheet gridlines, heavy row fills, oversized pills.
- Large empty hero areas and decorative UI with no financial purpose.
- Inventing a metric, a ratio or a sentence of commentary at the page level.
  If the registry or the selectors do not provide it, the page does not show
  it — it shows the existing unavailable state.
- Hard-coding a company, entity, region, channel or account anywhere outside
  `src/config`.
- Duplicating a component for a theme.
