import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { Variance } from "@/domain/metrics/variance";
import { cn } from "@/utils/cn";

/**
 * VARIANCE VALUE
 * ---------------------------------------------------------------------------
 * The single most-used component in the product, and the one that carries the
 * accessibility contract.
 *
 * Direction and sentiment are encoded SEPARATELY and both are always present:
 *
 *   glyph  (▲ ▼ –)  says which way the number moved
 *   colour (green / red / neutral) says whether that is good news
 *
 * That separation is what lets "Markdown impact ▼ 12.6%" read as favourable
 * while "Operating costs ▲ 3.9%" reads as adverse, and it means the variance is
 * still legible to a reader who cannot distinguish the two colours.
 */

const SENTIMENT_CLASS = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-secondary",
} as const;

interface VarianceValueProps {
  variance: Variance;
  /** Pre-formatted text, produced by the formatter from the metric definition. */
  children: string;
  /** Trailing qualifier, e.g. "vs LY". */
  label?: string;
  size?: "xs" | "sm" | "md";
  showGlyph?: boolean;
  className?: string;
}

const SIZE_CLASS = {
  xs: "text-[10.5px]",
  sm: "text-[11.5px]",
  md: "text-[12.5px]",
} as const;

const GLYPH_SIZE = { xs: 9, sm: 10, md: 11 } as const;

export function VarianceValue({
  variance, children, label, size = "sm", showGlyph = true, className,
}: VarianceValueProps) {
  const Icon =
    variance.direction === "up" ? ArrowUp
    : variance.direction === "down" ? ArrowDown
    : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium tnum whitespace-nowrap",
        SENTIMENT_CLASS[variance.sentiment],
        SIZE_CLASS[size],
        className,
      )}
    >
      {showGlyph && (
        <Icon size={GLYPH_SIZE[size]} strokeWidth={2.75} aria-hidden className="shrink-0" />
      )}
      <span>{children}</span>
      {label && <span className="text-tertiary font-normal">{label}</span>}
    </span>
  );
}
