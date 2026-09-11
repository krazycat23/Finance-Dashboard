import type {
  Account, CashFlowRecord, Channel, CostCentre, Customer, Department, Entity,
  FinanceRecord, Location, OperationalRecord, Period, Product, SalesRecord,
  ScenarioDefinition,
} from "@/domain/models";

export interface CompanyProfile {
  companyName: string;
  shortName?: string;
  tagline?: string;
  reportingCurrency: string;
  currencySymbol: string;
  locale: string;
  defaultScale: "units" | "thousands" | "millions";
  fiscalCalendar: { periodicity: "monthly"; fiscalYearStartMonth: number; fiscalYearLabel: "startYear" | "endYear" };
  defaultTheme?: "light" | "dark";
}

export interface ScenarioRoles { actual: string; budget: string; forecast: string; }
export interface ForecastScenarioInput { id: string; name: string; revenueFactor: number; marginShift: number; probability: number; description: string; }
export interface ForecastRiskInput { id: string; title: string; detail: string; valueFactor: number; type: "risk" | "opportunity"; confidence: "High" | "Medium" | "Low"; }
export interface ForecastDriverDefinition { id: string; driver: string; basis: string; }
export interface ForecastConfiguration { scenarios: ForecastScenarioInput[]; risksAndOpportunities: ForecastRiskInput[]; drivers?: ForecastDriverDefinition[]; }

export interface MappingSummaryInput { dimension: string; total: number; mapped: number; unmapped: number; review: number; valueCoverage: number; }
export interface UnmappedMember { id: string; dimension: "accounts" | "products"; externalId: string; name: string; value?: number; suggestedLine?: string; suggestedCategory?: string; confidence?: number; }
export interface DataIssue { id: string; severity: "critical" | "warning" | "info"; category: "Mapping" | "Reconciliation" | "Duplicates" | "Completeness" | "Timeliness"; title: string; detail: string; source: string; affectedRecords: number; firstSeen: string; status: "Open" | "In review" | "Resolved"; }
export interface ReconciliationResult { id: string; statement: string; sourceTotal: number; mappedTotal: number; difference: number; tolerance: number; status: "Reconciled" | "Within tolerance" | "Exception"; }
export interface ImportEvent { id: string; feed: string; completedAt: string; durationSeconds: number; records: number; status: "Success" | "Warning" | "Failed"; detail?: string; }
export interface DataHealthInput { integrityScore: number; mappingWeight?: number; reconciliationWeight?: number; integrityWeight?: number; timelinessWeight?: number; }
export interface ReportingDataQuality { mappingSummaries: MappingSummaryInput[]; unmappedMembers: UnmappedMember[]; issues: DataIssue[]; reconciliations: ReconciliationResult[]; imports: ImportEvent[]; health: DataHealthInput; }

export interface ReportingDimensions {
  entities: Entity[];
  accounts: Account[];
  departments: Department[];
  costCentres: CostCentre[];
  locations: Location[];
  channels: Channel[];
  products: Product[];
  customers: Customer[];
}

export interface ReportingDataset {
  id: string;
  source: "demo" | "import" | "api";
  periods: Period[];
  weeks: Period[];
  dimensions: ReportingDimensions;
  financeRecords: FinanceRecord[];
  salesRecords: SalesRecord[];
  weeklySalesRecords: SalesRecord[];
  operationalRecords: OperationalRecord[];
  cashFlowRecords: CashFlowRecord[];
  scenarios: ScenarioDefinition[];
  currentPeriodId: string;
  defaultEntityId: string;
  profile: CompanyProfile;
  scenarioRoles: ScenarioRoles;
  forecastConfiguration?: ForecastConfiguration;
  /** Demo-only narrative inputs; generic selectors do not own company assumptions. */
  dataQuality: ReportingDataQuality;
}

export interface ReportingDataAdapter {
  readonly id: string;
  load(): ReportingDataset;
}
