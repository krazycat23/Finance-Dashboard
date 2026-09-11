import { dataset } from "@/data/mock";
import type { FinancialMonth } from "@/data/mock/finance";
import type { Period, PeriodSelection } from "@/domain/models";
import { periodsForBasis, resolveEntityIds } from "./core";

/**
 * FORECAST SELECTION
 * ---------------------------------------------------------------------------
 * The forecast view is where the actual/forecast boundary matters most. Every
 * series returned here separates closed periods from open ones explicitly, so
 * a chart cannot accidentally render a projection as though it were history.
 *
 * The scenario arithmetic below is deliberately simple — this phase builds the
 * presentation and the seam, not a forecasting model.
 */

export interface ForecastPoint {
  period: Period;
  actual?: number;
  forecast: number;
  budget: number;
  priorYear?: number;
  isActual: boolean;
}

function monthIndex(scenario: FinancialMonth[]) {
  const map = new Map<string, FinancialMonth[]>();
  for (const m of scenario) {
    const list = map.get(m.periodId);
    if (list) list.push(m);
    else map.set(m.periodId, [m]);
  }
  return map;
}

const ACTUAL = monthIndex(dataset.scenarios.actual);
const BUDGET = monthIndex(dataset.scenarios.budget);
const FORECAST = monthIndex(dataset.scenarios.forecast);

type Measure = (m: FinancialMonth) => number;

const MEASURES: Record<string, Measure> = {
  revenue: (m) => m.revenue,
  grossProfit: (m) => m.grossProfit,
  ebitda: (m) => m.ebitda,
  netProfit: (m) => m.netProfit,
  operatingCosts: (m) => m.operatingCosts,
};

function total(
  index: Map<string, FinancialMonth[]>,
  periodId: string,
  entityIds: Set<string>,
  measure: Measure,
): number {
  const months = index.get(periodId) ?? [];
  return months.reduce((s, m) => (entityIds.has(m.entityId) ? s + measure(m) : s), 0);
}

/** Full fiscal-year series for the year containing the selected period. */
export function selectForecastSeries(
  selection: PeriodSelection,
  metricId: keyof typeof MEASURES = "revenue",
): ForecastPoint[] {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const measure = MEASURES[metricId];
  const periods = periodsForBasis("FY", selection.periodId);

  return periods.map((period) => {
    const priorId = (() => {
      const [year, month] = period.id.split("-").map(Number);
      return `${year - 1}-${String(month).padStart(2, "0")}`;
    })();

    return {
      period,
      actual: period.isActual ? total(ACTUAL, period.id, entityIds, measure) : undefined,
      forecast: total(FORECAST, period.id, entityIds, measure),
      budget: total(BUDGET, period.id, entityIds, measure),
      priorYear: total(ACTUAL, priorId, entityIds, measure),
      isActual: period.isActual,
    };
  });
}

export interface FullYearOutlook {
  /** Actuals to date plus forecast for the remaining periods. */
  forecast: number;
  budget: number;
  priorYear: number;
  actualToDate: number;
  forecastRemaining: number;
  varianceToBudget: number;
  /** Periods still to close in the fiscal year. */
  remainingPeriods: number;
  upside: number;
  downside: number;
}

/**
 * The full-year outlook is actual-to-date plus forecast-to-go. Reporting a
 * pure model output for periods that have already closed is the most common
 * way a forecast page loses credibility.
 */
export function selectFullYearOutlook(
  selection: PeriodSelection,
  metricId: keyof typeof MEASURES = "ebitda",
): FullYearOutlook {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const measure = MEASURES[metricId];
  const periods = periodsForBasis("FY", selection.periodId);

  let actualToDate = 0;
  let forecastRemaining = 0;
  let budgetTotal = 0;
  let priorYearTotal = 0;
  let remainingPeriods = 0;

  for (const period of periods) {
    budgetTotal += total(BUDGET, period.id, entityIds, measure);
    const priorId = (() => {
      const [year, month] = period.id.split("-").map(Number);
      return `${year - 1}-${String(month).padStart(2, "0")}`;
    })();
    priorYearTotal += total(ACTUAL, priorId, entityIds, measure);

    if (period.isActual) {
      actualToDate += total(ACTUAL, period.id, entityIds, measure);
    } else {
      forecastRemaining += total(FORECAST, period.id, entityIds, measure);
      remainingPeriods += 1;
    }
  }

  const forecast = actualToDate + forecastRemaining;
  return {
    forecast,
    budget: budgetTotal,
    priorYear: priorYearTotal,
    actualToDate,
    forecastRemaining,
    varianceToBudget: forecast - budgetTotal,
    remainingPeriods,
    // Scenario range applies only to the periods still open — history has no
    // uncertainty, and widening the band across closed periods would be wrong.
    upside: forecast + forecastRemaining * 0.085,
    downside: forecast - forecastRemaining * 0.11,
  };
}

export interface ScenarioRow {
  id: string;
  name: string;
  revenue: number;
  ebitda: number;
  ebitdaMargin: number;
  varianceToPlan: number;
  probability: number;
  description: string;
}

/**
 * Scenarios are expressed as multipliers on the forecast-to-go, so the closed
 * periods stay fixed across every scenario.
 */
