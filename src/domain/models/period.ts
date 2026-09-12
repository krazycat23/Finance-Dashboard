/**
 * PERIOD MODEL
 * ---------------------------------------------------------------------------
 * Fiscal calendars differ by company, so periods are data, never derived
 * inline from a Date. `fiscalYear` / `fiscalPeriod` are produced once by the
 * calendar helper using companyConfig.fiscalYearStartMonth.
 */

export type PeriodGrain = "week" | "month" | "quarter" | "year";

export interface Period {
  id: string;
  /** ISO date of the period end. */
  date: string;
  grain: PeriodGrain;
  label: string;
  shortLabel: string;
  fiscalYear: string;
  fiscalPeriod: number;
  fiscalWeek?: number;
  /** Source token such as Fin_Period 202701, retained for calendar resolution. */
  externalPeriodToken?: string;
  weekStart?: string;
  weekEnd?: string;
  fiscalQuarter?: number;
  calendarYear: number;
  calendarMonth: number;
  /**
   * False for periods after the reporting cut-off. Charts must never plot
   * actuals for these — a forecast is drawn distinctly instead.
   */
  isActual: boolean;
  /** Explicit calendar links supplied by the active data source. */
  previousPeriodId?: string;
  priorYearPeriodId?: string;
  fiscalYearPeriodIds?: string[];
  quarterPeriodIds?: string[];
}

/** How a page compares the selected period. */
export type PeriodBasis = "MTD" | "QTD" | "YTD" | "FY" | "R12";

export interface PeriodSelection {
  entityId: string;
  basis: PeriodBasis;
  periodId: string;
}
