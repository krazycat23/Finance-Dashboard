import { Meter } from "@/components/ui/Meter";
import { cn } from "@/utils/cn";

/**
 * RANKED BAR LIST
 * ---------------------------------------------------------------------------
 * A horizontal ranking, set as ruled rows rather than a stack of bars so it
 * carries the same density and seriousness as the statement tables.
 *
 * Values are always printed, so the bar is a second reading of the number
 * rather than the only one. Bars are a single colour — rank is already encoded
 * by position, and colouring by rank would break the rule that colour follows
 * the entity. The leader is the one row given extra weight; everything below it
 * is read relative to that.
 */

export interface RankedItem {
  id: string;
  label: string;
  value: number;
  /** Pre-formatted display value. */
  display: string;
  /** Optional secondary figure shown to the right, e.g. growth. */
  secondary?: string;
  secondaryTone?: "positive" | "negative" | "neutral";
}

export function RankedBarList({
  items, tone = "accent", className, showIndex,
}: {
  items: RankedItem[];
  tone?: "accent" | "positive" | "negative" | "neutral";
  className?: string;
  showIndex?: boolean;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 0);

  return (
    <ul className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const leader = index === 0;
        return (
          <li
            key={item.id}
            className={cn(
              "grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 items-baseline",
              "py-2.5 border-b border-subtle last:border-b-0",
              leader && "border-t border-strong first:border-t-0",
            )}
          >
            <div className="flex items-baseline gap-3 min-w-0">
              {showIndex && (
                <span aria-hidden className="type-section-number w-[14px] shrink-0">
                  {index + 1}
                </span>
              )}
              <span
                className={cn(
                  "truncate",
                  leader ? "text-[13px] font-semibold text-primary" : "text-[12.5px] text-primary",
                )}
              >
                {item.label}
              </span>
            </div>

            <div className="flex items-baseline gap-4 shrink-0">
              <span
                className={cn(
                  "tnum text-primary text-right",
                  leader ? "text-[13px] font-semibold" : "text-[12.5px] font-medium",
                )}
              >
                {item.display}
              </span>
              {item.secondary && (
                <span
                  className={cn(
                    "text-[11.5px] tnum font-medium w-[56px] text-right",
                    item.secondaryTone === "positive" && "text-positive",
                    item.secondaryTone === "negative" && "text-negative",
                    (!item.secondaryTone || item.secondaryTone === "neutral") && "text-secondary",
                  )}
                >
                  {item.secondary}
                </span>
              )}
            </div>

            <Meter
              value={item.value}
              max={max}
              tone={item.value < 0 ? "negative" : tone}
              className={cn("col-span-2", !leader && "opacity-70")}
            />
          </li>
        );
      })}
    </ul>
  );
}
