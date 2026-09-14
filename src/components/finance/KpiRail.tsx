import type { KpiDatum } from "@/domain/selectors/kpi";
import { formatMetric, formatMetricDelta } from "@/utils/format";
import { cn } from "@/utils/cn";
import { VarianceValue } from "./VarianceValue";

/**
 * KPI RAIL
 * ---------------------------------------------------------------------------
 * A quieter, wider alternative to the KPI band: five or six measures across,
 * divided by whitespace rather than by rules, with the figure at reading size
 * and the comparison stated in full underneath.
 *
 * The band shouts a headline; the rail states a position. A balance sheet or a
 * scorecard wants the second — the reader is comparing across the row, and
 * hairlines between every cell make that harder, not easier.
 */
export function KpiRail({
  data, comparisonCaption, className,
}: {
  data: KpiDatum[];
  /** Names the comparative once for the whole rail, e.g. "vs. Mar 2025". */
  comparisonCaption?: string;
  className?: string;
}) {
  if (data.length === 0) return null;

  return (
    <div
      className={cn(
        "grid gap-x-8 gap-y-6 border-y border-strong py-5",
        "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      {data.map((datum) => (
        <div key={datum.metric.id} className="flex flex-col min-w-0">
          <span className="type-label truncate">{datum.metric.shortName ?? datum.metric.name}</span>

          <span className="font-serif text-[27px] leading-[1.05] tracking-[-0.018em] text-primary tnum mt-2.5">
            {formatMetric(datum.value, datum.metric)}
          </span>

          {datum.variance ? (
            <VarianceValue variance={datum.variance} size="sm" glyph="triangle" className="mt-2.5">
              {formatMetricDelta(datum.variance.absolute, datum.variance.relative, datum.metric)}
            </VarianceValue>
          ) : (
            <span className="type-caption mt-2.5">No comparative</span>
          )}

          {comparisonCaption && <span className="type-caption mt-1">{comparisonCaption}</span>}
        </div>
      ))}
    </div>
  );
}
