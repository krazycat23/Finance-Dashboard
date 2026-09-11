/**
 * KPI BOARD CONFIGURATION
 * ---------------------------------------------------------------------------
 * Which operational metrics a client tracks, and how they are grouped.
 *
 * This is configuration, not code: the KPIs page renders whatever is listed
 * here AND present in the data. A metric configured but not yet feeding is
 * reported as awaiting data rather than rendered as a zero — a zero on a
 * scorecard is indistinguishable from genuinely terrible performance.
 */

export interface KpiBoard {
  id: string;
  label: string;
  description: string;
  /** Metric ids, resolved against the metric registry. */
  metricIds: string[];
}

export const kpiBoards: KpiBoard[] = [
  {
    id: "trading",
    label: "Trading",
    description: "Store and digital trading performance.",
    metricIds: [
      "traffic",
      "conversion",
      "averageTransactionValue",
      "unitsPerTransaction",
    ],
  },
  {
    id: "customer",
    label: "Customer & people",
    description: "Customer advocacy and labour productivity.",
    metricIds: ["nps", "salesPerLabourHour"],
  },
];

/** The metric shown first when the page opens, if it has data. */
export const defaultKpiMetricId = "conversion";
