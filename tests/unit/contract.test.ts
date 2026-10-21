import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildContractPdf, wrapText } from "@/lib/contract-pdf";
import {
  DEFAULT_CONTRACT_TEMPLATE,
  fillTemplate,
  missingFields,
  templateValues,
  toBlocks,
  unknownFields,
} from "@/lib/contract-template";
import { emptyCompany } from "@/lib/company";
import { emptyMission, seedState } from "@/lib/seed";
import type { Partner } from "@/lib/types";

const partner: Partner = {
  ...seedState.partners[0],
  company: { ...emptyCompany(), legalName: "Nova Kawiarnie sp. z o.o.", nip: "5250007738", legalAddress: "ul. Siedziby 2, 31-000 Kraków" },
};
const mission = emptyMission(partner.id, "m1");
mission.selectedVariant = "A";
mission.decision.decisionMakerId = partner.contacts[0].id;
mission.decision.constraintSummary = "tylko środy i czwartki 16–19";
mission.contract = { ...mission.contract, startAt: "2026-11-01", endAt: "2027-04-30", changeRules: "Wypowiedzenie z 30-dniowym okresem." };

describe("szablon umowy", () => {
  it("wypełnia pola z karty i misji", () => {
    const values = templateValues(partner, mission, "Anna Krajewska", new Date(2026, 9, 21));
    const text = fillTemplate(DEFAULT_CONTRACT_TEMPLATE, values);
    expect(text).toContain("Nova Kawiarnie sp. z o.o., ul. Siedziby 2, 31-000 Kraków, NIP 525-000-77-38");
    expect(text).toContain("Wariant: A — Ruch poza szczytem.");
    expect(text).toContain("od 01.11.2026 do 30.04.2027");
    expect(text).toContain("Zawarta dnia 21.10.2026");
    expect(text).toContain("- Wyłączność");
    expect(missingFields(DEFAULT_CONTRACT_TEMPLATE, values)).toEqual(["REGON partnera", "E-mail do faktur"]);
    expect(unknownFields("{{firma}} {{fima}}")).toEqual(["fima"]);
    expect(fillTemplate("NIP {{nip}}", { nip: "" })).toBe("NIP ……………");
  });
  it("bloki: tytuł, nagłówki, akapity, punkty", () => {
    const blocks = toBlocks("# T\n\n## § 1\nraz\ndwa\n\n- a\n- b");
    expect(blocks).toEqual([
      { kind: "title", text: "T" },
      { kind: "heading", text: "§ 1" },
      { kind: "paragraph", text: "raz dwa" },
      { kind: "bullet", text: "a" },
      { kind: "bullet", text: "b" },
    ]);
  });
  it("zawija tekst i tnie bardzo długie słowa", () => {
    const measure = (s: string) => s.length;
    expect(wrapText("ala ma kota", 6, measure)).toEqual(["ala ma", "kota"]);
    expect(wrapText("abcdefghij", 4, measure)).toEqual(["abcd", "efgh", "ij"]);
    expect(wrapText("adres https://bardzo-dlugi", 8, measure)).toEqual(["adres", "https://", "bardzo-d", "lugi"]);
  });
  it("składa PDF z polskimi znakami", async () => {
    const font = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "../../public/fonts", name)));
    const values = templateValues(partner, mission, "Anna Krajewska", new Date(2026, 9, 21));
    const blocks = toBlocks(fillTemplate(DEFAULT_CONTRACT_TEMPLATE, values));
    const bytes = await buildContractPdf(
      blocks,
      { title: "Umowa — Nova", footer: "Umowa współpracy · Kawiarnia Nova" },
      { regular: font("NotoSans-Regular.ttf"), bold: font("NotoSans-Bold.ttf") },
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe("Umowa — Nova");
    if (process.env.CONTRACT_PDF_OUT) writeFileSync(process.env.CONTRACT_PDF_OUT, bytes);
  });
});
