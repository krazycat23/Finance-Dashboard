import { getReportingDataset } from "@/domain/data";
import type { CashFlowRecord, Period, PeriodSelection, StatementRow } from "@/domain/models";
import { periodsForBasis, priorYearPeriods, resolveEntityIds } from "./core";

/**
 * CASH FLOW SELECTION
 * ---------------------------------------------------------------------------
 * Cash flow lines are movements, not balances, and they are not GL accounts —
 * they are derived from the same engine that produced the balance sheet. The
 * closing cash figure here is therefore the same number the Balance Sheet page
 * prints, by construction rather than by coincidence.
 */

export type CashScenario = "actual" | "budget" | "forecast";

function scenarioId(scenario: CashScenario): string {
  const dataset = getReportingDataset();
  const id = dataset.scenarioRoles[scenario];
  if (!dataset.scenarios.some((item) => item.id === id)) throw new Error(`Dataset does not provide a ${scenario} scenario.`);
  return id;
}

function scenarioRecords(scenario: CashScenario): CashFlowRecord[] {
  const id = scenarioId(scenario);
  return getReportingDataset().cashFlowRecords.filter((record) => record.scenarioId === id);
}

export interface CashFlowTotals {
  ebitda: number;
  workingCapitalMovement: number;
  interest: number;
  tax: number;
  operatingCashFlow: number;
  capex: number;
  investingCashFlow: number;
  dividends: number;
  financingCashFlow: number;
  netCashMovement: number;
  openingCash: number;
  closingCash: number;
  freeCashFlow: number;
}

function sum(months: CashFlowRecord[]): CashFlowTotals {
  const total = (get: (m: CashFlowRecord) => number) =>
    months.reduce((s, m) => s + get(m), 0);

  const operatingCashFlow = total((m) => m.operatingCashFlow);
  const investingCashFlow = total((m) => m.investingCashFlow);

  return {
    ebitda: total((m) => m.ebitda),
    workingCapitalMovement: total((m) => m.workingCapitalMovement),
    interest: total((m) => m.interest),
    tax: total((m) => m.tax),
    operatingCashFlow,
    capex: total((m) => m.capex),
    investingCashFlow,
    dividends: total((m) => m.dividends),
    financingCashFlow: total((m) => m.financingCashFlow),
    netCashMovement: total((m) => m.netCashMovement),
    openingCash: 0,
    closingCash: 0,
    // Free cash flow is operating cash flow after capex — the definition a
    // board uses. It is computed here so no page invents its own version.
    freeCashFlow: operatingCashFlow + investingCashFlow,
  };
}

function monthsFor(
  scenario: CashScenario,
  periods: Period[],
  entityIds: string[],
): CashFlowRecord[] {
  const periodSet = new Set(periods.map((p) => p.id));
  const entitySet = new Set(entityIds);
  return scenarioRecords(scenario).filter(
    (m) => periodSet.has(m.periodId) && entitySet.has(m.entityId),
  );
}

/** Closing cash across a set of entities at one period. */
function cashAt(periodId: string, entityIds: string[], scenario: CashScenario): number {
  const entitySet = new Set(entityIds);
  return scenarioRecords(scenario)
    .filter((m) => m.periodId === periodId && entitySet.has(m.entityId))
    .reduce((s, m) => s + m.cash, 0);
}

/**
 * Cash flow totals for an explicit period window. Exported so the KPI layer
 * can build a real sparkline and a real prior-year comparative instead of
 * scaling the current figure by a made-up factor.
 */
export function cashFlowTotalsFor(
  periodIds: string[],
  entityIds: string[],
  scenario: CashScenario = "actual",
): CashFlowTotals {
  const periodSet = new Set(periodIds);
  const entitySet = new Set(entityIds);
  return sum(
    scenarioRecords(scenario).filter(
      (m) => periodSet.has(m.periodId) && entitySet.has(m.entityId),
    ),
  );
}

