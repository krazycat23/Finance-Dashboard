import { companyConfig } from "@/config/company";
import type { Period } from "@/domain/models";

/**
 * FISCAL CALENDAR
 * ---------------------------------------------------------------------------
 * Fiscal mapping is computed once, here, from companyConfig. Nothing else in
 * the codebase may infer a fiscal year from a date — a company on a July start
 * and one on a January start must produce identical downstream behaviour.
 */

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fiscalYearOf(calendarYear: number, calendarMonth: number): string {
  const start = companyConfig.fiscalYearStartMonth;
  // A July start means Jul-2025 belongs to the year ending June 2026.
  const endYear = calendarMonth >= start && start > 1 ? calendarYear + 1 : calendarYear;
  const labelYear = companyConfig.fiscalYearLabel === "endYear" ? endYear : endYear - 1;
  return `FY${String(labelYear).slice(-2)}`;
}

export function fiscalPeriodOf(calendarMonth: number): number {
  const start = companyConfig.fiscalYearStartMonth;
  return ((calendarMonth - start + 12) % 12) + 1;
}

/** Days in a calendar month, used by working-capital day calculations. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthPeriodId(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function buildMonthPeriod(
  year: number,
  month: number,
  isActual: boolean,
): Period {
  return {
    id: monthPeriodId(year, month),
    date: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    grain: "month",
    label: `${MONTH_SHORT[month - 1]} ${year}`,
    shortLabel: MONTH_SHORT[month - 1],
    fiscalYear: fiscalYearOf(year, month),
    fiscalPeriod: fiscalPeriodOf(month),
    calendarYear: year,
    calendarMonth: month,
    isActual,
  };
}

/** `count` consecutive months ending at (and including) the given month. */
export function monthSeriesEndingAt(
  endYear: number,
  endMonth: number,
  count: number,
  actualThroughId?: string,
): Period[] {
  const periods: Period[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(endYear, endMonth - 1 - i, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const id = monthPeriodId(year, month);
    periods.push(buildMonthPeriod(year, month, actualThroughId ? id <= actualThroughId : true));
  }
  return periods;
}

/** The twelve months of the fiscal year containing the given month. */
export function fiscalYearMonths(year: number, month: number): Period[] {
  const start = companyConfig.fiscalYearStartMonth;
  const offset = (month - start + 12) % 12;
  const firstDate = new Date(Date.UTC(year, month - 1 - offset, 1));
  const periods: Period[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + i, 1));
    periods.push(
      buildMonthPeriod(d.getUTCFullYear(), d.getUTCMonth() + 1, false),
    );
  }
  return periods;
}

export function parsePeriodId(periodId: string): { year: number; month: number } {
  const [year, month] = periodId.split("-").map(Number);
  return { year, month };
}

/** Same period one year earlier — the prior-year comparative. */
export function priorYearPeriodId(periodId: string): string {
  const { year, month } = parsePeriodId(periodId);
  return monthPeriodId(year - 1, month);
}

/** Weekly period ids are ISO-ish `YYYY-Www`, kept distinct from months. */
export function weekPeriodId(fiscalYear: string, week: number): string {
  return `${fiscalYear}-W${String(week).padStart(2, "0")}`;
}
