import * as XLSX from "xlsx";
import { classifyDataset, profileColumn } from "./profile";
import type { ImportSource, StagedDataset } from "./types";

const id = () => crypto.randomUUID();
const rowsForSheet = (sheet: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });

export async function stageLocalFile(companyId: string, file: File): Promise<{ source: ImportSource; datasets: StagedDataset[] }> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx" && extension !== "xls") throw new Error("Only CSV and XLSX files are supported.");
  const sourceId = id(); const type = extension === "csv" ? "csv" : "xlsx";
  const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const source: ImportSource = { id: sourceId, companyId, filename: file.name, fileType: type, uploadedAt: new Date().toISOString(), sheetNames: workbook.SheetNames };
  const datasets = workbook.SheetNames.map((sheetName) => {
    const rows = rowsForSheet(workbook.Sheets[sheetName]); const columns = rows.length ? Object.keys(rows[0]) : [];
    const inferred = classifyDataset(columns);
    return { id: id(), sourceFileId: sourceId, sourceSheet: sheetName, rows, columns: columns.map((column) => profileColumn(column, rows)), inferred, status: "staged" as const, warnings: rows.length ? [] : ["Sheet contains no data rows"], errors: [] };
  });
  return { source, datasets };
}
