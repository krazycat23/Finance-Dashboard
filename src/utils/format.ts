import { getReportingDataset } from "@/domain/data";
import type { MetricDefinition, MetricFormat } from "@/domain/metrics/types";

/**
 * NUMBER FORMATTING
 * ---------------------------------------------------------------------------
 * The only place in the application permitted to turn a number into a string.
 * Finance conventions are non-negotiable here:
 *   - negatives in parentheses, never with a hyphen
 *   - tabular figures (enforced by the .tnum utility on every numeric cell)
 *   - an explicit sign on variances, because a variance without one is a trap
 *   - scale applied consistently and labelled, so 124.2 is never ambiguous
 */

export type Scale = "units" | "thousands" | "millions" | "auto";

export interface FormatOptions {
  scale?: Scale;
  precision?: number;
  /** Render negatives as (1,245) rather than -1,245. Default true. */
  parentheses?: boolean;
  /** Always show + / − . Default false. */
  showSign?: boolean;
  /** Append the scale suffix (K / M). Default true when scaled. */
  showScaleSuffix?: boolean;
  /** Override the currency symbol. */
  currencySymbol?: string;
  /** Render 0 as a dash — standard in statement tables. */
  dashForZero?: boolean;
}

const SCALE_DIVISORS: Record<Exclude<Scale, "auto">, number> = {
  units: 1,
  thousands: 1_000,
  millions: 1_000_000,
};

const SCALE_SUFFIX: Record<Exclude<Scale, "auto">, string> = {
  units: "",
  thousands: "K",
  millions: "M",
};

function resolveScale(value: number, scale: Scale): Exclude<Scale, "auto"> {
  if (scale !== "auto") return scale;
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return "millions";
  if (magnitude >= 10_000) return "thousands";
  return "units";
}

function group(value: number, precision: number): string {
  return new Intl.NumberFormat(getReportingDataset().profile.locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value);
}

/**
 * Wrap the magnitude according to sign convention. Splitting this out keeps
 * parenthesis and explicit-sign handling identical across every formatter.
 */
function applySign(
  formattedMagnitude: string,
  isNegative: boolean,
  options: Pick<FormatOptions, "parentheses" | "showSign">,
): string {
  const { parentheses = true, showSign = false } = options;
  if (isNegative) {
    return parentheses ? `(${formattedMagnitude})` : `−${formattedMagnitude}`;
  }
  return showSign ? `+${formattedMagnitude}` : formattedMagnitude;
}

export function formatNumber(
  value: number | null | undefined,
  options: FormatOptions = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (options.dashForZero && value === 0) return "—";

  const scale = resolveScale(value, options.scale ?? "units");
  const rawScaled = value / SCALE_DIVISORS[scale];
  const precision =
    options.precision ?? (scale === "units" ? 0 : Math.abs(rawScaled) < 100 ? 1 : 0);
  const suffix =
    (options.showScaleSuffix ?? true) ? SCALE_SUFFIX[scale] : "";
  // `|| 0` collapses -0 so a rounded-to-nothing value never prints as "(0)".
  const factor = 10 ** precision;
  const scaled = Math.round(rawScaled * factor) / factor || 0;

  return applySign(group(Math.abs(scaled), precision) + suffix, scaled < 0, options);
}

export function formatCurrency(
  value: number | null | undefined,
  options: FormatOptions = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (options.dashForZero && value === 0) return "—";

  const profile = getReportingDataset().profile;
  const symbol = options.currencySymbol ?? profile.currencySymbol;
  const scale = resolveScale(value, options.scale ?? profile.defaultScale);
  const scaled = value / SCALE_DIVISORS[scale];
  const precision =
    options.precision ?? (scale === "units" ? 0 : Math.abs(scaled) < 100 ? 1 : 0);
  const suffix = (options.showScaleSuffix ?? true) ? SCALE_SUFFIX[scale] : "";

  // Symbol sits inside the parentheses: $(1,245), the statement convention.
  return applySign(
    symbol + group(Math.abs(scaled), precision) + suffix,
    scaled < 0,
    options,
  );
}

/** Expects a fraction (0.042), renders 4.2%. */
export function formatPercentage(
  value: number | null | undefined,
  options: FormatOptions = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const precision = options.precision ?? 1;
  // Round before testing the sign, so a value that displays as zero never
  // renders as "-0.0%".
  const factor = 10 ** precision;
  const pct = Math.round(value * 100 * factor) / factor || 0;
  return applySign(`${group(Math.abs(pct), precision)}%`, pct < 0, {
    parentheses: options.parentheses ?? false,
    showSign: options.showSign,
  });
}

