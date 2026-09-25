export type CsvTable = {
  headers: string[];
  rows: string[][];
};

function detectDelimiter(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim()) ?? "";
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : ";";
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value)) rows.push(row);
  return rows;
}

function looksBrokenPolish(text: string) {
  if (text.includes("\uFFFD")) return true;
  const sample = text.slice(0, 4000);
  const letters = sample.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letters) return false;
  const odd = (sample.match(/[ÃÂ�]/g) ?? []).length;
  return odd > 8 && odd / Math.max(letters.length, 1) > 0.04;
}

export async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!looksBrokenPolish(utf8)) return utf8.replace(/^\uFEFF/, "");
  try {
    return new TextDecoder("iso-8859-2").decode(buffer);
  } catch {
    return utf8.replace(/^\uFEFF/, "");
  }
}

export function parseCsv(text: string): CsvTable {
  const delimiter = detectDelimiter(text);
  const matrix = parseRows(text, delimiter);
  if (!matrix.length) return { headers: [], rows: [] };

  const width = Math.max(...matrix.map((row) => row.length));
  const padded = matrix.map((row) => {
    const next = [...row];
    while (next.length < width) next.push("");
    return next.slice(0, width);
  });

  const rawHeaders = padded[0];
  const headers = rawHeaders.map((header, index) => header || `Kolumna ${index + 1}`);
  return { headers, rows: padded.slice(1) };
}
