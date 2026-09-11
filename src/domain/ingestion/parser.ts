import * as XLSX from "xlsx";
import { classifyDataset, profileColumn } from "./profile";
import { detectTableRange, rowsFromRange } from "./tableDetection";
import type { Classification, ImportSource, StagedDataset } from "./types";

const id = () => crypto.randomUUID();
const rowsForSheet = (sheet: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false, blankrows: true });

export async function stageLocalFile(companyId: string, file: File): Promise<{ source: ImportSource; datasets: StagedDataset[] }> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx" && extension !== "xls") throw new Error("Only CSV and XLSX files are supported.");
  const sourceId = id(); const type = extension === "csv" ? "csv" : "xlsx";
  const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const source: ImportSource = { id: sourceId, companyId, filename: file.name, fileType: type, uploadedAt: new Date().toISOString(), sheetNames: workbook.SheetNames };
  const datasets = workbook.SheetNames.map((sheetName) => {
    const grid = rowsForSheet(workbook.Sheets[sheetName]); const tableRange=detectTableRange(grid); const rows=tableRange ? rowsFromRange(grid, tableRange) : []; const header=tableRange ? Object.keys(rows[0] ?? {}) : [];
    const columns = header;
    const inferred = classifyDataset(columns);
    // The mapping workbook is a first-class authoritative input, not an account-master guess.
    const isGlMapping = /gl\s*(code|description)|p1\s*-\s*section/i.test(columns.join(" ")) && /p2\s*-\s*header/i.test(columns.join(" "));
    const isCalendar = /week/i.test(columns.join(" ")) && /financial\s*(period|month)|week\s*(start|end)/i.test(columns.join(" "));
    return { id: id(), sourceFileId: sourceId, sourceSheet: sheetName, rows, rawGrid: grid, columns: columns.map((column) => profileColumn(column, rows)), inferred: (isGlMapping ? { type:"gl_mapping", confidence:1, reasons:["GL Code, P1, P2 and P3 columns identify an authoritative GL mapping."] } : isCalendar ? { type:"financial_calendar", confidence:.95, reasons:["Week and fiscal-calendar columns detected."] } : inferred) as Classification, status: "staged" as const, tableRange, warnings: rows.length ? (tableRange?.requiresConfirmation?["Header/table range confidence is low; confirm before mapping."]:[]) : ["No table detected on this sheet"], errors: [] };
  });
  return { source, datasets };
}
