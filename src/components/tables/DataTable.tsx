import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * DATA TABLE
 * ---------------------------------------------------------------------------
 * The generic table primitive. It owns the conventions that must not vary
 * between pages: row height, header treatment, numeric alignment, tabular
 * figures, hover, and the horizontal-scroll container that keeps a wide table
 * from forcing the page to scroll sideways.
 *
 * Columns declare their own alignment and rendering; the table never inspects
 * the data.
 */

export interface Column<T> {
  id: string;
  header: ReactNode;
  /** Secondary header line, e.g. the period a column covers. */
  subHeader?: ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  render: (row: T, index: number) => ReactNode;
  /** Visually separates column groups, e.g. actual | budget | variance. */
  groupStart?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Per-row emphasis, used by statement tables for subtotals and totals. */
  rowClassName?: (row: T, index: number) => string | undefined;
  className?: string;
  /** Sticky header for long tables. */
  stickyHeader?: boolean;
  /**
   * Minimum width before the table scrolls horizontally. Narrow panels need a
   * lower floor, otherwise the last columns are clipped rather than reachable.
   */
  minWidth?: number;
  empty?: ReactNode;
}

const ALIGN_CLASS = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function DataTable<T>({
  columns, rows, rowKey, rowClassName, className, stickyHeader,
  minWidth = 640, empty,
}: DataTableProps<T>) {
  if (rows.length === 0 && empty) {
    return <div className="py-10 text-center text-[12px] text-tertiary">{empty}</div>;
  }

  return (
    // Only the table scrolls sideways, never the page.
    <div className={cn("overflow-x-auto -mx-4 px-4", className)}>
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead className={cn(stickyHeader && "sticky top-0 bg-panel z-10")}>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={cn(
                  "py-2 px-2.5 font-medium text-[10.5px] uppercase tracking-[0.07em]",
                  "text-tertiary align-bottom whitespace-nowrap",
                  ALIGN_CLASS[column.align ?? "left"],
                  column.groupStart && "border-l border-subtle",
                )}
              >
                <div>{column.header}</div>
                {column.subHeader && (
                  <div className="font-normal normal-case tracking-normal text-[10px] mt-0.5 opacity-80">
                    {column.subHeader}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className={cn(
                "border-b border-subtle last:border-b-0",
                "hover:bg-inset/60 transition-colors",
                rowClassName?.(row, index),
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={cn(
                    "py-[7px] px-2.5 text-[12px] align-middle",
                    column.align === "right" && "tnum",
                    ALIGN_CLASS[column.align ?? "left"],
                    column.groupStart && "border-l border-subtle",
                  )}
                >
                  {column.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
