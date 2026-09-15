import type { CanonicalCalculationRole, StatementLine } from "@/domain/models";
import { asIdentifier, type SourceWorkbooks } from "./workbook";

export const GL_MAPPING_FILE = "FF_GL_PL_Mapping.xlsx";
const GL_MAPPING_SHEET = "GL Mapping";

/** The source's own hierarchy, carried through untouched. */
export interface FreedomGlMapping {
  glCode: string;
  description: string;
  p1: string;
  p2: string;
  p3: string;
  pnlSection: string;
  /** The workbook's declared natural sign for the GL in the trial balance. */
  sourceSign: "income" | "cost";
  line: StatementLine;
  role: CanonicalCalculationRole;
  /**
   * Multiplier from the raw trial-balance value to the canonical magnitude.
   * See `canonicalDirection` for why this is decided by the canonical LINE and
   * not by the source's sign column.
   */
  multiplier: 1 | -1;
}

/**
 * CANONICAL ROLE ASSIGNMENT
 * ---------------------------------------------------------------------------
 * The source hierarchy (P1 section / P2 header / P3 sub-header) is a
 * PRESENTATION structure and is preserved as such on every account. It is not
 * the arithmetic role: "Markdowns" and "COGS" both sit under P1 "Total Income"
 * yet neither is income, and "Support Centre Allocation" sits under its own P1
 * while the workbook's own P&L Section column calls it Below the Line.
 *
 * Canonical role is therefore assigned from the P2 header, which is the level
 * at which the workbook is internally consistent.
 */
const ROLE_BY_P2: Record<string, { line: StatementLine; role: CanonicalCalculationRole }> = {
  "Gross Sales": { line: "grossSales", role: "grossSales" },
  Markdowns: { line: "markdowns", role: "markdowns" },
  COGS: { line: "costOfSales", role: "costOfSales" },
  // Both of these P2 headers mix income and cost GLs, which is precisely what
  // the tradingIncomeCost role exists for: a net contribution to revenue whose
  // components point in both directions.
  "Net Delivery Fees": { line: "revenue", role: "tradingIncomeCost" },
  "Net Other Income": { line: "revenue", role: "tradingIncomeCost" },
  Depreciation: { line: "depreciationAmortisation", role: "depreciationAmortisation" },
  Interest: { line: "interest", role: "interest" },
  Tax: { line: "tax", role: "tax" },
};

/**
 * Opex P2 headers all carry the operatingCosts role, but each keeps its own
 * header as the cost category so that cost composition still reads by the
 * client's own grouping.
 */
const OPEX_SECTION = "Opex";

/**
 * P2 headers with no canonical equivalent. These are NOT forced into operating
 * costs to make a total tie: they resolve to `unconfirmed`, which the canonical
 * engine deliberately excludes from the P&L ladder, and they are reported as
 * unmapped value in the reconciliation instead.
 */
const UNSUPPORTED_P2 = new Set(["Discontinued", "Support Centre Allocation"]);

/**
 * SIGN CONVENTION
 * ---------------------------------------------------------------------------
 * The trial balances carry income as positive and cost as negative, which the
 * mapping workbook states per GL in its Sign Convention column and which the
 * data confirms: GL 1000 "Gross Sales - Furn" totals +390.9m for FY26 while
 * every cost-convention GL sums negative.
 *
 * The canonical engine stores magnitudes: a line that is SUBTRACTED in the
 * ladder (markdowns, cost of sales, operating costs, D&A, interest, tax) holds
 * a positive number, and a line that is ADDED (gross sales, revenue) holds its
 * natural sign. The multiplier is therefore decided by the canonical line, not
 * by the per-GL sign column.
 *
 * That distinction matters for the mixed headers. "Net Delivery Fees" contains
 * both fee income and delivery expense; flipping its cost GLs to positive
 * magnitudes would ADD delivery expense to revenue. On an added line the raw
 * sign is what carries the economics, so it is kept.
 */
const SUBTRACTED_LINES = new Set<StatementLine>([
  "markdowns", "returns", "costOfSales", "operatingCosts",
  "depreciationAmortisation", "interest", "tax",
]);

export function canonicalDirection(line: StatementLine): 1 | -1 {
  return SUBTRACTED_LINES.has(line) ? -1 : 1;
}

export interface GlMappingResult {
  byGl: Map<string, FreedomGlMapping>;
  /** Rows read from the workbook, before de-duplication. */
  sourceRows: number;
}

export function parseGlMapping(workbooks: SourceWorkbooks): GlMappingResult {
  const rows = workbooks.sheet(GL_MAPPING_FILE, GL_MAPPING_SHEET);
  const header = rows[0]?.map((cell) => asIdentifier(cell)) ?? [];
  const column = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`${GL_MAPPING_FILE}/${GL_MAPPING_SHEET} has no "${name}" column. Found: ${header.join(", ")}`);
    return index;
  };
  const cGl = column("GL Code");
  const cDesc = column("GL Description");
  const cP1 = column("P1 - Section");
  const cP2 = column("P2 - Header");
  const cP3 = column("P3 - Sub-Header");
  const cSection = column("P&L Section");
  const cSign = column("Sign Convention");

  const byGl = new Map<string, FreedomGlMapping>();
  let sourceRows = 0;

  for (const row of rows.slice(1)) {
    const glCode = asIdentifier(row[cGl]);
    if (!glCode) continue;
    sourceRows += 1;

    const p1 = asIdentifier(row[cP1]);
    const p2 = asIdentifier(row[cP2]);
    const sourceSign = asIdentifier(row[cSign]).toLowerCase() === "income" ? "income" : "cost";
    const assigned = resolveRole(p1, p2);

    byGl.set(glCode, {
      glCode,
      description: asIdentifier(row[cDesc]) || glCode,
      p1,
      p2,
      p3: asIdentifier(row[cP3]),
      pnlSection: asIdentifier(row[cSection]),
      sourceSign,
      line: assigned.line,
      role: assigned.role,
      multiplier: canonicalDirection(assigned.line),
    });
  }

  return { byGl, sourceRows };
}

function resolveRole(p1: string, p2: string): { line: StatementLine; role: CanonicalCalculationRole } {
  if (UNSUPPORTED_P2.has(p2) || UNSUPPORTED_P2.has(p1)) {
    return { line: "unconfirmed", role: "unconfirmed" };
  }
  const direct = ROLE_BY_P2[p2];
  if (direct) return direct;
  if (p1 === OPEX_SECTION) return { line: "operatingCosts", role: "operatingCosts" };
  // An unrecognised header is left unconfirmed rather than absorbed into
  // operating costs, which would hide a mapping gap inside a real subtotal.
  return { line: "unconfirmed", role: "unconfirmed" };
}
