import type { CanonicalCalculationRole, StatementLine } from "@/domain/models";
import { CANONICAL_REPORTING_SCHEMA_VERSION, type CanonicalReportingPackageV1 } from "./contract";

export type CanonicalValidationCode = "invalid_package" | "invalid_schema_version" | "invalid_manifest" | "invalid_id" | "duplicate_id" | "orphan_period" | "orphan_entity" | "orphan_account" | "orphan_dimension" | "orphan_scenario" | "invalid_canonical_role" | "invalid_number" | "reconciliation_failure";
export interface CanonicalValidationIssue { code: CanonicalValidationCode; path: string; message: string }
export interface CanonicalValidationResult { valid: boolean; errors: CanonicalValidationIssue[]; checkedRecords: number; checkedReconciliations: number }

const STATEMENT_LINES = new Set<StatementLine>(["unconfirmed", "grossSales", "markdowns", "returns", "netSales", "revenue", "costOfSales", "grossProfit", "operatingCosts", "ebitda", "depreciationAmortisation", "ebit", "interest", "tax", "netProfit", "cash", "tradeReceivables", "inventory", "otherCurrentAssets", "totalCurrentAssets", "propertyPlantEquipment", "intangibleAssets", "rightOfUseAssets", "otherNonCurrentAssets", "totalNonCurrentAssets", "totalAssets", "tradePayables", "borrowingsCurrent", "leaseLiabilitiesCurrent", "otherCurrentLiabilities", "totalCurrentLiabilities", "borrowingsNonCurrent", "leaseLiabilitiesNonCurrent", "otherNonCurrentLiabilities", "totalNonCurrentLiabilities", "totalLiabilities", "shareCapital", "retainedEarnings", "totalEquity", "totalLiabilitiesAndEquity", "operatingCashFlow", "investingCashFlow", "financingCashFlow", "netCashMovement"]);
const CALCULATION_ROLES = new Set<CanonicalCalculationRole>(["grossSales", "markdowns", "returns", "revenue", "netSales", "costOfSales", "tradingIncome", "tradingCost", "tradingIncomeCost", "operatingCosts", "depreciationAmortisation", "interest", "tax", "unconfirmed"]);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function validateCanonicalReportingPackage(value: unknown): CanonicalValidationResult {
  const errors: CanonicalValidationIssue[] = [];
  const add = (code: CanonicalValidationCode, path: string, message: string) => errors.push({ code, path, message });
  if (!isObject(value)) return { valid: false, errors: [{ code: "invalid_package", path: "$", message: "Package must be an object." }], checkedRecords: 0, checkedReconciliations: 0 };
  const pkg = value as unknown as CanonicalReportingPackageV1;
  if (pkg.schemaVersion !== CANONICAL_REPORTING_SCHEMA_VERSION) add("invalid_schema_version", "schemaVersion", "Unsupported schema version " + String(pkg.schemaVersion) + ".");
  if (!isObject(pkg.adapterManifest) || pkg.adapterManifest.schemaVersion !== pkg.schemaVersion || typeof pkg.adapterManifest.id !== "string" || !pkg.adapterManifest.id.trim()) add("invalid_manifest", "adapterManifest", "Manifest must identify an adapter and target the package schema version.");

  const ids = (items: unknown, path: string) => {
    const result = new Set<string>();
    asArray(items).forEach((item, index) => {
      const id = isObject(item) ? item.id : undefined;
      if (typeof id !== "string" || !id.trim()) add("invalid_id", path + "[" + index + "].id", "IDs must be non-empty strings; identifiers are never numerically coerced.");
      else if (result.has(id)) add("duplicate_id", path + "[" + index + "].id", "Duplicate ID " + id + ".");
      else result.add(id);
    });
    return result;
  };

  const periodIds = ids(pkg.periods, "periods");
  const weekIds = ids(pkg.weeks, "weeks");
  const dimensions: Record<string, unknown> = isObject(pkg.dimensions) ? pkg.dimensions as unknown as Record<string, unknown> : {};
  const entityIds = ids(dimensions.entities, "dimensions.entities");
  const accountIds = ids(dimensions.accounts, "dimensions.accounts");
  const departmentIds = ids(dimensions.departments, "dimensions.departments");
  const costCentreIds = ids(dimensions.costCentres, "dimensions.costCentres");
  const locationIds = ids(dimensions.locations, "dimensions.locations");
  const channelIds = ids(dimensions.channels, "dimensions.channels");
  const productIds = ids(dimensions.products, "dimensions.products");
  const customerIds = ids(dimensions.customers, "dimensions.customers");
  const scenarioIds = ids(pkg.scenarios, "scenarios");
  if (!periodIds.has(pkg.currentPeriodId)) add("orphan_period", "currentPeriodId", "Current period must reference periods.");
  if (!entityIds.has(pkg.defaultEntityId)) add("orphan_entity", "defaultEntityId", "Default entity must reference dimensions.entities.");

  asArray(dimensions.entities).forEach((raw, index) => { if (isObject(raw) && typeof raw.parentId === "string" && !entityIds.has(raw.parentId)) add("orphan_entity", "dimensions.entities[" + index + "].parentId", "Entity parent does not exist."); });
  asArray(dimensions.departments).forEach((raw, index) => { if (isObject(raw) && typeof raw.entityId === "string" && !entityIds.has(raw.entityId)) add("orphan_entity", "dimensions.departments[" + index + "].entityId", "Department entity does not exist."); });
  asArray(dimensions.costCentres).forEach((raw, index) => { if (isObject(raw) && typeof raw.departmentId === "string" && !departmentIds.has(raw.departmentId)) add("orphan_dimension", "dimensions.costCentres[" + index + "].departmentId", "Cost-centre department does not exist."); });
  asArray(dimensions.locations).forEach((raw, index) => { if (isObject(raw) && typeof raw.parentId === "string" && !locationIds.has(raw.parentId)) add("orphan_dimension", "dimensions.locations[" + index + "].parentId", "Location parent does not exist."); });
  asArray(dimensions.accounts).forEach((raw, index) => {
    if (!isObject(raw)) return;
    if (!STATEMENT_LINES.has(raw.line as StatementLine)) add("invalid_canonical_role", "dimensions.accounts[" + index + "].line", "Unknown statement line " + String(raw.line) + ".");
    if (raw.calculationRole !== undefined && !CALCULATION_ROLES.has(raw.calculationRole as CanonicalCalculationRole)) add("invalid_canonical_role", "dimensions.accounts[" + index + "].calculationRole", "Unknown calculation role " + String(raw.calculationRole) + ".");
  });

  let checkedRecords = 0;
  const finite = (record: Record<string, unknown>, path: string) => ["actual", "budget", "forecast", "priorYear", "revenue", "units", "cost", "orders", "transactions", "traffic", "writtenRevenue", "priorYearRevenue", "budgetRevenue", "value", "target", "ebitda", "cash", "operatingCashFlow", "investingCashFlow", "financingCashFlow", "netCashMovement", "capex", "workingCapitalMovement", "interest", "tax", "dividends"].forEach((key) => { const measure = record[key]; if (measure !== undefined && (typeof measure !== "number" || !Number.isFinite(measure))) add("invalid_number", path + "." + key, "Canonical measures must be finite numbers."); });
  const references = (records: unknown, path: string, allowedPeriods: Set<string>, accountRequired = false) => asArray(records).forEach((raw, index) => {
    checkedRecords += 1;
    if (!isObject(raw)) { add("invalid_package", path + "[" + index + "]", "Record must be an object."); return; }
    if (typeof raw.periodId !== "string" || !allowedPeriods.has(raw.periodId)) add("orphan_period", path + "[" + index + "].periodId", "Record period does not exist.");
    if (typeof raw.entityId !== "string" || !entityIds.has(raw.entityId)) add("orphan_entity", path + "[" + index + "].entityId", "Record entity does not exist.");
    if (accountRequired && (typeof raw.accountId !== "string" || !accountIds.has(raw.accountId))) add("orphan_account", path + "[" + index + "].accountId", "Finance record account does not exist.");
    const optional: Array<[string, Set<string>]> = [["departmentId", departmentIds], ["costCentreId", costCentreIds], ["locationId", locationIds], ["channelId", channelIds], ["productId", productIds], ["customerId", customerIds]];
    optional.forEach(([key, set]) => { if (raw[key] !== undefined && (typeof raw[key] !== "string" || !set.has(raw[key] as string))) add("orphan_dimension", path + "[" + index + "]." + key, "Record dimension does not exist."); });
    asArray(raw.scenarioValues).forEach((entry, item) => { if (!isObject(entry) || typeof entry.scenarioId !== "string" || !scenarioIds.has(entry.scenarioId)) add("orphan_scenario", path + "[" + index + "].scenarioValues[" + item + "].scenarioId", "Scenario value references an unknown scenario."); });
    finite(raw, path + "[" + index + "]");
  });
  references(pkg.financeRecords, "financeRecords", periodIds, true);
  references(pkg.salesRecords, "salesRecords", periodIds);
  references(pkg.weeklySalesRecords, "weeklySalesRecords", weekIds);
  references(pkg.operationalRecords, "operationalRecords", periodIds);
  references(pkg.cashFlowRecords, "cashFlowRecords", periodIds);
  asArray(pkg.cashFlowRecords).forEach((raw, index) => { if (isObject(raw) && (typeof raw.scenarioId !== "string" || !scenarioIds.has(raw.scenarioId))) add("orphan_scenario", "cashFlowRecords[" + index + "].scenarioId", "Cash-flow record scenario does not exist."); });

  let checkedReconciliations = 0;
  asArray(pkg.reconciliations).forEach((raw, index) => {
    checkedReconciliations += 1;
    if (!isObject(raw) || ![raw.sourceTotal, raw.canonicalTotal, raw.difference, raw.tolerance].every((n) => typeof n === "number" && Number.isFinite(n))) { add("invalid_number", "reconciliations[" + index + "]", "Reconciliation values must be finite numbers."); return; }
    const computed = (raw.canonicalTotal as number) - (raw.sourceTotal as number);
    if (Math.abs(computed - (raw.difference as number)) > 1e-6 || Math.abs(computed) > (raw.tolerance as number)) add("reconciliation_failure", "reconciliations[" + index + "]", "Canonical total is outside tolerance or the declared difference is incorrect.");
  });
  if (!Array.isArray(pkg.reconciliations) || pkg.reconciliations.length === 0) add("reconciliation_failure", "reconciliations", "At least one reconciliation is required.");
  return { valid: errors.length === 0, errors, checkedRecords, checkedReconciliations };
}

export function assertCanonicalReportingPackage(value: unknown): asserts value is CanonicalReportingPackageV1 {
  const result = validateCanonicalReportingPackage(value);
  if (!result.valid) throw new Error("Invalid canonical reporting package:\n" + result.errors.map((issue) => "- [" + issue.code + "] " + issue.path + ": " + issue.message).join("\n"));
}
