import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export type BadgeTone = "neutral" | "positive" | "negative" | "caution" | "accent";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-neutral-soft text-secondary",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  caution: "bg-caution-soft text-caution",
  accent: "bg-accent-soft text-primary",
};

export function Badge({
  children, tone = "neutral", className,
}: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-[2px] rounded-[3px]",
        "text-[10.5px] font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
