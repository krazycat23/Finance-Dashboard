/**
 * CANONICAL DIMENSIONS
 * ---------------------------------------------------------------------------
 * Every dimension carries an `externalId` and `mappingStatus`. That pair is the
 * onboarding seam: a client's raw ERP code is retained alongside the canonical
 * id, and the Data & Mapping page reports on anything not yet mapped. The
 * reporting layer only ever reads canonical ids, so an unmapped account is
 * visible as an exception rather than silently distorting a total.
 */

export type MappingStatus = "mapped" | "unmapped" | "review" | "excluded";
export type AccountMappingStatus = "Authoritative" | "Approved Rule" | "Manually Confirmed" | "Needs Review" | "Unmapped";
export type CanonicalCalculationRole = "grossSales" | "markdowns" | "netSales" | "costOfSales" | "tradingIncomeCost" | "operatingCosts" | "depreciationAmortisation" | "interest" | "tax" | "unconfirmed";

export interface DimensionBase {
  id: string;
  name: string;
  /** The code as it appears in the source system. */
  externalId?: string;
  mappingStatus?: MappingStatus;
}

/** Which statement an account rolls into, and where. */
export type StatementType = "pnl" | "balance" | "cashflow";

/**
 * Canonical statement lines. A client's chart of accounts maps onto these;
 * the statement tables are generated from them rather than hardcoded, so a
 * company with 4,000 GL accounts and one with 40 render identically.
 */
export type StatementLine =
  // P&L
  | "revenue"
  | "costOfSales"
  | "grossProfit"
  | "operatingCosts"
  | "ebitda"
  | "depreciationAmortisation"
  | "ebit"
  | "interest"
  | "tax"
  | "netProfit"
  // Balance sheet
  | "cash"
  | "tradeReceivables"
  | "inventory"
  | "otherCurrentAssets"
  | "totalCurrentAssets"
  | "propertyPlantEquipment"
  | "intangibleAssets"
  | "rightOfUseAssets"
  | "otherNonCurrentAssets"
  | "totalNonCurrentAssets"
  | "totalAssets"
  | "tradePayables"
  | "borrowingsCurrent"
  | "leaseLiabilitiesCurrent"
  | "otherCurrentLiabilities"
  | "totalCurrentLiabilities"
  | "borrowingsNonCurrent"
  | "leaseLiabilitiesNonCurrent"
  | "otherNonCurrentLiabilities"
  | "totalNonCurrentLiabilities"
  | "totalLiabilities"
  | "shareCapital"
  | "retainedEarnings"
  | "totalEquity"
  | "totalLiabilitiesAndEquity"
  // Cash flow
  | "operatingCashFlow"
  | "investingCashFlow"
  | "financingCashFlow"
  | "netCashMovement";

export interface Account extends DimensionBase {
  statement: StatementType;
  /** Canonical line this account aggregates into. */
  line: StatementLine;
  /**
   * Natural sign convention. Costs are stored as positive magnitudes and
   * carry sign -1, so presentation and arithmetic never disagree about
   * whether "Cost of Sales 67,373" is an inflow.
   */
  sign: 1 | -1;
  /** Optional grouping for cost composition analysis. */
  costCategory?: string;
  /** Client reporting hierarchy, deliberately independent of arithmetic role. */
  reportingHierarchy?: { p1?: string; p2?: string; p3?: string; pnlSection?: string };
  calculationRole?: CanonicalCalculationRole;
  sourceMultiplier?: 1 | -1;
  mappingSource?: "authoritative_file" | "approved_rule" | "manual" | "unmapped";
  mappingSourceFile?: string;
  accountMappingStatus?: AccountMappingStatus;
  mappingConfidence?: number;
  authoritative?: boolean;
}

export interface Entity extends DimensionBase {
  parentId?: string;
  currency?: string;
  /** Depth in the hierarchy; 0 = group. */
  level: number;
}

export interface Department extends DimensionBase {
  entityId?: string;
}

export interface CostCentre extends DimensionBase {
  departmentId?: string;
}

export interface Location extends DimensionBase {
  region: string;
  country?: string;
  /** Store, warehouse, office, online — deliberately free-form. */
  locationType?: string;
}

export interface Channel extends DimensionBase {
  /** Direct-to-consumer, wholesale, marketplace, etc. */
  channelType?: string;
}

export interface Product extends DimensionBase {
  category: string;
  subCategory?: string;
}

export interface Customer extends DimensionBase {
  segment?: string;
}
