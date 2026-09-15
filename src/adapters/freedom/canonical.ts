import type {
  Account, CostCentre, Entity, FinanceRecord, Period, SalesRecord, Channel,
} from "@/domain/models";
import type { AdapterManifest, CanonicalReconciliation, CanonicalReportingPackageV1 } from "../contract";
import { CANONICAL_REPORTING_SCHEMA_VERSION } from "../contract";
import { CALENDAR_FILE, parseFinancialCalendar, toWeekPeriods, type FreedomWeek } from "./calendar";
import { GL_MAPPING_FILE, parseGlMapping, type FreedomGlMapping } from "./glMapping";
import { TRIAL_BALANCES, parseTrialBalance, type TrialBalanceParse } from "./trialBalance";
import { WRITTEN_SALES_FILE, describeDeliveredSalesGap, parseWeeklyHistory, parseWrittenSales } from "./sales";
import { Accumulator, sum } from "./sum";
import type { SourceWorkbooks } from "./workbook";

const GROUP_ENTITY_ID = "FF";
const ENTITY_NAMES: Record<string, string> = {
  FFAU: "Freedom Furniture Australia",
  FFNZ: "Freedom Furniture New Zealand",
  FLAU: "Freedom Logistics Australia",
};
const CHANNEL_IDS: Record<string, string> = {
  "In Store": "in-store",
  Instore: "in-store",
  Online: "online",
  Dropship: "dropship",
};

export function buildFreedomPackage(
  workbooks: SourceWorkbooks,
  manifest: AdapterManifest,
  sourceFiles: string[],
): CanonicalReportingPackageV1 {
  const mapping = parseGlMapping(workbooks);
  const calendar = parseFinancialCalendar(workbooks);
  const balances = TRIAL_BALANCES.map((source) => parseTrialBalance(workbooks, source));

  const finance = buildFinance(balances, mapping.byGl);
  const periods = buildMonthPeriods(finance.periodIds, finance.actualPeriodIds);
  const sales = buildSales(workbooks, calendar);
  const weekPeriods = toWeekPeriods(calendar, sales.lastActualWeekId);

  const entities = buildEntities(finance.entityCodes);
  const costCentres = buildCostCentres(finance.costCentres);
  const accounts = buildAccounts(finance.accounts, mapping.byGl);

  const currentPeriodId = finance.actualPeriodIds.at(-1) ?? periods.at(-1)?.id ?? "";
  const assumptions = [
    "Identifiers are strings throughout; cost-centre codes such as 0650 and fiscal tokens such as 202701 keep every character.",
    "Trial balances carry income positive and cost negative, as the GL mapping's Sign Convention column states. Canonical magnitudes flip only the lines the ladder subtracts, so mixed headers such as Net Delivery Fees keep the economics of their cost components.",
    "The source has no consolidated row, so a reporting group entity is created as the parent of the entities the workbooks do report.",
    "FY26 is loaded as actual for its own months, which is what makes prior-year comparison a reading of history rather than a copied column.",
    `Weekly sales are published for ${weekPeriods[0]?.fiscalYear ?? "FY27"} only, because ${CALENDAR_FILE} is the one authoritative week-to-date mapping supplied.`,
    "Monthly sales are derived from weekly sales through the financial calendar's own fiscal-month column; they are not taken from the trial balance and are not expected to equal ledger revenue.",
  ];

  const reconciliations = buildReconciliations(balances, finance, sales);
  const unsupported = collectUnsupported(workbooks, finance, mapping.byGl);

  return {
    id: "freedom-furniture",
    source: "import",
    periods,
    weeks: weekPeriods,
    dimensions: {
      entities,
      accounts,
      departments: [],
      costCentres,
      locations: [],
      channels: sales.channels,
      products: [],
      customers: [],
    },
    financeRecords: finance.records,
    salesRecords: sales.monthly,
    weeklySalesRecords: sales.weekly,
    operationalRecords: [],
    cashFlowRecords: [],
    scenarios: [
      { id: "actual", kind: "actual", label: "Actual" },
      { id: "budget", kind: "budget", label: "FY27 Budget" },
    ],
    currentPeriodId,
    defaultEntityId: GROUP_ENTITY_ID,
    profile: {
      companyName: "Freedom Furniture Australia",
      shortName: "Freedom",
      reportingCurrency: "AUD",
      currencySymbol: "$",
      locale: "en-AU",
      defaultScale: "thousands",
      fiscalCalendar: { periodicity: "monthly", fiscalYearStartMonth: 7, fiscalYearLabel: "endYear" },
    },
    scenarioRoles: { actual: "actual", budget: "budget", forecast: "forecast" },
    dataQuality: {
      mappingSummaries: [
        {
          dimension: "GL Accounts",
          total: finance.accounts.size,
          mapped: finance.mappedAccounts,
          unmapped: finance.accounts.size - finance.mappedAccounts,
          review: 0,
          valueCoverage: finance.valueCoverage,
        },
      ],
      unmappedMembers: finance.unmappedMembers,
      issues: [],
      reconciliations: reconciliations.map((entry) => ({
        id: entry.id,
        statement: entry.label,
        sourceTotal: entry.sourceTotal,
        mappedTotal: entry.canonicalTotal,
        difference: entry.difference,
        tolerance: entry.tolerance,
        status: Math.abs(entry.difference) <= entry.tolerance ? "Reconciled" : "Exception",
      })),
      imports: [],
      health: { integrityScore: Math.round(finance.valueCoverage * 100) },
    },
    capabilities: {
      hasPnl: true,
      // The GL mapping covers profit and loss only; no balance-sheet or
      // cash-flow line appears in any of the three trial balances.
      hasBalanceSheet: false,
      hasCashFlow: false,
      hasSales: sales.monthly.length > 0,
      hasWeeklySales: sales.weekly.length > 0,
      hasBudget: balances.some((balance) => balance.source.scenario === "budget"),
      hasForecast: false,
      hasOperationalKpis: false,
    },
    schemaVersion: CANONICAL_REPORTING_SCHEMA_VERSION,
    adapterManifest: manifest,
    generatedAt: new Date().toISOString(),
    sourceFiles,
    assumptions: [...assumptions, ...unsupported.map((note) => `Unsupported: ${note}`)],
    reconciliations,
  };
}

