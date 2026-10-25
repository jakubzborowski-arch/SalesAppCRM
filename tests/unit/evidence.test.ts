import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "@/lib/discovery-extract";
import {
  EVIDENCE_NOT_FOUND,
  NO_EVIDENCE,
  SELLER_EVIDENCE,
  SPEAKERS_UNKNOWN,
  numberInText,
  sameSpeaker,
  speakerView,
  utterances,
} from "@/lib/evidence";
import { buildMissionProposal } from "@/lib/mission-extract";
import { emptyCompany } from "@/lib/company";
import { emptyMission } from "@/lib/seed";
import type { Partner } from "@/lib/types";

const SPINACH = `Spinach AI — Notatka ze spotkania
Spotkanie: Lutra × Planszówkarnia Pionek
Data: piątek, 23 października 2026, 14:00–14:32
Uczestnicy: Kuba Zborowski (Lutra), Karolina Nowak (Planszówkarnia Pionek)

Kuba Zborowski: Dzień dobry, jak wygląda u Was tydzień?
Karolina Nowak: We wtorki po osiemnastej jest u nas pusto jak w bibliotece.
Kuba Zborowski: Moglibyście dać 20 procent zniżki?
Karolina Nowak: Mogę dać 15 procent zniżki na wstęp i napoje, od poniedziałku do środy, od 18 do 22.
Karolina Nowak: Ale tylko dla grup od czterech osób i bez alkoholu.
Kuba Zborowski: Okej. Firma to Pionek sp. z o.o.?
Karolina Nowak: Tak, Pionek Gry Planszowe sp. z o.o.`;

const partner: Partner = {
  id: "p-1", name: "Pionek", segment: "venue", capacity: 40, city: "Kraków", address: "", category: "planszówkarnia",
  subcategory: "", website: "", instagram: "", facebook: "", socialOther: "", priority: "", priorityReason: "", source: "",
  dnc: false, company: emptyCompany(), contacts: [{ id: "c-k", name: "Karolina Nowak", role: "właścicielka", isDecisionMaker: true }],
  consents: [],
};

const view = (text = SPINACH, seller = "Jakub Zborowski") =>
  speakerView({ note: "", transcripts: [{ text }], seller, contacts: partner.contacts });

function proposal(answer: unknown, text = SPINACH) {
  const v = view(text);
  return buildMissionProposal(normalizeExtraction(answer), {
    mission: emptyMission("p-1", "m-1"),
    partner,
    source: text,
    callDate: "2026-10-23",
    today: new Date(2026, 9, 23),
    view: v,
  });
}

const BASE = {
  cytat: "We wtorki po osiemnastej jest u nas pusto jak w bibliotece.",
  problem: "Puste wtorki wieczorem.",
  warunki: { znizka_procent: 15, min_grupa: 4, wylaczenia: "bez alkoholu", dni: ["mon", "tue", "wed"], godziny_od: "18", godziny_do: "22" },
  umowa: { nazwa_firmy: "Pionek Gry Planszowe sp. z o.o." },
  dowody: {
    problem: "We wtorki po osiemnastej jest u nas pusto jak w bibliotece.",
    znizka: "Mogę dać 15 procent zniżki na wstęp i napoje, od poniedziałku do środy, od 18 do 22.",
    kiedy: "Mogę dać 15 procent zniżki na wstęp i napoje, od poniedziałku do środy, od 18 do 22.",
    grupa: "Ale tylko dla grup od czterech osób i bez alkoholu.",
    wylaczenia: "Ale tylko dla grup od czterech osób i bez alkoholu.",
    nazwa_firmy: "Tak, Pionek Gry Planszowe sp. z o.o.",
  },
};

