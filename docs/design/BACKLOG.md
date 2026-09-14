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

## In progress — written vs delivered sales

Scaffolding is committed and inert; nothing reads it yet.

- `SalesRecord.writtenRevenue` — orders written in the period, against
  `revenue`, which is always what was delivered and recognised.
- `Combo.leadMonths` in the sales generator — 0 for stores (the order and
  the delivery are one event at the till), 0.4 for online, 0.8 for
  marketplace, 1.6 for wholesale.

Still to do:

1. **Populate `writtenRevenue` in the generator.** The intended shape is
   `written(m) ≈ delivered(m + leadMonths)`, interpolated between the two
   surrounding months and jittered. Two things fall out of that for free:
   written leads delivered into the December peak by a month, and the
   cumulative difference between the two series settles at roughly
   `leadMonths` of delivery — which *is* the order bank, without an opening
   balance having to be invented.
2. **`selectOrderBook(selection)`** returning written, delivered, the bank
   (cumulative written less cumulative delivered through the window end),
   weeks of cover, and the prior-year equivalents.
3. **Registry metrics + resolvers** for `writtenSales` and `orderBank`.
   Note that a metric registered without a resolver silently returns 0 —
   that is how `netDebtToEbitda` came to render a confident `0.00x`.
4. **A Sales section** pairing the two series with the bank movement.

## Not started

- **Transactions and ATV over time.** The facts already carry
  `transactions` and `traffic`; this is a chart that was never drawn, not
  missing data.
- **Balance sheet ratios.** Gearing and interest cover, and a real
  `netDebtToEbitda` resolver. The metric is registered but unresolved, so
  it is currently kept off the page rather than shown as zero.
- **P&L.** Net profit margin, and a view switcher across division, cost
  centre and account.
- **Forecast.** A driver-level bridge.
- **Entities page.** No route exists today.
- **Overview search** and a notifications badge.

## Open question

Both supplied reference designs put **icons in the sidebar**; the current
navigation uses running numerals only. This changes every page, so it has
been left alone pending a decision.
