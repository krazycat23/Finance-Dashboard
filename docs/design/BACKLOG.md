# North House — feature backlog

Where the redesign got to, and what is still owed. Written down because the
remaining items all follow the same pattern: the page design exists, but the
dataset has nothing for it to report, so the feature was never built.

The standing decision is that demo data for these is fine — Northpoint is a
generated company, and a generated company can have a generated order bank.
What must stay true is that an **imported** company shows the unavailable
state rather than Northpoint's numbers.

## Done

- **Report library.** `reportLibrary` on `ReportingDataset`; schedules,
  exports, board packs and templates, with selectors in
  `src/domain/selectors/reports.ts` and the Reports page rebuilt on them.
- **Store estate.** `Location` carries `parentId`, `format` and `openedOn`.
  21 stores across six regions in `src/data/mock/dimensions.ts`, each with a
  share of its region, its own growth and a like-for-like flag. Derived
  `regionId` / `storeId` dimensions in `selectBreakdown`, and a store
  performance section on Sales.

## Done — written vs delivered sales

- `SalesRecord.writtenRevenue` against `revenue`, which is always what was
  delivered and recognised. `Combo.leadMonths` in the generator: 0 for stores
  (order and delivery are one event at the till), 0.4 online, 0.8
  marketplace, 1.6 wholesale.
- Written is read back off the delivered series — `written(m) ≈
  delivered(m + leadMonths)` — rather than invented alongside it, so written
  leads delivered into the December peak by the length of the lead.
- The opening bank is anchored in the first month of history. A running total
  of written less delivered telescopes to the GROWTH in delivery across the
  lead, not to the balance, so without the anchor a flat business shows a bank
  of nothing. It came out at $1.5M / 0.4 weeks before the anchor and $7.0M /
  1.9 weeks after, which is the right order for a book with wholesale at 1.6
  months.
- `selectOrderBook` (balance, cover, prior-year) and `selectOrderFlow`
  (written / delivered / bank by month), an `OrderFlowChart`, and sections 06
  and 07 on Sales.
- `writtenSales` is registered and resolvable. `orderBank` is registered
  `standalone: true` — a new registry flag meaning the KPI layer cannot derive
  it from a period window, so `selectKpi` now raises instead of returning a
  confident zero. That is the guard the `netDebtToEbitda` `0.00x` needed.

## Done — balance sheet leverage

- `gearing` is an ordinary resolver: net debt over net debt plus equity, both
  closing positions, so it holds within a single window and sits in the
  capital rail.
- `netDebtToEbitda` and `interestCover` are `standalone`. They divide a
  closing balance by a flow, so the two sides come from different windows —
  the position at the reporting date against the twelve months ending there.
  A single-window resolver would have divided closing net debt by nine months
  of EBITDA and reported the answer as a covenant multiple.
- `selectLeverage` returns all three with their prior-year equivalents, and
  leaves a ratio undefined rather than zero where it cannot be stated: net
  cash has no debt multiple, and a company paying no interest has no cover.
  The page omits the row instead of asserting a figure.
- A move in gearing is stated in basis points, as every other margin in the
  product is.

## Not started

- **Transactions and ATV over time.** The facts already carry
  `transactions` and `traffic`; this is a chart that was never drawn, not
  missing data.
- **P&L.** Net profit margin, and a view switcher across division, cost
  centre and account.
- **Forecast.** A driver-level bridge.
- **Entities page.** No route exists today.
- **Overview search** and a notifications badge.

## Open question

Both supplied reference designs put **icons in the sidebar**; the current
navigation uses running numerals only. This changes every page, so it has
been left alone pending a decision.