describe("kto mówi", () => {
  it("pomija nagłówki Spinach, rozpoznaje mówców, zdrobnienie i dopisek (Lutra)", () => {
    const list = utterances(SPINACH);
    expect(list.filter((u) => u.speaker === "Kuba Zborowski")).toHaveLength(3);
    expect(list.some((u) => u.speaker === "Data" || u.speaker === "Spotkanie" || u.speaker === "Uczestnicy")).toBe(false);
    expect(sameSpeaker("Kuba Zborowski", "Jakub Zborowski")).toBe(true);
    expect(sameSpeaker("Kuba", "Jakub Kowalski")).toBe(true);
    expect(sameSpeaker("Karolina Nowak", "Jakub Zborowski")).toBe(false);
    const v = view();
    expect(v.known).toBe(true);
    expect(v.partnerText).toMatch(/15 procent/);
    expect(v.partnerText).not.toMatch(/20 procent/);
    expect(v.sellerText).toMatch(/20 procent/);
  });

  it("bez etykiet mówców — nieznani; dwóch mówców i jedna osoba partnera — drugi to handlowiec", () => {
    expect(view("Środy po 16 jest pusto.\nMogę dać 10 procent.").known).toBe(false);
    const two = view("Ola: Dzień dobry.\nKarolina Nowak: U nas pusto we wtorki.", "Jan Testowy");
    expect(two.known).toBe(true);
    expect(two.partnerText).toMatch(/pusto/);
  });

  it("liczba w dowodzie cyframi albo słownie", () => {
    expect(numberInText(15, "Mogę dać 15 procent")).toBe(true);
    expect(numberInText(15, "Mogę dać piętnaście procent")).toBe(true);
    expect(numberInText(15, "Mogę dać 150 zł")).toBe(false);
    expect(numberInText(4, "od czterech osób")).toBe(true);
    expect(numberInText(6, "od sześciu osób")).toBe(true);
    expect(numberInText(5, "mogę dać pięć procent")).toBe(true);
    expect(numberInText(35, "trzydzieści pięć procent")).toBe(true);
    expect(numberInText(30, "trzydzieści pięć procent")).toBe(false);
    expect(numberInText(50, "połowę ceny")).toBe(true);
  });
});

