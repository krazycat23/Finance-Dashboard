import type { Insight } from "@/domain/selectors/insights";
import { cn } from "@/utils/cn";

/**
 * Insight list. The marker carries sentiment, but each insight also states its
 * direction in words, so the meaning survives without colour.
 */

const MARKER_CLASS = {
  positive: "bg-positive",
  negative: "bg-negative",
  neutral: "bg-[var(--series-3)]",
} as const;

export function InsightList({
  insights, className,
}: { insights: Insight[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {insights.map((insight) => (
        <li key={insight.id} className="flex gap-2.5 items-start">
          <span
            aria-hidden
            className={cn(
              "mt-[6px] w-[5px] h-[5px] rounded-full shrink-0",
              MARKER_CLASS[insight.sentiment],
            )}
          />
          <p className="text-[12.5px] text-secondary leading-[1.55]">{insight.text}</p>
        </li>
      ))}
    </ul>
  );
}
