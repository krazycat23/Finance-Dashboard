import { getMetric } from "@/domain/metrics";
import { calculateVariance, type Variance } from "@/domain/metrics/variance";
import type { MetricDefinition } from "@/domain/metrics/types";
import type { Period, PeriodSelection } from "@/domain/models";
import { dataset } from "@/data/mock";
import { cashFlowTotalsFor, type CashFlowTotals } from "./cashflow";
import { salesTotalsFor, type SalesTotals } from "./sales";
import {
  aggregateLines,
  periodsForBasis,
  priorYearPeriods,
  resolveEntityIds,
  selectComparableBudget,
  selectLines,
  type LineTotals,
} from "./core";

/**
 * KPI SELECTION
 * ---------------------------------------------------------------------------
 * A KPI is requested by metric id. Everything else — its unit, its precision,
 * whether the movement is favourable — comes from the metric registry, so the
 * KPI strip is genuinely reusable across companies and pages.
 */

export interface KpiDatum {
  metric: MetricDefinition;
  value: number;
  comparison?: number;
  comparisonLabel: string;
  variance?: Variance;
  /** Values for the sparkline, oldest first. Always actuals only. */
  series: number[];
  /** Secondary comparison shown beneath the primary, e.g. vs budget. */
  secondary?: { label: string; variance: Variance };
}

/** How a KPI value is extracted from a set of statement lines. */
type Resolver = (lines: LineTotals) => number | undefined;

/**
 * Metric resolvers. Ratios are computed here, once, from their components —
 * never by a component dividing two numbers it happens to have to hand.
 */
const RESOLVERS: Record<string, Resolver> = {
  revenue: (l) => l.revenue,
  totalSales: (l) => l.revenue,
  costOfSales: (l) => l.costOfSales,
  grossProfit: (l) => l.grossProfit,
  grossMargin: (l) => (l.revenue ? (l.grossProfit ?? 0) / l.revenue : undefined),
  operatingCosts: (l) => l.operatingCosts,
  ebitda: (l) => l.ebitda,
  ebitdaMargin: (l) => (l.revenue ? (l.ebitda ?? 0) / l.revenue : undefined),
  ebit: (l) => l.ebit,
  netProfit: (l) => l.netProfit,
  depreciationAmortisation: (l) => l.depreciationAmortisation,

  cash: (l) => l.cash,
  inventory: (l) => l.inventory,
  tradeReceivables: (l) => l.tradeReceivables,
  tradePayables: (l) => l.tradePayables,
  netAssets: (l) => (l.totalAssets ?? 0) - (l.totalLiabilities ?? 0),
  netDebt: (l) =>
    (l.borrowingsCurrent ?? 0) + (l.borrowingsNonCurrent ?? 0) +
    (l.leaseLiabilitiesCurrent ?? 0) + (l.leaseLiabilitiesNonCurrent ?? 0) -
    (l.cash ?? 0),
  workingCapital: (l) => (l.totalCurrentAssets ?? 0) - (l.totalCurrentLiabilities ?? 0),
  currentRatio: (l) =>
    l.totalCurrentLiabilities ? (l.totalCurrentAssets ?? 0) / l.totalCurrentLiabilities : undefined,
  quickRatio: (l) =>
    l.totalCurrentLiabilities
      ? ((l.totalCurrentAssets ?? 0) - (l.inventory ?? 0)) / l.totalCurrentLiabilities
      : undefined,
  cashRatio: (l) =>
    l.totalCurrentLiabilities ? (l.cash ?? 0) / l.totalCurrentLiabilities : undefined,
};

/**
 * Commercial metrics resolve against the sales facts rather than the ledger.
 * Ratios are computed from their components here, once — a component must
 * never divide two numbers it happens to be holding.
 */
