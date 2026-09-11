import { dataset } from "@/data/mock";
import type { PeriodSelection, StatementLine, StatementRow } from "@/domain/models";
import {
  aggregateLines, periodsForBasis, priorYearPeriods, resolveEntityIds,
  selectComparableBudget, selectLines, type LineTotals,
} from "./core";

const accountIndex = new Map(
  dataset.dimensions.accounts.map((account) => [account.id, account]),
);

/**
 * STATEMENT CONSTRUCTION
 * ---------------------------------------------------------------------------
 * The shape of each statement is declared as data. A client with a different
 * presentation order changes this table, not a component. `inverse` marks the
 * lines where spending less than plan is favourable, which is what lets the
 * variance colouring be correct on a cost line without the table knowing what
 * "Cost of Sales" means.
 */

interface LineSpec {
  line: StatementLine;
  label: string;
  emphasis: StatementRow["emphasis"];
  depth?: number;
  inverse?: boolean;
  /** A caption row with no figures, e.g. "Assets". */
  section?: string;
}

const PNL_SPEC: LineSpec[] = [
  { line: "revenue", label: "Revenue", emphasis: "subtotal" },
  { line: "costOfSales", label: "Cost of Sales", emphasis: "detail", depth: 1, inverse: true },
  { line: "grossProfit", label: "Gross Profit", emphasis: "subtotal" },
  { line: "operatingCosts", label: "Operating Costs", emphasis: "detail", depth: 1, inverse: true },
  { line: "ebitda", label: "EBITDA", emphasis: "subtotal" },
  {
    line: "depreciationAmortisation",
    label: "Depreciation & Amortisation",
    emphasis: "detail", depth: 1, inverse: true,
  },
  { line: "ebit", label: "EBIT", emphasis: "subtotal" },
  { line: "interest", label: "Interest", emphasis: "detail", depth: 1, inverse: true },
  { line: "tax", label: "Tax", emphasis: "detail", depth: 1, inverse: true },
  { line: "netProfit", label: "Net Profit", emphasis: "total" },
];

const BALANCE_SPEC: LineSpec[] = [
  { line: "cash", label: "Cash and cash equivalents", emphasis: "detail", section: "Assets" },
  { line: "tradeReceivables", label: "Trade receivables", emphasis: "detail" },
  { line: "inventory", label: "Inventory", emphasis: "detail" },
  { line: "otherCurrentAssets", label: "Other current assets", emphasis: "detail" },
  { line: "totalCurrentAssets", label: "Total current assets", emphasis: "subtotal" },
  { line: "propertyPlantEquipment", label: "Property, plant and equipment", emphasis: "detail" },
  { line: "intangibleAssets", label: "Intangible assets", emphasis: "detail" },
  { line: "rightOfUseAssets", label: "Right-of-use assets", emphasis: "detail" },
  { line: "otherNonCurrentAssets", label: "Other non-current assets", emphasis: "detail" },
  { line: "totalNonCurrentAssets", label: "Total non-current assets", emphasis: "subtotal" },
  { line: "totalAssets", label: "Total assets", emphasis: "total" },

  { line: "tradePayables", label: "Trade payables", emphasis: "detail", section: "Liabilities", inverse: true },
  { line: "borrowingsCurrent", label: "Borrowings (current)", emphasis: "detail", inverse: true },
  { line: "leaseLiabilitiesCurrent", label: "Lease liabilities (current)", emphasis: "detail", inverse: true },
  { line: "otherCurrentLiabilities", label: "Other current liabilities", emphasis: "detail", inverse: true },
  { line: "totalCurrentLiabilities", label: "Total current liabilities", emphasis: "subtotal", inverse: true },
  { line: "borrowingsNonCurrent", label: "Borrowings (non-current)", emphasis: "detail", inverse: true },
  { line: "leaseLiabilitiesNonCurrent", label: "Lease liabilities (non-current)", emphasis: "detail", inverse: true },
  { line: "otherNonCurrentLiabilities", label: "Other non-current liabilities", emphasis: "detail", inverse: true },
  { line: "totalNonCurrentLiabilities", label: "Total non-current liabilities", emphasis: "subtotal", inverse: true },
  { line: "totalLiabilities", label: "Total liabilities", emphasis: "total", inverse: true },

  { line: "shareCapital", label: "Share capital", emphasis: "detail", section: "Equity" },
  { line: "retainedEarnings", label: "Retained earnings", emphasis: "detail" },
  { line: "totalEquity", label: "Total equity", emphasis: "subtotal" },
  { line: "totalLiabilitiesAndEquity", label: "Total liabilities and equity", emphasis: "total" },
];

