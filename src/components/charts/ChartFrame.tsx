import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * CHART FRAME
 * ---------------------------------------------------------------------------
 * Shared chrome for every chart: the unit caption, the legend, and the plot
 * area. Centralising it is what stops one chart labelling its axis "$M" and
 * another leaving it implicit.
 *
 * The legend is mandatory for two or more series — identity must never be
 * carried by colour alone.
 */

export interface LegendEntry {
  id: string;
  label: string;
  colour: string;
  /** Line series render as a rule; dashed marks a plan or forecast. */
  shape?: "block" | "line" | "dashed";
}

interface ChartFrameProps {
  children: ReactNode;
  /** Unit caption, shown once rather than on every tick. */
  unit?: string;
  legend?: LegendEntry[];
  height?: number;
  /** A note rendered under the plot, e.g. what the shaded region means. */
  footnote?: ReactNode;
  className?: string;
}

export function ChartLegend({ entries }: { entries: LegendEntry[] }) {
  return (
    <ul className="flex items-center gap-3.5 flex-wrap">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-1.5">
          {entry.shape === "line" || entry.shape === "dashed" ? (
            <svg width={14} height={8} aria-hidden className="shrink-0">
              <line
                x1={0} y1={4} x2={14} y2={4}
                stroke={entry.colour}
                strokeWidth={2}
                strokeDasharray={entry.shape === "dashed" ? "3 2.5" : undefined}
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <span
              aria-hidden
              className="w-2.5 h-2.5 shrink-0"
              style={{ backgroundColor: entry.colour }}
            />
          )}
          <span className="text-[11px] text-secondary whitespace-nowrap">{entry.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChartFrame({
  children, unit, legend, height = 240, footnote, className,
}: ChartFrameProps) {
  return (
    <div className={cn("flex flex-col min-w-0", className)}>
      {(unit || legend) && (
        <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
          {unit ? (
            <span className="text-[10.5px] text-tertiary tnum">{unit}</span>
          ) : (
            <span />
          )}
          {legend && legend.length > 0 && <ChartLegend entries={legend} />}
        </div>
      )}
      <div style={{ height }} className="min-w-0">
        {children}
      </div>
      {footnote && (
        <p className="text-[10.5px] text-tertiary mt-2 leading-snug">{footnote}</p>
      )}
    </div>
  );
}
