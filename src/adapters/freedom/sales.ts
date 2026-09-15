import { asIdentifier, asNumber, type SheetMatrix, type SourceWorkbooks } from "./workbook";

export const WRITTEN_SALES_FILE = "Weekly Sales FY26.xlsx";
export const WEEKLY_HISTORY_FILE = "Weekly sales since 07.xlsx";

/**
 * SALES WORKBOOKS
 * ---------------------------------------------------------------------------
 * Neither sales workbook is a table. Both are saved pivot reports: stacked
 * filter rows at the top, a header row that is not row 1, several report blocks
 * laid out side by side in the same sheet, and a Grand Total row at the foot.
 *
 * Every block is therefore located by its own header text and every row is
 * rejected unless its first cell is a fiscal-period token. That is what keeps
 * filter captions, repeated headers, the FX helper block and Grand Total out of
 * the facts.
 */

/** A fiscal week of written orders, split by the channel the source reports. */
export interface WrittenWeek {
  finPeriod: string;
  entityCode: "FFAU" | "FFNZ";
  channel: string;
  value: number;
}

const FIN_PERIOD_TOKEN = /^\d{6}$/;
const GRAND_TOTAL = "grand total";

export function parseWrittenSales(workbooks: SourceWorkbooks): { weeks: WrittenWeek[]; sourceTotal: number; rejectedRows: number; unconvertibleNzRows: number } {
  const rows = workbooks.sheet(WRITTEN_SALES_FILE, "Written Sales");
  const headerIndex = rows.findIndex((row) => asIdentifier(row[0]) === "Fin_Period");
  if (headerIndex < 0) throw new Error(`${WRITTEN_SALES_FILE}/Written Sales has no Fin_Period header row.`);
  const header = rows[headerIndex].map((cell) => asIdentifier(cell));

  // The AU block repeats the Fin_Period header further along the same row; the
  // NZ block is the first. Column indices are read from the header itself so a
  // re-saved pivot that shifts a column cannot silently mis-assign a channel.
  const finPeriodColumns = header.flatMap((name, index) => (name === "Fin_Period" ? [index] : []));
  if (finPeriodColumns.length < 2) {
    throw new Error(`${WRITTEN_SALES_FILE}/Written Sales expects an NZ and an AU block; found ${finPeriodColumns.length}.`);
  }
  const [nzAnchor, auAnchor] = finPeriodColumns;

  // NZ is reported twice: in NZD beside its own anchor, and converted to AUD in
  // the helper block. The reporting currency is AUD, so the converted columns
  // are the ones taken and the NZD columns are ignored.
  // NZ is reported twice: in NZD beside its own anchor, and pre-converted to
  // AUD in the helper block. The helper block is NOT used. From fiscal week 15
  // onward its converted columns hold a runaway doubling series — 246m, 492m,
  // 982m, 1.96bn, 3.92bn, 7.85bn — while the NZD columns beside them are zero,
  // so the workbook's conversion formula has come adrift. The NZD columns are
  // the source of record and are converted here with the workbook's own rate.
  const nzChannels = channelColumns(header, nzAnchor);
  const cFxRate = header.findIndex((name) => /^FX Rate/i.test(name));
  if (cFxRate < 0) throw new Error(`${WRITTEN_SALES_FILE}/Written Sales has no FX Rate column to convert NZ sales with.`);

  const auChannels = channelColumns(header, auAnchor);

  const weeks: WrittenWeek[] = [];
  let sourceTotal = 0;
  let rejectedRows = 0;
  let unconvertibleNzRows = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const nzPeriod = asIdentifier(row[nzAnchor]);
    const auPeriod = asIdentifier(row[auAnchor]);
    if (!FIN_PERIOD_TOKEN.test(auPeriod) && !FIN_PERIOD_TOKEN.test(nzPeriod)) {
      if (asIdentifier(row[nzAnchor]).toLowerCase() === GRAND_TOTAL) rejectedRows += 1;
      continue;
    }

    if (FIN_PERIOD_TOKEN.test(auPeriod)) {
      for (const channel of auChannels) {
        const value = asNumber(row[channel.index]);
        if (value === undefined || value === 0) continue;
        weeks.push({ finPeriod: auPeriod, entityCode: "FFAU", channel: channel.name, value });
        sourceTotal += value;
      }
    }
    if (FIN_PERIOD_TOKEN.test(nzPeriod)) {
      const fxRate = asNumber(row[cFxRate]);
      const nzValues = nzChannels.map((channel) => ({ channel, value: asNumber(row[channel.index]) ?? 0 }));
      const hasValue = nzValues.some((entry) => entry.value !== 0);
      if (hasValue && (fxRate === undefined || fxRate <= 0)) {
        unconvertibleNzRows += 1;
      } else if (hasValue && fxRate) {
        for (const entry of nzValues) {
          if (entry.value === 0) continue;
          // The rate is quoted A$1 = NZD, so AUD is NZD divided by the rate.
          const converted = entry.value / fxRate;
          weeks.push({ finPeriod: nzPeriod, entityCode: "FFNZ", channel: entry.channel.name, value: converted });
          sourceTotal += converted;
        }
      }
    }
  }

  return { weeks, sourceTotal, rejectedRows, unconvertibleNzRows };
}