const SALES_RESOLVERS: Record<string, (t: SalesTotals) => number | undefined> = {
  totalSales: (t) => t.revenue,
  likeForLikeSales: (t) => t.likeForLike,
  likeForLikeGrowth: (t) =>
    t.likeForLikePriorYear ? t.likeForLike / t.likeForLikePriorYear - 1 : undefined,
  averageTransactionValue: (t) => t.averageTransactionValue,
  units: (t) => t.units,
  orders: (t) => t.orders,
  transactions: (t) => t.transactions,
  traffic: (t) => t.traffic,
  conversion: (t) => t.conversion,
  unitsPerTransaction: (t) => t.unitsPerTransaction,
};

function resolve(metricId: string, lines: LineTotals): number | undefined {
  const resolver = RESOLVERS[metricId];
  return resolver ? resolver(lines) : undefined;
}

/**
 * Cash flow metrics are movements produced by the cash flow engine, not ledger
 * balances, so they resolve against the cash flow totals.
 */
const CASHFLOW_RESOLVERS: Record<string, (t: CashFlowTotals) => number> = {
  operatingCashFlow: (t) => t.operatingCashFlow,
  freeCashFlow: (t) => t.freeCashFlow,
};

/** Working-capital days need trailing-twelve-month flows, so they get their own path. */
const DAY_METRICS = new Set(["dso", "dpo", "dio", "cashConversionCycle"]);

function isSalesMetric(metricId: string): boolean {
  // Total sales exists in both worlds; prefer the ledger so the Overview and
  // the Sales page report one revenue, not two.
  return metricId !== "totalSales" && metricId in SALES_RESOLVERS;
}

function resolveSales(metricId: string, totals: SalesTotals): number | undefined {
  return SALES_RESOLVERS[metricId]?.(totals);
}

const ENTITY_NAMES = new Map(
  dataset.dimensions.entities.map((e) => [e.id, e.name]),
);
function entityName(id: string): string {
  return ENTITY_NAMES.get(id) ?? id;
}

const BASIS_LABEL: Record<string, string> = {
  MTD: "vs LY", QTD: "vs LY", YTD: "vs LY", FY: "vs LY", R12: "vs LY",
};

/**
 * Build a KPI from statement lines.
 *
 * The sparkline is the trailing twelve ACTUAL periods of the same measure —
 * never a decorative squiggle, and never extended into periods that have not
 * closed.
 */
export function selectKpi(metricId: string, selection: PeriodSelection): KpiDatum {
  const metric = getMetric(metricId);
  const entityIds = resolveEntityIds(selection.entityId);

  if (isSalesMetric(metricId)) return selectSalesKpi(metricId, selection, entityIds);
  if (metricId in CASHFLOW_RESOLVERS) {
    return selectCashFlowKpi(metricId, selection, entityIds);
  }
  if (DAY_METRICS.has(metricId)) return selectDaysKpi(metricId, selection);

  const lines = selectLines(selection);

  const value = resolve(metricId, lines.actual) ?? 0;
  const comparison = resolve(metricId, lines.priorYear);
  const budgetValue = resolve(metricId, selectComparableBudget(selection));

  const variance = calculateVariance(value, comparison, metric);
  const budgetVariance = calculateVariance(value, budgetValue, metric);

  // Trailing actual periods for the sparkline.
  const window = periodsForBasis("R12", selection.periodId).filter((p) => p.isActual);
  const series = window
    .map((p) => resolve(metricId, aggregateLines([p.id], entityIds, "actual")))
    .filter((v): v is number => v !== undefined);

  return {
    metric,
    value,
    comparison,
    comparisonLabel: BASIS_LABEL[selection.basis] ?? "vs LY",
    variance,
    series,
    secondary: budgetVariance
      ? { label: "vs Budget", variance: budgetVariance }
      : undefined,
  };
}

/**
 * KPI built from the sales facts. Budget exists only for revenue in the sales
 * ledger, so most commercial metrics carry a prior-year comparison alone —
 * which is stated honestly rather than filled with a fabricated plan.
 */
