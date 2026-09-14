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

/**
 * NUMBERED INSIGHT LIST
 * ---------------------------------------------------------------------------
 * The editorial reading of the same findings. Three ranks, clearly separated:
 *
 *   the numeral      a quiet editorial index in the left gutter
 *   the finding      primary text, the line a reader actually takes away
 *   the sentiment    a short rule under the numeral, never colour alone
 *
 * Nothing here is generated — it renders exactly the insights the selectors
 * produced, in the order they were ranked.
 */
const RULE_CLASS = {
  positive: "bg-positive",
  negative: "bg-negative",
  neutral: "bg-[var(--border-strong)]",
} as const;

export function NumberedInsightList({
  insights, className,
}: { insights: Insight[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {insights.map((insight, index) => (
        <li
          key={insight.id}
          className="grid grid-cols-[34px_1fr] gap-x-5 py-3.5 border-t border-subtle first:border-t-0 first:pt-0"
        >
          {/* The gutter carries the index and the sentiment together, so the
              finding beside it stays a single uninterrupted line of prose. */}
          <div aria-hidden className="flex flex-col gap-1.5 pt-[3px]">
            <span className="type-section-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className={cn("w-[18px] h-[2px]", RULE_CLASS[insight.sentiment])} />
          </div>
          <p className="text-[13.5px] leading-[1.55] text-primary">{insight.text}</p>
        </li>
      ))}
    </ol>
  );
}
