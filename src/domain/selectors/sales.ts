import { getReportingDataset } from "@/domain/data";
import type { Period, PeriodSelection, SalesRecord } from "@/domain/models";
import { periodsForBasis, priorYearPeriods, resolveEntityIds } from "./core";

/**
 * SALES SELECTION
 * ---------------------------------------------------------------------------
 * Aggregations over the sales fact table. Dimension breakdowns are requested
 * by dimension KEY, not by name, so the same component renders "by channel",
 * "by product" or "by region" without knowing what any of them are.
 */

const dataset = getReportingDataset;

/**
 * Dimensions a sales breakdown can be cut by.
 *
 * `channelId`, `productId`, `locationId` and `entityId` are fields on the
 * fact. `regionId` and `storeId` are derived: sales for the store channel are
 * carried at store grain, so a store cut is the fact's own location filtered
 * to stores, and a regional cut follows each location up to its parent. The
 * fact table stays one grain; the reader gets two levels of it.
 */
export type SalesDimension =
  | "channelId"
  | "productId"
  | "locationId"
  | "entityId"
  | "regionId"
  | "storeId";

type DimensionResolver = (record: SalesRecord) => string | undefined;

/**
 * How each dimension reads a key off a record. Everything downstream — the
 * breakdown, the heat grid, the prior-year comparative — goes through this,
 * so a derived dimension behaves exactly like a real one.
 */
function resolvers(): Record<SalesDimension, DimensionResolver> {
  const byId = new Map(dataset().dimensions.locations.map((l) => [l.id, l]));
  return {
    channelId: (r) => r.channelId,
    productId: (r) => r.productId,
    locationId: (r) => r.locationId,
    entityId: (r) => r.entityId,
    // A record already at region grain is its own region.
    regionId: (r) => {
      const location = r.locationId ? byId.get(r.locationId) : undefined;
      return location?.parentId ?? location?.id;
    },
    // Only the store estate; online and wholesale sit at region grain and
    // are deliberately absent from a store ranking rather than shown as zero.
    storeId: (r) => {
      const location = r.locationId ? byId.get(r.locationId) : undefined;
      return location?.locationType === "store" ? location.id : undefined;
    },
  };
}

export interface SalesTotals {
  revenue: number;
  cost: number;
  grossProfit: number;
  grossMargin: number;
  units: number;
  orders: number;
  transactions: number;
  traffic: number;
  averageTransactionValue: number;
  conversion: number;
  unitsPerTransaction: number;
  /** Revenue from comparable locations only, and its prior-year equivalent. */
  /** Orders written in the window, where the dataset separates the two. */
  written: number;
  likeForLike: number;
  likeForLikePriorYear: number;
  priorYearRevenue: number;
  budgetRevenue: number;
}

function totalise(records: SalesRecord[]): SalesTotals {
  let revenue = 0, cost = 0, units = 0, orders = 0, transactions = 0, traffic = 0, written = 0;
  let likeForLike = 0, likeForLikePriorYear = 0, priorYearRevenue = 0, budgetRevenue = 0;

  for (const r of records) {
    revenue += r.revenue;
    cost += r.cost ?? 0;
    units += r.units ?? 0;
    orders += r.orders ?? 0;
    transactions += r.transactions ?? 0;
    traffic += r.traffic ?? 0;
    written += r.writtenRevenue ?? 0;
    priorYearRevenue += r.priorYearRevenue ?? 0;
    budgetRevenue += r.budgetRevenue ?? 0;
    // Like-for-like counts only locations trading in BOTH periods, and only
    // where a prior-year comparative actually exists.
    if (r.comparable && r.priorYearRevenue !== undefined) {
      likeForLike += r.revenue;
      likeForLikePriorYear += r.priorYearRevenue;
    }
  }

  const grossProfit = revenue - cost;
  return {
    revenue, cost, grossProfit,
    grossMargin: revenue ? grossProfit / revenue : 0,
    units, orders, transactions, traffic, written,
    averageTransactionValue: transactions ? revenue / transactions : 0,
    conversion: traffic ? transactions / traffic : 0,
    unitsPerTransaction: transactions ? units / transactions : 0,
    likeForLike, likeForLikePriorYear, priorYearRevenue, budgetRevenue,
  };
}

