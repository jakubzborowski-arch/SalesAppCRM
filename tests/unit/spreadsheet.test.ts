import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseXlsxBuffer, readImportFile } from "@/lib/spreadsheet";

const fixture = readFileSync(new URL("../fixtures/partnerzy.xlsx", import.meta.url));
const buffer = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer;

describe("import arkusza .xlsx", () => {
  it("pomija pusty arkusz, czyta nagłówki, liczby, daty i puste wiersze", async () => {
    const table = await parseXlsxBuffer(buffer);
    expect(table.headers).toEqual(["Nazwa", "Miasto", "Typ partnera", "Pojemność", "Data kontaktu"]);
    expect(table.rows).toEqual([
      ["Kawiarnia Nova", "Kraków", "Miejsce", "40", "2026-10-21"],
      ["Klub Planszówek Pionek", "Kraków", "miejsce", "", ""],
      ["Firma Beta", "Warszawa", "Firma", "12.5", "jutro"],
    ]);
  });

  it("stary .xls odrzuca z jasnym komunikatem", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "stary.xls", { type: "application/vnd.ms-excel" });
    await expect(readImportFile(file)).rejects.toThrow(/\.xlsx albo CSV/);
  });
});
