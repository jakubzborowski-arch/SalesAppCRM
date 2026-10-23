import { describe, expect, it } from "vitest";
import { EXTRACTION_SCHEMA, normalizeExtraction } from "@/lib/discovery-extract";
import { buildMissionProposal, GROUPS, planMission } from "@/lib/mission-extract";
import { emptyCompany } from "@/lib/company";
import { emptyMission } from "@/lib/seed";
import type { Mission, Partner } from "@/lib/types";

const TRANSCRIPT = `Anna Kowalska: Środy po 16 jest pusto. Mogę dać 10 procent od 16 do 19, od sześciu osób, bez alkoholu.
Kuba: A gdyby zniżkę realizować kodem QR przy kasie?
Anna Kowalska: QR jest ok. Mamy też salkę na 20 osób na wydarzenia.
Anna Kowalska: Mam już inne aplikacje ze zniżkami.
Kuba: My przyprowadzamy grupy, nie pojedyncze osoby.
Anna Kowalska: No dobra, to ma sens.
Anna Kowalska: Firma to Nova Café sp. z o.o. W razie czego dzwońcie do Marka Lisa, kierownika zmiany.
Anna Kowalska: Otwarte jesteśmy pn–pt 8–22. Logo możecie wrzucić do aplikacji.
Anna Kowalska: Spróbujmy od 1 listopada do końca stycznia.`;

function partner(segment: Partner["segment"] = "venue"): Partner {
  return {
    id: "p-1", name: "Nova", segment, capacity: 40, city: "Kraków", address: "", category: "kawiarnia", subcategory: "",
    website: "", instagram: "", facebook: "", socialOther: "", priority: "", priorityReason: "", source: "", dnc: false,
    company: emptyCompany(), contacts: [{ id: "c-anna", name: "Anna Kowalska", role: "właścicielka", isDecisionMaker: true }],
    consents: [],
  };
}

const mission = (patch: Partial<Mission> = {}): Mission => ({ ...emptyMission("p-1", "m-1"), ...patch });

const ANSWER = {
  cytat: "Środy po 16 jest pusto.",
  warunki: {
    znizka_procent: 10, gratis: "", dni: ["wed", "środa"], godziny_od: "16", godziny_do: "19.00", min_grupa: 6,
    wylaczenia: "bez alkoholu", realizacja: "qr", miejsce_na_wydarzenia: "Salka na 20 osób",
    cykl_wydarzenia: 0, cykl_czestotliwosc: "", cykl_pierwsze: "", pilotaz_zespol: "", pilotaz_osoby: 0, pilotaz_feedback: "",
    okres_od: "2026-11-01", okres_do: "2027-01-31",
  },
  obiekcje: [
    { klucz: "other_apps", argument_zadzialal: true, cytat: "Mam już inne aplikacje ze zniżkami." },
    { klucz: "nieznana", argument_zadzialal: false, cytat: "" },
  ],
  umowa: {
    nazwa_firmy: "Nova Café sp. z o.o.", kontakt_awaryjny: "Marek Lis", godziny_otwarcia: "pn–pt 8–22",
    zgoda_logo: true, zgoda_zdjecia: false, zgoda_social: false,
  },
};

const build = (m: Mission, p: Partner, raw: unknown = ANSWER) =>
  buildMissionProposal(normalizeExtraction(raw), {
    mission: m, partner: p, source: TRANSCRIPT, callDate: "2026-10-21", today: new Date(2026, 9, 21),
  });

