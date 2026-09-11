export type MetricFormat =
  | "currency"
  | "percentage"
  | "number"
  | "bps"
  | "days"
  | "ratio"
  | "times";

/**
 * Whether an increase in this metric is good news.
 *
 * This is the single most important field in the product. Higher operating
 * costs are adverse; lower markdown is favourable; headcount is neither. The
 * UI asks the registry, and never assumes up = green.
 */
export type FavourableDirection = "up" | "down" | "neutral";

export type Aggregation = "sum" | "average" | "weightedAverage" | "last" | "derived";

export interface MetricDefinition {
  id: string;
  name: string;
  /** Optional shorter label for tight table headers. */
  shortName?: string;
  format: MetricFormat;
  favourableDirection: FavourableDirection;
  aggregation: Aggregation;
  /** Decimal places for the primary value. */
  precision?: number;
  /** Display scale override; otherwise companyConfig.defaultScale applies. */
  scale?: "units" | "thousands" | "millions";
  /**
   * How a change in this metric should be expressed. Margins move in basis
   * points, revenue in percent — this drives the comparison label.
   */
  deltaFormat?: MetricFormat;
  description?: string;
  /** Statement / domain grouping, used by the KPI configurator. */
  domain?: "financial" | "sales" | "workingCapital" | "operational" | "forecast";
}

export type MetricRegistry = Record<string, MetricDefinition>;
