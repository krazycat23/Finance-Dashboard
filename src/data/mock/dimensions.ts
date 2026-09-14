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


/**
 * THE STORE ESTATE
 * ---------------------------------------------------------------------------
 * Stores are locations like any other, distinguished only by `locationType`
 * and by pointing at their region through `parentId`. Sales for the store
 * channel are carried at this grain, so a regional view is a roll-up rather
 * than a separate fact table, and nothing in the selector layer needs to know
 * that "store" is a special kind of place.
 *
 * `share` is the store's portion of its region, and the shares within a region
 * sum to 1 — the regional weights in the sales generator are unchanged by the
 * estate being described in more detail.
 */
export interface StoreDefinition {
  id: string;
  name: string;
  regionId: string;
  format: "Flagship" | "Metro" | "Suburban" | "Outlet";
  share: number;
  openedOn: string;
  /** False while a store is outside the like-for-like base. */
  comparable: boolean;
  /**
   * Compound monthly growth specific to this store, on top of the group's.
   * Without it every store in a region is a scaled copy of every other one
   * and a store ranking says nothing a regional ranking has not already said.
   */
  growthAdj: number;
}

export const stores: StoreDefinition[] = [
  { id: "st-syd-cbd", name: "Sydney CBD", regionId: "nsw", format: "Flagship", share: 0.31, openedOn: "2009-03-01", comparable: true, growthAdj: 0.0031 },
  { id: "st-bondi", name: "Bondi Junction", regionId: "nsw", format: "Metro", share: 0.22, openedOn: "2013-09-01", comparable: true, growthAdj: 0.0048 },
  { id: "st-parramatta", name: "Parramatta", regionId: "nsw", format: "Suburban", share: 0.19, openedOn: "2016-04-01", comparable: true, growthAdj: -0.0012 },
  { id: "st-chatswood", name: "Chatswood", regionId: "nsw", format: "Suburban", share: 0.16, openedOn: "2018-10-01", comparable: true, growthAdj: 0.0006 },
  { id: "st-newcastle", name: "Newcastle", regionId: "nsw", format: "Outlet", share: 0.12, openedOn: "2024-11-01", comparable: false, growthAdj: 0.0072 },

  { id: "st-melb-cbd", name: "Melbourne CBD", regionId: "vic", format: "Flagship", share: 0.34, openedOn: "2010-08-01", comparable: true, growthAdj: 0.0019 },
  { id: "st-chadstone", name: "Chadstone", regionId: "vic", format: "Metro", share: 0.28, openedOn: "2014-03-01", comparable: true, growthAdj: 0.0037 },
  { id: "st-richmond", name: "Richmond", regionId: "vic", format: "Suburban", share: 0.22, openedOn: "2017-06-01", comparable: true, growthAdj: -0.0035 },
  { id: "st-geelong", name: "Geelong", regionId: "vic", format: "Outlet", share: 0.16, openedOn: "2019-02-01", comparable: true, growthAdj: -0.0021 },

  { id: "st-bris-cbd", name: "Brisbane CBD", regionId: "qld", format: "Flagship", share: 0.4, openedOn: "2011-05-01", comparable: true, growthAdj: 0.0009 },
  { id: "st-gold-coast", name: "Gold Coast", regionId: "qld", format: "Metro", share: 0.33, openedOn: "2015-11-01", comparable: true, growthAdj: 0.0044 },
  { id: "st-chermside", name: "Chermside", regionId: "qld", format: "Suburban", share: 0.27, openedOn: "2020-09-01", comparable: true, growthAdj: -0.0028 },

  { id: "st-adel-cbd", name: "Adelaide CBD", regionId: "sa", format: "Flagship", share: 0.62, openedOn: "2012-02-01", comparable: true, growthAdj: 0.0015 },
  { id: "st-marion", name: "Marion", regionId: "sa", format: "Suburban", share: 0.38, openedOn: "2018-03-01", comparable: true, growthAdj: -0.0009 },

  // The Western Australian estate is mid-refit, which is why the region sits
  // outside the like-for-like base.
  { id: "st-perth-cbd", name: "Perth CBD", regionId: "wa", format: "Flagship", share: 0.44, openedOn: "2013-07-01", comparable: false, growthAdj: 0.0026 },
  { id: "st-karrinyup", name: "Karrinyup", regionId: "wa", format: "Metro", share: 0.31, openedOn: "2016-10-01", comparable: false, growthAdj: -0.0046 },
  { id: "st-joondalup", name: "Joondalup", regionId: "wa", format: "Suburban", share: 0.25, openedOn: "2021-04-01", comparable: false, growthAdj: 0.0011 },

  { id: "st-auckland", name: "Auckland CBD", regionId: "nz", format: "Flagship", share: 0.38, openedOn: "2012-09-01", comparable: true, growthAdj: 0.0034 },
  { id: "st-sylvia-park", name: "Sylvia Park", regionId: "nz", format: "Metro", share: 0.26, openedOn: "2015-05-01", comparable: true, growthAdj: 0.0002 },
  { id: "st-wellington", name: "Wellington", regionId: "nz", format: "Suburban", share: 0.21, openedOn: "2017-11-01", comparable: true, growthAdj: -0.0018 },
  { id: "st-christchurch", name: "Christchurch", regionId: "nz", format: "Suburban", share: 0.15, openedOn: "2022-08-01", comparable: true, growthAdj: 0.0053 },
];

const REGION_META: Record<string, { region: string; country: string }> = {
  nsw: { region: "NSW", country: "AU" },
  vic: { region: "VIC", country: "AU" },
  qld: { region: "QLD", country: "AU" },
  sa: { region: "SA", country: "AU" },
  wa: { region: "WA", country: "AU" },
  nz: { region: "NZ", country: "NZ" },
};

function storeLocations(): Location[] {
  return stores.map((store) => ({
    id: store.id,
    name: store.name,
    region: REGION_META[store.regionId].region,
    country: REGION_META[store.regionId].country,
    locationType: "store",
    parentId: store.regionId,
    format: store.format,
    openedOn: store.openedOn,
    mappingStatus: "mapped" as const,
  }));
}

export const locations: Location[] = [
  { id: "nsw", name: "New South Wales", region: "NSW", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "vic", name: "Victoria", region: "VIC", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "qld", name: "Queensland", region: "QLD", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "sa", name: "South Australia", region: "SA", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "wa", name: "Western Australia", region: "WA", country: "AU", locationType: "region", mappingStatus: "mapped" },
  { id: "nz", name: "New Zealand", region: "NZ", country: "NZ", locationType: "region", mappingStatus: "mapped" },
  ...storeLocations(),
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
