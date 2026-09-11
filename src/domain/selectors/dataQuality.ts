import { getReportingDataset } from "@/domain/data";
import { companyConfig } from "@/config/company";
import type { MappingStatus } from "@/domain/models";

/**
 * DATA QUALITY, MAPPING AND RECONCILIATION
 * ---------------------------------------------------------------------------
 * This is the page that decides whether the engine can be deployed into a new
 * company at all. Everything here is expressed in terms of the CANONICAL
 * dimensions, so the same checks run against any client's data:
 *
 *   - is every source account mapped to a statement line?
 *   - do the mapped totals reconcile to the source system?
 *   - are there duplicate or orphaned records?
 *   - when did each feed last land?
 *
 * In this phase the exceptions are generated; the shapes are the real ones the
 * ingestion layer will populate.
 */

export interface MappingSummary {
  dimension: string;
  total: number;
  mapped: number;
  unmapped: number;
  review: number;
  coverage: number;
  /** Share of financial value that sits on mapped members. */
  valueCoverage: number;
}

export interface DataIssue {
  id: string;
  severity: "critical" | "warning" | "info";
  category: "Mapping" | "Reconciliation" | "Duplicates" | "Completeness" | "Timeliness";
  title: string;
  detail: string;
  source: string;
  affectedRecords: number;
  firstSeen: string;
  status: "Open" | "In review" | "Resolved";
}

export interface ReconciliationLine {
  id: string;
  statement: string;
  sourceTotal: number;
  mappedTotal: number;
  difference: number;
  tolerance: number;
  status: "Reconciled" | "Within tolerance" | "Exception";
}

export interface RefreshEvent {
  id: string;
  feed: string;
  completedAt: string;
  durationSeconds: number;
  records: number;
  status: "Success" | "Warning" | "Failed";
  detail?: string;
}

export interface DataHealth {
  score: number;
  grade: "Strong" | "Adequate" | "At risk";
  components: { id: string; label: string; score: number; weight: number }[];
  unmappedAccounts: number;
  unmappedProducts: number;
  duplicateRecords: number;
  reconciliationExceptions: number;
  lastRefresh: string;
}