function filterRecords(
  records: SalesRecord[],
  periodIds: Set<string>,
  entityIds: Set<string>,
): SalesRecord[] {
  return records.filter(
    (r) => periodIds.has(r.periodId) && entityIds.has(r.entityId),
  );
}

/**
 * Totals for an explicit period/entity set. Exported so the KPI layer can
 * build a sparkline period by period without re-deriving the window.
 */
export function salesTotalsFor(periodIds: string[], entityIds: string[]): SalesTotals {
  return totalise(filterRecords(dataset().salesRecords, new Set(periodIds), new Set(entityIds)));
}

export function selectSalesTotals(selection: PeriodSelection): SalesTotals {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const periodIds = new Set(
    periodsForBasis(selection.basis, selection.periodId)
      .filter((p) => p.isActual)
      .map((p) => p.id),
  );
  return totalise(filterRecords(dataset().salesRecords, periodIds, entityIds));
}

export function selectPriorYearSalesTotals(selection: PeriodSelection): SalesTotals {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const periodIds = new Set(
    priorYearPeriods(selection.basis, selection.periodId)
      .filter((p) => p.isActual)
      .map((p) => p.id),
  );
  return totalise(filterRecords(dataset().salesRecords, periodIds, entityIds));
}

export interface DimensionBreakdown {
  id: string;
  name: string;
  revenue: number;
  grossProfit: number;
  grossMargin: number;
  units: number;
  share: number;
  priorYearRevenue: number;
  budgetRevenue: number;
  growth?: number;
  marginPoints?: number;
  /** False when any of the member's records sit outside the like-for-like base. */
  comparable: boolean;
}

function nameLookup(): Record<SalesDimension, Map<string, string>> {
  const dimensions = dataset().dimensions;
  return {
    channelId: new Map(dimensions.channels.map((c) => [c.id, c.name])),
    productId: new Map(dimensions.products.map((p) => [p.id, p.name])),
    locationId: new Map(dimensions.locations.map((l) => [l.id, l.name])),
    entityId: new Map(dimensions.entities.map((e) => [e.id, e.name])),
    regionId: new Map(dimensions.locations.map((l) => [l.id, l.name])),
    storeId: new Map(dimensions.locations.map((l) => [l.id, l.name])),
  };
}

export function selectBreakdown(
  selection: PeriodSelection,
  dimension: SalesDimension,
): DimensionBreakdown[] {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const periodIds = new Set(
    periodsForBasis(selection.basis, selection.periodId)
      .filter((p) => p.isActual)
      .map((p) => p.id),
  );
  const records = filterRecords(dataset().salesRecords, periodIds, entityIds);

  const keyOf = resolvers()[dimension];
  const grouped = new Map<string, SalesRecord[]>();
  for (const r of records) {
    const key = keyOf(r);
    if (!key) continue;
    const list = grouped.get(key);
    if (list) list.push(r);
    else grouped.set(key, [r]);
  }

  const totalRevenue = records.reduce((s, r) => s + r.revenue, 0);

  const rows: DimensionBreakdown[] = [];
  for (const [id, group] of grouped) {
    const t = totalise(group);
    // Prior-year margin, for the margin-points movement.
    const priorMargin = t.priorYearRevenue > 0 ? t.grossMargin : undefined;
    rows.push({
      id,
      name: nameLookup()[dimension].get(id) ?? id,
      revenue: t.revenue,
      grossProfit: t.grossProfit,
      grossMargin: t.grossMargin,
      units: t.units,
      share: totalRevenue ? t.revenue / totalRevenue : 0,
      priorYearRevenue: t.priorYearRevenue,
      budgetRevenue: t.budgetRevenue,
      comparable: group.every((r) => r.comparable !== false),
      growth: t.priorYearRevenue > 0 ? t.revenue / t.priorYearRevenue - 1 : undefined,
      marginPoints: priorMargin,
    });
  }

  return rows.sort((a, b) => b.revenue - a.revenue);
}


