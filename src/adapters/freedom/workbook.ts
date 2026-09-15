import * as XLSX from "xlsx";

/**
 * FREEDOM SOURCE WORKBOOK ACCESS
 * ---------------------------------------------------------------------------
 * Every Freedom workbook arrives as bytes and is read here. The adapter never
 * touches a filesystem: sources are supplied through AdapterInput.files, which
 * is what lets the same adapter run under the Node validation harness and in a
 * browser upload without a second code path.
 */
export type SheetMatrix = (string | number | boolean | Date | null)[][];

export interface SourceWorkbooks {
  /** Matrix rows by workbook name and sheet name. */
  sheet(file: string, sheet: string): SheetMatrix;
  sheetNames(file: string): string[];
  has(file: string): boolean;
  names(): string[];
}

export function openWorkbooks(files: { name: string; bytes?: Uint8Array }[]): SourceWorkbooks {
  const books = new Map<string, XLSX.WorkBook>();
  for (const file of files) {
    if (!file.bytes) continue;
    books.set(baseName(file.name), XLSX.read(file.bytes, { type: "array", cellDates: true }));
  }
  const require_ = (file: string): XLSX.WorkBook => {
    const book = books.get(baseName(file));
    if (!book) throw new Error(`Freedom source workbook is missing: ${file}`);
    return book;
  };
  return {
    has: (file) => books.has(baseName(file)),
    names: () => [...books.keys()],
    sheetNames: (file) => require_(file).SheetNames,
    sheet(file, sheet) {
      const book = require_(file);
      const worksheet = book.Sheets[sheet];
      if (!worksheet) {
        throw new Error(`Freedom workbook ${file} has no sheet "${sheet}". Sheets: ${book.SheetNames.join(", ")}`);
      }
      return XLSX.utils.sheet_to_json<SheetMatrix[number]>(worksheet, {
        header: 1,
        raw: true,
        blankrows: false,
        defval: null,
      }) as SheetMatrix;
    },
  };
}

/** Source names may arrive with a path prefix; the workbook is keyed by file name. */
function baseName(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}

/**
 * Identifiers are strings, always. Freedom cost centres include codes such as
 * "0650" and a numeric read would silently become 650 — a different cost
 * centre. Excel also hands back numbers for codes that look numeric, so every
 * identifier passes through here.
 */
export function asIdentifier(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  return String(value).trim();
}

/** Split a "0650 - Supply & Logistics" cell into its code and description. */
export function splitCodedLabel(value: unknown): { code: string; description: string } {
  const text = asIdentifier(value);
  const separator = text.indexOf(" - ");
  if (separator < 0) return { code: text, description: text };
  return { code: text.slice(0, separator).trim(), description: text.slice(separator + 3).trim() };
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