export function selectScenarios(selection: PeriodSelection): ScenarioRow[] {
  const revenue = selectFullYearOutlook(selection, "revenue");
  const ebitda = selectFullYearOutlook(selection, "ebitda");

  const build = (
    id: string,
    name: string,
    revenueFactor: number,
    marginShift: number,
    probability: number,
    description: string,
  ): ScenarioRow => {
    const scenarioRevenue = revenue.actualToDate + revenue.forecastRemaining * revenueFactor;
    const baseMargin = revenue.forecast ? ebitda.forecast / revenue.forecast : 0;
    const scenarioEbitda =
      ebitda.actualToDate +
      ebitda.forecastRemaining * revenueFactor +
      revenue.forecastRemaining * revenueFactor * marginShift;
    return {
      id,
      name,
      revenue: scenarioRevenue,
      ebitda: scenarioEbitda,
      ebitdaMargin: scenarioRevenue ? scenarioEbitda / scenarioRevenue : baseMargin,
      varianceToPlan: scenarioEbitda - ebitda.budget,
      probability,
      description,
    };
  };

  return [
    build("upside", "Upside", 1.075, 0.006, 0.2, "Trading momentum sustained, promotional depth held"),
    build("base", "Base case", 1.0, 0, 0.6, "Current reforecast, no change in trading assumptions"),
    build("downside", "Downside", 0.925, -0.008, 0.2, "Consumer softening and deeper clearance activity"),
  ];
}

export interface DriverAssumption {
  id: string;
  driver: string;
  basis: string;
  current: number;
  assumed: number;
  format: "percentage" | "currency" | "number" | "days";
}

/** Assumptions behind the reforecast, shown so the number can be challenged. */
export function selectDriverAssumptions(selection: PeriodSelection): DriverAssumption[] {
  const revenue = selectFullYearOutlook(selection, "revenue");
  const ebitda = selectFullYearOutlook(selection, "ebitda");
  const opex = selectFullYearOutlook(selection, "operatingCosts");
  const gp = selectFullYearOutlook(selection, "grossProfit");

  const runRate = revenue.remainingPeriods
    ? revenue.forecastRemaining / revenue.remainingPeriods
    : 0;
  const achievedRunRate =
    revenue.remainingPeriods < 12
      ? revenue.actualToDate / (12 - revenue.remainingPeriods)
      : 0;

  return [
    {
      id: "revenue-run-rate",
      driver: "Monthly revenue run rate",
      basis: "Forecast periods versus achieved",
      current: achievedRunRate,
      assumed: runRate,
      format: "currency",
    },
    {
      id: "gross-margin",
      driver: "Gross margin rate",
      basis: "Full-year forecast",
      current: gp.actualToDate / Math.max(revenue.actualToDate, 1),
      assumed: gp.forecast / Math.max(revenue.forecast, 1),
      format: "percentage",
    },
    {
      id: "opex-ratio",
      driver: "Operating cost ratio",
      basis: "Percentage of revenue",
      current: opex.actualToDate / Math.max(revenue.actualToDate, 1),
      assumed: opex.forecast / Math.max(revenue.forecast, 1),
      format: "percentage",
    },
    {
      id: "ebitda-margin",
      driver: "EBITDA margin",
      basis: "Full-year forecast",
      current: ebitda.actualToDate / Math.max(revenue.actualToDate, 1),
      assumed: ebitda.forecast / Math.max(revenue.forecast, 1),
      format: "percentage",
    },
  ];
}

/**
 * Forecast accuracy: how well the previous reforecast predicted what actually
 * happened, over the closed periods. Reported as 1 − mean absolute percentage
 * error, and computed only where an actual exists.
 */
export function selectForecastAccuracy(selection: PeriodSelection): number {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const periods = periodsForBasis("R12", selection.periodId).filter((p) => p.isActual);

  const errors: number[] = [];
  for (const period of periods) {
    const actual = total(ACTUAL, period.id, entityIds, MEASURES.revenue);
    const forecast = total(FORECAST, period.id, entityIds, MEASURES.revenue);
    if (actual > 0) errors.push(Math.abs(actual - forecast) / actual);
  }
  if (errors.length === 0) return 0;
  return 1 - errors.reduce((a, b) => a + b, 0) / errors.length;
}

export interface RiskOpportunity {
  id: string;
  title: string;
  detail: string;
  value: number;
  type: "risk" | "opportunity";
  confidence: "High" | "Medium" | "Low";
}

export function selectRisksAndOpportunities(selection: PeriodSelection): RiskOpportunity[] {
  const outlook = selectFullYearOutlook(selection, "ebitda");
  const scale = Math.abs(outlook.forecastRemaining) || Math.abs(outlook.forecast) * 0.1;

  return [
    {
      id: "promo",
      title: "Promotional depth",
      detail: "Clearance activity running ahead of plan in slower categories.",
      value: -scale * 0.16,
      type: "risk",
      confidence: "High",
    },
    {
      id: "freight",
      title: "Inbound freight rates",
      detail: "Contracted rates settle below the rate assumed in the plan.",
      value: scale * 0.11,
      type: "opportunity",
      confidence: "Medium",
    },
    {
      id: "digital",
      title: "Digital growth momentum",
      detail: "Online conversion improvement sustained through the remaining periods.",
      value: scale * 0.19,
      type: "opportunity",
      confidence: "Medium",
    },
    {
      id: "wages",
      title: "Award wage increase",
      detail: "Timing of the wage review lands earlier than planned.",
      value: -scale * 0.09,
      type: "risk",
      confidence: "High",
    },
    {
      id: "supply",
      title: "Supply continuity",
      detail: "Key category availability constrained into the final quarter.",
      value: -scale * 0.07,
      type: "risk",
      confidence: "Low",
    },
  ];
}
