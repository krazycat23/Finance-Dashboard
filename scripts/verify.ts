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
import { authoritativeRules, buildCalendar, buildImportedDataset, classifyDataset, detectTableRange, resolveAccountRule, resolveHierarchyRole, suggestFieldMappings, unpivotWideRows, validateWorkspace, MemoryImportWorkspaceStore, type ImportWorkspace } from "@/domain/ingestion";
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

// --- Dataset switching must not leak selector cache values -----------------
const cachePeriod = dataset.periods.find((period) => period.isActual)!;
const cacheEntity = dataset.defaultEntityId;
const beforeSwitch = selectLines({ entityId: cacheEntity, basis: "MTD", periodId: cachePeriod.id }).actual.revenue ?? 0;
const alternate = structuredClone(dataset);
alternate.id = `${dataset.id}-alternate`;
const revenueAccountIds = new Set(alternate.dimensions.accounts.filter((account) => account.line === "revenue").map((account) => account.id));
const revenueRecord = alternate.financeRecords.find((record) => revenueAccountIds.has(record.accountId) && record.periodId === cachePeriod.id && record.actual !== undefined && record.scenarioValues?.some((value) => value.scenarioId === alternate.scenarioRoles.actual));
if (revenueRecord) {
  revenueRecord.actual! += 1234;
  const actualValue = revenueRecord.scenarioValues!.find((value) => value.scenarioId === alternate.scenarioRoles.actual)!;
  actualValue.value += 1234;
}
setReportingDataset(alternate);
const afterSwitch = selectLines({ entityId: cacheEntity, basis: "MTD", periodId: cachePeriod.id }).actual.revenue ?? 0;
expect(
  "dataset switch invalidates selector cache",
  revenueRecord !== undefined && afterSwitch !== beforeSwitch,
  "a value cached for the first dataset was returned after the active dataset changed",
);