describe("rozmowa → cała misja", () => {
  it("odczyt: dni z nazw, godziny GG:MM, nieznana obiekcja odpada; schemat zamknięty", () => {
    const ext = normalizeExtraction(ANSWER);
    expect(ext.terms).toMatchObject({ discountPercent: 10, days: ["wed"], hoursFrom: "16:00", hoursTo: "19:00", minGroup: 6, redemption: "qr" });
    expect(ext.objections).toEqual([{ key: "other_apps", worked: true, quote: "Mam już inne aplikacje ze zniżkami." }]);
    expect(ext.deal.consentLogo).toBe(true);
    // Stare odpowiedzi (bez nowych kluczy) też się czytają.
    expect(normalizeExtraction({ cytat: "x" }).terms.discountPercent).toBe(0);
    expect(EXTRACTION_SCHEMA.required).toEqual(expect.arrayContaining(["warunki", "obiekcje", "umowa"]));
  });

  it("lokal: warunki, obiekcja, umowa i aktywacja w podglądzie, pogrupowane; zgoda niezaznaczona", () => {
    const proposal = build(mission(), partner());
    const row = (key: string) => proposal.rows.find((item) => item.key === key)!;
    expect(row("terms:value")).toMatchObject({ value: "10% rabatu", checked: true, group: GROUPS.offer });
    expect(row("terms:when").value).toBe("śr 16:00–19:00");
    expect(row("terms:group").value).toBe("od 6 osób");
    expect(row("terms:redemption").value).toMatch(/QR/);
    expect(row("terms:space").value).toBe("Salka na 20 osób");
    expect(row("terms:period").value).toMatch(/^01\.11\.2026 .* – 31\.01\.2027/);
    expect(row("objection:other_apps")).toMatchObject({ group: GROUPS.negotiation, checked: true });
    expect(row("objection:other_apps").value).toMatch(/argument zadziałał/);
    expect(row("deal:company")).toMatchObject({ value: "Nova Café sp. z o.o.", checked: true });
    expect(row("deal:ops").hint).toMatch(/Telefon dopisz ręcznie/);
    expect(row("deal:hours").value).toBe("pn–pt 8–22");
    expect(row("deal:contract:brand_app")).toMatchObject({ checked: false });
    // Komplet warunków dla lokalu po wstawieniu — nie ma czego zgłaszać.
    expect(proposal.missing.some((item) => item.startsWith("warunki:"))).toBe(false);

    const selected = new Set(proposal.rows.filter((item) => item.checked).map((item) => item.key));
    selected.add("deal:contract:brand_app");
    const plan = planMission(proposal, selected, mission());
    expect(plan.terms.discount).toEqual({
      kind: "percent", percent: 10, days: ["wed"], hoursFrom: "16:00", hoursTo: "19:00", minGroup: 6,
      exclusions: "bez alkoholu", redemption: "qr",
    });
    expect(plan.terms.space).toEqual({ offered: true, notes: "Salka na 20 osób" });
    expect(plan.contract).toEqual({ startAt: "2026-11-01", endAt: "2027-01-31", companyName: "Nova Café sp. z o.o." });
    expect(plan.activation).toEqual({ opsContactName: "Marek Lis" });
    expect(plan.partner).toEqual({ hours: "pn–pt 8–22" });
    expect(plan.checklist).toEqual({ "contract:brand_app": true });
    expect(plan.objections).toEqual([{ key: "other_apps", worked: true }]);
  });

  it("nic nie wraca, gdy już jest; odznaczone nie wchodzi do planu", () => {
    const base = mission();
    const filled = mission({
      terms: { ...base.terms, discount: { ...base.terms.discount, kind: "percent", percent: 10, redemption: "qr" } },
      objections: base.objections.map((o) => (o.key === "other_apps" ? { ...o, checked: true, argumentWorked: true } : o)),
      contract: { ...base.contract, startAt: "2026-11-01", endAt: "2027-01-31" },
    });
    const proposal = build(filled, partner());
    const keys = proposal.rows.map((item) => item.key);
    expect(keys).not.toContain("terms:value");
    expect(keys).not.toContain("terms:redemption");
    expect(keys).not.toContain("objection:other_apps");
    expect(keys).not.toContain("terms:period");
    const plan = planMission(proposal, new Set(["terms:group"]), filled);
    expect(plan.terms).toEqual({ discount: { minGroup: 6 } });
    expect(plan.contract).toEqual({});
  });

  it("społeczność i firma: cykl i pilotaż zamiast zniżki; braki w warunkach na liście", () => {
    const community = build(mission(), partner("community"), {
      warunki: { cykl_wydarzenia: 4, cykl_czestotliwosc: "monthly", cykl_pierwsze: "2026-11-12", znizka_procent: 10 },
    });
    expect(community.rows.find((r) => r.key === "terms:cycle")!.value).toMatch(/cykl 4 wydarzeń/);
    expect(community.rows.some((r) => r.key === "terms:value")).toBe(false);
    expect(community.missing.some((item) => item.startsWith("warunki: okres") || item.includes("okres"))).toBe(true);

    const company = build(mission(), partner("company"), {
      warunki: { pilotaz_zespol: "marketing", pilotaz_osoby: 12, pilotaz_feedback: "2026-12-15" },
      umowa: { zgoda_logo: true },
    });
    expect(company.rows.find((r) => r.key === "terms:pilot")!.value).toBe("zespół marketing · 12 os. · feedback 15.12.2026");
    // Firma nie potrzebuje zgody na logo w aplikacji.
    expect(company.rows.some((r) => r.key === "deal:contract:brand_app")).toBe(false);
  });

  it("obiekcja ze zmyślonym cytatem — do sprawdzenia, odznaczona", () => {
    const proposal = build(mission(), partner(), {
      obiekcje: [{ klucz: "no_time", argument_zadzialal: false, cytat: "Nie mam czasu na takie rzeczy." }],
    });
    expect(proposal.rows.find((r) => r.key === "objection:no_time")).toMatchObject({ checked: false });
  });
});
