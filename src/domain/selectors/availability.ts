import { getReportingDataset, type ReportingDataset, type DatasetCapabilities } from "@/domain/data";

export const capabilityLabels: Record<keyof DatasetCapabilities, string> = { hasPnl: "P&L", hasBalanceSheet: "Balance Sheet", hasCashFlow: "Cash Flow", hasSales: "Monthly sales", hasWeeklySales: "Weekly sales", hasBudget: "Budget", hasForecast: "Forecast", hasOperationalKpis: "Operational KPIs" };
export type ReportingModule = "overview" | "sales" | "weekly" | "pnl" | "balance" | "cashflow" | "forecast" | "kpis" | "variance";
export function reportingCapabilities(dataset: ReportingDataset = getReportingDataset()): DatasetCapabilities {
  if (dataset.capabilities) return dataset.capabilities;
  // Legacy adapters, including MockDataAdapter, predate capability flags.
  const lines = new Set(dataset.dimensions.accounts.filter(account => account.statement === "balance").map(account => account.id));
  return { hasPnl: dataset.financeRecords.length > 0, hasBalanceSheet: dataset.financeRecords.some(record => lines.has(record.accountId)), hasCashFlow: dataset.cashFlowRecords.length > 0, hasSales: dataset.salesRecords.length > 0, hasWeeklySales: dataset.weeklySalesRecords.length > 0, hasBudget: dataset.financeRecords.some(record => record.budget !== undefined), hasForecast: dataset.financeRecords.some(record => record.forecast !== undefined), hasOperationalKpis: dataset.operationalRecords.length > 0 };
}
export function selectModuleAvailability(module: ReportingModule, dataset: ReportingDataset = getReportingDataset()): { available: boolean; message: string } {
  const c = reportingCapabilities(dataset);
  const available = { overview: c.hasPnl || c.hasSales || c.hasWeeklySales || c.hasBalanceSheet || c.hasCashFlow, sales: c.hasSales || c.hasWeeklySales, weekly: c.hasWeeklySales, pnl: c.hasPnl, balance: c.hasBalanceSheet, cashflow: c.hasCashFlow, forecast: c.hasForecast && !!dataset.forecastConfiguration, kpis: c.hasOperationalKpis, variance: c.hasPnl && c.hasBudget }[module];
  const label = { overview: "Reporting", sales: "Sales", weekly: "Weekly sales", pnl: "P&L", balance: "Balance Sheet", cashflow: "Cash Flow", forecast: "Forecast reporting", kpis: "Operational KPI", variance: "Budget variance" }[module];
  return { available, message: `${label} data has not been configured for this company.` };
}
/** Absence is null, never a synthetic numeric zero. Guards do not invoke unsupported selectors. */
export function selectAvailable<T>(module: ReportingModule, selector: () => T, dataset: ReportingDataset = getReportingDataset()): T | null {
  return selectModuleAvailability(module, dataset).available ? selector() : null;
}
