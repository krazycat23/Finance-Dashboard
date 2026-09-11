import type {
  Account,
  Channel,
  CostCentre,
  Customer,
  Department,
  Entity,
  Location,
  Product,
} from "@/domain/models";

/**
 * DEMONSTRATION DIMENSIONS
 * ---------------------------------------------------------------------------
 * Deliberately generic: a multi-entity group, four channels, six product
 * categories, six regions. None of this is referenced by name anywhere in
 * `components/`. Replacing this file with a client's real structures is the
 * whole onboarding exercise.
 */

export const entities: Entity[] = [
  { id: "group", name: "Group", level: 0, currency: "AUD", externalId: "GRP", mappingStatus: "mapped" },
  { id: "retail-au", name: "Retail — Australia", parentId: "group", level: 1, currency: "AUD", externalId: "RAU", mappingStatus: "mapped" },
  { id: "retail-nz", name: "Retail — New Zealand", parentId: "group", level: 1, currency: "NZD", externalId: "RNZ", mappingStatus: "mapped" },
  { id: "wholesale", name: "Wholesale", parentId: "group", level: 1, currency: "AUD", externalId: "WHL", mappingStatus: "mapped" },
  { id: "digital", name: "Digital", parentId: "group", level: 1, currency: "AUD", externalId: "DIG", mappingStatus: "mapped" },
];

export const channels: Channel[] = [
  { id: "stores", name: "Stores", channelType: "direct", externalId: "CH-STR", mappingStatus: "mapped" },
  { id: "online", name: "Online", channelType: "direct", externalId: "CH-ONL", mappingStatus: "mapped" },
  { id: "wholesale", name: "Wholesale", channelType: "indirect", externalId: "CH-WHL", mappingStatus: "mapped" },
  { id: "marketplace", name: "Marketplace", channelType: "indirect", externalId: "CH-MKT", mappingStatus: "mapped" },
];

export const locations: Location[] = [
  { id: "nsw", name: "New South Wales", region: "NSW", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "vic", name: "Victoria", region: "VIC", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "qld", name: "Queensland", region: "QLD", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "sa", name: "South Australia", region: "SA", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "wa", name: "Western Australia", region: "WA", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "nz", name: "New Zealand", region: "NZ", country: "NZ", locationType: "region", mappingStatus: "mapped" },
];

export const products: Product[] = [
  { id: "womenswear", name: "Womenswear", category: "Apparel", mappingStatus: "mapped" },
  { id: "menswear", name: "Menswear", category: "Apparel", mappingStatus: "mapped" },
  { id: "footwear", name: "Footwear", category: "Footwear", mappingStatus: "mapped" },
  { id: "accessories", name: "Accessories", category: "Accessories", mappingStatus: "mapped" },
  { id: "home", name: "Home", category: "Home", mappingStatus: "mapped" },
  { id: "kids", name: "Kids", category: "Apparel", mappingStatus: "mapped" },
];

export const customers: Customer[] = [
  { id: "retail-consumer", name: "Retail Consumer", segment: "B2C", mappingStatus: "mapped" },
  { id: "key-accounts", name: "Key Accounts", segment: "B2B", mappingStatus: "mapped" },
  { id: "independents", name: "Independents", segment: "B2B", mappingStatus: "mapped" },
];

export const departments: Department[] = [
  { id: "commercial", name: "Commercial", mappingStatus: "mapped" },
  { id: "operations", name: "Operations", mappingStatus: "mapped" },
  { id: "technology", name: "Technology", mappingStatus: "mapped" },
  { id: "corporate", name: "Corporate", mappingStatus: "mapped" },
];

export const costCentres: CostCentre[] = [
  { id: "cc-1000", name: "Store Operations", departmentId: "operations", externalId: "1000", mappingStatus: "mapped" },
  { id: "cc-2000", name: "Marketing", departmentId: "commercial", externalId: "2000", mappingStatus: "mapped" },
  { id: "cc-3000", name: "Supply Chain", departmentId: "operations", externalId: "3000", mappingStatus: "mapped" },
  { id: "cc-4000", name: "Technology", departmentId: "technology", externalId: "4000", mappingStatus: "mapped" },
  { id: "cc-5000", name: "Head Office", departmentId: "corporate", externalId: "5000", mappingStatus: "mapped" },
];

/**
 * The chart of accounts. `line` is the mapping target — the statement tables
 * are built by grouping on it, so adding a GL account never requires a UI
 * change, only a mapping.
 */
