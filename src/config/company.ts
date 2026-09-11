/**
 * COMPANY CONFIGURATION
 * ---------------------------------------------------------------------------
 * The single file a new client engagement edits first. Nothing in
 * `components/` or `pages/` may hardcode any value that belongs here.
 *
 * "Northpoint" is demonstration branding only.
 */

export interface CompanyConfig {
  companyName: string;
  /** Short mark shown in the sidebar; falls back to companyName. */
  shortName?: string;
  tagline?: string;

  /** ISO 4217 code, used for labelling and export metadata. */
  currency: string;
  currencySymbol: string;
  /** Default scale for headline figures. */
  defaultScale: "units" | "thousands" | "millions";

  /** 1 = January. A July start (7) gives an Australian FY. */
  fiscalYearStartMonth: number;
  /** How fiscal years are labelled, e.g. FY25 for the year ending June 2025. */
  fiscalYearLabel: "startYear" | "endYear";
  /** Weekly retail calendars are common; monthly is the default. */
  periodicity: "monthly" | "weekly" | "4-4-5";

  defaultEntityId: string;
  defaultTheme: "light" | "dark";
  locale: string;

  /**
   * The period the demo dataset is reported "as at". In a live deployment this
   * comes from the last closed period in the warehouse.
   */
  currentPeriodId: string;
  /** Months of history the mock generator produces before the current period. */
  historyMonths: number;
  /** Months of forward periods generated for forecasting. */
  forecastMonths: number;
}

export const companyConfig: CompanyConfig = {
  companyName: "Northpoint",
  shortName: "Northpoint",
  tagline: "Group Reporting",

  currency: "AUD",
  currencySymbol: "$",
  defaultScale: "millions",

  fiscalYearStartMonth: 7,
  fiscalYearLabel: "endYear",
  periodicity: "monthly",

  defaultEntityId: "group",
  defaultTheme: "light",
  locale: "en-AU",

  // March 2026 is period 9 of FY26 on a July year start: nine months of
  // actuals, three months to go. That is the position an FP&A pack is most
  // often produced in -- year-to-date variance to plan is meaningful and the
  // forecast still has something to say.
  currentPeriodId: "2026-03",
  historyMonths: 33,
  forecastMonths: 15,
};