function selectSalesKpi(
  metricId: string,
  selection: PeriodSelection,
  entityIds: string[],
): KpiDatum {
  const metric = getMetric(metricId);

  const currentIds = periodsForBasis(selection.basis, selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);
  const priorIds = priorYearPeriods(selection.basis, selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);

  const current = salesTotalsFor(currentIds, entityIds);
  const prior = salesTotalsFor(priorIds, entityIds);

  const value = resolveSales(metricId, current) ?? 0;
  // Like-for-like compares only the comparable base on BOTH sides; comparing a
  // like-for-like figure against total prior-year sales would overstate decline.
  const comparison =
    metricId === "likeForLikeSales"
      ? current.likeForLikePriorYear
      : resolveSales(metricId, prior);

  const series = periodsForBasis("R12", selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => resolveSales(metricId, salesTotalsFor([p.id], entityIds)))
    .filter((v): v is number => v !== undefined);

  const budgetVariance =
    metricId === "totalSales"
      ? calculateVariance(value, current.budgetRevenue, metric)
      : undefined;

  return {
    metric,
    value,
    comparison,
    comparisonLabel: "vs LY",
    variance: calculateVariance(value, comparison, metric),
    series,
    secondary: budgetVariance ? { label: "vs Budget", variance: budgetVariance } : undefined,
  };
}

function selectCashFlowKpi(
  metricId: string,
  selection: PeriodSelection,
  entityIds: string[],
): KpiDatum {
  const metric = getMetric(metricId);
  const resolver = CASHFLOW_RESOLVERS[metricId];

  const currentIds = periodsForBasis(selection.basis, selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);
  const priorIds = priorYearPeriods(selection.basis, selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);

  const value = resolver(cashFlowTotalsFor(currentIds, entityIds));
  const comparison = priorIds.length
    ? resolver(cashFlowTotalsFor(priorIds, entityIds))
    : undefined;
  const budget = resolver(cashFlowTotalsFor(currentIds, entityIds, "budget"));

  const series = periodsForBasis("R12", selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => resolver(cashFlowTotalsFor([p.id], entityIds)));

  const budgetVariance = calculateVariance(value, budget, metric);

  return {
    metric,
    value,
    comparison,
    comparisonLabel: "vs LY",
    variance: calculateVariance(value, comparison, metric),
    series,
    secondary: budgetVariance ? { label: "vs Budget", variance: budgetVariance } : undefined,
  };
}

/**
 * Working-capital days. The sparkline is built by recomputing days at each of
 * the trailing twelve closes, so it shows the actual trajectory of the metric
 * rather than the trajectory of the balance it is derived from.
 */
function selectDaysKpi(metricId: string, selection: PeriodSelection): KpiDatum {
  const metric = getMetric(metricId);
  const days = selectWorkingCapitalDays(selection);

  const pick = (source: { dso: number; dio: number; dpo: number; cashConversionCycle: number }) =>
    metricId === "dso" ? source.dso
    : metricId === "dio" ? source.dio
    : metricId === "dpo" ? source.dpo
    : source.cashConversionCycle;

  const value = pick(days);
  const comparison = pick(days.priorYear);

  const series = periodsForBasis("R12", selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => pick(selectWorkingCapitalDays({ ...selection, periodId: p.id })));

  return {
    metric,
    value,
    comparison,
    comparisonLabel: "vs LY",
    variance: calculateVariance(value, comparison, metric),
    series,
  };
}

export function selectKpis(metricIds: string[], selection: PeriodSelection): KpiDatum[] {
  return metricIds.map((id) => selectKpi(id, selection));
}

/**
 * Working-capital days.
 *
 * Defined ONCE and consumed by both the Balance Sheet and the Cash Flow page.
 * Days are computed on trailing-twelve-month flows against the closing
 * balance, which is the convention that survives a seasonal business.
 */
export interface WorkingCapitalDays {
  dso: number;
  dio: number;
  dpo: number;
  cashConversionCycle: number;
  priorYear: { dso: number; dio: number; dpo: number; cashConversionCycle: number };
}

const DAYS_IN_YEAR = 365;

