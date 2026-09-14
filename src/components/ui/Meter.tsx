import { cn } from "@/utils/cn";

/**
 * A horizontal magnitude bar. Used for ranked lists and coverage indicators.
 * The value is always printed alongside, so the bar is a second encoding of
 * something already readable rather than the only way to read it.
 */
export function Meter({
  value, max, tone = "accent", className,
}: {
  value: number;
  max: number;
  tone?: "accent" | "positive" | "negative" | "neutral";
  className?: string;
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.max(0, (Math.abs(value) / max) * 100));
  const fill = {
    accent: "bg-[var(--series-1)]",
    positive: "bg-positive",
    negative: "bg-negative",
    neutral: "bg-[var(--series-3)]",
  }[tone];

  return (
    <div className={cn("h-[5px] bg-[var(--fill-muted)] overflow-hidden", className)}>
      <div className={cn("h-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
