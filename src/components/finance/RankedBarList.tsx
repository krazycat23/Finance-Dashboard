import { Meter } from "@/components/ui/Meter";
import { cn } from "@/utils/cn";

/**
 * RANKED BAR LIST
 * ---------------------------------------------------------------------------
 * A horizontal ranking. Values are always printed, so the bar is a second
 * reading of the number rather than the only one. Bars are a single colour —
 * rank is already encoded by position, and colouring by rank would break the
 * rule that colour follows the entity.
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
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {items.map((item, index) => (
        <li key={item.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
          <div className="flex items-center gap-2 min-w-0">
            {showIndex && (
              <span className="text-[11px] text-tertiary tnum w-3 shrink-0">{index + 1}</span>
            )}
            <span className="text-[12px] text-primary truncate">{item.label}</span>
          </div>
          <div className="flex items-baseline gap-2.5 shrink-0">
            <span className="text-[12px] text-primary tnum font-medium">{item.display}</span>
            {item.secondary && (
              <span
                className={cn(
                  "text-[11px] tnum w-[52px] text-right",
                  item.secondaryTone === "positive" && "text-positive",
                  item.secondaryTone === "negative" && "text-negative",
                  (!item.secondaryTone || item.secondaryTone === "neutral") && "text-tertiary",
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
            className="col-span-2"
          />
        </li>
      ))}
    </ul>
  );
}
