import { companyConfig } from "@/config/company";
import { monthSeriesEndingAt, parsePeriodId } from "@/domain/calendar";
import type {
  FinanceRecord,
  OperationalRecord,
  Period,
  SalesRecord,
} from "@/domain/models";
import * as dimensions from "./dimensions";
import { generateFinancials, toFinanceRecords, type FinanceScenarios } from "./finance";
import { generateOperational } from "./operational";
import { generateSales, generateWeeklySales } from "./sales";
import { validateFinancials, validateResidual } from "./validate";

export interface Dataset {
  periods: Period[];
  weeks: Period[];
  financeRecords: FinanceRecord[];
  salesRecords: SalesRecord[];
  weeklySalesRecords: SalesRecord[];
  operationalRecords: OperationalRecord[];
  scenarios: FinanceScenarios;
  dimensions: typeof dimensions;
  /** The last period with actuals. */
  currentPeriodId: string;
}

function buildPeriods(): Period[] {
  const { year, month } = parsePeriodId(companyConfig.currentPeriodId);
  const total = companyConfig.historyMonths + companyConfig.forecastMonths;
  // Generate through the forecast horizon, then mark actuals up to the
  // reporting cut-off. Every chart reads `isActual` rather than guessing,
  // which is what stops future months being drawn as though they happened.
  const endDate = new Date(Date.UTC(year, month - 1 + companyConfig.forecastMonths, 1));
  return monthSeriesEndingAt(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth() + 1,
    total,
    companyConfig.currentPeriodId,
  );
}

function buildDataset(): Dataset {
  const periods = buildPeriods();
  const sales = generateSales(periods);
  const { weeks, records: weeklySalesRecords } = generateWeeklySales(periods, sales.monthly);
  const scenarios = generateFinancials(periods, sales);
  const financeRecords = toFinanceRecords(periods, scenarios);
  const operationalRecords = generateOperational(periods, sales.monthly);

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
    periods,
    weeks,
    financeRecords,
    salesRecords: sales.monthly,
    weeklySalesRecords,
    operationalRecords,
    scenarios,
    dimensions,
    currentPeriodId: companyConfig.currentPeriodId,
  };
}

/**
 * The dataset is built once at module load. In a real deployment this module
 * is replaced by a data adapter (SQL, API, warehouse) returning the same
 * canonical shapes — nothing above this layer would change.
 */
export const dataset: Dataset = buildDataset();

export { dimensions };
