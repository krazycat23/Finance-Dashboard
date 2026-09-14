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
 * The editorial reading of the same findings: an ordered list with a hairline
 * between entries and the sentiment carried by a short rule against the
 * numeral. Nothing here is generated — it renders exactly the insights the
 * selectors produced, in the order they were ranked.
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
          className="grid grid-cols-[auto_1fr] gap-x-4 py-3 border-t border-subtle first:border-t-0 first:pt-0"
        >
          <div className="flex items-center gap-2 pt-[3px]">
            <span aria-hidden className="type-section-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              aria-hidden
              className={cn("w-[14px] h-[2px] shrink-0", RULE_CLASS[insight.sentiment])}
            />
          </div>
          <p className="type-body">{insight.text}</p>
        </li>
      ))}
    </ol>
  );
}
