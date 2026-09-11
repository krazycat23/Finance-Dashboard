import type { CompanyProfile, ReportingDataset } from "@/domain/data";
import type { ScenarioKind, StatementLine } from "@/domain/models";

export type DatasetType = "finance_actual" | "budget" | "forecast" | "sales" | "operational_kpi" | "account_master" | "gl_mapping" | "entity_master" | "product_master" | "customer_master" | "location_master" | "financial_calendar" | "ignored" | "unknown";
export type InferredValueType = "string" | "number" | "date" | "boolean" | "currency-like" | "percentage-like" | "identifier";
export type ImportStatus = "staged" | "classified" | "mapped" | "validated" | "ready" | "error";
export type CanonicalField = "period" | "date" | "entityId" | "entityName" | "accountId" | "accountName" | "departmentId" | "costCentreId" | "amount" | "debit" | "credit" | "currency" | "revenue" | "units" | "cost" | "orders" | "locationId" | "channelId" | "productId" | "customerId" | "metricId" | "value" | "fiscalYear" | "fiscalPeriod" | "fiscalQuarter" | "periodStart" | "periodEnd" | "custom" | "ignore";

export interface ImportSource { id: string; companyId: string; filename: string; fileType: "csv" | "xlsx" | "json"; uploadedAt: string; sheetNames?: string[]; }
export interface ColumnProfile { name: string; inferredType: InferredValueType; nonNullCount: number; nullPercent: number; distinctCount: number; samples: unknown[]; min?: number | string; max?: number | string; }
export interface Classification { type: DatasetType; confidence: number; reasons: string[]; }
export interface TableRange { headerRow: number; startRow: number; endRow: number; startColumn?: number; endColumn?: number; confidence: number; requiresConfirmation?: boolean; }
export interface StagedDataset { id: string; sourceFileId: string; sourceSheet?: string; columns: ColumnProfile[]; rows: ReadonlyArray<Record<string, unknown>>; rawGrid?: unknown[][]; inferred: Classification; confirmedType?: DatasetType; status: ImportStatus; warnings: string[]; errors: string[]; tableRange?: TableRange; rangeConfirmed?: boolean; wideUnpivot?: WideUnpivotConfiguration; }
export interface WideUnpivotConfiguration { identifierColumns: string[]; valueColumns: string[]; periodFromColumn: boolean; scenarioFromColumn?: boolean; valueField?: string; scenario?: "actual" | "budget" | "forecast"; }
export interface FieldMapping { id: string; datasetId: string; sourceColumn: string; canonicalField: CanonicalField; status: "mapped" | "review" | "ignored" | "custom"; confidence?: number; customDimensionId?: string; sign?: 1 | -1; }
export interface MappingRule { id: string; companyId: string; priority: number; kind: "exact" | "prefix" | "range" | "nameContains"; value: string; statement: "pnl" | "balance" | "cashflow"; line: StatementLine; sign: 1 | -1; sourceMultiplier?: 1 | -1; reportingHierarchy?: { p1?: string; p2?: string; p3?: string; pnlSection?: string }; calculationRole?: import("@/domain/models").CanonicalCalculationRole; mappingSource?: "authoritative_file" | "approved_rule" | "manual"; mappingSourceFile?: string; mappingStatus?: import("@/domain/models").AccountMappingStatus; confidence?: number; authoritative?: boolean; }
export interface CustomDimensionDefinition { id: string; companyId: string; name: string; sourceColumn: string; }
export interface IngestionIssue { id: string; severity: "info" | "warning" | "error"; datasetId: string; field?: string; message: string; affectedRows: number; samples: Record<string, unknown>[]; recommendedAction: string; }
export interface IngestionReconciliation { id: string; label: string; sourceTotal: number; targetTotal: number; difference: number; differencePercent?: number; tolerance: number; status: "Reconciled" | "Within tolerance" | "Exception"; stage?: "raw" | "unpivot" | "sign" | "mapped" | "canonical"; }
export interface IngestionCompany { id: string; profile: CompanyProfile; createdAt: string; updatedAt: string; }
export interface ScenarioSetup { datasetId: string; scenarioId: string; kind: ScenarioKind; label: string; version?: string; asOfDate?: string; }
export interface CalendarSetup { datasetId?: string; fiscalYearStartMonth: number; fiscalYearLabel: "startYear" | "endYear"; mappings?: Partial<Record<CanonicalField, string>>; }
export interface ImportWorkspace { company: IngestionCompany; sources: ImportSource[]; datasets: StagedDataset[]; mappings: FieldMapping[]; rules: MappingRule[]; customDimensions: CustomDimensionDefinition[]; scenarios: ScenarioSetup[]; calendar: CalendarSetup; issues: IngestionIssue[]; reconciliations: IngestionReconciliation[]; activatedDataset?: ReportingDataset; }
