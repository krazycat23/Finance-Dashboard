import type { StatementRow } from "@/domain/models";
import { calculateStatementVariance } from "@/domain/metrics/variance";
import { formatNumber, formatVariancePercent } from "@/utils/format";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { cn } from "@/utils/cn";
import { DataTable, type Column } from "./DataTable";

/**
 * STATEMENT TABLE
 * ---------------------------------------------------------------------------
 * Renders any financial statement from StatementRow[]. It knows the finance
 * presentation conventions and nothing about a particular company:
 *
 *  - subtotals and totals get weight and a rule, not a colour wash
 *  - detail rows indent under their subtotal
 *  - cost lines render as deductions, driven by the row's own `inverse` flag
 *  - a favourable variance on a cost line is a spend UNDER budget, which the
 *    row declares rather than the table inferring
 */

export type StatementColumnSet = "full" | "compact" | "budgetOnly";

interface StatementTableProps {
  rows: StatementRow[];
  /** Column headings for the period being reported. */
  actualLabel: string;
  budgetLabel?: string;
  /** Period caption under the comparative column; defaults to the actual's. */
  budgetSubLabel?: string;
  priorYearLabel?: string;
  columnSet?: StatementColumnSet;
  /** Heading for the movement column, e.g. "Variance" or "Movement". */
  varianceLabel?: string;
  /** Scale for every figure in the table; statements use one scale throughout. */
  scale?: "units" | "thousands" | "millions";
  className?: string;
}

const EMPHASIS_CLASS: Record<StatementRow["emphasis"], string> = {
  detail: "",
  subtotal: "font-semibold border-t border-line",
  total: "font-semibold border-t-2 border-strong bg-inset/40",
};

export function StatementTable({
  rows, actualLabel, budgetLabel = "Budget", budgetSubLabel,
  priorYearLabel = "Last Year", columnSet = "full", varianceLabel = "Variance",
  scale = "thousands", className,
}: StatementTableProps) {
  // Statement bodies carry no currency symbol: the panel caption states the
  // unit once ($'000), and repeating the symbol on every row adds noise to the
  // column a reader is trying to scan vertically.
  const money = (value: number | undefined, row: StatementRow) => {
    if (row.isSection) return null;
    if (value === undefined) return <span className="text-tertiary">—</span>;
    // Deduction lines print as negatives so the column adds up as it reads.
    const signed = row.inverse ? -Math.abs(value) : value;
    return formatNumber(signed, { scale, showScaleSuffix: false, precision: 0 });
  };

  const varianceCell = (
    row: StatementRow,
    comparison: number | undefined,
    mode: "absolute" | "percent",
  ) => {
    if (row.isSection || comparison === undefined) return null;
    const variance = calculateStatementVariance(row.actual, comparison, row.inverse);
    if (!variance) return <span className="text-tertiary">—</span>;

    // Finance convention: a variance column reads FAVOURABLE POSITIVE and
    // ADVERSE NEGATIVE, whatever the line. On a cost line that means the sign
    // is flipped — spending less than budget is a positive variance even though
    // the underlying balance fell. Without this, an overspend would print as a
    // positive number in red, which reads as a contradiction.
    const signedAbsolute = row.inverse ? -variance.absolute : variance.absolute;
    const signedRelative =
      variance.relative === undefined
        ? undefined
        : row.inverse ? -variance.relative : variance.relative;

    const text =
      mode === "absolute"
        ? formatNumber(signedAbsolute, { scale, showScaleSuffix: false, precision: 0 })
        : signedRelative === undefined
          ? "—"
          : formatVariancePercent(signedRelative);

    return (
      <VarianceValue variance={variance} size="sm" showGlyph={false}>
        {text}
      </VarianceValue>
    );
  };

  const labelColumn: Column<StatementRow> = {
    id: "label",
    header: "",
    align: "left",
    width: "30%",
    render: (row) => (
      <span
        className={cn(
          row.isSection &&
            "eyebrow block pt-2.5 pb-0.5",
          !row.isSection && row.emphasis === "detail" && "text-secondary",
          !row.isSection && row.emphasis !== "detail" && "text-primary",
        )}
        style={!row.isSection && row.depth ? { paddingLeft: row.depth * 12 } : undefined}
      >
        {row.label}
      </span>
    ),
  };

  const columns: Column<StatementRow>[] = [labelColumn];

  columns.push({
    id: "actual",
    header: "Actual",
    subHeader: actualLabel,
    align: "right",
    render: (row) => money(row.actual, row),
  });

  if (columnSet !== "compact") {
    columns.push(
      {
        id: "budget",
        header: budgetLabel,
        subHeader: budgetSubLabel ?? actualLabel,
        align: "right",
        groupStart: true,
        render: (row) => money(row.budget, row),
      },
      {
        id: "variance",
        header: varianceLabel,
        align: "right",
        render: (row) => varianceCell(row, row.budget, "absolute"),
      },
      {
        id: "variance-pct",
        header: "Var %",
        align: "right",
        render: (row) => varianceCell(row, row.budget, "percent"),
      },
    );
  }

  if (columnSet === "full") {
    columns.push(
      {
        id: "prior",
        header: priorYearLabel,
        align: "right",
        groupStart: true,
        render: (row) => money(row.priorYear, row),
      },
      {
        id: "vs-ly",
        header: "vs LY",
        align: "right",
        render: (row) => varianceCell(row, row.priorYear, "absolute"),
      },
      {
        id: "vs-ly-pct",
        header: "vs LY %",
        align: "right",
        render: (row) => varianceCell(row, row.priorYear, "percent"),
      },
    );
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row, index) => `${row.line}-${index}`}
      rowClassName={(row) =>
        cn(
          row.isSection && "hover:bg-transparent",
          !row.isSection && EMPHASIS_CLASS[row.emphasis],
        )
      }
      className={className}
    />
  );
}
