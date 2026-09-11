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
    profile: {
      companyName: companyConfig.companyName, shortName: companyConfig.shortName, tagline: companyConfig.tagline,
      reportingCurrency: companyConfig.currency, currencySymbol: companyConfig.currencySymbol,
      locale: companyConfig.locale, defaultScale: companyConfig.defaultScale,
      fiscalCalendar: { periodicity: "monthly", fiscalYearStartMonth: companyConfig.fiscalYearStartMonth, fiscalYearLabel: companyConfig.fiscalYearLabel }, defaultTheme: companyConfig.defaultTheme,
    },
    scenarioRoles: { actual: "actual", budget: "original-budget", forecast: "forecast-current" },
    forecastConfiguration: {
      scenarios: [
        { id: "upside", name: "Upside", revenueFactor: 1.075, marginShift: 0.006, probability: 0.2, description: "Trading momentum sustained, promotional depth held" },
        { id: "base", name: "Base case", revenueFactor: 1, marginShift: 0, probability: 0.6, description: "Current reforecast, no change in trading assumptions" },
        { id: "downside", name: "Downside", revenueFactor: 0.925, marginShift: -0.008, probability: 0.2, description: "Consumer softening and deeper clearance activity" },
      ],
      risksAndOpportunities: [
        { id: "promo", title: "Promotional depth", detail: "Clearance activity running ahead of plan in slower categories.", valueFactor: -0.16, type: "risk", confidence: "High" },
        { id: "freight", title: "Inbound freight rates", detail: "Contracted rates settle below the rate assumed in the plan.", valueFactor: 0.11, type: "opportunity", confidence: "Medium" },
        { id: "digital", title: "Digital growth momentum", detail: "Online conversion improvement sustained through the remaining periods.", valueFactor: 0.19, type: "opportunity", confidence: "Medium" },
        { id: "wages", title: "Award wage increase", detail: "Timing of the wage review lands earlier than planned.", valueFactor: -0.09, type: "risk", confidence: "High" },
        { id: "supply", title: "Supply continuity", detail: "Key category availability constrained into the final quarter.", valueFactor: -0.07, type: "risk", confidence: "Low" },
      ],
    },
    dataQuality: {
      mappingSummaries: [
        { dimension: "GL Accounts", total: 32, mapped: 28, unmapped: 4, review: 0, valueCoverage: 0.965 },
        { dimension: "Products", total: 15, mapped: 12, unmapped: 3, review: 0, valueCoverage: 0.94 },
        ...["Cost Centres", "Channels", "Locations", "Entities"].map((dimension) => ({ dimension, total: 1, mapped: 1, unmapped: 0, review: 0, valueCoverage: 1 })),
      ],
      unmappedMembers: [
        { id: "unmapped-account-0", dimension: "accounts", externalId: "6710", name: "Store Refit Amortisation", value: 412_000, suggestedLine: "Depreciation & Amortisation", confidence: 0.94 },
        { id: "unmapped-account-1", dimension: "accounts", externalId: "6820", name: "Loyalty Programme Accrual", value: 268_400, suggestedLine: "Operating Costs", confidence: 0.88 },
        { id: "unmapped-account-2", dimension: "accounts", externalId: "5310", name: "Supplier Rebate — Q3 True-up", value: 731_900, suggestedLine: "Cost of Sales", confidence: 0.79 },
        { id: "unmapped-account-3", dimension: "accounts", externalId: "2410", name: "Deferred Consideration", value: 195_000, suggestedLine: "Other Non-Current Liabilities", confidence: 0.62 },
        { id: "unmapped-product-0", dimension: "products", externalId: "SKU-88421", name: "Outerwear — Winter Capsule", suggestedCategory: "Apparel", confidence: 0.91 },
        { id: "unmapped-product-1", dimension: "products", externalId: "SKU-88903", name: "Home — Seasonal Textiles", suggestedCategory: "Home", confidence: 0.85 },
        { id: "unmapped-product-2", dimension: "products", externalId: "SKU-91044", name: "Accessories — Licensed Range", suggestedCategory: "Accessories", confidence: 0.73 },
      ],
      reconciliations: [
        { id: "rec-revenue", statement: "Revenue — GL to sales ledger", sourceTotal: 141284000, mappedTotal: 141284000, difference: 0, tolerance: 5000, status: "Reconciled" },
        { id: "rec-cogs", statement: "Cost of sales — GL to inventory system", sourceTotal: 75900000, mappedTotal: 75896600, difference: 3400, tolerance: 10000, status: "Within tolerance" },
        { id: "rec-cash", statement: "Cash — GL to bank statement", sourceTotal: 45230000, mappedTotal: 45230000, difference: 0, tolerance: 1000, status: "Reconciled" },
        { id: "rec-ar", statement: "Trade receivables — GL to AR sub-ledger", sourceTotal: 8512000, mappedTotal: 6903600, difference: 1608400, tolerance: 25000, status: "Exception" },
      ],
      issues: [
        { id: "issue-unmapped-accounts", severity: "critical", category: "Mapping", title: "4 GL accounts are not mapped to a statement line", detail: "Balances are excluded from reported totals until mapped.", source: "General Ledger", affectedRecords: 4, firstSeen: "2026-03-02", status: "Open" },
        { id: "issue-recon-ar", severity: "critical", category: "Reconciliation", title: "Trade receivables is outside tolerance", detail: "Difference requires investigation.", source: "Reconciliation engine", affectedRecords: 1, firstSeen: "2026-03-03", status: "In review" },
        { id: "issue-duplicates", severity: "warning", category: "Duplicates", title: "47 duplicate transaction lines detected in the sales feed", detail: "Deduplicated on load; source export should be corrected.", source: "Point of Sale", affectedRecords: 47, firstSeen: "2026-02-27", status: "In review" },
      ],
      imports: [
        { id: "refresh-gl", feed: "General Ledger", completedAt: "2026-03-05T04:00:00.000Z", durationSeconds: 284, records: 184220, status: "Success" },
        { id: "refresh-sales", feed: "Sales Ledger", completedAt: "2026-03-05T03:00:00.000Z", durationSeconds: 392, records: 1942804, status: "Success" },
        { id: "refresh-payroll", feed: "Payroll", completedAt: "2026-03-05T02:00:00.000Z", durationSeconds: 412, records: 38411, status: "Warning", detail: "Completed late" },
      ],
      health: { integrityScore: 96.4 },
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
