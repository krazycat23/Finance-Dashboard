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

export type SalesDimension = "channelId" | "productId" | "locationId" | "entityId";

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
  likeForLike: number;
  likeForLikePriorYear: number;
  priorYearRevenue: number;
  budgetRevenue: number;
}

function totalise(records: SalesRecord[]): SalesTotals {
  let revenue = 0, cost = 0, units = 0, orders = 0, transactions = 0, traffic = 0;
  let likeForLike = 0, likeForLikePriorYear = 0, priorYearRevenue = 0, budgetRevenue = 0;

  for (const r of records) {
    revenue += r.revenue;
    cost += r.cost ?? 0;
    units += r.units ?? 0;
    orders += r.orders ?? 0;
    transactions += r.transactions ?? 0;
    traffic += r.traffic ?? 0;
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
    units, orders, transactions, traffic,
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
}

function nameLookup(): Record<SalesDimension, Map<string, string>> {
  const dimensions = dataset().dimensions;
  return {
    channelId: new Map(dimensions.channels.map((c) => [c.id, c.name])),
    productId: new Map(dimensions.products.map((p) => [p.id, p.name])),
    locationId: new Map(dimensions.locations.map((l) => [l.id, l.name])),
    entityId: new Map(dimensions.entities.map((e) => [e.id, e.name])),
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

  const grouped = new Map<string, SalesRecord[]>();
  for (const r of records) {
    const key = r[dimension];
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
      growth: t.priorYearRevenue > 0 ? t.revenue / t.priorYearRevenue - 1 : undefined,
      marginPoints: priorMargin,
    });
  }

  return rows.sort((a, b) => b.revenue - a.revenue);
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

  return members.map((member) => {
    const monthCells = months.map((period) => {
      const rows = dataset().salesRecords.filter(
        (r) =>
          r.periodId === period.id &&
          entityIds.has(r.entityId) &&
          r[dimension] === member.id,
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

  const grouped = new Map<string, PriorBreakdown>();
  for (const r of records) {
    const key = r[dimension];
    if (!key) continue;
    const entry = grouped.get(key) ?? { id: key, revenue: 0, units: 0 };
    entry.revenue += r.revenue;
    entry.units += r.units ?? 0;
    grouped.set(key, entry);
  }
  return [...grouped.values()];
}
