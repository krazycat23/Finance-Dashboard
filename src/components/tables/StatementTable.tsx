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

export type StatementColumnSet = "full" | "compact" | "budgetOnly" | "priorOnly";

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
  /**
   * How a result row is marked. "rule" is the accountant's default — weight and
   * a rule. "band" adds a quiet tonal fill, which a balance sheet earns because
   * it carries four nested results a reader has to find at a glance.
   */
  totalTreatment?: "rule" | "band";
  className?: string;
}

/**
 * ROW HIERARCHY
 * ---------------------------------------------------------------------------
 * Three ranks, marked by rule, weight and air — never by a colour wash, because
 * a filled row in a statement reads as a status, which it is not.
 *
 *   detail    the lines that make up a result
 *   subtotal  a result: a rule above, weight, and a little more room
 *   total     THE result: a rule above and the accountant's double rule below,
 *             set a size larger so the eye lands on it last and stays
 *
 * The rank comes from the statement spec, so the same table gives a P&L its
 * profit lines and a balance sheet its totals without knowing either.
 */
const EMPHASIS_CLASS: Record<StatementRow["emphasis"], string> = {
  detail: "",
  subtotal: "font-semibold border-t border-line [&>td]:py-[10px]",
  total: [
    "font-semibold border-t border-strong",
    "[&>td]:py-[13px] [&>td]:text-[13.5px]",
    // The double rule under a final result is the accounting convention, and
    // it closes the statement without a fill or a box.
    "[&>td]:border-b-4 [&>td]:border-b-[var(--border-strong)]",
    "[&>td]:[border-bottom-style:double]",
  ].join(" "),
};

/**
 * A row carrying no information in any scenario — zero actual, no budget and no
 * comparative. It stays in the statement because the structure requires it, but
 * it is set back so it cannot compete with the lines that moved. This is
 * computed from the row's own figures; no line is named here.
 */
function isImmaterial(row: StatementRow): boolean {
  if (row.isSection || row.emphasis !== "detail") return false;
  const absent = (value: number | undefined) => value === undefined || value === 0;
  return absent(row.actual) && absent(row.budget) && absent(row.priorYear);
}

export function StatementTable({
  rows, actualLabel, budgetLabel = "Budget", budgetSubLabel,
  priorYearLabel = "Last Year", columnSet = "full", varianceLabel = "Variance",
  scale = "thousands", totalTreatment = "rule", className,
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
    width: columnSet === "priorOnly" ? "38%" : "30%",
    render: (row) => (
      <span
        className={cn(
          row.isSection && "eyebrow block pt-2.5 pb-0.5",
          !row.isSection && row.emphasis === "detail" && "text-secondary",
          !row.isSection && row.emphasis === "subtotal" && "text-primary",
          // The final result is set in the display serif: it is the sentence
          // the whole statement has been building towards.
          !row.isSection && row.emphasis === "total" &&
            "text-primary font-serif text-[15px] tracking-[-0.01em]",
          isImmaterial(row) && "text-tertiary",
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
    width: columnSet === "priorOnly" ? "16%" : undefined,
    render: (row) => money(row.actual, row),
  });

  if (columnSet !== "compact" && columnSet !== "priorOnly") {
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

  if (columnSet === "full" || columnSet === "priorOnly") {
    // Against a prior CLOSE the movement is not a year-on-year variance, so the
    // columns take the caller's own label rather than "vs LY".
    const priorOnly = columnSet === "priorOnly";
    columns.push(
      {
        id: "prior",
        header: priorYearLabel,
        align: "right",
        width: priorOnly ? "16%" : undefined,
        groupStart: true,
        render: (row) => money(row.priorYear, row),
      },
      {
        id: "vs-ly",
        header: priorOnly ? varianceLabel : "vs LY",
        align: "right",
        width: priorOnly ? "15%" : undefined,
        render: (row) => varianceCell(row, row.priorYear, "absolute"),
      },
      {
        id: "vs-ly-pct",
        header: priorOnly ? `${varianceLabel} %` : "vs LY %",
        align: "right",
        width: priorOnly ? "15%" : undefined,
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
          // The band is a tonal fill, not a colour: it marks structure, never
          // a status.
          totalTreatment === "band" && !row.isSection && row.emphasis !== "detail" &&
            "bg-inset hover:bg-inset",
          isImmaterial(row) && "[&>td]:text-tertiary",
        )
      }
      className={className}
    />
  );
}
