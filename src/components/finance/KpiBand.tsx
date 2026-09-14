import type { KpiDatum } from "@/domain/selectors/kpi";
import { formatMetric, formatMetricDelta } from "@/utils/format";
import { cn } from "@/utils/cn";
import { VarianceValue } from "./VarianceValue";

/**
 * KPI BAND
 * ---------------------------------------------------------------------------
 * The headline figures, set as a band rather than a row of cards: large display
 * numerals divided by thin vertical rules. A card gives each metric a box, a
 * border and a shadow it has not earned; a band lets the eye run across the
 * figures and compare them, which is the actual task.
 *
 * Driven entirely by KpiDatum — unit, precision and whether a rise is
 * favourable all come from the metric definition, so the same component renders
 * revenue, gross margin and cash without a special case for any of them.
 */

export interface KpiBandProps {
  data: KpiDatum[];
  /** Sets the first figure a size larger; used once, on the lead metric. */
  emphasiseFirst?: boolean;
  className?: string;
}

export function KpiBand({ data, emphasiseFirst, className }: KpiBandProps) {
  if (data.length === 0) return null;

  return (
    <div
      className={cn(
        // One band, divided by hairlines. The rules belong to the cells, so the
        // band reflows at laptop and tablet widths without losing them.
        "grid border-y border-strong",
        "grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {data.map((datum, index) => (
        <KpiFigure
          key={datum.metric.id}
          datum={datum}
          lead={emphasiseFirst && index === 0}
          className={cn(
            "py-6 px-7 border-l border-subtle",
            // No rule before the first cell of a row, at either column count.
            index % 2 === 0 && "border-l-0 pl-0 lg:border-l lg:pl-7",
            index % 4 === 0 && "lg:border-l-0 lg:pl-0",
            // The stacked row at phone and tablet widths needs its own divider.
            index > 1 && "border-t border-subtle lg:border-t-0",
          )}
        />
      ))}
    </div>
  );
}

function KpiFigure({
  datum, lead, className,
}: { datum: KpiDatum; lead?: boolean; className?: string }) {
  const { metric, value, variance, comparisonLabel, secondary } = datum;

  return (
    <div className={cn("flex flex-col min-w-0", className)}>
      <span className="type-label">{metric.shortName ?? metric.name}</span>

      <span className={cn("type-kpi mt-3.5", lead ? "type-kpi-lead" : "type-kpi")}>
        {formatMetric(value, metric)}
      </span>

      {/* One comparative per line, in a fixed order, so every figure in the
          band has the same height whatever its labels say. */}
      <div className="flex flex-col gap-[2px] mt-3">
        {variance ? (
          <VarianceValue variance={variance} label={comparisonLabel} size="md">
            {formatMetricDelta(variance.absolute, variance.relative, metric)}
          </VarianceValue>
        ) : (
          <span className="type-caption">No comparative</span>
        )}
        {secondary ? (
          <VarianceValue
            variance={secondary.variance}
            label={secondary.label}
            size="xs"
            showGlyph={false}
          >
            {formatMetricDelta(
              secondary.variance.absolute,
              secondary.variance.relative,
              metric,
            )}
          </VarianceValue>
        ) : (
          <span className="type-caption">&nbsp;</span>
        )}
      </div>
    </div>
  );
}