const dataset = getReportingDataset;
function createDemoRandom(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const rng = createDemoRandom(24680);

function countByStatus(items: { mappingStatus?: MappingStatus }[]) {
  let mapped = 0, unmapped = 0, review = 0;
  for (const item of items) {
    const status = item.mappingStatus ?? "unmapped";
    if (status === "mapped") mapped += 1;
    else if (status === "review") review += 1;
    else if (status === "unmapped") unmapped += 1;
  }
  return { mapped, unmapped, review, total: items.length };
}

/**
 * Demonstration exceptions. A live deployment discovers these by diffing the
 * source extract against the mapping table; the shape is identical.
 */
const SYNTHETIC_UNMAPPED = {
  accounts: [
    { externalId: "6710", name: "Store Refit Amortisation", value: 412_000 },
    { externalId: "6820", name: "Loyalty Programme Accrual", value: 268_400 },
    { externalId: "5310", name: "Supplier Rebate — Q3 True-up", value: 731_900 },
    { externalId: "2410", name: "Deferred Consideration", value: 195_000 },
  ],
  products: [
    { externalId: "SKU-88421", name: "Outerwear — Winter Capsule" },
    { externalId: "SKU-88903", name: "Home — Seasonal Textiles" },
    { externalId: "SKU-91044", name: "Accessories — Licensed Range" },
  ],
};

export function selectMappingSummary(): MappingSummary[] {
  const { accounts, products, channels, locations, entities, costCentres } = dataset().dimensions;

  const rows: MappingSummary[] = [
    {
      dimension: "GL Accounts",
      ...countByStatus(accounts),
      unmapped: SYNTHETIC_UNMAPPED.accounts.length,
      total: accounts.length + SYNTHETIC_UNMAPPED.accounts.length,
      coverage: 0,
      valueCoverage: 0,
      mapped: accounts.length,
      review: 0,
    },
    {
      dimension: "Products",
      ...countByStatus(products),
      unmapped: SYNTHETIC_UNMAPPED.products.length,
      total: products.length + SYNTHETIC_UNMAPPED.products.length,
      coverage: 0,
      valueCoverage: 0,
      mapped: products.length,
      review: 0,
    },
    { dimension: "Cost Centres", ...countByStatus(costCentres), coverage: 0, valueCoverage: 0 },
    { dimension: "Channels", ...countByStatus(channels), coverage: 0, valueCoverage: 0 },
    { dimension: "Locations", ...countByStatus(locations), coverage: 0, valueCoverage: 0 },
    { dimension: "Entities", ...countByStatus(entities), coverage: 0, valueCoverage: 0 },
  ];

  for (const row of rows) {
    row.coverage = row.total ? row.mapped / row.total : 1;
    // Value coverage is normally far higher than count coverage: the unmapped
    // tail is usually small accounts. Reporting only count coverage overstates
    // the problem; reporting only value coverage hides it.
    row.valueCoverage = Math.min(1, row.coverage + (1 - row.coverage) * 0.72);
  }
  return rows;
}

export function selectUnmappedAccounts() {
  return SYNTHETIC_UNMAPPED.accounts.map((a, i) => ({
    id: `unmapped-account-${i}`,
    ...a,
    suggestedLine:
      i === 0 ? "Depreciation & Amortisation"
      : i === 1 ? "Operating Costs"
      : i === 2 ? "Cost of Sales"
      : "Other Non-Current Liabilities",
    // The confidence a future AI-assisted mapping step would attach.
    confidence: [0.94, 0.88, 0.79, 0.62][i],
  }));
}

export function selectUnmappedProducts() {
  return SYNTHETIC_UNMAPPED.products.map((p, i) => ({
    id: `unmapped-product-${i}`,
    ...p,
    suggestedCategory: ["Apparel", "Home", "Accessories"][i],
    confidence: [0.91, 0.85, 0.73][i],
  }));
}

export function selectReconciliation(): ReconciliationLine[] {
  const build = (
    id: string,
    statement: string,
    sourceTotal: number,
    difference: number,
    tolerance: number,
  ): ReconciliationLine => ({
    id,
    statement,
    sourceTotal,
    mappedTotal: sourceTotal - difference,
    difference,
    tolerance,
    status:
      Math.abs(difference) === 0
        ? "Reconciled"
        : Math.abs(difference) <= tolerance
          ? "Within tolerance"
          : "Exception",
  });

  return [
    build("rec-revenue", "Revenue — GL to sales ledger", 141_284_000, 0, 5_000),
    build("rec-cogs", "Cost of sales — GL to inventory system", 75_900_000, 3_400, 10_000),
    build("rec-cash", "Cash — GL to bank statement", 45_230_000, 0, 1_000),
    build("rec-ar", "Trade receivables — GL to AR sub-ledger", 8_512_000, 1_608_400, 25_000),
    build("rec-ap", "Trade payables — GL to AP sub-ledger", 14_301_000, 12_200, 25_000),
    build("rec-inventory", "Inventory — GL to warehouse count", 21_040_000, 284_900, 50_000),
  ];
}

export function selectDataIssues(): DataIssue[] {
  const reconciliation = selectReconciliation();
  const exceptions = reconciliation.filter((r) => r.status === "Exception");

  const issues: DataIssue[] = [
    {
      id: "issue-unmapped-accounts",
      severity: "critical",
      category: "Mapping",
      title: `${SYNTHETIC_UNMAPPED.accounts.length} GL accounts are not mapped to a statement line`,
      detail:
        "Balances on these accounts are excluded from all reported totals until they are mapped.",
      source: "General Ledger",
      affectedRecords: SYNTHETIC_UNMAPPED.accounts.length,
      firstSeen: "2026-03-02",
      status: "Open",
    },
    ...exceptions.map((exception, i) => ({
      id: `issue-recon-${exception.id}`,
      severity: "critical" as const,
      category: "Reconciliation" as const,
      title: `${exception.statement} is outside tolerance`,
      detail: `Difference of ${Math.round(exception.difference).toLocaleString()} against a tolerance of ${exception.tolerance.toLocaleString()}.`,
      source: "Reconciliation engine",
      affectedRecords: 1,
      firstSeen: `2026-03-0${i + 3}`,
      status: "In review" as const,
    })),
    {
      id: "issue-duplicates",
      severity: "warning",
      category: "Duplicates",
      title: "47 duplicate transaction lines detected in the sales feed",
      detail:
        "Identical order id, line number and timestamp across two extracts. Deduplicated on load; the source export should be corrected.",
      source: "Point of Sale",
      affectedRecords: 47,
      firstSeen: "2026-02-27",
      status: "In review",
    },
    {
      id: "issue-products",
      severity: "warning",
      category: "Mapping",
      title: `${SYNTHETIC_UNMAPPED.products.length} product codes have no category mapping`,
      detail: "Revenue is reported in total but excluded from category analysis.",
      source: "Product Master",
      affectedRecords: SYNTHETIC_UNMAPPED.products.length,
      firstSeen: "2026-03-01",
      status: "Open",
    },
    {
      id: "issue-completeness",
      severity: "warning",
      category: "Completeness",
      title: "Two locations reported no trading data for one week",
      detail:
        "No sales records received for the week commencing 16 February. Confirm closure or re-extract.",
      source: "Point of Sale",
      affectedRecords: 2,
      firstSeen: "2026-02-24",
      status: "Resolved",
    },
    {
      id: "issue-fx",
      severity: "info",
      category: "Completeness",
      title: "Foreign exchange rate applied from the prior month for one entity",
      detail:
        "The New Zealand rate for the current period had not landed at load time; the prior month rate was carried forward.",
      source: "Treasury",
      affectedRecords: 1,
      firstSeen: "2026-03-03",
      status: "In review",
    },
    {
      id: "issue-timeliness",
      severity: "info",
      category: "Timeliness",
      title: "Payroll feed landed four hours later than scheduled",
      detail: "No impact on reported figures; monitoring for recurrence.",
      source: "Payroll",
      affectedRecords: 0,
      firstSeen: "2026-03-04",
      status: "Resolved",
    },
  ];

  return issues;
}

export function selectRefreshLog(): RefreshEvent[] {
  const feeds = [
    { feed: "General Ledger", records: 184_220 },
    { feed: "Sales Ledger", records: 1_942_804 },
    { feed: "Point of Sale", records: 3_104_559 },
    { feed: "Inventory", records: 421_006 },
    { feed: "Payroll", records: 38_411 },
    { feed: "Product Master", records: 12_884 },
    { feed: "Bank Statements", records: 9_204 },
  ];

  return feeds.map((f, i) => {
    const hoursAgo = 2 + i * 1.4;
    const completedAt = new Date(Date.UTC(2026, 2, 5, 6, 0) - hoursAgo * 3_600_000);
    const status: RefreshEvent["status"] =
      f.feed === "Payroll" ? "Warning" : f.feed === "Product Master" ? "Warning" : "Success";
    return {
      id: `refresh-${i}`,
      feed: f.feed,
      completedAt: completedAt.toISOString(),
      durationSeconds: Math.round(40 + rng() * 500),
      records: f.records,
      status,
      detail:
        f.feed === "Payroll"
          ? "Completed late"
          : f.feed === "Product Master"
            ? "3 records rejected on validation"
            : undefined,
    };
  });
}

/**
 * Weighted health score. The weights are configuration in spirit: mapping
 * completeness dominates because an unmapped account silently changes a
 * reported total, whereas a late feed is visible and recoverable.
 */
export function selectDataHealth(): DataHealth {
  const mapping = selectMappingSummary();
  const reconciliation = selectReconciliation();
  const issues = selectDataIssues();
  const refresh = selectRefreshLog();

  const accountRow = mapping.find((m) => m.dimension === "GL Accounts")!;
  const productRow = mapping.find((m) => m.dimension === "Products")!;
  const exceptions = reconciliation.filter((r) => r.status === "Exception").length;

  const components = [
    { id: "mapping", label: "Mapping completeness", score: accountRow.valueCoverage * 100, weight: 0.35 },
    {
      id: "reconciliation",
      label: "Reconciliation",
      score: (1 - exceptions / reconciliation.length) * 100,
      weight: 0.3,
    },
    {
      id: "integrity",
      label: "Record integrity",
      score: 96.4,
      weight: 0.2,
    },
    {
      id: "timeliness",
      label: "Timeliness",
      score: (refresh.filter((r) => r.status === "Success").length / refresh.length) * 100,
      weight: 0.15,
    },
  ];

  const score = components.reduce((s, c) => s + c.score * c.weight, 0);

  return {
    score,
    grade: score >= 90 ? "Strong" : score >= 75 ? "Adequate" : "At risk",
    components,
    unmappedAccounts: accountRow.unmapped,
    unmappedProducts: productRow.unmapped,
    duplicateRecords: issues.find((i) => i.category === "Duplicates")?.affectedRecords ?? 0,
    reconciliationExceptions: exceptions,
    lastRefresh: refresh[0].completedAt,
  };
}

export const dataQualityMeta = {
  companyName: companyConfig.companyName,
  currentPeriodId: companyConfig.currentPeriodId,
};
