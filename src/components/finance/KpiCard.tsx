import type { KpiDatum } from "@/domain/selectors/kpi";
import { formatMetric, formatMetricDelta } from "@/utils/format";
import { cn } from "@/utils/cn";
import { Sparkline } from "./Sparkline";
import { VarianceValue } from "./VarianceValue";

/**
 * KPI CARD
 * ---------------------------------------------------------------------------
 * Driven entirely by a KpiDatum: the card knows nothing about which metric it
 * is showing. Unit, precision and whether a rise is favourable all come from
 * the metric definition, which is why the same component renders revenue,
 * operating costs and cash correctly without a special case for any of them.
 */

interface KpiCardProps {
  datum: KpiDatum;
  /** Marks the primary metric on a page; used sparingly. */
  emphasis?: boolean;
  onClick?: () => void;
  className?: string;
}

export function KpiCard({ datum, emphasis, onClick, className }: KpiCardProps) {
  const { metric, value, variance, comparisonLabel, secondary, series } = datum;
  const interactive = Boolean(onClick);

  const Element = interactive ? "button" : "div";

  return (
    <Element
      {...(interactive ? { type: "button" as const, onClick } : {})}
      className={cn(
        "bg-panel border border-subtle px-3.5 py-3 text-left",
        "flex flex-col gap-2 min-w-0",
        interactive && "hover:border-strong transition-colors cursor-pointer",
        emphasis && "border-strong",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11.5px] text-secondary font-medium leading-tight truncate">
          {metric.shortName ?? metric.name}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <span
          className={cn(
            "tnum font-semibold text-primary tracking-[-0.015em] leading-none",
            emphasis ? "text-[26px]" : "text-[21px]",
          )}
        >
          {formatMetric(value, metric)}
        </span>
        {series.length > 1 && (
          <Sparkline values={series} title={metric.name} width={emphasis ? 96 : 76} height={24} />
        )}
      </div>

      {/* One comparative per line, fixed order. Wrapping these onto a shared
          row makes cards different heights as soon as one label is longer. */}
      <div className="flex flex-col gap-[3px]">
        {variance ? (
          <VarianceValue variance={variance} label={comparisonLabel} size="sm">
            {formatMetricDelta(variance.absolute, variance.relative, metric)}
          </VarianceValue>
        ) : (
          <span className="text-[11.5px] text-tertiary">No comparative</span>
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
          <span className="text-[10.5px] text-tertiary">&nbsp;</span>
        )}
      </div>
    </Element>
  );
}

/**
 * KPI STRIP
 * ---------------------------------------------------------------------------
 * A responsive row of KPI cards. Six across at executive desktop widths,
 * degrading to three and then two — never one, because a single column of KPI
 * cards on a 1440px screen wastes the density this audience needs.
 */
export function KpiStrip({
  data, emphasiseFirst, onSelect, className,
}: {
  data: KpiDatum[];
  emphasiseFirst?: boolean;
  onSelect?: (metricId: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2.5",
        "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
        className,
      )}
    >
      {data.map((datum, index) => (
        <KpiCard
          key={datum.metric.id}
          datum={datum}
          emphasis={emphasiseFirst && index === 0}
          onClick={onSelect ? () => onSelect(datum.metric.id) : undefined}
        />
      ))}
    </div>
  );
}
