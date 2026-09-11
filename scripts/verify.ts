/**
 * CONSISTENCY VERIFICATION
 * ---------------------------------------------------------------------------
 * Run with `npm run verify`.
 *
 * Checks the invariants that a finance product cannot be allowed to break, at
 * the SELECTOR level — that is, on the numbers the pages actually render, not
 * just on the raw data. Each check corresponds to something a reviewer would
 * test by hand on the first screen:
 *
 *   - the statements tie to each other
 *   - the balance sheet balances
 *   - the cash flow bridge reconciles to the cash balance
 *   - a metric shown on two pages is the same number on both
 *   - bridges and decompositions sum to the movement they claim to explain
 *   - no chart plots an actual for a period that has not closed
 *
 * When this engine is pointed at a new company, this is the acceptance test.
 */

import { MockDataAdapter } from "@/data/mock";
import { setReportingDataset } from "@/domain/data";
import type { PeriodSelection } from "@/domain/models";
import {
  selectBalanceSheet, selectCashBridge, selectCashFlow, selectEbitdaBridge,
  selectBudgetBridge, selectKpi, selectLines, selectMetricSeries,
  selectPriceVolumeMix, selectProfitAndLoss, selectSalesTotals,
  selectWorkingCapitalDays, periodsForBasis,
} from "@/domain/selectors";

const dataset = new MockDataAdapter().load();
setReportingDataset(dataset);

interface Failure {
  check: string;
  detail: string;
}

const failures: Failure[] = [];
let passed = 0;

function expect(check: string, condition: boolean, detail: string) {
  if (condition) passed += 1;
  else failures.push({ check, detail });
}

/** Currency comparisons tolerate rounding accumulated across thousands of records. */
const TOLERANCE = 1;
const close = (a: number, b: number, tolerance = TOLERANCE) =>
  Math.abs(a - b) <= tolerance;

const leafEntities = dataset.dimensions.entities.filter((entity) =>
  !dataset.dimensions.entities.some((candidate) => candidate.parentId === entity.id),
);
const verificationEntities = [dataset.defaultEntityId, ...leafEntities.slice(0, 2).map((entity) => entity.id)];
const SELECTIONS: PeriodSelection[] = verificationEntities.flatMap((entityId, index) => [
  { entityId, basis: index === 1 ? "MTD" : "YTD", periodId: dataset.currentPeriodId },
  ...(index === 0 ? [{ entityId, basis: "R12" as const, periodId: dataset.currentPeriodId }] : []),
]);

