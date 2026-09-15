import type { Period } from "@/domain/models";
import { asIdentifier, asNumber, type SourceWorkbooks } from "./workbook";

export const CALENDAR_FILE = "FY27_Fin_Calendar.xlsx";
const CALENDAR_SHEET = "Fin Calendar";

/**
 * FY27 FINANCIAL CALENDAR
 * ---------------------------------------------------------------------------
 * The authoritative week-to-period mapping. The sheet opens with three title
 * and provenance rows and carries an unrelated "Quick Lookup" block in columns
 * I and J, so the header row is located by its own column names rather than by
 * a fixed offset.
 *
 * Fin_Period arrives from Excel as the number 202701. It is a fiscal TOKEN, not
 * a quantity, and is carried as the string "202701" so that it can never be
 * arithmetically combined or lose a leading character.
 */
export interface FreedomWeek {
  /** Canonical week id, e.g. FY27W01. */
  id: string;
  finPeriod: string;
  fiscalWeek: number;
  fiscalMonthName: string;
  fiscalQuarter: number;
  fiscalYear: string;
  weekStart: string;
  weekEnd: string;
  /** Calendar month the fiscal month resolves to, e.g. 2026-07. */
  monthPeriodId: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function parseFinancialCalendar(workbooks: SourceWorkbooks): FreedomWeek[] {
  const rows = workbooks.sheet(CALENDAR_FILE, CALENDAR_SHEET);
  const headerIndex = rows.findIndex((row) => row.some((cell) => asIdentifier(cell) === "Fin_Period"));
  if (headerIndex < 0) {
    throw new Error(`${CALENDAR_FILE}/${CALENDAR_SHEET} has no Fin_Period header row.`);
  }
  const header = rows[headerIndex].map((cell) => asIdentifier(cell));
  const column = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`${CALENDAR_FILE} calendar table has no "${name}" column.`);
    return index;
  };
  const cStart = column("Week Start");
  const cEnd = column("Week End");
  const cPeriod = column("Fin_Period");
  const cWeek = column("Fiscal Week");
  const cMonth = column("Fiscal Month");
  const cQuarter = column("Fiscal Quarter");
  const cFy = column("FY");

  const weeks: FreedomWeek[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const finPeriod = asIdentifier(row[cPeriod]);
    const fiscalWeek = asNumber(row[cWeek]);
    if (!finPeriod || fiscalWeek === undefined) continue;

    const fiscalYear = asIdentifier(row[cFy]);
    const monthName = asIdentifier(row[cMonth]);
    const weekStart = isoDate(row[cStart]);
    const weekEnd = isoDate(row[cEnd]);
    if (!weekStart || !weekEnd) continue;

    weeks.push({
      id: `${fiscalYear}W${String(fiscalWeek).padStart(2, "0")}`,
      finPeriod,
      fiscalWeek,
      fiscalMonthName: monthName,
      fiscalQuarter: Number(asIdentifier(row[cQuarter]).replace(/[^0-9]/g, "")) || 1,
      fiscalYear,
      weekStart,
      weekEnd,
      monthPeriodId: monthPeriodFor(monthName, weekEnd),
    });
  }

  if (weeks.length === 0) throw new Error(`${CALENDAR_FILE} produced no calendar weeks.`);
  return weeks;
}

/**
 * The fiscal month is named ("July"), so the calendar year is taken from the
 * week-end date. A week ending in early July belongs to fiscal July of the same
 * calendar year; a fiscal month can only straddle a year boundary at December
 * and January, which the month name itself disambiguates.
 */
function monthPeriodFor(monthName: string, weekEnd: string): string {
  const monthIndex = MONTHS.indexOf(monthName);
  const end = new Date(weekEnd);
  const year = monthIndex < 0 ? end.getUTCFullYear()
    : monthIndex === 0 && end.getUTCMonth() === 11 ? end.getUTCFullYear() + 1
    : monthIndex === 11 && end.getUTCMonth() === 0 ? end.getUTCFullYear() - 1
    : end.getUTCFullYear();
  const month = monthIndex < 0 ? end.getUTCMonth() + 1 : monthIndex + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isoDate(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = asIdentifier(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

export function toWeekPeriods(weeks: FreedomWeek[], lastActualWeekId?: string): Period[] {
  const lastIndex = lastActualWeekId ? weeks.findIndex((week) => week.id === lastActualWeekId) : -1;
  return weeks.map((week, index) => ({
    id: week.id,
    date: week.weekEnd,
    grain: "week" as const,
    label: `Week ${week.fiscalWeek}`,
    shortLabel: `W${week.fiscalWeek}`,
    fiscalYear: week.fiscalYear,
    fiscalPeriod: week.fiscalWeek,
    fiscalWeek: week.fiscalWeek,
    externalPeriodToken: week.finPeriod,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    fiscalQuarter: week.fiscalQuarter,
    calendarYear: Number(week.weekEnd.slice(0, 4)),
    calendarMonth: Number(week.weekEnd.slice(5, 7)),
    isActual: lastIndex < 0 ? false : index <= lastIndex,
  }));
}
