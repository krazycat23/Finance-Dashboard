import { sum } from "./sum";
import { asIdentifier, asNumber, splitCodedLabel, type SourceWorkbooks } from "./workbook";

/**
 * WIDE TRIAL BALANCE UNPIVOT
 * ---------------------------------------------------------------------------
 * All three finance sources share one shape: three identifier columns followed
 * by one column per calendar month, headed "2026-07". The header names differ
 * between workbooks — FY26 spells its first column "Entiy" and the budget calls
 * the second column "GL" — so columns are located by matching a set of accepted
 * spellings rather than by position alone, and the period columns are whatever
 * remains that parses as a YYYY-MM token.
 */
export interface TrialBalanceSource {
  file: string;
  sheet: string;
  /** Which canonical scenario the workbook's values belong to. */
  scenario: "actual" | "budget";
  label: string;
  /**
   * The last period this workbook reports as CLOSED, where it carries columns
   * beyond its own cut-off.
   *
   * "AUG TB" is an August trial balance and it carries a September column, but
   * September is still open: it holds 3,575 posted rows against August's 6,104
   * and $11.2m of gross sales against a budgeted $45.4m. Treating it as closed
   * compares two and a bit months of actual against three months of budget and
   * of last year, and manufactures profit out of a month that has revenue
   * posted but not yet its costs.
   *
   * The declaration is checked against the data in `openPeriodEvidence`; the
   * two disagreeing is an error, not something to paper over.
   */
  closedThrough?: string;
}

export const TRIAL_BALANCES: TrialBalanceSource[] = [
  { file: "FY26 Final TB.xlsx", sheet: "PY TB", scenario: "actual", label: "FY26 actual trial balance" },
  { file: "AUG TB.xlsx", sheet: "Sheet2", scenario: "actual", label: "FY27 year-to-date actual trial balance", closedThrough: "2026-08" },
  { file: "FY27 Budget TB.xlsx", sheet: "Sheet2", scenario: "budget", label: "FY27 budget trial balance" },
];

export interface TrialBalanceCell {
  periodId: string;
  entityId: string;
  glCode: string;
  glDescription: string;
  costCentreId: string;
  costCentreName: string;
  /** The value exactly as the workbook holds it, before any sign treatment. */
  rawValue: number;
  sourceRow: number;
}

export interface TrialBalanceParse {
  source: TrialBalanceSource;
  periodIds: string[];
  cells: TrialBalanceCell[];
  /** Every numeric cell in the period columns, including zeros. */
  sourceCellCount: number;
  /** Sum of every numeric cell in the period columns. */
  sourceTotal: number;
  /** Sum of the emitted cells; equal to sourceTotal because only zeros are dropped. */
  unpivotedTotal: number;
  droppedZeroCells: number;
  /** Posted (non-zero) cell count per period, for the completeness check. */
  postedByPeriod: Map<string, number>;
}

/**
 * COMPLETENESS
 * ---------------------------------------------------------------------------
 * Is a trailing period actually closed? A closed month posts roughly as many
 * lines as the months before it. An open one posts a fraction — some revenue
 * has landed, most accruals have not — which is indistinguishable from a
 * catastrophic trading month unless someone looks.
 *
 * This measures every period against the median of the periods before it and
 * reports the ones that fall below half, so a declared cut-off is evidence-
 * checked rather than trusted.
 */
export function openPeriodEvidence(parse: TrialBalanceParse): { periodId: string; posted: number; expected: number }[] {
  const periods = parse.periodIds;
  const counts = periods.map((periodId) => parse.postedByPeriod.get(periodId) ?? 0);
  const findings: { periodId: string; posted: number; expected: number }[] = [];

  periods.forEach((periodId, index) => {
    if (index === 0) return;
    const preceding = counts.slice(0, index).filter((count) => count > 0).sort((a, b) => a - b);
    if (preceding.length === 0) return;
    const median = preceding[Math.floor(preceding.length / 2)];
    if (counts[index] < median * 0.5) findings.push({ periodId, posted: counts[index], expected: median });
  });

  return findings;
}

const ENTITY_HEADERS = ["Entity", "Entiy"];
const GL_HEADERS = ["GL Code", "GL"];
const COST_CENTRE_HEADERS = ["Cost Centre", "Cost Center"];
const PERIOD_TOKEN = /^(\d{4})-(\d{2})$/;

export function parseTrialBalance(workbooks: SourceWorkbooks, source: TrialBalanceSource): TrialBalanceParse {
  const rows = workbooks.sheet(source.file, source.sheet);
  const header = rows[0]?.map((cell) => asIdentifier(cell)) ?? [];

  const find = (accepted: string[]): number => {
    const index = header.findIndex((name) => accepted.includes(name));
    if (index < 0) {
      throw new Error(`${source.file}/${source.sheet} has no ${accepted[0]} column. Header: ${header.join(", ")}`);
    }
    return index;
  };
  const cEntity = find(ENTITY_HEADERS);
  const cGl = find(GL_HEADERS);
  const cCostCentre = find(COST_CENTRE_HEADERS);

  const periodColumns: { index: number; periodId: string }[] = [];
  header.forEach((name, index) => {
    const match = PERIOD_TOKEN.exec(name);
    if (match) periodColumns.push({ index, periodId: name });
  });
  if (periodColumns.length === 0) {
    throw new Error(`${source.file}/${source.sheet} exposes no YYYY-MM period columns. Header: ${header.join(", ")}`);
  }

  const cells: TrialBalanceCell[] = [];
  const postedByPeriod = new Map<string, number>();
  const sourceValues: number[] = [];
  let sourceCellCount = 0;
  let droppedZeroCells = 0;

  rows.slice(1).forEach((row, offset) => {
    const entityId = asIdentifier(row[cEntity]);
    const gl = splitCodedLabel(row[cGl]);
    const costCentre = splitCodedLabel(row[cCostCentre]);
    if (!entityId || !gl.code) return;

    for (const period of periodColumns) {
      const value = asNumber(row[period.index]);
      if (value === undefined) continue;
      sourceCellCount += 1;
      sourceValues.push(value);
      if (value === 0) {
        droppedZeroCells += 1;
        continue;
      }
      postedByPeriod.set(period.periodId, (postedByPeriod.get(period.periodId) ?? 0) + 1);
      cells.push({
        periodId: period.periodId,
        entityId,
        glCode: gl.code,
        glDescription: gl.description,
        costCentreId: costCentre.code,
        costCentreName: costCentre.description,
        rawValue: value,
        sourceRow: offset + 2,
      });
    }
  });

  const sourceTotal = sum(sourceValues);
  const unpivotedTotal = sum(cells.map((cell) => cell.rawValue));
  return {
    source,
    periodIds: periodColumns.map((column) => column.periodId),
    cells,
    sourceCellCount,
    sourceTotal,
    unpivotedTotal,
    droppedZeroCells,
    postedByPeriod,
  };
}