/** Channel columns of a block: everything between the anchor and Grand Total. */
function channelColumns(header: string[], anchor: number): { index: number; name: string }[] {
  const columns: { index: number; name: string }[] = [];
  for (let index = anchor + 1; index < header.length; index += 1) {
    const name = header[index];
    if (!name) continue;
    if (name.toLowerCase() === GRAND_TOTAL) break;
    if (name === "Fin_Period") break;
    columns.push({ index, name });
  }
  return columns;
}

/**
 * WEEKLY SALES HISTORY
 * ---------------------------------------------------------------------------
 * A fiscal-year by fiscal-week matrix of company-store sales, one row per store
 * group and financial year, from FY07 onward. There is no channel or store
 * detail in it; the row label IS the group.
 */
export interface HistoryWeek {
  fiscalYear: string;
  fiscalWeek: number;
  entityCode: "FFAU" | "FFNZ";
  value: number;
}

const GROUP_ENTITY: Record<string, "FFAU" | "FFNZ"> = {
  "All FF Coy Stores (AUS)": "FFAU",
  "All FF Coy Stores (NZ)": "FFNZ",
};

export function parseWeeklyHistory(workbooks: SourceWorkbooks): { weeks: HistoryWeek[]; sourceTotal: number; unknownGroups: string[] } {
  const rows: SheetMatrix = workbooks.sheet(WEEKLY_HISTORY_FILE, "Sheet1");
  const headerIndex = rows.findIndex((row) => row.some((cell) => /^Week\s+1$/i.test(asIdentifier(cell))));
  if (headerIndex < 0) throw new Error(`${WEEKLY_HISTORY_FILE}/Sheet1 has no "Week 1" header.`);
  const header = rows[headerIndex].map((cell) => asIdentifier(cell));

  const weekColumns = header.flatMap((name, index) => {
    const match = /^Week\s+(\d+)$/i.exec(name);
    return match ? [{ index, week: Number(match[1]) }] : [];
  });

  const weeks: HistoryWeek[] = [];
  const unknownGroups = new Set<string>();
  let sourceTotal = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const group = asIdentifier(row[0]);
    const fiscalYear = asIdentifier(row[1]);
    if (!group || !/^FY\d{2}$/.test(fiscalYear)) continue;
    const entityCode = GROUP_ENTITY[group];
    if (!entityCode) {
      unknownGroups.add(group);
      continue;
    }
    for (const column of weekColumns) {
      const value = asNumber(row[column.index]);
      if (value === undefined || value === 0) continue;
      weeks.push({ fiscalYear, fiscalWeek: column.week, entityCode, value });
      sourceTotal += value;
    }
  }

  return { weeks, sourceTotal, unknownGroups: [...unknownGroups] };
}

/**
 * DELIVERED SALES
 * ---------------------------------------------------------------------------
 * The workbook's "Delivered Sales" sheet is an unfinished pivot: its channel
 * block holds a single fiscal week before its Grand Total, and its second block
 * covers two named stores rather than the estate. It is reported as an
 * unsupported source feature rather than published as a partial delivered-sales
 * series that a reader would take for the whole business.
 */
export function describeDeliveredSalesGap(workbooks: SourceWorkbooks): string | undefined {
  if (!workbooks.has(WRITTEN_SALES_FILE)) return undefined;
  const rows = workbooks.sheet(WRITTEN_SALES_FILE, "Delivered Sales");
  const headerIndex = rows.findIndex((row) => asIdentifier(row[0]) === "Row Labels");
  if (headerIndex < 0) return `${WRITTEN_SALES_FILE}/Delivered Sales: no recognisable header row.`;
  const periods = rows
    .slice(headerIndex + 1)
    .map((row) => asIdentifier(row[0]))
    .filter((value) => FIN_PERIOD_TOKEN.test(value));
  return `${WRITTEN_SALES_FILE}/Delivered Sales holds ${periods.length} fiscal week(s) of channel detail and a two-store block; it is not a complete delivered-sales series and is not published.`;
}