// --- Local ingestion fixtures: different shapes, same canonical bridge -----
const importCompany = { id: "fixture-services", createdAt: "2026-01-01", updatedAt: "2026-01-01", profile: { companyName: "Services Co", reportingCurrency: "USD", currencySymbol: "$", locale: "en-US", defaultScale: "thousands" as const, fiscalCalendar: { periodicity: "monthly" as const, fiscalYearStartMonth: 1, fiscalYearLabel: "endYear" as const } } };
const financeRows = [{ Period: "2026-01", Account: "41001", "Account Name": "Consulting revenue", Entity: "Services", Amount: "125000" }];
const fixtureDataset = { id: "fixture-finance", sourceFileId: "fixture-file", columns: [], rows: financeRows, inferred: classifyDataset(Object.keys(financeRows[0])), confirmedType: "finance_actual" as const, status: "staged" as const, warnings: [], errors: [] };
const fixtureMappings = suggestFieldMappings(fixtureDataset.id, Object.keys(financeRows[0])).map((mapping) => ({ ...mapping, status: mapping.canonicalField === "accountId" || mapping.canonicalField === "amount" ? "mapped" as const : mapping.status }));
const workspace: ImportWorkspace = { company: importCompany, sources: [], datasets: [fixtureDataset], mappings: fixtureMappings, rules: [{ id: "broad", companyId: importCompany.id, priority: 1, kind: "prefix", value: "41*", statement: "pnl", line: "revenue", sign: 1 }, { id: "specific", companyId: importCompany.id, priority: 2, kind: "exact", value: "41001", statement: "pnl", line: "revenue", sign: 1 }], customDimensions: [], scenarios: [{ datasetId: fixtureDataset.id, scenarioId: "actual", kind: "actual", label: "Actual" }], calendar: { fiscalYearStartMonth: 1, fiscalYearLabel: "endYear" }, issues: [], reconciliations: [] };
const imported = buildImportedDataset(workspace);
expect("ingestion classifies finance fixture", fixtureDataset.inferred.type === "finance_actual", "finance-shaped columns were not classified as finance actual");
expect("mapping rule precedence", resolveAccountRule("41001", "Consulting revenue", workspace.rules)?.id === "specific", "specific account mapping did not override broad prefix rule");
expect("raw to canonical preservation", imported.dataset?.financeRecords[0]?.actual === 125000, "canonical actual does not retain source amount");
expect("activation blocks incomplete finance mapping", !buildImportedDataset({ ...workspace, mappings: workspace.mappings.filter((mapping) => mapping.canonicalField !== "amount") }).dataset, "missing required finance mapping did not block activation");
expect("sales fixture classification", classifyDataset(["Order ID", "Customer", "Plan", "Revenue", "Quantity"]).type === "sales", "services-shaped sales columns were not classified as sales");
const wide = unpivotWideRows([{ GL: "4000", Jan: 10, Feb: 20 }], { identifierColumns: ["GL"], valueColumns: ["Jan", "Feb"], periodFromColumn: true, valueField: "Amount" });
expect("wide TB unpivot", wide.length === 2 && wide[1].Amount === 20 && wide[1].period === "Feb", "wide balance columns were not retained with period lineage");
const mappingDataset = { id: "fixture-gl-map", sourceFileId: "mapping-file", columns: [], rows: [{ "GL Code": "41001", "GL Description": "Markdown", "P1 - Section": "Income", "P2 - Header": "Sales", "P3 - Sub-Header": "Markdowns", "P&L Section": "Income", "Sign Convention": "cost" }], inferred: { type: "gl_mapping" as const, confidence: 1, reasons: [] }, status: "staged" as const, warnings: [], errors: [] };
const authWorkspace = { ...workspace, sources: [{ id: "mapping-file", companyId: importCompany.id, filename: "FF_GL_PL_Mapping.xlsx", fileType: "xlsx" as const, uploadedAt: "2026-01-01" }], datasets: [fixtureDataset, mappingDataset] };
const auth = authoritativeRules(authWorkspace)[0];
expect("authoritative GL mapping precedence", auth?.priority === 1_000_000 && resolveAccountRule("41001", "Markdown", [...authoritativeRules(authWorkspace), ...workspace.rules])?.id === auth?.id, "exact workbook mapping did not override generic rules");
expect("mapping provenance and hierarchy preservation", auth?.mappingSource === "authoritative_file" && auth.reportingHierarchy?.p3 === "Markdowns" && auth.sourceMultiplier === -1, "authoritative mapping lost provenance, P1/P2/P3, or sign treatment");
const rangeFixture = { ...fixtureDataset, id: "range-fixture", tableRange: { headerRow: 1, startRow: 2, endRow: 2, confidence: .3, requiresConfirmation: true } };
expect("range confirmation blocks activation", validateWorkspace({ ...workspace, datasets: [rangeFixture] }).some(issue => issue.id === "range-fixture:range"), "unconfirmed source range did not block activation");
const mappingRange = detectTableRange([["GL Code", "GL Description", "P1 - Section", "P2 - Header", "P3 - Sub-Header", "P&L Section", "Sign Convention"], ["1000", "Gross Sales", "Income", "Sales", "Gross Sales", "Income", "income"]]);
const augustRange = detectTableRange([["August trial balance"], ["Entity", "GL Code", "Cost Centre", "2026-07", "2026-08", "2026-09"], ["A", "1000", "CC1", 10, 20, 30]]);
const pivotRange = detectTableRange([["Report filter", "TimePeriod"], ["Row Labels", "Column Labels"], ["Grand Total", 100]]);
expect("schema header beats Gross Sales data", mappingRange?.headerRow === 1, "mapping data row outranked its schema header");
expect("later August header is recognised", augustRange?.headerRow === 2, "header detector did not distinguish title row from schema row");
expect("pivot blocks require table selection", !!pivotRange?.requiresConfirmation, "pivot/filter block was silently accepted");
expect("literal income and cost signs", authoritativeRules({ ...authWorkspace, datasets: [{ ...mappingDataset, rows: [{ "GL Code": "1000", "Sign Convention": "income" }, { "GL Code": "2060", "Sign Convention": "cost" }] }] }).map(rule => rule.sourceMultiplier).join(",") === "1,-1", "income/cost source multipliers are incorrect");
const calendarRows = Array.from({ length: 52 }, (_, index) => ({ "Week Start": `2026-07-${String(index + 1).padStart(2, "0")}`, "Week End": `2026-07-${String(index + 2).padStart(2, "0")}`, Fin_Period: `2027${String(Math.floor(index / 4) + 1).padStart(2, "0")}`, "Fiscal Week": String(index + 1), "Fiscal Month": String(Math.floor(index / 4) + 1), "Fiscal Quarter": String(Math.floor(index / 13) + 1), FY: "FY27" }));
const calendarFixture = { id: "calendar", sourceFileId: "calendar-file", columns: [], rows: calendarRows, inferred: { type: "financial_calendar" as const, confidence: 1, reasons: [] }, status: "staged" as const, warnings: [], errors: [] };
const parsedCalendar = buildCalendar({ ...workspace, datasets: [calendarFixture] });
expect("real-style calendar aliases create 52 weeks", parsedCalendar.weeks.length === 52 && parsedCalendar.weeks[0]?.externalPeriodToken === "202701", "Fin_Period/Fiscal Week calendar aliases did not produce 52 retained weeks");
expect("three identifiers survive wide unpivot", JSON.stringify(unpivotWideRows([{ Entity: "E", GL: "1000", "Cost Centre": "CC", "2026-07": 1 }], { identifierColumns: ["Entity", "GL", "Cost Centre"], valueColumns: ["2026-07"], periodFromColumn: true })[0]) === JSON.stringify({ Entity: "E", GL: "1000", "Cost Centre": "CC", amount: 1, period: "2026-07" }), "wide transform dropped an identifier dimension");
expect("scenario confirmation blocks activation", !buildImportedDataset({ ...workspace, scenarios: [] }).dataset, "unconfirmed scenario was activated");
const hierarchyRoles = [{ id: "parent", companyId: importCompany.id, p2: "Sales", calculationRole: "grossSales" as const, line: "revenue" as const, status: "Approved Rule" as const, provenance: "hierarchy_node" as const }, { id: "child", companyId: importCompany.id, p2: "Sales", p3: "Markdowns", calculationRole: "markdowns" as const, line: "revenue" as const, status: "Manually Confirmed" as const, provenance: "hierarchy_node" as const }];
expect("hierarchy parent role inheritance", resolveHierarchyRole({ p2: "Sales", p3: "Gross Sales" }, hierarchyRoles)?.calculationRole === "grossSales", "parent hierarchy role did not inherit");
expect("hierarchy child override precedence", resolveHierarchyRole({ p2: "Sales", p3: "Markdowns" }, hierarchyRoles)?.calculationRole === "markdowns", "specific hierarchy role did not override parent");
const memoryStore = new MemoryImportWorkspaceStore(); await memoryStore.save({ ...workspace, hierarchyRoles, datasets: [{ ...fixtureDataset, wideUnpivot: { identifierColumns: ["Period", "Account", "Entity"], valueColumns: ["Amount"], periodFromColumn: true }, rangeConfirmed: true }] }); const restored = await memoryStore.load(importCompany.id);
expect("workspace persistence restores onboarding decisions", restored?.hierarchyRoles?.[1]?.p3 === "Markdowns" && restored.datasets[0]?.wideUnpivot?.identifierColumns.length === 3 && restored.scenarios.length === 1, "workspace restore lost persisted onboarding decisions");
const activatedHierarchy = buildImportedDataset({ ...authWorkspace, hierarchyRoles, scenarios: [{ datasetId: fixtureDataset.id, scenarioId: "actual", kind: "actual", label: "Actual" }] });
expect("hierarchy role resolves inside activation", activatedHierarchy.dataset?.dimensions.accounts.find(account => account.id === "41001")?.line === "revenue", "activated account did not inherit canonical line from hierarchy node");
expect("capabilities derive from imported facts", activatedHierarchy.dataset?.capabilities?.hasPnl === true && activatedHierarchy.dataset.capabilities.hasBalanceSheet === false && activatedHierarchy.dataset.capabilities.hasCashFlow === false, "imported company capabilities were fabricated");
expect("integrity is derived rather than hardcoded", activatedHierarchy.dataset?.dataQuality.health.integrityScore !== 100 || activatedHierarchy.dataset.dataQuality.mappingSummaries[0]?.valueCoverage === 1, "integrity score is a hardcoded certainty");

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