interface FinanceBuild {
  records: FinanceRecord[];
  periodIds: string[];
  actualPeriodIds: string[];
  entityCodes: Set<string>;
  costCentres: Map<string, string>;
  accounts: Map<string, { description: string; mapping?: FreedomGlMapping }>;
  mappedAccounts: number;
  unmappedMembers: CanonicalReportingPackageV1["dataQuality"]["unmappedMembers"];
  /** Raw source value, by stage of the pipeline. */
  signNormalisedTotal: number;
  mappedValue: number;
  unmappedValue: number;
  canonicalTotal: number;
  /** Raw mapped trial-balance value, by canonical scenario. */
  mappedByScenario: Map<string, number>;
  valueCoverage: number;
}

function buildFinance(balances: TrialBalanceParse[], mappingByGl: Map<string, FreedomGlMapping>): FinanceBuild {
  const records = new Map<string, FinanceRecord>();
  const periodIds = new Set<string>();
  const actualPeriodIds = new Set<string>();
  const entityCodes = new Set<string>();
  const costCentres = new Map<string, string>();
  const accounts = new Map<string, { description: string; mapping?: FreedomGlMapping }>();
  const unmappedValue = new Map<string, number>();

  const signNormalised = new Accumulator();
  const mapped = new Accumulator();
  const unmapped = new Accumulator();
  // Coverage is measured on gross magnitude: a mapped credit and an unmapped
  // debit of the same size must not net out into a coverage of 100%.
  const mappedGross = new Accumulator();
  const unmappedGross = new Accumulator();
  const mappedByScenario = new Map<string, Accumulator>();

  for (const balance of balances) {
    for (const cell of balance.cells) {
      const mapping = mappingByGl.get(cell.glCode);
      periodIds.add(cell.periodId);
      if (balance.source.scenario === "actual") actualPeriodIds.add(cell.periodId);
      entityCodes.add(cell.entityId);
      if (cell.costCentreId) costCentres.set(cell.costCentreId, cell.costCentreName || cell.costCentreId);
      if (!accounts.has(cell.glCode)) accounts.set(cell.glCode, { description: mapping?.description ?? cell.glDescription, mapping });

      // Sign normalisation: the canonical value for the line this GL belongs to.
      // An unmapped GL has no line, so it carries its raw value and is reported
      // as unmapped rather than being given a role to make a total tie.
      const multiplier = mapping?.multiplier ?? 1;
      const value = cell.rawValue * multiplier;
      signNormalised.add(value);

      if (mapping && mapping.line !== "unconfirmed") {
        mapped.add(cell.rawValue);
        mappedGross.add(Math.abs(cell.rawValue));
        const scenario = mappedByScenario.get(balance.source.scenario) ?? new Accumulator();
        scenario.add(cell.rawValue);
        mappedByScenario.set(balance.source.scenario, scenario);
      } else {
        unmapped.add(cell.rawValue);
        unmappedGross.add(Math.abs(cell.rawValue));
        unmappedValue.set(cell.glCode, (unmappedValue.get(cell.glCode) ?? 0) + cell.rawValue);
      }

      const key = `${cell.periodId}|${cell.entityId}|${cell.glCode}|${cell.costCentreId}`;
      let record = records.get(key);
      if (!record) {
        record = {
          periodId: cell.periodId,
          entityId: cell.entityId,
          accountId: cell.glCode,
          costCentreId: cell.costCentreId || undefined,
          lineage: { sourceReference: `${balance.source.file}/${balance.source.sheet}`, sourceCurrency: "AUD", reportingCurrency: "AUD", mappingVersion: GL_MAPPING_FILE },
        };
        records.set(key, record);
      }
      // Stored at source precision. Rounding here would make the canonical
      // total disagree with the trial balance by a rounding residual, and the
      // reconciliation tolerance would have to be widened to absorb it.
      record[balance.source.scenario] = (record[balance.source.scenario] ?? 0) + value;
    }
  }

  const mappedValue = mapped.value;
  const unmappedTotal = unmapped.value;
  const mappedAccounts = [...accounts.values()].filter((entry) => entry.mapping && entry.mapping.line !== "unconfirmed").length;
  const grossTotal = mappedGross.value + unmappedGross.value;
  const valueCoverage = grossTotal === 0 ? 1 : mappedGross.value / grossTotal;

  return {
    records: [...records.values()],
    periodIds: [...periodIds].sort(),
    actualPeriodIds: [...actualPeriodIds].sort(),
    entityCodes,
    costCentres,
    accounts,
    mappedAccounts,
    unmappedMembers: [...unmappedValue.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([glCode, value]) => ({
        id: `gl-${glCode}`,
        dimension: "accounts" as const,
        externalId: glCode,
        name: accounts.get(glCode)?.description ?? glCode,
        value: round2(value),
      })),
    signNormalisedTotal: signNormalised.value,
    mappedValue,
    unmappedValue: unmappedTotal,
    canonicalTotal: mappedValue,
    mappedByScenario: new Map([...mappedByScenario].map(([scenario, accumulator]) => [scenario, accumulator.value])),
    valueCoverage,
  };
}

