import readXlsxFile from "read-excel-file/universal";
import { parseCsv, readCsvFile, type CsvTable } from "./csv";

function isSpreadsheetName(name: string) {
  return /\.(xlsx|xlsm)$/i.test(name);
}

function isOldExcelName(name: string) {
  return /\.xls$/i.test(name);
}

function isoDay(date: Date) {
  // Komórki z datą w Excelu nie mają strefy — bierzemy dzień w UTC, żeby nie cofnąć daty o jeden.
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function isCsvName(name: string) {
  return /\.(csv|txt|tsv)$/i.test(name);
}

function cellsToStrings(row: unknown[]) {
  return row.map((cell) => {
    if (cell == null) return "";
    if (cell instanceof Date) return isoDay(cell);
    if (typeof cell === "number" && Number.isFinite(cell)) return String(cell);
    if (typeof cell === "boolean") return cell ? "tak" : "nie";
    return String(cell).trim();
  });
}

export function sheetMatrixToTable(matrix: unknown[][]): CsvTable {
  const rows = matrix
    .map((row) => cellsToStrings(Array.isArray(row) ? row : []))
    .filter((row) => row.some((value) => value));
  if (!rows.length) return { headers: [], rows: [] };

  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => {
    const next = [...row];
    while (next.length < width) next.push("");
    return next.slice(0, width);
  });

  const headers = padded[0].map((header, index) => header || `Kolumna ${index + 1}`);
  return { headers, rows: padded.slice(1) };
}

/** Pierwszy arkusz z nagłówkami (puste arkusze pomijamy). Tylko .xlsx — stary .xls trzeba zapisać na nowo. */
export async function parseXlsxBuffer(buffer: ArrayBuffer | Blob): Promise<CsvTable> {
  const sheets = await readXlsxFile(buffer);
  for (const sheet of sheets) {
    const table = sheetMatrixToTable(sheet.data as unknown[][]);
    if (table.headers.length) return table;
  }
  return { headers: [], rows: [] };
}

export async function readImportFile(file: File): Promise<CsvTable> {
  const name = file.name.toLowerCase();
  if (isOldExcelName(name)) {
    throw new Error("Stary format .xls nie jest obsługiwany. Zapisz plik w Excelu jako .xlsx albo CSV.");
  }
  if (isSpreadsheetName(name) || file.type.includes("spreadsheet") || file.type.includes("excel")) {
    return parseXlsxBuffer(await file.arrayBuffer());
  }
  if (isCsvName(name) || !file.type || file.type.includes("csv") || file.type.includes("text")) {
    return parseCsv(await readCsvFile(file));
  }
  throw new Error("Wybierz plik Excel (.xlsx) albo CSV.");
}
