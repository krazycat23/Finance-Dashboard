import { formatPercentage } from "@/utils/format";
import { divergingFill, useChartTokens } from "./chartTheme";
import { cn } from "@/utils/cn";

/**
 * HEAT GRID
 * ---------------------------------------------------------------------------
 * A matrix of signed rates — typically growth by region by period.
 *
 * Three things make this readable rather than decorative, and all three are
 * mandatory here:
 *   1. a legend with an explicit scale, so the reader knows what saturation means
 *   2. the value printed in every cell, so colour is never the only encoding
 *   3. a symmetric diverging scale around zero with a neutral midpoint
 *
 * The bound is the largest absolute value in the grid, so the scale adapts to
 * the data instead of clipping it at an arbitrary ceiling.
 */

export interface HeatRow {
  id: string;
  label: string;
  cells: { id: string; label: string; value?: number }[];
  total?: number;
}

interface HeatGridProps {
  rows: HeatRow[];
  totalLabel?: string;
  className?: string;
}

export function HeatGrid({ rows, totalLabel = "YTD", className }: HeatGridProps) {
  const tokens = useChartTokens();

  const bound = Math.max(
    ...rows.flatMap((row) => row.cells.map((cell) => Math.abs(cell.value ?? 0))),
    0.01,
  );

  const columns = rows[0]?.cells ?? [];

  return (
    <div className={cn("flex flex-col gap-3 min-w-0", className)}>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse min-w-[520px]">
          <thead>
            <tr>
              <th className="text-left pb-2 pr-3 text-[10px] uppercase tracking-[0.07em] text-tertiary font-medium">
                Region
              </th>
              {columns.map((cell) => (
                <th
                  key={cell.id}
                  className="pb-2 px-1 text-[10px] text-tertiary font-medium text-center tnum"
                >
                  {cell.label}
                </th>
              ))}
              <th className="pb-2 pl-3 text-[10px] uppercase tracking-[0.07em] text-tertiary font-medium text-right">
                {totalLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-1 pr-3 text-[12px] text-primary whitespace-nowrap">
                  {row.label}
                </td>
                {row.cells.map((cell) => {
                  const { background, opacity } = divergingFill(cell.value, bound, tokens);
                  return (
                    <td key={cell.id} className="py-1 px-[2px]">
                      <div
                        className="h-[26px] rounded-[2px] flex items-center justify-center"
                        style={{ backgroundColor: background, opacity }}
                        title={`${row.label}, ${cell.label}: ${cell.value === undefined ? "no data" : formatPercentage(cell.value)}`}
                      >
                        {/* The value is always printed: colour is a second reading. */}
                        <span className="text-[10px] tnum font-medium text-primary mix-blend-luminosity">
                          {cell.value === undefined ? "—" : formatPercentage(cell.value, { precision: 0 })}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "py-1 pl-3 text-[12px] tnum text-right font-medium whitespace-nowrap",
                    (row.total ?? 0) >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {row.total === undefined ? "—" : formatPercentage(row.total, { showSign: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Explicit scale. A heat grid without one is decoration. */}
      <div className="flex items-center gap-2.5 text-[10px] text-tertiary">
        <span className="tnum">{formatPercentage(-bound, { precision: 0 })}</span>
        <div className="flex-1 max-w-[180px] h-[6px] rounded-[2px] overflow-hidden flex">
          {Array.from({ length: 11 }, (_, i) => {
            const value = -bound + (i / 10) * bound * 2;
            const { background, opacity } = divergingFill(value, bound, tokens);
            return (
              <div key={i} className="flex-1" style={{ backgroundColor: background, opacity }} />
            );
          })}
        </div>
        <span className="tnum">{formatPercentage(bound, { precision: 0 })}</span>
        <span className="ml-1">growth vs last year</span>
      </div>
    </div>
  );
}
