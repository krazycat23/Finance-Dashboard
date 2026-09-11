import type { StatementLine } from "./dimensions";

/**
 * FACT TABLES
 * ---------------------------------------------------------------------------
 * Two narrow fact shapes cover the whole product. Scenarios (actual, budget,
 * forecast, prior year) are columns rather than rows so that a variance is a
 * subtraction on one record, not a join.
 */

export interface FinanceRecord {
  periodId: string;
  entityId: string;
  accountId: string;
  departmentId?: string;
  costCentreId?: string;
  actual?: number;
  budget?: number;
  forecast?: number;
  priorYear?: number;
}

export interface SalesRecord {
  periodId: string;
  entityId: string;
  locationId?: string;
  channelId?: string;
  productId?: string;
  customerId?: string;
  revenue: number;
  units?: number;
  cost?: number;
  orders?: number;
  transactions?: number;
  traffic?: number;
  /** Revenue for the comparable prior-year period, for like-for-like. */
  priorYearRevenue?: number;
  /** Excluded from like-for-like (new or closed locations). */
  comparable?: boolean;
  budgetRevenue?: number;
}

/** An operational (non-financial) measure, kept generic on purpose. */
export interface OperationalRecord {
  periodId: string;
  entityId: string;
  locationId?: string;
  metricId: string;
  value: number;
  target?: number;
  priorYear?: number;
}

export type Scenario = "actual" | "budget" | "forecast" | "priorYear";

/** A measure resolved across scenarios, ready for presentation. */
export interface MeasureValue {
  metricId: string;
  actual: number;
  budget?: number;
  forecast?: number;
  priorYear?: number;
}

/** One row of a rendered financial statement. */
export interface StatementRow {
  line: StatementLine;
  label: string;
  /** Rendering weight: how strongly the row is emphasised. */
  emphasis: "detail" | "subtotal" | "total";
  /** Indent depth for nested detail. */
  depth?: number;
  actual: number;
  budget?: number;
  forecast?: number;
  priorYear?: number;
  /** True where a positive variance is unfavourable (cost lines). */
  inverse?: boolean;
  /** Rows that are pure structure (a spacer or section caption). */
  isSection?: boolean;
}