/** Expects a fraction difference (0.012), renders 120 bps. */
export function formatBasisPoints(
  value: number | null | undefined,
  options: FormatOptions = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const bps = Math.round(value * 10_000);
  return applySign(`${group(Math.abs(bps), 0)} bps`, bps < 0, {
    parentheses: options.parentheses ?? false,
    showSign: options.showSign,
  });
}

export function formatDays(
  value: number | null | undefined,
  options: FormatOptions = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const precision = options.precision ?? 0;
  const unit = Math.abs(value) === 1 ? "day" : "days";
  return applySign(`${group(Math.abs(value), precision)} ${unit}`, value < 0, {
    parentheses: options.parentheses ?? false,
    showSign: options.showSign,
  });
}

export function formatTimes(
  value: number | null | undefined,
  options: FormatOptions = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const precision = options.precision ?? 2;
  return applySign(`${group(Math.abs(value), precision)}x`, value < 0, {
    parentheses: options.parentheses ?? false,
    showSign: options.showSign,
  });
}

/** Dispatch on a format token. */
export function formatByType(
  value: number | null | undefined,
  format: MetricFormat,
  options: FormatOptions = {},
): string {
  switch (format) {
    case "currency":
      return formatCurrency(value, options);
    case "percentage":
      return formatPercentage(value, options);
    case "bps":
      return formatBasisPoints(value, options);
    case "days":
      return formatDays(value, options);
    case "times":
    case "ratio":
      return formatTimes(value, options);
    case "number":
      return formatNumber(value, options);
  }
}

/**
 * Format a value using its metric definition. This is the entry point
 * components should reach for: the metric already knows its unit, precision
 * and scale, so a caller cannot format the same metric two ways on two pages.
 */
export function formatMetric(
  value: number | null | undefined,
  metric: MetricDefinition,
  options: FormatOptions = {},
): string {
  return formatByType(value, metric.format, {
    scale: metric.scale,
    precision: metric.precision,
    ...options,
  });
}

/**
 * Format the *change* in a metric. Margins move in basis points, revenue in
 * percent — `deltaFormat` on the definition decides, so the comparison line on
 * a KPI card is never wrong about its own units.
 */
export function formatMetricDelta(
  absolute: number,
  relative: number | undefined,
  metric: MetricDefinition,
): string {
  const deltaFormat = metric.deltaFormat;

  if (deltaFormat === "bps") {
    return formatBasisPoints(absolute, { showSign: true });
  }
  if (metric.format === "days") {
    return formatDays(absolute, { showSign: true, parentheses: false });
  }
  if (metric.format === "times") {
    return formatTimes(absolute, { showSign: true, parentheses: false });
  }
  if (metric.format === "percentage") {
    // A change in a percentage is percentage points, not a percentage.
    return `${formatPercentage(absolute, { showSign: true })} pts`;
  }
  if (relative === undefined) {
    return formatByType(absolute, metric.format, { showSign: true, parentheses: false });
  }
  return formatPercentage(relative, { showSign: true });
}

/** Variance column in a statement table: signed, parenthesised when adverse. */
export function formatVariance(
  value: number | null | undefined,
  options: FormatOptions = {},
): string {
  return formatCurrency(value, { parentheses: true, ...options });
}

export function formatVariancePercent(
  value: number | null | undefined,
  options: FormatOptions = {},
): string {
  return formatPercentage(value, { precision: 1, showSign: true, ...options });
}

/** Compact axis labels — no currency symbol, minimal digits. */
export function formatAxis(value: number, format: MetricFormat = "currency"): string {
  if (format === "percentage") return `${Math.round(value * 100)}%`;
  if (format === "days") return `${Math.round(value)}`;
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${(value / 1_000_000).toFixed(magnitude >= 10_000_000 ? 0 : 1)}`;
  if (magnitude >= 1_000) return `${(value / 1_000).toFixed(0)}`;
  return `${value}`;
}

/** The unit caption a chart shows once, instead of on every tick. */
export function axisUnitLabel(scale: Exclude<Scale, "auto"> = "millions"): string {
  const symbol = getReportingDataset().profile.currencySymbol;
  return scale === "millions" ? `${symbol}M` : scale === "thousands" ? `${symbol}K` : symbol;
}
