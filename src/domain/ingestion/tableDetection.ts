import type { TableRange, WideUnpivotConfiguration } from "./types";

const text = (value: unknown) => String(value ?? "").trim();
const normalise = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const exactSchema = new Set(["gl code", "gl description", "gl", "entity", "entiy", "cost centre", "cost center", "week start", "week end", "fin period", "fiscal week", "fiscal month", "fiscal quarter", "fy", "p1 section", "p2 header", "p3 sub header", "p l section", "sign convention", "notes"]);
const pivotEvidence = /column labels|row labels|grand total|timeperiod|branctype|report filter|page field/i;

/**
 * Scores schema-shaped labels, not words occurring in financial data. Exact
 * labels and date-column runs win; descriptive values such as Gross Sales do not.
 */
export function detectTableRange(grid: unknown[][]): TableRange | undefined {
  const candidates = grid.slice(0, 80).map((row, index) => {
    const cells = row.map(normalise).filter(Boolean);
    const schema = cells.filter(cell => exactSchema.has(cell)).length;
    const dates = cells.filter(cell => /^\d{4}[-/]\d{2}$/.test(cell) || /^fy\d{2}/.test(cell)).length;
    const identifiers = cells.filter(cell => /^(entity|entiy|gl|gl code|cost centre|cost center)$/.test(cell)).length;
    const dataLike = cells.filter(cell => /gross sales|markdown|salary|advertising|total occupancy/i.test(cell)).length;
    const score = schema * 8 + dates * 3 + identifiers * 4 + Math.min(cells.length, 16) - dataLike * 6;
    return { index, score, cells, schema, dates };
  }).filter(candidate => candidate.cells.length >= 2).sort((a, b) => b.score - a.score || a.index - b.index);
  const best = candidates[0];
  if (!best || best.score < 8) {
    const first = grid.findIndex(row => row.some(cell => text(cell)));
    const end = grid.length;
    return first < 0 ? undefined : { headerRow: first + 1, startRow: first + 2, endRow: end, startColumn: 1, endColumn: Math.max(...grid.map(row => row.length)), confidence: .1, requiresConfirmation: true };
  }
  const pivotRows = grid.filter(row => row.some(cell => pivotEvidence.test(text(cell)))).length;
  const blankAfter = grid.slice(best.index + 1).findIndex(row => row.every(cell => !text(cell)));
  const endRow = blankAfter < 0 ? grid.length : best.index + 1 + blankAfter;
  const confidence = Math.max(.1, Math.min(.99, .45 + best.schema * .08 + best.dates * .04 - (pivotRows ? .35 : 0)));
  // Multiple plausible schema rows or any pivot evidence is never auto-approved.
  const competing = candidates.filter(c => c.index !== best.index && c.score >= best.score - 2).length;
  return { headerRow: best.index + 1, startRow: best.index + 2, endRow, startColumn: 1, endColumn: Math.max(...grid.slice(best.index, endRow).map(row => row.length)), confidence, requiresConfirmation: confidence < .72 || pivotRows > 0 || competing > 0 };
}

export function rowsFromRange(grid: unknown[][], range: TableRange): Record<string, unknown>[] {
  const headers = grid[range.headerRow - 1].slice((range.startColumn ?? 1) - 1, range.endColumn).map((v, i) => text(v) || `Column ${i + 1}`);
  return grid.slice(range.startRow - 1, range.endRow).filter(row => row.some(cell => text(cell))).map(row => Object.fromEntries(headers.map((header, i) => [header, row[(range.startColumn ?? 1) - 1 + i] ?? null])));
}

export function unpivotWideRows(rows: ReadonlyArray<Record<string, unknown>>, config: WideUnpivotConfiguration): Record<string, unknown>[] {
  const valueField = config.valueField ?? "amount";
  return rows.flatMap(row => config.valueColumns.map(column => ({ ...Object.fromEntries(config.identifierColumns.map(key => [key, row[key]])), [valueField]: row[column], period: config.periodFromColumn ? column : row.period, ...(config.scenarioFromColumn ? { scenario: column } : {}) }) as Record<string, unknown>).filter(row => row[valueField] !== null && row[valueField] !== ""));
}
