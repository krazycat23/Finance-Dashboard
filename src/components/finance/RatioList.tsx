import { Meter } from "@/components/ui/Meter";
import { VarianceValue } from "./VarianceValue";
import type { Variance } from "@/domain/metrics/variance";
import { cn } from "@/utils/cn";

/**
 * A labelled list of ratios or day-counts with an optional comparative.
 * Used for liquidity ratios and working-capital days — the same component,
 * because they are the same shape of information.
 */

export interface RatioItem {
  id: string;
  label: string;
  display: string;
  /** Movement against the comparative, already resolved for sentiment. */
  variance?: Variance;
  varianceDisplay?: string;
  comparisonLabel?: string;
  /** Optional bar, where the ratio has a meaningful benchmark. */
  meter?: { value: number; max: number };
}

export function RatioList({ items, className }: { items: RatioItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col", className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-1.5 py-2.5 border-b border-subtle last:border-b-0"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-secondary">{item.label}</span>
            <div className="flex items-baseline gap-3 shrink-0">
              <span className="text-[12.5px] text-primary tnum font-medium">
                {item.display}
              </span>
              {item.variance && item.varianceDisplay && (
                <VarianceValue
                  variance={item.variance}
                  size="xs"
                  label={item.comparisonLabel}
                  className="w-[92px] justify-end"
                >
                  {item.varianceDisplay}
                </VarianceValue>
              )}
            </div>
          </div>
          {item.meter && <Meter value={item.meter.value} max={item.meter.max} />}
        </li>
      ))}
    </ul>
  );
}
