import type { OperationalRecord, Period, SalesRecord } from "@/domain/models";
import { createRandom, jitter, round } from "./random";

/**
 * OPERATIONAL METRICS
 * ---------------------------------------------------------------------------
 * Generic by design. The KPIs page reads whatever metric ids appear here and
 * renders them through the metric registry, so a client whose operational
 * measures are "on-time delivery" and "first-call resolution" needs no code
 * change — only different records and registry entries.
 *
 * Traffic, conversion and ATV are derived from the sales records rather than
 * invented, so the KPI page and the Sales page agree.
 */

const LOCATIONS = ["nsw", "vic", "qld", "sa", "wa", "nz"];

export function generateOperational(
  periods: Period[],
  monthlySales: SalesRecord[],
): OperationalRecord[] {
  const rng = createRandom(31415);
  const records: OperationalRecord[] = [];

  // Roll sales up to entity x location x period so derived metrics tie.
  const key = (r: SalesRecord) => `${r.periodId}|${r.entityId}|${r.locationId}`;
  const rolled = new Map<
    string,
    { revenue: number; transactions: number; traffic: number; units: number }
  >();
  for (const r of monthlySales) {
    const agg = rolled.get(key(r)) ?? { revenue: 0, transactions: 0, traffic: 0, units: 0 };
    agg.revenue += r.revenue;
    agg.transactions += r.transactions ?? 0;
    agg.traffic += r.traffic ?? 0;
    agg.units += r.units ?? 0;
    rolled.set(key(r), agg);
  }

  for (const [k, agg] of rolled) {
    const [periodId, entityId, locationId] = k.split("|");
    const push = (metricId: string, value: number, target: number) => {
      records.push({
        periodId,
        entityId,
        locationId,
        metricId,
        value: round(value, 4),
        target: round(target, 4),
      });
    };

    if (agg.traffic > 0) {
      push("traffic", agg.traffic, agg.traffic * jitter(rng, 0.04));
      push("conversion", agg.transactions / agg.traffic, 0.034);
    }
    if (agg.transactions > 0) {
      push("averageTransactionValue", agg.revenue / agg.transactions, 96);
      push("unitsPerTransaction", agg.units / agg.transactions, 2.05);
    }
  }

  // Measures with no financial counterpart are modelled directly.
  periods.forEach((period, index) => {
    if (!period.isActual) return;
    for (const locationId of LOCATIONS) {
      const drift = index * 0.12;
      records.push({
        periodId: period.id,
        entityId: "group",
        locationId,
        metricId: "nps",
        value: round(38 + drift * 0.4 + (rng() - 0.5) * 9, 0),
        target: 45,
      });
      records.push({
        periodId: period.id,
        entityId: "group",
        locationId,
        metricId: "salesPerLabourHour",
        value: round(118 + drift * 0.9 + (rng() - 0.5) * 14, 2),
        target: 132,
      });
    }
  });

  return records;
}
