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
        // Thin vertical separators come from the cell borders, so the band
        // reflows cleanly at laptop and tablet widths without losing them.
        "grid gap-y-7 border-y border-strong py-6",
        "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      {data.map((datum, index) => (
        <KpiFigure
          key={datum.metric.id}
          datum={datum}
          lead={emphasiseFirst && index === 0}
          className={cn(
            "px-5 first:pl-0",
            // A rule before every cell except the first in each row.
            "border-l border-subtle",
            index % 2 === 0 && "border-l-0 pl-0 md:border-l md:pl-5",
            index % 3 === 0 && "md:border-l-0 md:pl-0 xl:border-l xl:pl-5",
            index % 5 === 0 && "xl:border-l-0 xl:pl-0",
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

      <span className={cn("type-kpi mt-3", lead ? "type-kpi-lead" : "type-kpi-sm")}>
        {formatMetric(value, metric)}
      </span>

      {/* One comparative per line, in a fixed order, so every figure in the
          band has the same height whatever its labels say. */}
      <div className="flex flex-col gap-[3px] mt-3">
        {variance ? (
          <VarianceValue variance={variance} label={comparisonLabel} size="sm">
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
            className="opacity-85"
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