function buildMonthPeriods(periodIds: string[], actualPeriodIds: string[]): Period[] {
  const actual = new Set(actualPeriodIds);
  return periodIds.map((id) => {
    const year = Number(id.slice(0, 4));
    const month = Number(id.slice(5, 7));
    // Fiscal year starts in July and is labelled by its ending year.
    const fiscalYearEnd = month >= 7 ? year + 1 : year;
    const fiscalPeriod = month >= 7 ? month - 6 : month + 6;
    const end = new Date(Date.UTC(year, month, 0));
    return {
      id,
      date: end.toISOString().slice(0, 10),
      grain: "month" as const,
      label: end.toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" }),
      shortLabel: end.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" }),
      fiscalYear: `FY${String(fiscalYearEnd).slice(2)}`,
      fiscalPeriod,
      fiscalQuarter: Math.ceil(fiscalPeriod / 3),
      calendarYear: year,
      calendarMonth: month,
      isActual: actual.has(id),
    };
  });
}

function buildEntities(codes: Set<string>): Entity[] {
  const children = [...codes].sort().map((code): Entity => ({
    id: code,
    name: ENTITY_NAMES[code] ?? code,
    externalId: code,
    parentId: GROUP_ENTITY_ID,
    level: 1,
    currency: code.endsWith("NZ") ? "NZD" : "AUD",
    mappingStatus: "mapped",
  }));
  return [
    { id: GROUP_ENTITY_ID, name: "Freedom Group", externalId: GROUP_ENTITY_ID, level: 0, currency: "AUD", mappingStatus: "mapped" },
    ...children,
  ];
}