describe("dowody w podglądzie", () => {
  it("pole z dowodem w słowach partnera — zaznaczone, dowód w podpowiedzi", () => {
    const rows = proposal(BASE).rows;
    const row = (key: string) => rows.find((r) => r.key === key)!;
    expect(row("quote")).toMatchObject({ checked: true });
    expect(row("problem")).toMatchObject({ checked: true });
    expect(row("problem").hint).toMatch(/^Dowód: „We wtorki/);
    expect(row("terms:value")).toMatchObject({ checked: true, warning: undefined });
    expect(row("terms:when")).toMatchObject({ checked: true });
    expect(row("terms:exclusions")).toMatchObject({ checked: true });
    expect(row("deal:company")).toMatchObject({ checked: true });
  });

  it("bez dowodu — odznaczone z ostrzeżeniem; grupa słownie („od czterech osób”) rozpoznana", () => {
    const rows = proposal({ ...BASE, dowody: { ...BASE.dowody, nazwa_firmy: "" } }).rows;
    expect(rows.find((r) => r.key === "deal:company")).toMatchObject({ checked: false, warning: NO_EVIDENCE });
    expect(rows.find((r) => r.key === "terms:group")).toMatchObject({ checked: true });
    const wrong = proposal({ ...BASE, warunki: { ...BASE.warunki, min_grupa: 8 } }).rows;
    expect(wrong.find((r) => r.key === "terms:group")!.warning).toMatch(/liczby 8/);
  });

  it("propozycja handlowca nie jest dowodem; zmyślone zdanie też nie", () => {
    const answer = {
      ...BASE,
      warunki: { ...BASE.warunki, znizka_procent: 20 },
      dowody: { ...BASE.dowody, znizka: "Moglibyście dać 20 procent zniżki?", nazwa_firmy: "Firma Pionek zawsze płaci w terminie." },
    };
    const rows = proposal(answer).rows;
    expect(rows.find((r) => r.key === "terms:value")).toMatchObject({ checked: false, warning: SELLER_EVIDENCE });
    expect(rows.find((r) => r.key === "deal:company")).toMatchObject({ checked: false, warning: EVIDENCE_NOT_FOUND });
  });

  it("cytat partnera powiedziany przez handlowca — ostrzeżenie", () => {
    const rows = proposal({ ...BASE, cytat: "Moglibyście dać 20 procent zniżki?" }).rows;
    expect(rows.find((r) => r.key === "quote")!.warning).toMatch(/powiedział handlowiec/);
  });

  it("transkrypt bez mówców: warunki i dane do umowy odznaczone nawet z dowodem", () => {
    const flat = SPINACH.replace(/^(Kuba Zborowski|Karolina Nowak): /gm, "");
    const rows = proposal(BASE, flat).rows;
    expect(rows.find((r) => r.key === "terms:value")).toMatchObject({ checked: false, warning: SPEAKERS_UNKNOWN });
    expect(rows.find((r) => r.key === "deal:company")).toMatchObject({ checked: false, warning: SPEAKERS_UNKNOWN });
    // Pola rozmowy z dowodem zostają zaznaczone.
    expect(rows.find((r) => r.key === "problem")).toMatchObject({ checked: true });
  });

  it("podmieniona liczba w prawie dosłownym cytacie nie przejdzie (15 → 20, cztery → sześć)", () => {
    const rows = proposal({
      ...BASE,
      warunki: { ...BASE.warunki, znizka_procent: 20, min_grupa: 6 },
      dowody: {
        ...BASE.dowody,
        znizka: "Mogę dać 20 procent zniżki na wstęp i napoje, od poniedziałku do środy, od 18 do 22.",
        grupa: "Ale tylko dla grup od sześciu osób i bez alkoholu.",
      },
    }).rows;
    expect(rows.find((r) => r.key === "terms:value")).toMatchObject({ checked: false });
    expect(rows.find((r) => r.key === "terms:value")!.warning).toMatch(/liczbę 20/);
    expect(rows.find((r) => r.key === "terms:group")).toMatchObject({ checked: false });
  });

  it("„Wariant B: …” w środku wypowiedzi handlowca nie robi się mówcą partnera", () => {
    const text = `Kuba Zborowski: Dzień dobry, mamy dla Was propozycję:
Wariant B: 20 procent zniżki od poniedziałku do środy dla grup.
Karolina Nowak: Mogę dać 15 procent zniżki na wstęp i napoje, od poniedziałku do środy, od 18 do 22.
Kuba Zborowski: Rozumiem.
Karolina Nowak: Ale tylko dla grup od czterech osób i bez alkoholu.`;
    const v = view(text);
    expect(v.known).toBe(true);
    expect(v.speakers).toEqual(["Kuba Zborowski", "Karolina Nowak"]);
    expect(v.partnerText).not.toMatch(/20 procent/);
    const rows = proposal(
      { ...BASE, warunki: { ...BASE.warunki, znizka_procent: 20 }, dowody: { ...BASE.dowody, znizka: "20 procent zniżki od poniedziałku do środy dla grup." } },
      text,
    ).rows;
    expect(rows.find((r) => r.key === "terms:value")).toMatchObject({ checked: false });
  });
});

describe("dowody jako lista {pole, cytat} (odpowiedź Claude API)", () => {
  it("lista i obiekt dają to samo; nieznane pola i puste cytaty pominięte, pierwszy dowód wygrywa", () => {
    const list = Object.entries(BASE.dowody).map(([pole, cytat]) => ({ pole, cytat }));
    const fromList = normalizeExtraction({ ...BASE, dowody: [...list, { pole: "nieznane", cytat: "x" }, { pole: "decydent", cytat: "" }, { pole: "problem", cytat: "inne" }] });
    expect(fromList.evidence).toEqual(normalizeExtraction(BASE).evidence);
    expect(proposal({ ...BASE, dowody: list }).rows.find((r) => r.key === "deal:company")).toMatchObject({ checked: true });
  });
});
