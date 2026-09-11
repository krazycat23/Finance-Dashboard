import * as XLSX from "xlsx";
import { classifyDataset, profileColumn } from "./profile";
import { detectTableRange } from "./tableDetection";
import type { ImportSource, StagedDataset } from "./types";

const id = () => crypto.randomUUID();
const rowsForSheet = (sheet: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false, blankrows: true });

export async function stageLocalFile(companyId: string, file: File): Promise<{ source: ImportSource; datasets: StagedDataset[] }> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx" && extension !== "xls") throw new Error("Only CSV and XLSX files are supported.");
  const sourceId = id(); const type = extension === "csv" ? "csv" : "xlsx";
  const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const source: ImportSource = { id: sourceId, companyId, filename: file.name, fileType: type, uploadedAt: new Date().toISOString(), sheetNames: workbook.SheetNames };
  const datasets = workbook.SheetNames.map((sheetName) => {
    const grid = rowsForSheet(workbook.Sheets[sheetName]); const tableRange=detectTableRange(grid); const header=tableRange ? grid[tableRange.headerRow-1].map((value,index)=>String(value ?? `Column ${index+1}`).trim()) : []; const rows=(tableRange?grid.slice(tableRange.startRow-1,tableRange.endRow):[]).filter((row)=>row.some((value)=>value!==null&&value!=="")).map((row)=>Object.fromEntries(header.map((column,index)=>[column,row[index] ?? null])));
    const columns = header;
    const inferred = classifyDataset(columns);
    return { id: id(), sourceFileId: sourceId, sourceSheet: sheetName, rows, columns: columns.map((column) => profileColumn(column, rows)), inferred, status: "staged" as const, tableRange, warnings: rows.length ? (tableRange?.requiresConfirmation?["Header/table range confidence is low; confirm before mapping."]:[]) : ["No table detected on this sheet"], errors: [] };
  });
  return { source, datasets };
}