function buildCostCentres(costCentres: Map<string, string>): CostCentre[] {
  return [...costCentres.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, name]) => ({ id, name: name || id, externalId: id, mappingStatus: "mapped" as const }));
}

function buildAccounts(
  accounts: Map<string, { description: string; mapping?: FreedomGlMapping }>,
  mappingByGl: Map<string, FreedomGlMapping>,
): Account[] {
  return [...accounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([glCode, entry]) => {
      const mapping = entry.mapping ?? mappingByGl.get(glCode);
      const line = mapping?.line ?? "unconfirmed";
      return {
        id: glCode,
        name: mapping?.description ?? entry.description ?? glCode,
        externalId: glCode,
        statement: "pnl" as const,
        line,
        sign: (mapping?.multiplier ?? 1) as 1 | -1,
        sourceMultiplier: (mapping?.multiplier ?? 1) as 1 | -1,
        costCategory: mapping?.p2,
        reportingHierarchy: mapping
          ? { p1: mapping.p1, p2: mapping.p2, p3: mapping.p3, pnlSection: mapping.pnlSection }
          : undefined,
        calculationRole: mapping?.role ?? "unconfirmed",
        mappingSource: mapping ? ("authoritative_file" as const) : ("unmapped" as const),
        mappingSourceFile: mapping ? GL_MAPPING_FILE : undefined,
        accountMappingStatus: mapping
          ? mapping.line === "unconfirmed" ? ("Needs Review" as const) : ("Authoritative" as const)
          : ("Unmapped" as const),
        mappingStatus: mapping && mapping.line !== "unconfirmed" ? ("mapped" as const) : ("unmapped" as const),
      };
    });
}

interface SalesBuild {
  weekly: SalesRecord[];
  monthly: SalesRecord[];
  channels: Channel[];
  lastActualWeekId?: string;
  writtenSourceTotal: number;
  writtenCanonicalTotal: number;
  writtenOutOfScopeTotal: number;
  writtenWorkbookTotal: number;
  historySourceTotal: number;
  historyCanonicalTotal: number;
  monthlyTotal: number;
}