export type StatementKey = "pnl" | "balance" | "cashflow";

function buildRows(
  spec: LineSpec[],
  actual: LineTotals,
  budget: LineTotals,
  priorYear: LineTotals,
  forecast: LineTotals,
): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const item of spec) {
    if (item.section) {
      rows.push({
        line: item.line,
        label: item.section,
        emphasis: "detail",
        actual: 0,
        isSection: true,
      });
    }
    rows.push({
      line: item.line,
      label: item.label,
      emphasis: item.emphasis,
      depth: item.depth,
      inverse: item.inverse,
      actual: actual[item.line] ?? 0,
      budget: budget[item.line],
      priorYear: priorYear[item.line],
      forecast: forecast[item.line],
    });
  }
  return rows;
}

export function selectProfitAndLoss(selection: PeriodSelection): StatementRow[] {
  const lines = selectLines(selection);
  // Budget is restricted to closed periods so the variance is like-for-like.
  const budget = selectComparableBudget(selection);
  return buildRows(PNL_SPEC, lines.actual, budget, lines.priorYear, lines.forecast);
}

/**
 * A balance sheet is read against the PRIOR MONTH and the prior year, not
 * against a budget — few companies budget a balance sheet line by line, and
 * the movement since last close is the question actually being asked. The
 * comparative therefore differs from the P&L's, which is why it is decided
 * here rather than in the table component.
 */
export function selectBalanceSheet(selection: PeriodSelection): StatementRow[] {
  const lines = selectLines(selection);
  const entityIds = resolveEntityIds(selection.entityId);

  const closed = periodsForBasis("R12", selection.periodId).filter((p) => p.isActual);
  const priorMonth = closed[closed.length - 2];
  const priorMonthTotals = priorMonth
    ? aggregateLines([priorMonth.id], entityIds, "actual")
    : {};

  return buildRows(
    BALANCE_SPEC,
    lines.actual,
    priorMonthTotals,
    lines.priorYear,
    lines.forecast,
  );
}

/**
 * Operating cost composition, grouped by the cost category declared on the
 * chart of accounts. The grouping is a property of the account dimension, so a
 * client with different cost categories gets a different chart with no code
 * change.
 */
export interface CostCategoryTotal {
  id: string;
  name: string;
  actual: number;
  budget: number;
  priorYear: number;
  share: number;
  variance: number;
}

export function selectCostComposition(selection: PeriodSelection): CostCategoryTotal[] {
  const entityIds = resolveEntityIds(selection.entityId);
  const window = periodsForBasis(selection.basis, selection.periodId);
  const actualIds = window.filter((p) => p.isActual).map((p) => p.id);
  const priorIds = priorYearPeriods(selection.basis, selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);

  const sum = (periodIds: string[], scenario: "actual" | "budget") => {
    const periodSet = new Set(periodIds);
    const entitySet = new Set(entityIds);
    const byCategory = new Map<string, number>();
    for (const record of dataset.financeRecords) {
      if (!periodSet.has(record.periodId) || !entitySet.has(record.entityId)) continue;
      const account = accountIndex.get(record.accountId);
      if (!account?.costCategory) continue;
      const value = record[scenario];
      if (value === undefined) continue;
      byCategory.set(
        account.costCategory,
        (byCategory.get(account.costCategory) ?? 0) + value,
      );
    }
    return byCategory;
  };

  const actual = sum(actualIds, "actual");
  const budget = sum(actualIds, "budget");
  const prior = sum(priorIds, "actual");
  const total = [...actual.values()].reduce((a, b) => a + b, 0);

  return [...actual.entries()]
    .map(([name, value]) => ({
      id: name,
      name,
      actual: value,
      budget: budget.get(name) ?? 0,
      priorYear: prior.get(name) ?? 0,
      share: total ? value / total : 0,
      // Signed so that positive is favourable: an underspend against plan.
      variance: (budget.get(name) ?? 0) - value,
    }))
    .sort((a, b) => b.actual - a.actual);
}