export function selectCashFlow(
  selection: PeriodSelection,
  scenario: CashScenario = "actual",
): CashFlowTotals {
  const entityIds = resolveEntityIds(selection.entityId);
  const window = periodsForBasis(selection.basis, selection.periodId).filter(
    (p) => scenario === "actual" ? p.isActual : true,
  );
  if (window.length === 0) {
    return { ...sum([]), openingCash: 0, closingCash: 0 };
  }

  const totals = sum(monthsFor(scenario, window, entityIds));

  // Opening cash is the closing balance of the period BEFORE the window.
  const allPeriods = getReportingDataset().periods;
  const firstIndex = allPeriods.findIndex((p) => p.id === window[0].id);
  const openingPeriod = allPeriods[firstIndex - 1];

  totals.openingCash = openingPeriod ? cashAt(openingPeriod.id, entityIds, scenario) : 0;
  totals.closingCash = cashAt(window[window.length - 1].id, entityIds, scenario);

  return totals;
}

export function selectPriorYearCashFlow(selection: PeriodSelection): CashFlowTotals {
  const entityIds = resolveEntityIds(selection.entityId);
  const window = priorYearPeriods(selection.basis, selection.periodId).filter(
    (p) => p.isActual,
  );
  return sum(monthsFor("actual", window, entityIds));
}

/** The cash flow bridge: opening cash, the three activities, closing cash. */
export interface BridgeSegment {
  label: string;
  value: number;
  kind: "start" | "delta" | "end";
}

export function selectCashBridge(selection: PeriodSelection): BridgeSegment[] {
  const t = selectCashFlow(selection);
  return [
    { label: "Opening cash", value: t.openingCash, kind: "start" },
    { label: "Operating", value: t.operatingCashFlow, kind: "delta" },
    { label: "Investing", value: t.investingCashFlow, kind: "delta" },
    { label: "Financing", value: t.financingCashFlow, kind: "delta" },
    { label: "Closing cash", value: t.closingCash, kind: "end" },
  ];
}

/** Statement rows for the cash flow table. */
export function selectCashFlowRows(selection: PeriodSelection): StatementRow[] {
  const actual = selectCashFlow(selection);
  const budget = selectCashFlow(selection, "budget");
  const priorYear = selectPriorYearCashFlow(selection);

  const row = (
    label: string,
    get: (t: CashFlowTotals) => number,
    emphasis: StatementRow["emphasis"] = "detail",
    inverse = false,
  ): StatementRow => ({
    line: "operatingCashFlow",
    label,
    emphasis,
    inverse,
    actual: get(actual),
    budget: get(budget),
    priorYear: get(priorYear),
  });

  return [
    row("EBITDA", (t) => t.ebitda, "subtotal"),
    row("Working capital movement", (t) => -t.workingCapitalMovement, "detail", false),
    row("Interest paid", (t) => -t.interest, "detail", true),
    row("Tax paid", (t) => -t.tax, "detail", true),
    row("Operating cash flow", (t) => t.operatingCashFlow, "subtotal"),
    row("Capital expenditure", (t) => -t.capex, "detail", true),
    row("Investing cash flow", (t) => t.investingCashFlow, "subtotal"),
    row("Dividends paid", (t) => -t.dividends, "detail", true),
    row("Debt and lease repayments", (t) => t.financingCashFlow + t.dividends, "detail", true),
    row("Financing cash flow", (t) => t.financingCashFlow, "subtotal"),
    row("Net movement in cash", (t) => t.netCashMovement, "total"),
  ];
}

/** Monthly closing-cash series for the trend chart. */
export function selectCashTrend(
  periods: Period[],
  entityId: string,
): { period: Period; actual?: number; forecast: number; budget: number }[] {
  const entityIds = resolveEntityIds(entityId);
  return periods.map((period) => ({
    period,
    actual: period.isActual ? cashAt(period.id, entityIds, "actual") : undefined,
    forecast: cashAt(period.id, entityIds, "forecast"),
    budget: cashAt(period.id, entityIds, "budget"),
  }));
}