function buildSales(workbooks: SourceWorkbooks, calendar: FreedomWeek[]): SalesBuild {
  const written = parseWrittenSales(workbooks);
  const history = parseWeeklyHistory(workbooks);

  const weekByFinPeriod = new Map(calendar.map((week) => [week.finPeriod, week]));
  const weekByFiscalWeek = new Map(calendar.map((week) => [week.fiscalWeek, week]));
  const currentFiscalYear = calendar[0]?.fiscalYear ?? "FY27";
  const priorFiscalYear = `FY${String(Number(currentFiscalYear.slice(2)) - 1).padStart(2, "0")}`;

  const channels = new Map<string, Channel>();
  const weekly: SalesRecord[] = [];
  const writtenInScope = new Accumulator();
  const writtenOutOfScope = new Accumulator();
  const writtenCanonical = new Accumulator();

  // Written orders, by channel, for the fiscal year the calendar covers.
  for (const entry of written.weeks) {
    const week = weekByFinPeriod.get(entry.finPeriod);
    if (!week) {
      // Written sales run back four fiscal years; only the year the financial
      // calendar dates can be published, and the rest is reported as such
      // rather than silently absorbed into a tolerance.
      writtenOutOfScope.add(entry.value);
      continue;
    }
    writtenInScope.add(entry.value);
    const channelId = CHANNEL_IDS[entry.channel] ?? entry.channel.toLowerCase().replace(/\s+/g, "-");
    channels.set(channelId, { id: channelId, name: entry.channel === "Instore" ? "In Store" : entry.channel, externalId: entry.channel, mappingStatus: "mapped" });
    weekly.push({
      periodId: week.id,
      entityId: entry.entityCode,
      channelId,
      revenue: 0,
      writtenRevenue: entry.value,
    });
    writtenCanonical.add(entry.value);
  }

  // Delivered company-store sales, with the same fiscal week a year earlier as
  // the comparative. The history workbook has no dates of its own, so fiscal
  // week number is the only alignment available and is used explicitly.
  const priorByKey = new Map<string, number>();
  for (const entry of history.weeks) {
    if (entry.fiscalYear !== priorFiscalYear) continue;
    priorByKey.set(`${entry.entityCode}|${entry.fiscalWeek}`, entry.value);
  }

  const historyCanonical = new Accumulator();
  let lastActualWeek: FreedomWeek | undefined;
  let lastActualWeekId: string | undefined;
  for (const entry of history.weeks) {
    if (entry.fiscalYear !== currentFiscalYear) continue;
    const week = weekByFiscalWeek.get(entry.fiscalWeek);
    if (!week) continue;
    const priorYearRevenue = priorByKey.get(`${entry.entityCode}|${entry.fiscalWeek}`);
    weekly.push({
      periodId: week.id,
      entityId: entry.entityCode,
      revenue: entry.value,
      priorYearRevenue,
      comparable: true,
    });
    historyCanonical.add(entry.value);
    if (!lastActualWeek || week.fiscalWeek > lastActualWeek.fiscalWeek) lastActualWeek = week;
  }
  lastActualWeekId = lastActualWeek?.id;

  // Monthly sales are the weekly delivered series folded up through the
  // calendar's own fiscal-month column.
  const monthly = new Map<string, SalesRecord>();
  for (const entry of history.weeks) {
    if (entry.fiscalYear !== currentFiscalYear) continue;
    const week = weekByFiscalWeek.get(entry.fiscalWeek);
    if (!week) continue;
    const key = `${week.monthPeriodId}|${entry.entityCode}`;
    const record = monthly.get(key) ?? {
      periodId: week.monthPeriodId,
      entityId: entry.entityCode,
      revenue: 0,
      priorYearRevenue: 0,
      comparable: true,
    };
    record.revenue += entry.value;
    record.priorYearRevenue = (record.priorYearRevenue ?? 0) + (priorByKey.get(`${entry.entityCode}|${entry.fiscalWeek}`) ?? 0);
    monthly.set(key, record);
  }
  const monthlyRecords = [...monthly.values()];

  return {
    weekly,
    monthly: monthlyRecords,
    channels: [...channels.values()].sort((a, b) => a.id.localeCompare(b.id)),
    lastActualWeekId,
    writtenSourceTotal: writtenInScope.value,
    writtenCanonicalTotal: writtenCanonical.value,
    writtenOutOfScopeTotal: writtenOutOfScope.value,
    writtenWorkbookTotal: written.sourceTotal,
    historySourceTotal: history.sourceTotal,
    historyCanonicalTotal: historyCanonical.value,
    monthlyTotal: sum(monthlyRecords.map((record) => record.revenue)),
  };
}

/**
 * RECONCILIATION
 * ---------------------------------------------------------------------------
 * Each finance source is proved through every stage it passes: the workbook's
 * own cells, the unpivot, sign normalisation, the mapped/unmapped split, and
 * the canonical records. The mapped and unmapped legs are stated separately so
 * that a coverage gap shows up as a number rather than disappearing into a
 * total that happens to agree.
 */
