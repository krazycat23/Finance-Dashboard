import { getReportingDataset, getReportingDatasetRevision } from "@/domain/data";
import type {
  Period,
  PeriodBasis,
  PeriodSelection,
  Scenario,
  StatementLine,
} from "@/domain/models";

/**
 * SELECTOR CORE
 * ---------------------------------------------------------------------------
 * Pure functions from (dataset, selection) to view models. This is the only
 * layer that knows how facts are stored; pages and components consume its
 * output. Replacing the mock dataset with a warehouse adapter means
 * reimplementing this file and nothing above it.
 *
 * Everything financial is aggregated through the account -> statement line
 * mapping, so an unmapped account genuinely drops out of the totals and shows
 * up as an exception on the Data & Mapping page rather than silently
 * distorting a subtotal.
 */

const dataset = getReportingDataset;

/** Entity plus all descendants — "Group" is the sum of its children. */
export function resolveEntityIds(entityId: string): string[] {
  const children = dataset().dimensions.entities.filter((e) => e.parentId === entityId);
  if (children.length === 0) return [entityId];
  return children.flatMap((child) => resolveEntityIds(child.id));
}

export function getPeriod(periodId: string): Period | undefined {
  return dataset().periods.find((period) => period.id === periodId);
}

export function actualPeriods(): Period[] {
  return dataset().periods.filter((p) => p.isActual);
}

export function currentPeriod(): Period {
  const period = getPeriod(dataset().currentPeriodId);
  if (!period) throw new Error("Configured current period is not in the dataset.");
  return period;
}

/**
 * The periods a basis covers, ending at (and including) `periodId`.
 * A basis never returns periods beyond the reporting cut-off unless the
 * caller explicitly asks for forward periods elsewhere.
 */
export function periodsForBasis(basis: PeriodBasis, periodId: string): Period[] {
  const periods = dataset().periods;
  const anchor = periods.find((period) => period.id === periodId);
  if (!anchor) return [];
  const throughAnchor = (ids: string[]) => {
    const members = periods.filter((period) => ids.includes(period.id));
    const anchorIndex = members.findIndex((period) => period.id === anchor.id);
    return anchorIndex >= 0 ? members.slice(0, anchorIndex + 1) : members;
  };

  switch (basis) {
    case "MTD":
      return [anchor];
    case "QTD": {
      if (anchor.quarterPeriodIds) {
        return throughAnchor(anchor.quarterPeriodIds);
      }
      const quarterStart = Math.floor((anchor.fiscalPeriod - 1) / 3) * 3 + 1;
      return periods.filter(
        (p) =>
          p.fiscalYear === anchor.fiscalYear &&
          p.fiscalPeriod >= quarterStart &&
          p.fiscalPeriod <= anchor.fiscalPeriod,
      );
    }
    case "YTD":
      if (anchor.fiscalYearPeriodIds) {
        return throughAnchor(anchor.fiscalYearPeriodIds);
      }
      return periods.filter(
        (p) => p.fiscalYear === anchor.fiscalYear && p.fiscalPeriod <= anchor.fiscalPeriod,
      );
    case "FY":
      if (anchor.fiscalYearPeriodIds) {
        const ids = new Set(anchor.fiscalYearPeriodIds);
        return periods.filter((period) => ids.has(period.id));
      }
      return periods.filter((p) => p.fiscalYear === anchor.fiscalYear);
    case "R12": {
      const index = periods.findIndex((p) => p.id === anchor.id);
      return periods.slice(Math.max(0, index - 11), index + 1);
    }
  }
}

/** The equivalent basis window one fiscal year earlier. */
export function priorYearPeriods(basis: PeriodBasis, periodId: string): Period[] {
  const periods = dataset().periods;
  const anchor = periods.find((period) => period.id === periodId);
  if (!anchor) return [];
  const priorAnchor = anchor.priorYearPeriodId
    ? periods.find((period) => period.id === anchor.priorYearPeriodId)
    : undefined;
  return priorAnchor ? periodsForBasis(basis, priorAnchor.id) : [];
}

export type LineTotals = Partial<Record<StatementLine, number>>;

const lineCache = new Map<string, LineTotals>();

/**
 * Sum finance records into canonical statement lines.
 *
 * Values are stored as canonical positive magnitudes. Calculation roles keep
 * gross sales and contra-revenue separate; derived subtotals are computed here
 * so every consumer gets the same net sales and gross profit.
 */
