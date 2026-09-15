import "./verify-adapters";
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
import * as XLSX from "xlsx";
import { File } from "node:buffer";
import { ReportingRuntime } from "@/domain/data/runtime";
import { getReportingDataset, getReportingDatasetRevision } from "@/domain/data";
import { selectAvailable, selectModuleAvailability } from "@/domain/selectors/availability";
import { ActivationReview, activationBlockers } from "@/components/ingestion/ActivationReview";
import { ReportingUnavailable } from "@/components/finance/ReportingAvailability";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DatasetReview } from "@/components/ingestion/DatasetReview";
import { HierarchyRoleReview } from "@/components/ingestion/HierarchyRoleReview";
import { restageWorkspaceRange, setHierarchyNodeRole, updateWorkspaceFieldMapping, updateWorkspaceHierarchyRoles } from "@/components/ingestion/reviewState";
import { setReportingDataset } from "@/domain/data";
import { authoritativeRules, buildCalendar, buildImportedDataset, classifyDataset, detectTableRange, resolveAccountRule, resolveHierarchyRole, resolveMonthlyPeriodToken, stageLocalFile, suggestFieldMappings, unpivotWideRows, validateWorkspace, MemoryImportWorkspaceStore, type ImportWorkspace } from "@/domain/ingestion";
import type { PeriodSelection } from "@/domain/models";
import {
  selectBalanceSheet, selectCashBridge, selectCashFlow, selectEbitdaBridge,
  selectBudgetBridge, selectKpi, selectLines, selectMetricSeries,
  selectPriceVolumeMix, selectProfitAndLoss, selectSalesTotals,
  selectWorkingCapitalDays, periodsForBasis, selectWeeklySales, selectTopVariances,
} from "@/domain/selectors";
import { calculateStatementVariance } from "@/domain/metrics/variance";

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
// Source token preservation: CSV must not coerce fiscal codes/identifiers into
// dates/numbers; XLSX formatted strings resolve to the same logical source.
const csvUpload = await stageLocalFile(importCompany.id, new File(["Period,Entity,GL Code,Amount\n202701,001,0040,100"], "periods.csv", { type: "text/csv" }));
const csvRows = csvUpload.datasets[0]!.rows;
const xlsxBook = XLSX.utils.book_new(); const xlsxSheet = XLSX.utils.aoa_to_sheet([["Period", "Entity", "GL Code", "Amount"], ["202701", "001", "0040", 100]]); XLSX.utils.book_append_sheet(xlsxBook, xlsxSheet, "Source");
const xlsxUpload = await stageLocalFile(importCompany.id, new File([XLSX.write(xlsxBook, { type: "buffer", bookType: "xlsx" })], "periods.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
const xlsxRows = xlsxUpload.datasets[0]!.rows;
expect("CSV and XLSX retain fiscal and leading-zero tokens", csvRows[0]?.Period === "202701" && csvRows[0]?.Entity === "001" && csvRows[0]?.["GL Code"] === "0040" && xlsxRows[0]?.Period === "202701" && xlsxRows[0]?.Entity === "001" && xlsxRows[0]?.["GL Code"] === "0040", "source identifiers were coerced before mapping");
expect("profiling separates fiscal tokens identifiers and measures", csvUpload.datasets[0]?.columns.find(column => column.name === "Period")?.inferredType === "fiscal-period-token" && csvUpload.datasets[0]?.columns.find(column => column.name === "GL Code")?.inferredType === "identifier" && csvUpload.datasets[0]?.columns.find(column => column.name === "Amount")?.inferredType === "currency-like", "column profiling collapsed semantic values into generic numbers");
expect("genuine numeric amount remains numeric", Number(csvRows[0]?.Amount) === 100 && Number(xlsxRows[0]?.Amount) === 100, "numeric measure no longer parses as an amount");
const dateBook = XLSX.utils.book_new(); const dateSheet = XLSX.utils.aoa_to_sheet([["Period"], [new Date(Date.UTC(2026, 6, 1))]]); dateSheet.A2!.z = "m/d/yy"; XLSX.utils.book_append_sheet(dateBook, dateSheet, "Date");
const dateUpload = await stageLocalFile(importCompany.id, new File([XLSX.write(dateBook, { type: "buffer", bookType: "xlsx" })], "date.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
expect("genuine Excel date normalises without losing fiscal token semantics", resolveMonthlyPeriodToken(dateUpload.datasets[0]?.rows[0]?.Period) === "2026-07" && resolveMonthlyPeriodToken("202701") === undefined, "date and fiscal-token resolution are conflated");
const csvFinance = { ...csvUpload.datasets[0]!, confirmedType: "finance_actual" as const, rangeConfirmed: true };
const csvCalendar = { id: "csv-calendar", sourceFileId: "csv-calendar-file", columns: [], rows: [{ "Week Start": "2026-07-01", "Week End": "2026-07-07", Fin_Period: "202701", "Fiscal Week": "1", "Fiscal Month": "1", "Fiscal Quarter": "1", FY: "FY27" }], inferred: { type: "financial_calendar" as const, confidence: 1, reasons: [] }, confirmedType: "financial_calendar" as const, status: "staged" as const, warnings: [], errors: [] };
const csvMappings = suggestFieldMappings(csvFinance.id, csvFinance.columns.map(column => column.name)).map(mapping => ({ ...mapping, status: ["period", "entityId", "accountId", "amount"].includes(mapping.canonicalField) ? "mapped" as const : mapping.status }));
const csvImport = buildImportedDataset({ ...workspace, sources: csvUpload.source ? [csvUpload.source] : [], datasets: [csvFinance, csvCalendar], mappings: csvMappings, rules: [{ id: "csv-rule", companyId: importCompany.id, priority: 1, kind: "exact", value: "0040", statement: "pnl", line: "revenue", sign: 1 }], scenarios: [{ datasetId: csvFinance.id, scenarioId: "csv-actual", kind: "actual", label: "Actual" }] });
expect("CSV external fiscal token resolves through authoritative calendar in production path", csvImport.dataset?.financeRecords[0]?.periodId === "2026-07" && csvImport.dataset.financeRecords[0]?.entityId === "001" && csvImport.dataset.dimensions.accounts.some(account => account.externalId === "0040"), "CSV fiscal token or leading-zero dimensions did not survive activation");
expect("three identifiers survive wide unpivot", JSON.stringify(unpivotWideRows([{ Entity: "E", GL: "1000", "Cost Centre": "CC", "2026-07": 1 }], { identifierColumns: ["Entity", "GL", "Cost Centre"], valueColumns: ["2026-07"], periodFromColumn: true })[0]) === JSON.stringify({ Entity: "E", GL: "1000", "Cost Centre": "CC", amount: 1, period: "2026-07" }), "wide transform dropped an identifier dimension");
expect("scenario confirmation blocks activation", !buildImportedDataset({ ...workspace, scenarios: [] }).dataset, "unconfirmed scenario was activated");
const hierarchyRoles = [{ id: "parent", companyId: importCompany.id, p2: "Sales", calculationRole: "grossSales" as const, line: "revenue" as const, status: "Approved Rule" as const, provenance: "hierarchy_node" as const }, { id: "child", companyId: importCompany.id, p2: "Sales", p3: "Markdowns", calculationRole: "markdowns" as const, line: "revenue" as const, status: "Manually Confirmed" as const, provenance: "hierarchy_node" as const }];
expect("hierarchy parent role inheritance", resolveHierarchyRole({ p2: "Sales", p3: "Gross Sales" }, hierarchyRoles)?.calculationRole === "grossSales", "parent hierarchy role did not inherit");
expect("hierarchy child override precedence", resolveHierarchyRole({ p2: "Sales", p3: "Markdowns" }, hierarchyRoles)?.calculationRole === "markdowns", "specific hierarchy role did not override parent");
const memoryStore = new MemoryImportWorkspaceStore(); await memoryStore.save({ ...workspace, hierarchyRoles, datasets: [{ ...fixtureDataset, wideUnpivot: { identifierColumns: ["Period", "Account", "Entity"], valueColumns: ["Amount"], periodFromColumn: true }, rangeConfirmed: true }] }); const restored = await memoryStore.load(importCompany.id);
expect("workspace persistence restores onboarding decisions", restored?.hierarchyRoles?.[1]?.p3 === "Markdowns" && restored.datasets[0]?.wideUnpivot?.identifierColumns.length === 3 && restored.scenarios.length === 1, "workspace restore lost persisted onboarding decisions");
const activatedHierarchy = buildImportedDataset({ ...authWorkspace, hierarchyRoles, scenarios: [{ datasetId: fixtureDataset.id, scenarioId: "actual", kind: "actual", label: "Actual" }] });
expect("hierarchy role resolves inside activation", activatedHierarchy.dataset?.dimensions.accounts.find(account => account.id === "41001")?.line === "markdowns", "activated account did not inherit canonical line from hierarchy node");
expect("capabilities derive from imported facts", activatedHierarchy.dataset?.capabilities?.hasPnl === true && activatedHierarchy.dataset.capabilities.hasBalanceSheet === false && activatedHierarchy.dataset.capabilities.hasCashFlow === false, "imported company capabilities were fabricated");
expect("integrity is derived rather than hardcoded", activatedHierarchy.dataset?.dataQuality.health.integrityScore !== 100 || activatedHierarchy.dataset.dataQuality.mappingSummaries[0]?.valueCoverage === 1, "integrity score is a hardcoded certainty");
const uiColumns=["Period","Account","Amount"].map(name=>({name,inferredType:"string" as const,nonNullCount:2,nullPercent:0,distinctCount:2,samples:["2026-01","41001"]}));
const uiRangeDataset={...fixtureDataset,id:"ui-range",columns:uiColumns,rows:[{"Period":"2026-01","Account":"41001","Amount":10},{"Period":"2026-02","Account":"41001","Amount":20}],rawGrid:[["Title"],["Period","Account","Amount"],["2026-01","41001",10],["2026-02","41001",20]],tableRange:{headerRow:2,startRow:3,endRow:4,startColumn:1,endColumn:3,confidence:.4,requiresConfirmation:true}};
const uiWorkspace={...authWorkspace,datasets:[uiRangeDataset,mappingDataset],mappings:suggestFieldMappings(uiRangeDataset.id,uiColumns.map(column=>column.name)),hierarchyRoles:[]};
const datasetMarkup=renderToStaticMarkup(createElement(DatasetReview,{dataset:uiRangeDataset,workspace:uiWorkspace,onChange:()=>{},onRangeChange:()=>{}}));
const roleMarkup=renderToStaticMarkup(createElement(HierarchyRoleReview,{workspace:uiWorkspace,onChange:()=>{}}));
expect("onboarding renders editable range, raw preview, field mappings and hierarchy roles",datasetMarkup.includes('aria-label="headerRow"')&&datasetMarkup.includes("Raw worksheet preview")&&datasetMarkup.includes("Canonical field for Account")&&roleMarkup.includes("Hierarchy canonical-role review")&&roleMarkup.includes("Revert to inherited"),"a core onboarding review section is missing from rendered controls");
let uiState=restageWorkspaceRange(uiWorkspace,uiRangeDataset.id,"endRow",3);
expect("range edit restages from selected rows",uiState.datasets.find(dataset=>dataset.id===uiRangeDataset.id)?.rows.length===1&&uiState.datasets.find(dataset=>dataset.id===uiRangeDataset.id)?.rangeConfirmed===false,"edited range did not restage or require reconfirmation");
const parentNode={p1:"Income",p2:"Sales"};
uiState=updateWorkspaceHierarchyRoles(uiState,setHierarchyNodeRole(uiState.hierarchyRoles??[],uiState.company.id,parentNode,"grossSales"));
expect("range configuration survives hierarchy role assignment",uiState.datasets.find(dataset=>dataset.id===uiRangeDataset.id)?.tableRange?.endRow===3&&uiState.datasets.find(dataset=>dataset.id===uiRangeDataset.id)?.rows.length===1,"hierarchy assignment erased the range edit");
const accountMapping=uiState.mappings.find(mapping=>mapping.sourceColumn==="Account")!;
uiState=updateWorkspaceFieldMapping(uiState,accountMapping.id,"accountId");
expect("hierarchy assignment survives field mapping edit",uiState.hierarchyRoles?.some(role=>role.p2==="Sales"&&role.calculationRole==="grossSales")&&uiState.mappings.find(mapping=>mapping.id===accountMapping.id)?.canonicalField==="accountId","field mapping update erased hierarchy assignment");
const childPath={p1:"Income",p2:"Sales",p3:"Markdowns"};
expect("P3 displays inherited P2 role after UI assignment",resolveHierarchyRole(childPath,uiState.hierarchyRoles??[])?.calculationRole==="grossSales","production resolver did not inherit the assigned parent role");
const childOverride=setHierarchyNodeRole(uiState.hierarchyRoles??[],uiState.company.id,childPath,"markdowns");
expect("P3 explicit override wins and clearing restores inheritance",resolveHierarchyRole(childPath,childOverride)?.calculationRole==="markdowns"&&resolveHierarchyRole(childPath,setHierarchyNodeRole(childOverride,uiState.company.id,childPath,""))?.calculationRole==="grossSales","child override did not resolve or clear to inherited role");
const unresolvedActivation=buildImportedDataset({...authWorkspace,hierarchyRoles:[],scenarios:[{datasetId:fixtureDataset.id,scenarioId:"actual",kind:"actual",label:"Actual"}]});
const resolvedRoles=setHierarchyNodeRole([],importCompany.id,{p1:"Income",p2:"Sales",p3:"Markdowns"},"markdowns");
const resolvedActivation=buildImportedDataset({...authWorkspace,hierarchyRoles:resolvedRoles,scenarios:[{datasetId:fixtureDataset.id,scenarioId:"actual",kind:"actual",label:"Actual"}]});
expect("hierarchy role assignment clears production activation blocker",!unresolvedActivation.dataset&&unresolvedActivation.issues.some(issue=>issue.id.includes("canonical-role"))&&!!resolvedActivation.dataset,"review assignment did not clear the actual production blocker");
const uiStore=new MemoryImportWorkspaceStore();await uiStore.save(uiState);const restoredUi=await uiStore.load(uiState.company.id);
expect("range mapping and hierarchy decisions survive workspace save/reopen",restoredUi?.datasets.find(dataset=>dataset.id===uiRangeDataset.id)?.rangeConfirmed===false&&restoredUi?.mappings.find(mapping=>mapping.id===accountMapping.id)?.canonicalField==="accountId"&&restoredUi?.hierarchyRoles?.some(role=>role.p2==="Sales"),"workspace save/reopen lost UI review decisions");
// Canonical revenue arithmetic: gross sales less contra-revenue, then COGS/Opex.
const contraRows = [
  { Period: "2026-07", Entity: "A", "GL Code": "1000", Amount: "1000" },
  { Period: "2026-07", Entity: "A", "GL Code": "2060", Amount: "-100" },
  { Period: "2026-07", Entity: "A", "GL Code": "2070", Amount: "-50" },
  { Period: "2026-07", Entity: "A", "GL Code": "5000", Amount: "-400" },
  { Period: "2026-07", Entity: "A", "GL Code": "5905", Amount: "-200" },
];
const contraFinance = { id: "contra-actual", sourceFileId: "contra-file", columns: [], rows: contraRows, inferred: { type: "finance_actual" as const, confidence: 1, reasons: [] }, confirmedType: "finance_actual" as const, status: "staged" as const, warnings: [], errors: [] };
const contraBudget = { ...contraFinance, id: "contra-budget", sourceFileId: "contra-budget-file", rows: contraRows.map(row => row["GL Code"] === "2060" ? { ...row, Amount: "-80" } : row), inferred: { type: "budget" as const, confidence: 1, reasons: [] }, confirmedType: "budget" as const };
const contraMap = { id: "contra-map", sourceFileId: "contra-map-file", columns: [], rows: [
  { "GL Code": "1000", "P1 - Section": "Income", "P2 - Header": "Sales", "P3 - Sub-Header": "Gross Sales", "P&L Section": "Income", "Sign Convention": "income" },
  { "GL Code": "2060", "P1 - Section": "Income", "P2 - Header": "Sales", "P3 - Sub-Header": "Markdowns", "P&L Section": "Income", "Sign Convention": "cost" },
  { "GL Code": "2070", "P1 - Section": "Income", "P2 - Header": "Sales", "P3 - Sub-Header": "Returns", "P&L Section": "Income", "Sign Convention": "cost" },
  { "GL Code": "5000", "P1 - Section": "Cost of Sales", "P2 - Header": "COGS", "P3 - Sub-Header": "COGS", "P&L Section": "Income", "Sign Convention": "cost" },
  { "GL Code": "5905", "P1 - Section": "Expenses", "P2 - Header": "Operating", "P3 - Sub-Header": "Operating Costs", "P&L Section": "Income", "Sign Convention": "cost" },
], inferred: { type: "gl_mapping" as const, confidence: 1, reasons: [] }, confirmedType: "gl_mapping" as const, status: "staged" as const, warnings: [], errors: [] };
const contraMappings = [contraFinance, contraBudget].flatMap(dataset => suggestFieldMappings(dataset.id, Object.keys(contraRows[0]!)).map(mapping => ({ ...mapping, status: ["period", "entityId", "accountId", "amount"].includes(mapping.canonicalField) ? "mapped" as const : mapping.status })));
const contraRoles = [
  ["Income", "Sales", "Gross Sales", "grossSales"], ["Income", "Sales", "Markdowns", "markdowns"], ["Income", "Sales", "Returns", "returns"], ["Cost of Sales", "COGS", "COGS", "costOfSales"], ["Expenses", "Operating", "Operating Costs", "operatingCosts"],
].map(([p1,p2,p3,calculationRole], index) => ({ id: `contra-role-${index}`, companyId: importCompany.id, p1, p2, p3, calculationRole: calculationRole as import("@/domain/models").CanonicalCalculationRole, line: "unconfirmed" as const, status: "Manually Confirmed" as const, provenance: "hierarchy_node" as const }));
const contraWorkspace: ImportWorkspace = { ...workspace, datasets: [contraFinance, contraBudget, contraMap], mappings: contraMappings, rules: [], hierarchyRoles: contraRoles, scenarios: [{ datasetId: contraFinance.id, scenarioId: "contra-actual", kind: "actual", label: "Actual" }, { datasetId: contraBudget.id, scenarioId: "contra-budget", kind: "budget", label: "Budget" }] };
const contraImport = buildImportedDataset(contraWorkspace); setReportingDataset(contraImport.dataset!);
const contraLines = selectLines({ entityId: "company", basis: "MTD", periodId: "2026-07" }); const contraPnl = selectProfitAndLoss({ entityId: "company", basis: "MTD", periodId: "2026-07" });
expect("contra-revenue roles produce exact net-sales arithmetic", contraLines.actual.grossSales === 1000 && contraLines.actual.markdowns === 100 && contraLines.actual.returns === 50 && contraLines.actual.netSales === 850 && contraLines.actual.revenue === 850 && contraLines.actual.grossProfit === 450 && contraLines.actual.ebitda === 250, "gross sales, markdowns, returns, COGS and EBITDA did not reconcile");
expect("contra-revenue appears as adverse statement variance", contraPnl.find(row => row.line === "markdowns")?.actual === 100 && contraPnl.find(row => row.line === "markdowns")?.budget === 80 && calculateStatementVariance(100, 80, true)?.sentiment === "negative", "markdown variance did not retain adverse cost semantics");
expect("contra-revenue is adverse in variance ranking", selectTopVariances({ entityId: "company", basis: "MTD", periodId: "2026-07" }).find(item => item.label === "Markdowns")?.variance === -20, "markdown variance ranking treated increased markdowns as favourable");
// Imported reporting cut-off: the calendar includes plan months, but only
// valid Actual facts may establish which months are closed reporting periods.
const cutoffActualRows = [
  { Period: "2026-07", Entity: "A", Account: "41001", Amount: "100" },
  { Period: "2026-08", Entity: "A", Account: "41001", Amount: "200" },
];
const cutoffBudgetRows = [
  ["2026-07", "110"], ["2026-08", "210"], ["2026-09", "300"], ["2026-10", "400"],
  ["2026-11", "500"], ["2026-12", "600"], ["2027-01", "700"], ["2027-02", "800"],
  ["2027-03", "900"], ["2027-04", "1000"], ["2027-05", "1100"], ["2027-06", "1200"],
].map(([Period, Amount]) => ({ Period, Entity: "A", Account: "41001", Amount }));
const cutoffActual = { ...fixtureDataset, id: "cutoff-actual", sourceFileId: "cutoff-actual-file", rows: cutoffActualRows, confirmedType: "finance_actual" as const };
const cutoffBudget = { ...fixtureDataset, id: "cutoff-budget", sourceFileId: "cutoff-budget-file", rows: cutoffBudgetRows, inferred: { type: "budget" as const, confidence: 1, reasons: [] }, confirmedType: "budget" as const };
const cutoffMappings = [cutoffActual, cutoffBudget].flatMap(dataset => suggestFieldMappings(dataset.id, Object.keys(cutoffActualRows[0]!)).map(mapping => ({ ...mapping, status: ["period", "entityId", "accountId", "amount"].includes(mapping.canonicalField) ? "mapped" as const : mapping.status })));
const cutoffWorkspace: ImportWorkspace = { ...workspace, datasets: [cutoffActual, cutoffBudget], mappings: cutoffMappings, scenarios: [{ datasetId: cutoffActual.id, scenarioId: "cutoff-actual", kind: "actual", label: "Actual" }, { datasetId: cutoffBudget.id, scenarioId: "cutoff-budget", kind: "budget", label: "Original Budget" }] };
const cutoffImport = buildImportedDataset(cutoffWorkspace);
const cutoffData = cutoffImport.dataset!;
setReportingDataset(cutoffData);
expect("actual facts establish imported reporting cut-off", cutoffData.currentPeriodId === "2026-08" && cutoffData.periods.find(period => period.id === "2026-07")?.isActual === true && cutoffData.periods.find(period => period.id === "2026-08")?.isActual === true && cutoffData.periods.filter(period => period.id >= "2026-09").every(period => !period.isActual), "budget-only future periods were marked closed actuals or the actual cut-off was wrong");
const cutoffAugust = selectLines({ entityId: "company", basis: "MTD", periodId: "2026-08" });
const cutoffYtd = selectLines({ entityId: "company", basis: "YTD", periodId: "2026-08" });
const cutoffFutureBudget = selectLines({ entityId: "company", basis: "MTD", periodId: "2027-06" });
expect("actual MTD and YTD stop at imported actual horizon", cutoffAugust.actual.revenue === 200 && cutoffYtd.actual.revenue === 300, "actual MTD/YTD included plan months or omitted valid actual facts");
expect("future budget remains queryable without becoming actual", cutoffFutureBudget.budget.revenue === 1200 && cutoffFutureBudget.actual.revenue === 0 && cutoffData.currentPeriodId !== "2027-06", "future budget was inaccessible or treated as closed actual reporting");
const noActualImport = buildImportedDataset({ ...cutoffWorkspace, datasets: [cutoffBudget], mappings: cutoffMappings.filter(mapping => mapping.datasetId === cutoffBudget.id), scenarios: [{ datasetId: cutoffBudget.id, scenarioId: "cutoff-budget", kind: "budget", label: "Original Budget" }] });
expect("missing actual facts block an invented reporting cutoff", !noActualImport.dataset && noActualImport.issues.some(issue => issue.id === "finance:actual-reporting-cutoff"), "budget-only import invented a current actual reporting period");
// Stage evidence: raw wide source, unpivot, sign adjustment, mapping split,
// and independently read canonical facts.
const wideReconciliationRows = [{ Entity: "A", GL: "1000", "2026-07": 1000, "2026-08": 200 }, { Entity: "A", GL: "9999", "2026-07": -10, "2026-08": -5 }];
const wideReconciliation = { id: "wide-reconciliation", sourceFileId: "wide-file", columns: [], rows: wideReconciliationRows, inferred: { type: "finance_actual" as const, confidence: 1, reasons: [] }, confirmedType: "finance_actual" as const, status: "staged" as const, warnings: [], errors: [], wideUnpivot: { identifierColumns: ["Entity", "GL"], valueColumns: ["2026-07", "2026-08"], periodFromColumn: true, valueField: "amount" } };
const wideMappings = suggestFieldMappings(wideReconciliation.id, ["Entity", "GL", "2026-07", "2026-08"]).map(mapping => ({ ...mapping, status: ["entityId", "accountId"].includes(mapping.canonicalField) ? "mapped" as const : mapping.status }));
const wideBase: ImportWorkspace = { ...workspace, datasets: [wideReconciliation], mappings: wideMappings, rules: [{ id: "wide-income", companyId: importCompany.id, priority: 1, kind: "exact", value: "1000", statement: "pnl", line: "revenue", sign: 1, sourceMultiplier: 1 }], scenarios: [{ datasetId: wideReconciliation.id, scenarioId: "wide-actual", kind: "actual", label: "Actual" }] };
const wideBlocked = buildImportedDataset(wideBase);
expect("reconciliation captures unmapped wide-source evidence", !wideBlocked.dataset && wideBlocked.reconciliations.some(check => check.stage === "unpivot" && check.status === "pass" && check.sourceRowCount === 2 && check.targetRowCount === 4 && check.sourceTotal === 1185 && check.targetTotal === 1185 && check.sourceMagnitude === 1215 && check.targetMagnitude === 1215) && wideBlocked.reconciliations.some(check => check.stage === "mapped" && check.status === "pass" && check.sourceTotal === 1185 && check.targetTotal === 1185) && wideBlocked.reconciliations.some(check => check.stage === "canonical" && check.status === "pass"), "wide raw/unpivot/mapping/canonical evidence is missing or not independent");
const wideResolved = buildImportedDataset({ ...wideBase, rules: [...wideBase.rules, { id: "wide-cost", companyId: importCompany.id, priority: 2, kind: "exact", value: "9999", statement: "pnl", line: "operatingCosts", sign: -1, sourceMultiplier: -1 }] });
expect("reconciliation explains sign adjustment and passes after mapping", !!wideResolved.dataset && wideResolved.reconciliations.every(check => check.status === "pass") && wideResolved.reconciliations.find(check => check.stage === "sign")?.transformationAdjustment === 30 && wideResolved.dataset.dataQuality.health.integrityScore === 100, "sign normalisation or final canonical reconciliation was not independently evidenced");
// --- Imported dimensions and sales integration fixture --------------------
const integrationRows = [{ Period:"2026-07", Entity:"A", "Cost Centre":"0040", Department:"OPS", Account:"41001", Amount:"100" },{ Period:"2026-07", Entity:"B", "Cost Centre":"0100", Department:"HQ", Account:"41001", Amount:"200" },{ Period:"2026-08", Entity:"A", "Cost Centre":"0040", Department:"OPS", Account:"41001", Amount:"50" }];
const integrationFinance = { ...fixtureDataset, id:"integration-finance", rows:integrationRows, confirmedType:"finance_actual" as const };
const financeMappings = suggestFieldMappings(integrationFinance.id,Object.keys(integrationRows[0]!)).map(mapping=>({ ...mapping, status:["period","entityId","costCentreId","departmentId","accountId","amount"].includes(mapping.canonicalField)?"mapped" as const:mapping.status }));
const salesRows=[{Period:"2026-07",Entity:"A",Channel:"Online",Location:"Sydney",Revenue:"30",Units:"2"},{Period:"2026-07",Entity:"B",Channel:"Store",Location:"Melbourne",Revenue:"70",Units:"3"}];
const salesFixture={id:"integration-sales",sourceFileId:"sales-file",columns:[],rows:salesRows,inferred:{type:"sales" as const,confidence:1,reasons:[]},confirmedType:"sales" as const,status:"staged" as const,warnings:[],errors:[]};
const salesMappings=suggestFieldMappings(salesFixture.id,Object.keys(salesRows[0]!)).map(mapping=>({ ...mapping,status:["period","entityId","channelId","locationId","revenue","units"].includes(mapping.canonicalField)?"mapped" as const:mapping.status }));
const integrationWorkspace:ImportWorkspace={...workspace,datasets:[integrationFinance,salesFixture],mappings:[...financeMappings,...salesMappings],rules:[{id:"integration-rule",companyId:importCompany.id,priority:1,kind:"exact",value:"41001",statement:"pnl",line:"revenue",sign:1}],scenarios:[{datasetId:integrationFinance.id,scenarioId:"actual-live",kind:"actual",label:"Actual"}]};
const integration=buildImportedDataset(integrationWorkspace); const integrationData=integration.dataset!; setReportingDataset(integrationData);
expect("finance dimensions materialise and preserve leading zeroes", integrationData.dimensions.entities.some(e=>e.id==="A")&&integrationData.dimensions.entities.some(e=>e.id==="B")&&integrationData.dimensions.costCentres.some(c=>c.id==="0040")&&integrationData.dimensions.costCentres.some(c=>c.id==="0100")&&integrationData.dimensions.departments.some(d=>d.id==="OPS"),"imported finance dimensions are missing or leading zeroes changed");
expect("finance facts reference canonical dimensions", integrationData.financeRecords.every(r=>integrationData.dimensions.entities.some(e=>e.id===r.entityId)&&(!r.costCentreId||integrationData.dimensions.costCentres.some(c=>c.id===r.costCentreId))&&(!r.departmentId||integrationData.dimensions.departments.some(d=>d.id===r.departmentId))),"finance fact references a nonexistent dimension");
expect("group consolidates imported entities", (selectLines({entityId:"company",basis:"MTD",periodId:"2026-07"}).actual.revenue??0)===300&&(selectLines({entityId:"A",basis:"MTD",periodId:"2026-07"}).actual.revenue??0)===100,"group/entity selectors did not aggregate imported members");
expect("monthly sales transform and capabilities", integrationData.salesRecords.length===2&&integrationData.capabilities?.hasSales===true&&integrationData.capabilities.hasWeeklySales===false&&integrationData.dimensions.channels.length===2&&integrationData.dimensions.locations.length===2&&integrationData.dimensions.products.length===0&&integrationData.dimensions.customers.length===0,"monthly sales facts/dimensions/capabilities are wrong");
expect("monthly sales selector uses imported facts", selectSalesTotals({entityId:"company",basis:"MTD",periodId:"2026-07"}).revenue===100,"monthly sales selector did not read imported sales");
const weeklyCalendarRows=[1,2,3].map(week=>({"Week Start":`2026-07-0${week}`,"Week End":`2026-07-0${week+1}`,Fin_Period:`20270${week}`,"Fiscal Week":String(week),"Fiscal Month":"1","Fiscal Quarter":"1",FY:"FY27"}));
const weeklyCalendar={id:"weekly-calendar",sourceFileId:"calendar-file",columns:[],rows:weeklyCalendarRows,inferred:{type:"financial_calendar" as const,confidence:1,reasons:[]},confirmedType:"financial_calendar" as const,status:"staged" as const,warnings:[],errors:[]};
const weeklyRows=[{Period:"202701",Entity:"A",Channel:"Online",Revenue:"11",Units:"1"},{Period:"202702",Entity:"B",Channel:"Store",Revenue:"22",Units:"2"}];
const weeklyFixture={...salesFixture,id:"weekly-sales",rows:weeklyRows}; const weeklyMappings=suggestFieldMappings(weeklyFixture.id,Object.keys(weeklyRows[0]!)).map(mapping=>({...mapping,status:["period","entityId","channelId","revenue","units"].includes(mapping.canonicalField)?"mapped" as const:mapping.status}));
const weeklyImported=buildImportedDataset({...integrationWorkspace,datasets:[integrationFinance,salesFixture,weeklyCalendar,weeklyFixture],mappings:[...financeMappings,...salesMappings,...weeklyMappings]}); const weeklyData=weeklyImported.dataset!; setReportingDataset(weeklyData);
expect("weekly external calendar tokens resolve", weeklyData.weeks.length===3&&weeklyData.weeks[0]?.externalPeriodToken==="202701"&&weeklyData.weeklySalesRecords.map(r=>r.periodId).join(",")==="FY27-W01,FY27-W02","external Fin_Period did not resolve to canonical weekly IDs");
expect("weekly sales dimensions capabilities and totals", weeklyData.capabilities?.hasSales===true&&weeklyData.capabilities.hasWeeklySales===true&&weeklyData.weeklySalesRecords.every(r=>weeklyData.dimensions.entities.some(e=>e.id===r.entityId)&&(!r.channelId||weeklyData.dimensions.channels.some(c=>c.id===r.channelId)))&&weeklyData.weeklySalesRecords.reduce((sum,r)=>sum+r.revenue,0)===33,"weekly sales facts/dimensions/capabilities are invalid");
const invalidWeekly=buildImportedDataset({...integrationWorkspace,datasets:[integrationFinance,weeklyCalendar,{...weeklyFixture,rows:[...weeklyRows,{Period:"209999",Entity:"A",Channel:"Online",Revenue:"99",Units:"1"}]}],mappings:[...financeMappings,...weeklyMappings]});
expect("unknown weekly token is surfaced and excluded", !invalidWeekly.dataset&&invalidWeekly.issues.some(issue=>issue.datasetId==="sales"&&issue.message.includes("209999")),"unresolved weekly token was not surfaced as a blocking onboarding issue");

// Runtime uses the same controller as ReportingDataProvider, including production activation.
const runtimeStore = new MemoryImportWorkspaceStore();
const runtime = new ReportingRuntime(runtimeStore, new MockDataAdapter());
const runtimeA: ImportWorkspace = {...integrationWorkspace, company:{...integrationWorkspace.company,id:"runtime-a",profile:{...integrationWorkspace.company.profile,companyName:"Runtime A"}}, datasets:[integrationFinance,salesFixture,weeklyCalendar,weeklyFixture],mappings:[...financeMappings,...salesMappings,...weeklyMappings]};
const liveA = await runtime.activate(runtimeA);
expect("runtime activation publishes imported dataset",getReportingDataset()===liveA.dataset && selectLines({entityId:"company",basis:"MTD",periodId:"2026-07"}).actual.revenue===300 && selectSalesTotals({entityId:"company",basis:"MTD",periodId:"2026-07"}).revenue===100,"provider runtime did not publish production fixture values");
expect("weekly selector reads authoritative imported weeks",selectWeeklySales({entityId:"company",basis:"MTD",periodId:"2026-07"}).map(point=>point.revenue).join(",")==="11,22","weekly selector dropped valid imported calendar facts");
expect("weekly group equals child selections",selectWeeklySales({entityId:"A",basis:"MTD",periodId:"2026-07"}).reduce((sum,point)=>sum+point.revenue,0)===11 && selectWeeklySales({entityId:"B",basis:"MTD",periodId:"2026-07"}).reduce((sum,point)=>sum+point.revenue,0)===22,"weekly entity filtering leaked other entities");
expect("unsupported selectors return unavailable without evaluation",selectAvailable("balance",()=>{throw new Error("Unsupported balance selector invoked");})===null && !selectModuleAvailability("forecast").available && !selectModuleAvailability("kpis").available,"missing sources became computed values");
const unavailableMarkup=renderToStaticMarkup(createElement(ReportingUnavailable,{message:selectModuleAvailability("balance").message}));
expect("unavailable module has professional status",unavailableMarkup.includes("Balance Sheet data has not been configured") && unavailableMarkup.includes('role="status"') && !unavailableMarkup.includes("Northpoint"),"unavailable state leaked demo content");
const savedRuntimeA = await runtimeStore.load("runtime-a");
expect("activated snapshot and decisions are versioned and saved",savedRuntimeA?.activationSchemaVersion===1 && savedRuntimeA.activatedDataset?.id===liveA.dataset.id && savedRuntimeA.mappings.length===runtimeA.mappings.length && savedRuntimeA.scenarios[0]?.scenarioId==="actual-live","runtime did not persist activation and review decisions");
const restoredRuntime = new ReportingRuntime(runtimeStore,new MockDataAdapter());
const restoredA=await restoredRuntime.restore();
expect("new runtime restores last active imported company",restoredA.workspace?.company.id==="runtime-a" && getReportingDataset().id===liveA.dataset.id && selectSalesTotals({entityId:"company",basis:"MTD",periodId:"2026-07"}).revenue===100,"refresh reverted to demo or lost facts");
const runtimeB:ImportWorkspace={...integrationWorkspace,company:{...integrationWorkspace.company,id:"runtime-b",profile:{...integrationWorkspace.company.profile,companyName:"Runtime B",reportingCurrency:"NZD"}},datasets:[{...integrationFinance,rows:[{Period:"2026-07",Entity:"B-only",Account:"41001",Amount:"700",CostCentre:"0090",Department:"HQ"}]}],mappings:financeMappings};
await restoredRuntime.activate(runtimeB);
expect("second company isolates facts and capabilities",selectLines({entityId:"company",basis:"MTD",periodId:"2026-07"}).actual.revenue===700 && !selectModuleAvailability("sales").available && getReportingDataset().profile.reportingCurrency==="NZD","company B retained company A values");
const switchRevision=getReportingDatasetRevision();
await restoredRuntime.switchCompany("demo");
expect("explicit demo switch restores demo",getReportingDataset().source==="demo" && selectModuleAvailability("balance").available,"explicit demo switch did not restore adapter behavior");
await restoredRuntime.switchCompany("runtime-a");
expect("demo imported switching invalidates selector cache",getReportingDatasetRevision()>switchRevision && selectSalesTotals({entityId:"company",basis:"MTD",periodId:"2026-07"}).revenue===100 && getReportingDataset().dimensions.entities.every(entity=>["company","A","B"].includes(entity.id)),"stale dataset/cache values leaked across switches");
expect("imported runtime has no demo narrative or dimensions",!getReportingDataset().forecastConfiguration && getReportingDataset().operationalRecords.length===0 && getReportingDataset().dataQuality.issues.length===0 && getReportingDataset().dimensions.products.length===0 && getReportingDataset().dimensions.customers.length===0,"imported runtime contains demo-only facts");
let blockedRuntime=false;
try {await restoredRuntime.activate({...runtimeA,scenarios:[]});} catch {blockedRuntime=true;}
expect("runtime rejects blocked activation without switching",blockedRuntime && getReportingDataset().profile.companyName==="Runtime A" && await runtimeStore.getActiveCompany()==="runtime-a","blocked activation changed active company");
const reviewMarkup=renderToStaticMarkup(createElement(ActivationReview,{workspace:runtimeA,result:buildImportedDataset(runtimeA)}));
expect("activation review presents production results and reconciliation lineage",reviewMarkup.includes("Activation review") && reviewMarkup.includes("Capabilities") && reviewMarkup.includes("Reconciliation evidence") && reviewMarkup.includes("Mapped source → canonical facts") && activationBlockers(buildImportedDataset(runtimeA)).length===0,"review omitted production reconciliation evidence");
expect("activation review exposes blockers",activationBlockers(buildImportedDataset({...runtimeA,scenarios:[]})).some(message=>message.includes("scenario")),"activation review hid production blockers");

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