function buildReconciliations(balances: TrialBalanceParse[], finance: FinanceBuild, sales: SalesBuild): CanonicalReconciliation[] {
  const entries: CanonicalReconciliation[] = [];
  const tolerance = 0.01;

  for (const balance of balances) {
    entries.push({
      id: `finance-unpivot-${slug(balance.source.file)}`,
      label: `${balance.source.label}: workbook cells to unpivoted facts`,
      sourceTotal: balance.sourceTotal,
      canonicalTotal: balance.unpivotedTotal,
      difference: balance.unpivotedTotal - balance.sourceTotal,
      tolerance,
    });
  }

  const unpivotedTotal = sum(balances.map((balance) => balance.unpivotedTotal));
  entries.push({
    id: "finance-mapped-split",
    label: "Unpivoted trial balance to mapped plus unmapped value",
    sourceTotal: unpivotedTotal,
    canonicalTotal: finance.mappedValue + finance.unmappedValue,
    difference: (finance.mappedValue + finance.unmappedValue) - unpivotedTotal,
    tolerance,
  });

  // Independent evidence, not a restatement. The ladder below is rebuilt from
  // the EMITTED canonical records and the line each account was assigned, using
  // the same arithmetic the reporting engine uses. Because canonical magnitudes
  // flip exactly the lines the ladder subtracts, the resulting net profit must
  // equal the raw mapped trial-balance value. If a role were mis-assigned or a
  // sign flipped the wrong way, the two sides would part.
  for (const [scenario, rawMapped] of finance.mappedByScenario) {
    entries.push({
      id: `finance-ladder-${scenario}`,
      label: `Mapped ${scenario} trial-balance value to canonical net profit, rebuilt from the emitted records`,
      sourceTotal: rawMapped,
      canonicalTotal: netProfitFromRecords(finance, scenario as "actual" | "budget"),
      difference: netProfitFromRecords(finance, scenario as "actual" | "budget") - rawMapped,
      tolerance,
    });
  }

  entries.push({
    id: "sales-written-weekly",
    label: "Written sales rows inside the dated fiscal year to canonical weekly written facts",
    sourceTotal: sales.writtenSourceTotal,
    canonicalTotal: sales.writtenCanonicalTotal,
    difference: sales.writtenCanonicalTotal - sales.writtenSourceTotal,
    tolerance,
  });

  entries.push({
    id: "sales-weekly-to-monthly",
    label: "Canonical weekly delivered sales to canonical monthly sales",
    sourceTotal: sales.historyCanonicalTotal,
    canonicalTotal: sales.monthlyTotal,
    difference: sales.monthlyTotal - sales.historyCanonicalTotal,
    tolerance,
  });

  return entries;
}

function collectUnsupported(workbooks: SourceWorkbooks, finance: FinanceBuild, mappingByGl: Map<string, FreedomGlMapping>): string[] {
  const notes: string[] = [];
  const delivered = describeDeliveredSalesGap(workbooks);
  if (delivered) notes.push(delivered);

  const unmappedGls = [...finance.accounts.keys()].filter((glCode) => !mappingByGl.has(glCode));
  if (unmappedGls.length > 0) {
    notes.push(`${unmappedGls.length} GL code(s) appear in a trial balance but not in ${GL_MAPPING_FILE}; they are carried as unconfirmed and excluded from the profit and loss.`);
  }
  const unconfirmed = [...mappingByGl.values()].filter((entry) => entry.line === "unconfirmed");
  if (unconfirmed.length > 0) {
    const headers = [...new Set(unconfirmed.map((entry) => entry.p2))];
    notes.push(`Source hierarchy header(s) ${headers.join(", ")} have no canonical calculation role and are excluded from the ladder rather than absorbed into operating costs.`);
  }
  notes.push(`${WRITTEN_SALES_FILE}/Written Sales: the pre-converted NZ AUD columns hold a runaway doubling series from fiscal week 15 (246m, 492m, 982m, 1.96bn, 3.92bn, 7.85bn) while the NZD columns beside them are zero. The NZD columns are used and converted with the workbook's own FX rate; the converted block is ignored.`);
  notes.push("No balance-sheet or cash-flow source is supplied; those modules report as unavailable.");
  return notes;
}

/**
 * Rebuild the canonical P&L ladder from the emitted finance records, exactly as
 * the reporting engine derives it, and return net profit.
 */
function netProfitFromRecords(finance: FinanceBuild, scenario: "actual" | "budget"): number {
  const byLine = new Map<string, Accumulator>();
  for (const record of finance.records) {
    const value = record[scenario];
    if (value === undefined) continue;
    const line = finance.accounts.get(record.accountId)?.mapping?.line ?? "unconfirmed";
    if (line === "unconfirmed") continue;
    const accumulator = byLine.get(line) ?? new Accumulator();
    accumulator.add(value);
    byLine.set(line, accumulator);
  }
  const v = (line: string): number => byLine.get(line)?.value ?? 0;
  const netSales = v("grossSales") - v("markdowns") - v("returns") + v("revenue");
  const grossProfit = netSales - v("costOfSales");
  const ebitda = grossProfit - v("operatingCosts");
  const ebit = ebitda - v("depreciationAmortisation");
  return ebit - v("interest") - v("tax");
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