export function aggregateLines(
  periodIds: string[],
  entityIds: string[],
  scenario: Scenario,
): LineTotals {
  const key = `${getReportingDatasetRevision()}|${scenario}|${entityIds.join(",")}|${periodIds.join(",")}`;
  const cached = lineCache.get(key);
  if (cached) return cached;

  const periodSet = new Set(periodIds);
  const entitySet = new Set(entityIds);
  const totals: LineTotals = {};

  const data = dataset();
  const accountById = new Map(data.dimensions.accounts.map((account) => [account.id, account]));
  for (const record of data.financeRecords) {
    if (!periodSet.has(record.periodId)) continue;
    if (!entitySet.has(record.entityId)) continue;

    const account = accountById.get(record.accountId);
    // An unmapped account contributes nothing and is reported as an exception.
    if (!account || account.mappingStatus === "unmapped" || account.mappingStatus === "excluded") {
      continue;
    }

    const roleId = scenario === "priorYear" ? undefined : data.scenarioRoles[scenario];
    const scenarioDefinition = roleId ? data.scenarios.find((definition) => definition.id === roleId) : undefined;
    const value = scenarioDefinition
      ? record.scenarioValues?.find((item) => item.scenarioId === scenarioDefinition.id)?.value ?? record[scenario]
      : record[scenario];
    if (value === undefined) continue;

    totals[account.line] = (totals[account.line] ?? 0) + value;
  }

  // Balance-sheet balances are point-in-time: summing them across periods is
  // meaningless, so for multi-period windows take the closing period only.
  if (periodIds.length > 1) {
    const closing = aggregateLines([periodIds[periodIds.length - 1]], entityIds, scenario);
    for (const line of BALANCE_SHEET_LINES) {
      if (closing[line] !== undefined) totals[line] = closing[line];
    }
  }

  applyDerivedLines(totals);
  lineCache.set(key, totals);
  return totals;
}

const BALANCE_SHEET_LINES: StatementLine[] = [
  "cash", "tradeReceivables", "inventory", "otherCurrentAssets",
  "propertyPlantEquipment", "intangibleAssets", "rightOfUseAssets",
  "otherNonCurrentAssets", "tradePayables", "borrowingsCurrent",
  "leaseLiabilitiesCurrent", "otherCurrentLiabilities", "borrowingsNonCurrent",
  "leaseLiabilitiesNonCurrent", "otherNonCurrentLiabilities", "shareCapital",
  "retainedEarnings",
];

/**
 * Compute every subtotal from its components, once.
 * No page may calculate a subtotal itself — that is how two screens end up
 * disagreeing about gross profit.
 */
function applyDerivedLines(t: LineTotals): void {
  const v = (line: StatementLine) => t[line] ?? 0;

  // Legacy/revenue roles represent an already-net revenue contribution.
  // Gross-sales roles are explicitly reduced by markdowns and returns.
  t.netSales = v("grossSales") - v("markdowns") - v("returns") + v("revenue");
  t.revenue = t.netSales;
  t.grossProfit = t.netSales - v("costOfSales");
  t.ebitda = t.grossProfit - v("operatingCosts");
  t.ebit = t.ebitda - v("depreciationAmortisation");
  t.netProfit = t.ebit - v("interest") - v("tax");

  t.totalCurrentAssets =
    v("cash") + v("tradeReceivables") + v("inventory") + v("otherCurrentAssets");
  t.totalNonCurrentAssets =
    v("propertyPlantEquipment") + v("intangibleAssets") +
    v("rightOfUseAssets") + v("otherNonCurrentAssets");
  t.totalAssets = t.totalCurrentAssets + t.totalNonCurrentAssets;

  t.totalCurrentLiabilities =
    v("tradePayables") + v("borrowingsCurrent") +
    v("leaseLiabilitiesCurrent") + v("otherCurrentLiabilities");
  t.totalNonCurrentLiabilities =
    v("borrowingsNonCurrent") + v("leaseLiabilitiesNonCurrent") +
    v("otherNonCurrentLiabilities");
  t.totalLiabilities = t.totalCurrentLiabilities + t.totalNonCurrentLiabilities;

  t.totalEquity = v("shareCapital") + v("retainedEarnings");
  t.totalLiabilitiesAndEquity = t.totalLiabilities + t.totalEquity;
}

/** Convenience: the four scenarios for one selection window. */
export interface ScenarioLines {
  actual: LineTotals;
  budget: LineTotals;
  forecast: LineTotals;
  priorYear: LineTotals;
  periods: Period[];
  entityIds: string[];
}

export function selectLines(selection: PeriodSelection): ScenarioLines {
  const entityIds = resolveEntityIds(selection.entityId);
  const windowPeriods = periodsForBasis(selection.basis, selection.periodId);
  // Actuals only: a YTD figure must never include periods that have not closed.
  const actualIds = windowPeriods.filter((p) => p.isActual).map((p) => p.id);
  const allIds = windowPeriods.map((p) => p.id);
  const priorIds = priorYearPeriods(selection.basis, selection.periodId).map((p) => p.id);

  return {
    actual: aggregateLines(actualIds, entityIds, "actual"),
    budget: aggregateLines(allIds, entityIds, "budget"),
    forecast: aggregateLines(allIds, entityIds, "forecast"),
    // Prior year reads the ACTUAL scenario over the prior-year window rather
    // than the `priorYear` field on current records: that field is itself a
    // lag of the actual, so reading it here would reach back two years.
    priorYear: aggregateLines(priorIds, entityIds, "actual"),
    periods: windowPeriods,
    entityIds,
  };
}

/**
 * Budget restricted to the same closed periods as the actual, which is the
 * only like-for-like comparison. Comparing nine months of actual against a
 * twelve-month plan is the most common variance error in management reporting.
 */
export function selectComparableBudget(selection: PeriodSelection): LineTotals {
  const entityIds = resolveEntityIds(selection.entityId);
  const actualIds = periodsForBasis(selection.basis, selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);
  return aggregateLines(actualIds, entityIds, "budget");
}

export function allPeriods(): Period[] { return dataset().periods; }
export function reportingDimensions() { return dataset().dimensions; }
