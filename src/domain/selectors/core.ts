import { companyConfig } from "@/config/company";
import { dataset } from "@/data/mock";
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

const { periods, financeRecords, dimensions } = dataset;

const periodById = new Map(periods.map((p) => [p.id, p]));
const accountById = new Map(dimensions.accounts.map((a) => [a.id, a]));

/** Entity plus all descendants — "Group" is the sum of its children. */
export function resolveEntityIds(entityId: string): string[] {
  const children = dimensions.entities.filter((e) => e.parentId === entityId);
  if (children.length === 0) return [entityId];
  return children.flatMap((child) => resolveEntityIds(child.id));
}

export function getPeriod(periodId: string): Period | undefined {
  return periodById.get(periodId);
}

export function actualPeriods(): Period[] {
  return periods.filter((p) => p.isActual);
}

export function currentPeriod(): Period {
  const period = periodById.get(companyConfig.currentPeriodId);
  if (!period) throw new Error("Configured current period is not in the dataset.");
  return period;
}

/**
 * The periods a basis covers, ending at (and including) `periodId`.
 * A basis never returns periods beyond the reporting cut-off unless the
 * caller explicitly asks for forward periods elsewhere.
 */
export function periodsForBasis(basis: PeriodBasis, periodId: string): Period[] {
  const anchor = periodById.get(periodId);
  if (!anchor) return [];

  switch (basis) {
    case "MTD":
      return [anchor];
    case "QTD": {
      const quarterStart = Math.floor((anchor.fiscalPeriod - 1) / 3) * 3 + 1;
      return periods.filter(
        (p) =>
          p.fiscalYear === anchor.fiscalYear &&
          p.fiscalPeriod >= quarterStart &&
          p.fiscalPeriod <= anchor.fiscalPeriod,
      );
    }
    case "YTD":
      return periods.filter(
        (p) => p.fiscalYear === anchor.fiscalYear && p.fiscalPeriod <= anchor.fiscalPeriod,
      );
    case "FY":
      return periods.filter((p) => p.fiscalYear === anchor.fiscalYear);
    case "R12": {
      const index = periods.findIndex((p) => p.id === anchor.id);
      return periods.slice(Math.max(0, index - 11), index + 1);
    }
  }
}

/** The equivalent basis window one fiscal year earlier. */
export function priorYearPeriods(basis: PeriodBasis, periodId: string): Period[] {
  const anchor = periodById.get(periodId);
  if (!anchor) return [];
  const index = periods.findIndex((p) => p.id === anchor.id);
  const priorAnchor = periods[index - 12];
  return priorAnchor ? periodsForBasis(basis, priorAnchor.id) : [];
}

export type LineTotals = Partial<Record<StatementLine, number>>;

const lineCache = new Map<string, LineTotals>();

/**
 * Sum finance records into canonical statement lines.
 *
 * Values are stored as positive magnitudes; the account's `sign` describes
 * presentation, not arithmetic. Derived subtotals are computed here so that
 * every consumer gets the same gross profit, not its own version of it.
 */
export function aggregateLines(
  periodIds: string[],
  entityIds: string[],
  scenario: Scenario,
): LineTotals {
  const key = `${scenario}|${entityIds.join(",")}|${periodIds.join(",")}`;
  const cached = lineCache.get(key);
  if (cached) return cached;

  const periodSet = new Set(periodIds);
  const entitySet = new Set(entityIds);
  const totals: LineTotals = {};

  for (const record of financeRecords) {
    if (!periodSet.has(record.periodId)) continue;
    if (!entitySet.has(record.entityId)) continue;

    const account = accountById.get(record.accountId);
    // An unmapped account contributes nothing and is reported as an exception.
    if (!account || account.mappingStatus === "unmapped" || account.mappingStatus === "excluded") {
      continue;
    }

    const value = record[scenario];
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

  t.grossProfit = v("revenue") - v("costOfSales");
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

export { periods as allPeriods, dimensions };
