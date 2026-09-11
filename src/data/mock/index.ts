import { companyConfig } from "@/config/company";
import { monthSeriesEndingAt, parsePeriodId } from "@/domain/calendar";
import type {
  CashFlowRecord,
  Period,
} from "@/domain/models";
import type { ReportingDataAdapter, ReportingDataset } from "@/domain/data";
import * as dimensions from "./dimensions";
import { generateFinancials, toFinanceRecords, type FinanceScenarios } from "./finance";
import { generateOperational } from "./operational";
import { generateSales, generateWeeklySales } from "./sales";
import { validateFinancials, validateResidual } from "./validate";

function buildPeriods(): Period[] {
  const { year, month } = parsePeriodId(companyConfig.currentPeriodId);
  const total = companyConfig.historyMonths + companyConfig.forecastMonths;
  // Generate through the forecast horizon, then mark actuals up to the
  // reporting cut-off. Every chart reads `isActual` rather than guessing,
  // which is what stops future months being drawn as though they happened.
  const endDate = new Date(Date.UTC(year, month - 1 + companyConfig.forecastMonths, 1));
  const periods = monthSeriesEndingAt(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth() + 1,
    total,
    companyConfig.currentPeriodId,
  );
  const byYearAndFiscalPeriod = new Map(periods.map((period) => [`${period.fiscalYear}:${period.fiscalPeriod}`, period.id]));
  return periods.map((period, index) => ({
    ...period,
    previousPeriodId: periods[index - 1]?.id,
    priorYearPeriodId: byYearAndFiscalPeriod.get(`${priorFiscalYear(period.fiscalYear)}:${period.fiscalPeriod}`),
    fiscalYearPeriodIds: periods.filter((candidate) => candidate.fiscalYear === period.fiscalYear).map((candidate) => candidate.id),
    quarterPeriodIds: periods.filter((candidate) => candidate.fiscalYear === period.fiscalYear && Math.floor((candidate.fiscalPeriod - 1) / 3) === Math.floor((period.fiscalPeriod - 1) / 3)).map((candidate) => candidate.id),
  }));
}

function priorFiscalYear(fiscalYear: string): string {
  const year = Number(fiscalYear.replace(/^FY/, ""));
  return `FY${String((year + 99) % 100).padStart(2, "0")}`;
}

function buildDataset(): ReportingDataset {
  const periods = buildPeriods();
  const sales = generateSales(periods);
  const { weeks, records: weeklySalesRecords } = generateWeeklySales(periods, sales.monthly);
  const scenarios = generateFinancials(periods, sales);
  const financeRecords = toFinanceRecords(periods, scenarios);
  const operationalRecords = generateOperational(periods, sales.monthly);
  const scenarioDefinitions = [
    { id: "actual", kind: "actual", label: "Actual" },
    { id: "original-budget", kind: "budget", label: "Original Budget", version: "original" },
    { id: "forecast-current", kind: "forecast", label: "Current Forecast", version: "current", asOfDate: "2026-03-31" },
  ] as const;
  const cashFlowRecords: CashFlowRecord[] = [
    ...scenarios.actual.map((m) => ({ ...toCashFlowRecord(m), scenarioId: "actual" })),
    ...scenarios.budget.map((m) => ({ ...toCashFlowRecord(m), scenarioId: "original-budget" })),
    ...scenarios.forecast.map((m) => ({ ...toCashFlowRecord(m), scenarioId: "forecast-current" })),
  ];

  if (import.meta.env.DEV) {
    const issues = [
      ...validateFinancials(scenarios.actual),
      ...validateResidual(scenarios.actual),
    ];
    if (issues.length > 0) {
      // Loud, but non-fatal: the app still renders so the problem is visible
      // in context rather than as a blank screen.
      console.warn(
        `[mock data] ${issues.length} consistency issue(s) detected`,
        issues.slice(0, 10),
      );
    } else {
      console.info(
        "[mock data] consistency checks passed: statements tie, balance sheet balances, cash rolls forward",
      );
    }
  }

  return {
    id: "northpoint-demo",
    source: "demo",
    periods,
    weeks,
    financeRecords,
    salesRecords: sales.monthly,
    weeklySalesRecords,
    operationalRecords,
    scenarios: [...scenarioDefinitions],
    cashFlowRecords,
    dimensions,
    currentPeriodId: companyConfig.currentPeriodId,
    defaultEntityId: companyConfig.defaultEntityId,
    demo: {
      scenarios,
      risksAndOpportunities: [
        { id: "promo", title: "Promotional depth", detail: "Clearance activity running ahead of plan in slower categories.", valueFactor: -0.16, type: "risk", confidence: "High" },
        { id: "freight", title: "Inbound freight rates", detail: "Contracted rates settle below the rate assumed in the plan.", valueFactor: 0.11, type: "opportunity", confidence: "Medium" },
        { id: "digital", title: "Digital growth momentum", detail: "Online conversion improvement sustained through the remaining periods.", valueFactor: 0.19, type: "opportunity", confidence: "Medium" },
        { id: "wages", title: "Award wage increase", detail: "Timing of the wage review lands earlier than planned.", valueFactor: -0.09, type: "risk", confidence: "High" },
        { id: "supply", title: "Supply continuity", detail: "Key category availability constrained into the final quarter.", valueFactor: -0.07, type: "risk", confidence: "Low" },
      ],
    },
  };
}

function toCashFlowRecord(m: FinanceScenarios["actual"][number]): Omit<CashFlowRecord, "scenarioId"> {
  const { periodId, entityId, ebitda, cash, operatingCashFlow, investingCashFlow, financingCashFlow, netCashMovement, capex, workingCapitalMovement, interest, tax, dividends } = m;
  return { periodId, entityId, ebitda, cash, operatingCashFlow, investingCashFlow, financingCashFlow, netCashMovement, capex, workingCapitalMovement, interest, tax, dividends };
}

/**
 * The dataset is built once at module load. In a real deployment this module
 * is replaced by a data adapter (SQL, API, warehouse) returning the same
 * canonical shapes — nothing above this layer would change.
 */
export class MockDataAdapter implements ReportingDataAdapter {
  readonly id = "mock-demo";
  private dataset?: ReportingDataset;

  load(): ReportingDataset {
    this.dataset ??= buildDataset();
    return this.dataset;
  }
}

export { dimensions };
