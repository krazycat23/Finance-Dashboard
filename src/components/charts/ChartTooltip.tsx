import type { TooltipProps } from "recharts";
import { cn } from "@/utils/cn";

/**
 * A shared tooltip. Every chart in the product ships hover — a chart that
 * cannot be interrogated is a picture, and an executive's first instinct on
 * seeing a movement is to ask what it was.
 */

export interface TooltipRow {
  id: string;
  label: string;
  value: string;
  colour?: string;
  shape?: "block" | "line" | "dashed";
  /** Rendered in muted type beneath the rows. */
  muted?: boolean;
}

export function TooltipShell({
  title, subtitle, rows, className,
}: {
  title: string;
  subtitle?: string;
  rows: TooltipRow[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-panel border border-line px-3 py-2.5 min-w-[168px]",
        "shadow-[var(--shadow-overlay)]",
        className,
      )}
    >
      <div className="text-[11.5px] font-semibold text-primary">{title}</div>
      {subtitle && <div className="text-[10.5px] text-tertiary mt-0.5">{subtitle}</div>}
      <div className="mt-2 flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 min-w-0">
              {row.colour && (
                row.shape === "line" || row.shape === "dashed" ? (
                  <svg width={12} height={8} aria-hidden className="shrink-0">
                    <line
                      x1={0} y1={4} x2={12} y2={4}
                      stroke={row.colour} strokeWidth={2}
                      strokeDasharray={row.shape === "dashed" ? "3 2" : undefined}
                    />
                  </svg>
                ) : (
                  <span
                    aria-hidden
                    className="w-2 h-2 shrink-0"
                    style={{ backgroundColor: row.colour }}
                  />
                )
              )}
              <span
                className={cn(
                  "text-[11.5px] truncate",
                  row.muted ? "text-tertiary" : "text-secondary",
                )}
              >
                {row.label}
              </span>
            </div>
            <span
              className={cn(
                "text-[11.5px] tnum font-medium shrink-0",
                row.muted ? "text-tertiary" : "text-primary",
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Props Recharts passes to a custom tooltip, narrowed to what we use. */
export type RechartsTooltipProps = TooltipProps<number, string>;
