import type {
  Account, CashFlowRecord, Channel, CostCentre, Customer, Department, Entity,
  FinanceRecord, Location, OperationalRecord, Period, Product, SalesRecord,
  ScenarioDefinition,
} from "@/domain/models";

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
  /** Demo-only narrative inputs; generic selectors do not own company assumptions. */
  demo?: { scenarios?: unknown; risksAndOpportunities?: unknown[] };
  mapping?: { statuses?: unknown[]; issues?: unknown[]; reconciliations?: unknown[]; imports?: unknown[] };
}

export interface ReportingDataAdapter {
  readonly id: string;
  load(): ReportingDataset;
}
