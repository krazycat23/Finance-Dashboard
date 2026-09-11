import { dataset } from "@/data/mock";
import { tryGetMetric } from "@/domain/metrics";
import type { MetricDefinition } from "@/domain/metrics/types";
import type { OperationalRecord, Period, PeriodSelection } from "@/domain/models";
import { periodsForBasis, priorYearPeriods, resolveEntityIds } from "./core";

/**
 * OPERATIONAL METRICS
 * ---------------------------------------------------------------------------
 * Deliberately schema-driven. The KPI page does not know that "conversion" or
 * "NPS" exist — it asks which metric ids are PRESENT IN THE DATA for the
 * current selection, looks each one up in the registry, and renders whatever
 * comes back.
 *
 * That is what makes the page portable: a logistics client whose operational
 * measures are on-time delivery and damage rate needs new records and new
 * registry entries, not new components.
 */

const { operationalRecords, dimensions } = dataset;

const LOCATION_NAMES = new Map(dimensions.locations.map((l) => [l.id, l.name]));

/** Metric ids actually present in the data, in registry order. */
export function availableOperationalMetrics(): MetricDefinition[] {
  const ids = new Set(operationalRecords.map((record) => record.metricId));
  return [...ids]
    .map((id) => tryGetMetric(id))
    .filter((metric): metric is MetricDefinition => metric !== undefined);
}

function aggregate(records: OperationalRecord[], metric: MetricDefinition): number {
  if (records.length === 0) return 0;
  // Rates and scores average; counts sum. The registry decides, not the caller.
  if (metric.aggregation === "sum") {
    return records.reduce((s, r) => s + r.value, 0);
  }
  if (metric.aggregation === "weightedAverage" || metric.aggregation === "average") {
    return records.reduce((s, r) => s + r.value, 0) / records.length;
  }
  return records[records.length - 1].value;
}

function filterRecords(
  metricId: string,
  periodIds: Set<string>,
  entityIds: Set<string>,
  locationId?: string,
): OperationalRecord[] {
  return operationalRecords.filter(
    (record) =>
      record.metricId === metricId &&
      periodIds.has(record.periodId) &&
      // Records generated at group level are not attributable to a child entity.
      (entityIds.has(record.entityId) || record.entityId === "group") &&
      (locationId === undefined || record.locationId === locationId),
  );
}

export interface OperationalMeasure {
  metric: MetricDefinition;
  value: number;
  priorYear?: number;
  target?: number;
  series: number[];
}

export function selectOperationalMeasure(
  metricId: string,
  selection: PeriodSelection,
): OperationalMeasure | undefined {
  const metric = tryGetMetric(metricId);
  if (!metric) return undefined;

  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const currentPeriods = periodsForBasis(selection.basis, selection.periodId).filter(
    (p) => p.isActual,
  );
  const priorPeriods = priorYearPeriods(selection.basis, selection.periodId).filter(
    (p) => p.isActual,
  );

  const current = filterRecords(metricId, new Set(currentPeriods.map((p) => p.id)), entityIds);
  if (current.length === 0) return undefined;

  const prior = filterRecords(metricId, new Set(priorPeriods.map((p) => p.id)), entityIds);
  const targets = current.filter((r) => r.target !== undefined);

  const series = periodsForBasis("R12", selection.periodId)
    .filter((p) => p.isActual)
    .map((period) =>
      aggregate(filterRecords(metricId, new Set([period.id]), entityIds), metric),
    );

  return {
    metric,
    value: aggregate(current, metric),
    priorYear: prior.length > 0 ? aggregate(prior, metric) : undefined,
    target:
      targets.length > 0
        ? aggregate(
            targets.map((r) => ({ ...r, value: r.target! })),
            metric,
          )
        : undefined,
    series,
  };
}

export interface OperationalByLocation {
  locationId: string;
  locationName: string;
  value: number;
  priorYear?: number;
  target?: number;
}

export function selectOperationalByLocation(
  metricId: string,
  selection: PeriodSelection,
): OperationalByLocation[] {
  const metric = tryGetMetric(metricId);
  if (!metric) return [];

  const entityIds = new Set(resolveEntityIds(selection.entityId));
  const periodIds = new Set(
    periodsForBasis(selection.basis, selection.periodId)
      .filter((p) => p.isActual)
      .map((p) => p.id),
  );
  const priorIds = new Set(
    priorYearPeriods(selection.basis, selection.periodId)
      .filter((p) => p.isActual)
      .map((p) => p.id),
  );

  const locationIds = new Set(
    operationalRecords
      .filter((r) => r.metricId === metricId && r.locationId)
      .map((r) => r.locationId!),
  );

  return [...locationIds]
    .map((locationId): OperationalByLocation | undefined => {
      const current = filterRecords(metricId, periodIds, entityIds, locationId);
      if (current.length === 0) return undefined;
      const prior = filterRecords(metricId, priorIds, entityIds, locationId);
      const targets = current.filter((r) => r.target !== undefined);
      return {
        locationId,
        locationName: LOCATION_NAMES.get(locationId) ?? locationId,
        value: aggregate(current, metric),
        priorYear: prior.length > 0 ? aggregate(prior, metric) : undefined,
        target:
          targets.length > 0
            ? aggregate(targets.map((r) => ({ ...r, value: r.target! })), metric)
            : undefined,
      };
    })
    .filter((row): row is OperationalByLocation => row !== undefined)
    .sort((a, b) => b.value - a.value);
}

/** Period-by-period series for one metric, for the trend chart. */
export function selectOperationalSeries(
  metricId: string,
  selection: PeriodSelection,
): { period: Period; value: number; target?: number }[] {
  const metric = tryGetMetric(metricId);
  if (!metric) return [];
  const entityIds = new Set(resolveEntityIds(selection.entityId));

  return periodsForBasis("R12", selection.periodId)
    .filter((p) => p.isActual)
    .map((period) => {
      const records = filterRecords(metricId, new Set([period.id]), entityIds);
      const targets = records.filter((r) => r.target !== undefined);
      return {
        period,
        value: aggregate(records, metric),
        target:
          targets.length > 0
            ? aggregate(targets.map((r) => ({ ...r, value: r.target! })), metric)
            : undefined,
      };
    });
}