export const accounts: Account[] = [
  // P&L
  { id: "a-4000", name: "Product Revenue", statement: "pnl", line: "revenue", sign: 1, externalId: "4000", mappingStatus: "mapped" },
  { id: "a-4100", name: "Freight Recovered", statement: "pnl", line: "revenue", sign: 1, externalId: "4100", mappingStatus: "mapped" },
  { id: "a-5000", name: "Cost of Goods Sold", statement: "pnl", line: "costOfSales", sign: -1, externalId: "5000", mappingStatus: "mapped" },
  { id: "a-5100", name: "Inbound Freight", statement: "pnl", line: "costOfSales", sign: -1, externalId: "5100", mappingStatus: "mapped" },
  { id: "a-5200", name: "Inventory Provisions", statement: "pnl", line: "costOfSales", sign: -1, externalId: "5200", mappingStatus: "mapped" },
  { id: "a-6000", name: "People Costs", statement: "pnl", line: "operatingCosts", sign: -1, costCategory: "People Costs", externalId: "6000", mappingStatus: "mapped" },
  { id: "a-6100", name: "Marketing", statement: "pnl", line: "operatingCosts", sign: -1, costCategory: "Marketing", externalId: "6100", mappingStatus: "mapped" },
  { id: "a-6200", name: "Occupancy", statement: "pnl", line: "operatingCosts", sign: -1, costCategory: "Occupancy", externalId: "6200", mappingStatus: "mapped" },
  { id: "a-6300", name: "Technology", statement: "pnl", line: "operatingCosts", sign: -1, costCategory: "Technology", externalId: "6300", mappingStatus: "mapped" },
  { id: "a-6400", name: "Logistics", statement: "pnl", line: "operatingCosts", sign: -1, costCategory: "Logistics", externalId: "6400", mappingStatus: "mapped" },
  { id: "a-6500", name: "Professional Fees", statement: "pnl", line: "operatingCosts", sign: -1, costCategory: "Professional Fees", externalId: "6500", mappingStatus: "mapped" },
  { id: "a-6900", name: "Other Operating Costs", statement: "pnl", line: "operatingCosts", sign: -1, costCategory: "Other", externalId: "6900", mappingStatus: "mapped" },
  { id: "a-7000", name: "Depreciation", statement: "pnl", line: "depreciationAmortisation", sign: -1, externalId: "7000", mappingStatus: "mapped" },
  { id: "a-7100", name: "Amortisation", statement: "pnl", line: "depreciationAmortisation", sign: -1, externalId: "7100", mappingStatus: "mapped" },
  { id: "a-8000", name: "Interest Expense", statement: "pnl", line: "interest", sign: -1, externalId: "8000", mappingStatus: "mapped" },
  { id: "a-9000", name: "Income Tax Expense", statement: "pnl", line: "tax", sign: -1, externalId: "9000", mappingStatus: "mapped" },

  // Balance sheet
  { id: "a-1000", name: "Cash and Cash Equivalents", statement: "balance", line: "cash", sign: 1, externalId: "1000", mappingStatus: "mapped" },
  { id: "a-1100", name: "Trade Receivables", statement: "balance", line: "tradeReceivables", sign: 1, externalId: "1100", mappingStatus: "mapped" },
  { id: "a-1200", name: "Inventory", statement: "balance", line: "inventory", sign: 1, externalId: "1200", mappingStatus: "mapped" },
  { id: "a-1300", name: "Other Current Assets", statement: "balance", line: "otherCurrentAssets", sign: 1, externalId: "1300", mappingStatus: "mapped" },
  { id: "a-1500", name: "Property, Plant and Equipment", statement: "balance", line: "propertyPlantEquipment", sign: 1, externalId: "1500", mappingStatus: "mapped" },
  { id: "a-1600", name: "Intangible Assets", statement: "balance", line: "intangibleAssets", sign: 1, externalId: "1600", mappingStatus: "mapped" },
  { id: "a-1700", name: "Right-of-Use Assets", statement: "balance", line: "rightOfUseAssets", sign: 1, externalId: "1700", mappingStatus: "mapped" },
  { id: "a-1800", name: "Other Non-Current Assets", statement: "balance", line: "otherNonCurrentAssets", sign: 1, externalId: "1800", mappingStatus: "mapped" },
  { id: "a-2000", name: "Trade Payables", statement: "balance", line: "tradePayables", sign: -1, externalId: "2000", mappingStatus: "mapped" },
  { id: "a-2100", name: "Borrowings — Current", statement: "balance", line: "borrowingsCurrent", sign: -1, externalId: "2100", mappingStatus: "mapped" },
  { id: "a-2200", name: "Lease Liabilities — Current", statement: "balance", line: "leaseLiabilitiesCurrent", sign: -1, externalId: "2200", mappingStatus: "mapped" },
  { id: "a-2300", name: "Other Current Liabilities", statement: "balance", line: "otherCurrentLiabilities", sign: -1, externalId: "2300", mappingStatus: "mapped" },
  { id: "a-2500", name: "Borrowings — Non-Current", statement: "balance", line: "borrowingsNonCurrent", sign: -1, externalId: "2500", mappingStatus: "mapped" },
  { id: "a-2600", name: "Lease Liabilities — Non-Current", statement: "balance", line: "leaseLiabilitiesNonCurrent", sign: -1, externalId: "2600", mappingStatus: "mapped" },
  { id: "a-2700", name: "Other Non-Current Liabilities", statement: "balance", line: "otherNonCurrentLiabilities", sign: -1, externalId: "2700", mappingStatus: "mapped" },
  { id: "a-3000", name: "Share Capital", statement: "balance", line: "shareCapital", sign: -1, externalId: "3000", mappingStatus: "mapped" },
  { id: "a-3100", name: "Retained Earnings", statement: "balance", line: "retainedEarnings", sign: -1, externalId: "3100", mappingStatus: "mapped" },
];

/** Cost categories, derived from the chart of accounts rather than listed. */
export const costCategories = Array.from(
  new Set(accounts.filter((a) => a.costCategory).map((a) => a.costCategory!)),
);