function daysFor(closing: LineTotals, flows: LineTotals) {
  const revenue = flows.revenue ?? 0;
  const cogs = flows.costOfSales ?? 0;
  const dso = revenue ? ((closing.tradeReceivables ?? 0) / revenue) * DAYS_IN_YEAR : 0;
  const dio = cogs ? ((closing.inventory ?? 0) / cogs) * DAYS_IN_YEAR : 0;
  const dpo = cogs ? ((closing.tradePayables ?? 0) / cogs) * DAYS_IN_YEAR : 0;
  return { dso, dio, dpo, cashConversionCycle: dso + dio - dpo };
}

export function selectWorkingCapitalDays(selection: PeriodSelection): WorkingCapitalDays {
  const entityIds = resolveEntityIds(selection.entityId);

  const trailing = periodsForBasis("R12", selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);
  const closing = aggregateLines([selection.periodId], entityIds, "actual");
  const flows = aggregateLines(trailing, entityIds, "actual");

  const priorPeriods = priorYearPeriods("R12", selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);
  const priorClosingId = priorPeriods[priorPeriods.length - 1];
  const priorClosing = priorClosingId
    ? aggregateLines([priorClosingId], entityIds, "actual")
    : {};
  const priorFlows = aggregateLines(priorPeriods, entityIds, "actual");

  return { ...daysFor(closing, flows), priorYear: daysFor(priorClosing, priorFlows) };
}

/** A period-by-period series of one metric, for trend charts. */
export interface MetricPoint {
  period: Period;
  actual?: number;
  budget?: number;
  forecast?: number;
  priorYear?: number;
}

export function selectMetricSeries(
  metricId: string,
  periods: Period[],
  entityId: string,
): MetricPoint[] {
  const entityIds = resolveEntityIds(entityId);
  return periods.map((period) => {
    const priorId = (() => {
      const [year, month] = period.id.split("-").map(Number);
      return `${year - 1}-${String(month).padStart(2, "0")}`;
    })();

    return {
      period,
      // Actuals are emitted only for closed periods. This is what prevents a
      // chart drawing bars for months that have not happened.
      actual: period.isActual
        ? resolve(metricId, aggregateLines([period.id], entityIds, "actual"))
        : undefined,
      budget: resolve(metricId, aggregateLines([period.id], entityIds, "budget")),
      forecast: resolve(metricId, aggregateLines([period.id], entityIds, "forecast")),
      priorYear: resolve(metricId, aggregateLines([priorId], entityIds, "actual")),
    };
  });
}

/**
 * Per-entity performance, read through the finance records rather than the
 * sales facts, so EBITDA is a real EBITDA and not a gross-profit stand-in.
 */
export interface EntityPerformance {
  id: string;
  name: string;
  revenue: number;
  grossProfit: number;
  grossMargin: number;
  ebitda: number;
  ebitdaMargin: number;
  revenueGrowth?: number;
  ebitdaGrowth?: number;
  marginMovement?: number;
}

export function selectEntityPerformance(selection: PeriodSelection): EntityPerformance[] {
  const entityIds = resolveEntityIds(selection.entityId);
  const window = periodsForBasis(selection.basis, selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);
  const priorWindow = priorYearPeriods(selection.basis, selection.periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);

  return entityIds.map((entityId) => {
    const current = aggregateLines(window, [entityId], "actual");
    const prior = aggregateLines(priorWindow, [entityId], "actual");

    const revenue = current.revenue ?? 0;
    const priorRevenue = prior.revenue ?? 0;
    const grossProfit = current.grossProfit ?? 0;
    const ebitda = current.ebitda ?? 0;
    const priorEbitda = prior.ebitda ?? 0;

    const grossMargin = revenue ? grossProfit / revenue : 0;
    const priorMargin = priorRevenue ? (prior.grossProfit ?? 0) / priorRevenue : undefined;

    return {
      id: entityId,
      name: entityName(entityId),
      revenue,
      grossProfit,
      grossMargin,
      ebitda,
      ebitdaMargin: revenue ? ebitda / revenue : 0,
      revenueGrowth: priorRevenue ? revenue / priorRevenue - 1 : undefined,
      ebitdaGrowth: priorEbitda ? ebitda / priorEbitda - 1 : undefined,
      marginMovement: priorMargin === undefined ? undefined : grossMargin - priorMargin,
    };
  });
}
