import type { Period } from "@/domain/models";
import type { ImportTransformationContext } from "./context";
import { amount, cell, fieldValue, isFinance, prepareDatasetRows, text } from "./shared";

export interface CalendarResult { periods: Period[]; weeks: Period[]; periodTokenIds: ReadonlyMap<string, string>; }

/** Preserve identifier-looking tokens; only parse a value as a date after
 * excluding fiscal codes such as 202701. The output is the canonical month ID. */
export function resolveMonthlyPeriodToken(value: unknown): string | undefined {
  const token = text(value);
  if (/^\d{4}-\d{2}$/.test(token)) return token;
  if (/^\d{4}\/\d{2}$/.test(token)) return token.replace("/", "-");
  if (/^\d{6}$/.test(token) || /^\d{1,4}$/.test(token)) return undefined;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(token);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(token);
  const parsed = iso ? new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    : slash ? new Date(Date.UTC(Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]), Number(slash[1]) - 1, Number(slash[2])))
    : Number.isNaN(Date.parse(token)) ? undefined : new Date(token);
  return parsed && !Number.isNaN(parsed.getTime()) ? `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}` : undefined;
}

function buildMonth(id: string, index: number, all: string[], fiscalStart: number): Period {
  const [year, month] = id.split("-").map(Number);
  const fiscalYear = `FY${String(month >= fiscalStart ? year + 1 : year).slice(-2)}`;
  const fiscalPeriod = ((month - fiscalStart + 12) % 12) + 1;
  const sameYear = all.filter(candidate => {
    const [candidateYear, candidateMonth] = candidate.split("-").map(Number);
    return `FY${String(candidateMonth >= fiscalStart ? candidateYear + 1 : candidateYear).slice(-2)}` === fiscalYear;
  });
  return { id, date: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10), grain: "month", label: id, shortLabel: id.slice(5), fiscalYear, fiscalPeriod, calendarYear: year, calendarMonth: month, isActual: true, previousPeriodId: all[index - 1], fiscalYearPeriodIds: sameYear, quarterPeriodIds: sameYear.filter(candidate => {
    const candidateMonth = Number(candidate.slice(5));
    return Math.floor(((candidateMonth - fiscalStart + 12) % 12) / 3) === Math.floor((fiscalPeriod - 1) / 3);
  }) };
}

export function resolvePeriods(context: ImportTransformationContext): CalendarResult {
  const { workspace } = context;
  const calendar = context.datasets.find(dataset => (dataset.confirmedType ?? dataset.inferred.type) === "financial_calendar");
  const weeks: Period[] = [];
  const calendarMonthTokens = new Map<string, string>();
  if (calendar) for (const row of prepareDatasetRows(calendar)) {
    const week = text(cell(row, "Fiscal Week")) || text(cell(row, "Week"));
    const start = text(cell(row, "Week Start")); const end = text(cell(row, "Week End")); const fy = text(cell(row, "FY"));
    const externalPeriodToken = text(cell(row, "Fin_Period")) || undefined;
    if (week && start && end) {
      const month = resolveMonthlyPeriodToken(end);
      if (externalPeriodToken && month) calendarMonthTokens.set(externalPeriodToken, month);
      weeks.push({ id: `${fy}-W${week.padStart(2, "0")}`, date: end, grain: "week", label: `${fy} W${week}`, shortLabel: `W${week}`, fiscalYear: fy, fiscalPeriod: amount(cell(row, "Fiscal Month")) || 0, fiscalWeek: amount(week) || undefined, fiscalQuarter: amount(cell(row, "Fiscal Quarter")) || undefined, externalPeriodToken, weekStart: start, weekEnd: end, calendarYear: new Date(end).getUTCFullYear(), calendarMonth: new Date(end).getUTCMonth() + 1, isActual: false });
    }
  }
  const ids = new Set<string>(calendarMonthTokens.values());
  for (const dataset of context.financeDatasets.filter(dataset => isFinance(dataset.confirmedType ?? dataset.inferred.type))) {
    const mappings = workspace.mappings.filter(mapping => mapping.datasetId === dataset.id);
    for (const row of prepareDatasetRows(dataset)) {
      const raw = fieldValue(row, mappings, "period") ?? fieldValue(row, mappings, "date") ?? row.period;
      const token = text(raw); const id = resolveMonthlyPeriodToken(token) ?? calendarMonthTokens.get(token);
      if (id) ids.add(id);
    }
  }
  const all = [...ids].sort();
  const periods = all.map((id, index) => buildMonth(id, index, all, workspace.calendar.fiscalYearStartMonth));
  const periodTokenIds = new Map<string, string>();
  for (const period of periods) periodTokenIds.set(period.id, period.id);
  for (const [token, id] of calendarMonthTokens) periodTokenIds.set(token, id);
  return { periods, weeks, periodTokenIds };
}