/**
 * THE ORDER BOOK
 * ---------------------------------------------------------------------------
 * What was written against what was delivered, and the bank of orders taken
 * but not yet delivered that sits between them.
 *
 * The bank is a BALANCE, not a movement: it is every order ever written less
 * every order ever delivered, up to the end of the reported window. Summing
 * the window's own movement would give the change in the bank, which is a
 * different and much smaller number.
 *
 * Channels that take home at the till write and deliver in one event, so they
 * contribute equally to both sides and net to nothing in the bank — exactly as
 * they should.
 */
export interface OrderBook {
  written: number;
  delivered: number;
  writtenPriorYear: number;
  deliveredPriorYear: number;
  /** Orders taken and not yet delivered, at the end of the window. */
  bank: number;
  bankPriorYear: number;
  /** Weeks of delivery the bank represents, at the window's own run rate. */
  coverWeeks?: number;
  /** False when no channel in the dataset separates writing from delivery. */
  available: boolean;
}

/** Cumulative written less cumulative delivered, through `throughPeriodId`. */
function orderBankAt(
  throughPeriodId: string,
  entityIds: Set<string>,
): number {
  let bank = 0;
  for (const r of dataset().salesRecords) {
    if (r.periodId > throughPeriodId || !entityIds.has(r.entityId)) continue;
    bank += (r.writtenRevenue ?? r.revenue) - r.revenue;
  }
  return bank;
}

export function selectOrderBook(selection: PeriodSelection): OrderBook {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const periods = periodsForBasis(selection.basis, selection.periodId).filter((p) => p.isActual);
  const priorPeriods = priorYearPeriods(selection.basis, selection.periodId).filter((p) => p.isActual);

  const current = totalise(filterRecords(dataset().salesRecords, new Set(periods.map((p) => p.id)), entityIds));
  const prior = totalise(filterRecords(dataset().salesRecords, new Set(priorPeriods.map((p) => p.id)), entityIds));

  const close = periods.at(-1)?.id;
  const priorClose = priorPeriods.at(-1)?.id;
  const bank = close ? orderBankAt(close, entityIds) : 0;
  const bankPriorYear = priorClose ? orderBankAt(priorClose, entityIds) : 0;

  // A dataset whose channels all settle at the till writes exactly what it
  // delivers. Reporting a zero order bank for it would read as a collapsed
  // book rather than as a business that does not have one.
  const available = dataset().salesRecords.some((r) => r.writtenRevenue !== undefined && r.writtenRevenue !== r.revenue);

  const weeks = periods.length * (52 / 12);
  return {
    written: current.written,
    delivered: current.revenue,
    writtenPriorYear: prior.written,
    deliveredPriorYear: prior.revenue,
    bank,
    bankPriorYear,
    coverWeeks: current.revenue > 0 && weeks > 0 ? bank / (current.revenue / weeks) : undefined,
    available,
  };
}

/** Written against delivered, month by month, for the order-book chart. */
export interface OrderFlowPoint {
  period: Period;
  written: number;
  delivered: number;
  bank: number;
}

export function selectOrderFlow(selection: PeriodSelection, monthCount = 18): OrderFlowPoint[] {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const months = periodsForBasis("R12", selection.periodId).filter((p) => p.isActual);
  const window = months.slice(-monthCount);

  const byPeriod = new Map<string, { written: number; delivered: number }>();
  for (const r of dataset().salesRecords) {
    if (!entityIds.has(r.entityId)) continue;
    const entry = byPeriod.get(r.periodId) ?? { written: 0, delivered: 0 };
    entry.written += r.writtenRevenue ?? r.revenue;
    entry.delivered += r.revenue;
    byPeriod.set(r.periodId, entry);
  }

  // The bank runs from the beginning of the record set, not from the beginning
  // of the window, so the first point on the chart is a real balance.
  const ordered = [...byPeriod.keys()].sort();
  let running = 0;
  const bankByPeriod = new Map<string, number>();
  for (const periodId of ordered) {
    const entry = byPeriod.get(periodId)!;
    running += entry.written - entry.delivered;
    bankByPeriod.set(periodId, running);
  }

  return window.map((period) => {
    const entry = byPeriod.get(period.id) ?? { written: 0, delivered: 0 };
    return {
      period,
      written: entry.written,
      delivered: entry.delivered,
      bank: bankByPeriod.get(period.id) ?? 0,
    };
  });
}

