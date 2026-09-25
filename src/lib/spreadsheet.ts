import * as XLSX from "xlsx";
import { parseCsv, readCsvFile, type CsvTable } from "./csv";

function isSpreadsheetName(name: string) {
  return /\.(xlsx|xlsm|xls)$/i.test(name);
}

function isCsvName(name: string) {
  return /\.(csv|txt|tsv)$/i.test(name);
}

function cellsToStrings(row: unknown[]) {
  return row.map((cell) => {
    if (cell == null) return "";
    if (typeof cell === "number" && Number.isFinite(cell)) return String(cell);
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

export function parseXlsxBuffer(buffer: ArrayBuffer): CsvTable {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const table = sheetMatrixToTable(matrix);
    if (table.headers.length) return table;
  }
  return { headers: [], rows: [] };
}

export async function readImportFile(file: File): Promise<CsvTable> {
  const name = file.name.toLowerCase();
  if (isSpreadsheetName(name) || file.type.includes("spreadsheet") || file.type.includes("excel")) {
    return parseXlsxBuffer(await file.arrayBuffer());
  }
  if (isCsvName(name) || !file.type || file.type.includes("csv") || file.type.includes("text")) {
    return parseCsv(await readCsvFile(file));
  }
  throw new Error("Wybierz plik Excel (.xlsx) albo CSV.");
}