for (const selection of SELECTIONS) {
  const tag = `${selection.entityId}/${selection.basis}`;
  const lines = selectLines(selection);
  const a = lines.actual;

  // --- Statement identities ------------------------------------------------
  expect(
    `${tag} gross profit`,
    close((a.grossProfit ?? 0), (a.revenue ?? 0) - (a.costOfSales ?? 0)),
    "gross profit is not revenue less cost of sales",
  );
  expect(
    `${tag} EBITDA`,
    close((a.ebitda ?? 0), (a.grossProfit ?? 0) - (a.operatingCosts ?? 0)),
    "EBITDA is not gross profit less operating costs",
  );
  expect(
    `${tag} net profit`,
    close((a.netProfit ?? 0), (a.ebit ?? 0) - (a.interest ?? 0) - (a.tax ?? 0)),
    "net profit is not EBIT less interest and tax",
  );

  // --- Balance sheet balances ---------------------------------------------
  expect(
    `${tag} balance sheet balances`,
    close((a.totalAssets ?? 0), (a.totalLiabilitiesAndEquity ?? 0)),
    `assets ${(a.totalAssets ?? 0).toFixed(0)} vs L+E ${(a.totalLiabilitiesAndEquity ?? 0).toFixed(0)}`,
  );

  // --- Cash flow ties to the balance sheet --------------------------------
  const cash = selectCashFlow(selection);
  expect(
    `${tag} cash flow bridge`,
    close(
      cash.openingCash + cash.operatingCashFlow + cash.investingCashFlow +
        cash.financingCashFlow,
      cash.closingCash,
    ),
    "opening plus movements does not equal closing cash",
  );
  expect(
    `${tag} closing cash matches balance sheet`,
    close(cash.closingCash, a.cash ?? 0),
    `cash flow ${cash.closingCash.toFixed(0)} vs balance sheet ${(a.cash ?? 0).toFixed(0)}`,
  );

  const bridge = selectCashBridge(selection);
  const bridgeEnd = bridge[bridge.length - 1].value;
  expect(
    `${tag} cash bridge endpoint`,
    close(bridgeEnd, a.cash ?? 0),
    "the cash bridge does not close on the reported cash balance",
  );

  // --- The same metric on two pages ---------------------------------------
  expect(
    `${tag} cash KPI matches statement`,
    close(selectKpi("cash", selection).value, a.cash ?? 0),
    "the cash KPI and the balance sheet disagree",
  );
  expect(
    `${tag} revenue KPI matches statement`,
    close(selectKpi("revenue", selection).value, a.revenue ?? 0),
    "the revenue KPI and the P&L disagree",
  );
  // The Sales page and the P&L read different fact tables; they must still agree.
  const sales = selectSalesTotals(selection);
  expect(
    `${tag} sales ledger ties to P&L revenue`,
    close(sales.revenue, a.revenue ?? 0, Math.max(TOLERANCE, (a.revenue ?? 0) * 1e-6)),
    `sales ${sales.revenue.toFixed(0)} vs P&L ${(a.revenue ?? 0).toFixed(0)}`,
  );

  // --- Working capital days are defined once ------------------------------
  const days = selectWorkingCapitalDays(selection);
  expect(
    `${tag} cash conversion cycle`,
    close(days.cashConversionCycle, days.dso + days.dio - days.dpo, 0.01),
    "CCC is not DSO + DIO - DPO",
  );
  expect(
    `${tag} DSO KPI matches working capital`,
    close(selectKpi("dso", selection).value, days.dso, 0.01),
    "the DSO KPI and the working capital block disagree",
  );

  // --- Bridges sum to the movement they explain ---------------------------
  const ebitdaBridge = selectEbitdaBridge(selection);
  const start = ebitdaBridge[0].value;
  const end = ebitdaBridge[ebitdaBridge.length - 1].value;
  const deltas = ebitdaBridge.slice(1, -1).reduce((s, step) => s + step.value, 0);
  expect(
    `${tag} EBITDA bridge sums`,
    close(start + deltas, end, Math.max(TOLERANCE, Math.abs(end) * 1e-6)),
    `start ${start.toFixed(0)} + deltas ${deltas.toFixed(0)} != end ${end.toFixed(0)}`,
  );

  const budgetBridge = selectBudgetBridge(selection);
  const bStart = budgetBridge[0].value;
  const bEnd = budgetBridge[budgetBridge.length - 1].value;
  const bDeltas = budgetBridge.slice(1, -1).reduce((s, step) => s + step.value, 0);
  expect(
    `${tag} budget bridge sums`,
    close(bStart + bDeltas, bEnd, Math.max(TOLERANCE, Math.abs(bEnd) * 1e-6)),
    "budget-to-actual bridge does not reconcile",
  );

  const pvm = selectPriceVolumeMix(selection);
  const pvmSum = pvm.reduce((s, c) => s + c.value, 0);
  const revenueMovement = (a.revenue ?? 0) - (lines.priorYear.revenue ?? 0);
  expect(
    `${tag} price/volume/mix sums`,
    close(pvmSum, revenueMovement, Math.max(TOLERANCE, Math.abs(revenueMovement) * 1e-6)),
    `components ${pvmSum.toFixed(0)} != revenue movement ${revenueMovement.toFixed(0)}`,
  );

  // --- Statement rows agree with the aggregate ----------------------------
  const pnl = selectProfitAndLoss(selection);
  const revenueRow = pnl.find((row) => row.line === "revenue");
  expect(
    `${tag} P&L revenue row`,
    !!revenueRow && close(revenueRow.actual, a.revenue ?? 0),
    "the P&L table row does not match the aggregate",
  );
  const balance = selectBalanceSheet(selection);
  const totalAssetsRow = balance.find((row) => row.line === "totalAssets");
  const totalLERow = balance.find((row) => row.line === "totalLiabilitiesAndEquity");
  expect(
    `${tag} balance sheet table balances`,
    !!totalAssetsRow && !!totalLERow && close(totalAssetsRow.actual, totalLERow.actual),
    "the rendered balance sheet does not balance",
  );
}

// --- No chart may plot an actual for a period that has not closed ----------
const forwardPeriods = periodsForBasis("FY", dataset.currentPeriodId);
const series = selectMetricSeries("revenue", forwardPeriods, dataset.defaultEntityId);
const leaked = series.filter((point) => !point.period.isActual && point.actual !== undefined);
expect(
  "no actuals in open periods",
  leaked.length === 0,
  `${leaked.length} open period(s) carry an actual: ${leaked.map((p) => p.period.id).join(", ")}`,
);

// Every period marked actual must be at or before the reporting cut-off.
const misdated = dataset.periods.filter(
  (period) => period.isActual && period.id > dataset.currentPeriodId,
);
expect(
  "reporting cut-off respected",
  misdated.length === 0,
  `${misdated.length} period(s) marked actual beyond the reporting date`,
);

// --- Report ---------------------------------------------------------------
if (failures.length === 0) {
  console.log(`\n  ✓ ${passed} consistency checks passed.\n`);
  console.log("    Statements tie, the balance sheet balances, cash reconciles,");
  console.log("    bridges sum to the movements they explain, and no chart plots");
  console.log("    an actual for a period that has not closed.\n");
  process.exit(0);
}

console.error(`\n  ✗ ${failures.length} of ${failures.length + passed} checks FAILED\n`);
for (const failure of failures) {
  console.error(`    ${failure.check}`);
  console.error(`      ${failure.detail}`);
}
console.error("");
process.exit(1);