/** Weekly revenue series at entity x channel grain, for the sales trend. */
export interface WeeklyPoint {
  week: Period;
  revenue: number;
  priorYear?: number;
  budget: number;
}

export function selectWeeklySales(
  selection: PeriodSelection,
  weekCount = 52,
): WeeklyPoint[] {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const anchorMonth = selection.periodId;

  // Weeks belong to a month via their id prefix; take every week up to and
  // including the reporting month, then the most recent `weekCount` of them.
  const reportedWeeks = new Set(dataset().weeklySalesRecords.map(record => record.periodId));
  const anchorDate = dataset().periods.find(period => period.id === anchorMonth)?.date;
  const eligible = dataset().weeks.filter(w => dataset().source === "demo"
    ? w.id.slice(0, 7) <= anchorMonth && w.isActual
    : !!anchorDate && (w.weekEnd ?? w.date) <= anchorDate && reportedWeeks.has(w.id));
  const window = eligible.slice(-weekCount);
  const windowIds = new Set(window.map((w) => w.id));

  const byWeek = new Map<string, { revenue: number; priorYear: number; budget: number }>();
  for (const r of dataset().weeklySalesRecords) {
    if (!windowIds.has(r.periodId) || !entityIds.has(r.entityId)) continue;
    const agg = byWeek.get(r.periodId) ?? { revenue: 0, priorYear: 0, budget: 0 };
    agg.revenue += r.revenue;
    agg.priorYear += r.priorYearRevenue ?? 0;
    agg.budget += r.budgetRevenue ?? 0;
    byWeek.set(r.periodId, agg);
  }

  return window.map((week) => {
    const agg = byWeek.get(week.id) ?? { revenue: 0, priorYear: 0, budget: 0 };
    return {
      week,
      revenue: agg.revenue,
      priorYear: agg.priorYear > 0 ? agg.priorYear : undefined,
      budget: agg.budget,
    };
  });
}

/** Monthly revenue by dimension member, for the regional heat grid. */
export function selectMonthlyByDimension(
  selection: PeriodSelection,
  dimension: SalesDimension,
): { id: string; name: string; months: { period: Period; growth?: number }[]; total?: number }[] {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const months = periodsForBasis(selection.basis, selection.periodId).filter(
    (p) => p.isActual,
  );
  const members = selectBreakdown(selection, dimension);
  const keyOf = resolvers()[dimension];

  return members.map((member) => {
    const monthCells = months.map((period) => {
      const rows = dataset().salesRecords.filter(
        (r) =>
          r.periodId === period.id &&
          entityIds.has(r.entityId) &&
          keyOf(r) === member.id,
      );
      const revenue = rows.reduce((s, r) => s + r.revenue, 0);
      const prior = rows.reduce((s, r) => s + (r.priorYearRevenue ?? 0), 0);
      return { period, growth: prior > 0 ? revenue / prior - 1 : undefined };
    });
    return { id: member.id, name: member.name, months: monthCells, total: member.growth };
  });
}

/**
 * Prior-year breakdown by dimension, carrying real units as well as revenue.
 *
 * Needed by the price/volume/mix decomposition: deriving prior units from
 * revenue share would give every member the same implied price, which forces
 * the mix effect to exactly zero and makes the analysis worthless.
 */
export interface PriorBreakdown {
  id: string;
  revenue: number;
  units: number;
}

export function selectPriorYearBreakdown(
  selection: PeriodSelection,
  dimension: SalesDimension,
): PriorBreakdown[] {
  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const periodIds = new Set(
    priorYearPeriods(selection.basis, selection.periodId)
      .filter((p) => p.isActual)
      .map((p) => p.id),
  );
  const records = filterRecords(dataset().salesRecords, periodIds, entityIds);

  const keyOf = resolvers()[dimension];
  const grouped = new Map<string, PriorBreakdown>();
  for (const r of records) {
    const key = keyOf(r);
    if (!key) continue;
    const entry = grouped.get(key) ?? { id: key, revenue: 0, units: 0 };
    entry.revenue += r.revenue;
    entry.units += r.units ?? 0;
    grouped.set(key, entry);
  }
  return [...grouped.values()];
}
