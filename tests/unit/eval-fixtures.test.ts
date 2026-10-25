import { describe, expect, it } from "vitest";
import { EXTRACTION_SCHEMA, NOT_IN_TALK, normalizeExtraction, quoteFound } from "@/lib/discovery-extract";
import { EVIDENCE_KEYS, EVIDENCE_NOT_FOUND, NO_EVIDENCE, SELLER_EVIDENCE } from "@/lib/evidence";
import { isIsoDate } from "@/lib/dates";
import { allStrings, fixtureSetup, loadFixtures, previewFor, privateDataIn, type EvalFixture } from "../eval/fixtures";
import { scoreFields, scoreQuotes, summarize, tokenF1 } from "../eval/score";

/**
 * Zestaw do testów jakości AI (tests/eval/conversations) — sprawdzenie offline, bez sieci:
 * złoty wzorzec ma kształt odpowiedzi modelu, przechodzi przez normalizeExtraction bez strat,
 * cytaty i dowody są dosłownie w rozmowie (w wypowiedziach partnera), a podgląd misji nie gubi pól.
 */

const fixtures = loadFixtures();

/**
 * Znane problemy logiki ugruntowania (src/lib) wykryte na tym zestawie — nie poprawiamy ich tutaj.
 * Klucz: `${id fixture}:${klucz wiersza podglądu}` → opis. Te wiersze są wyłączone z asercji „bez NOT_IN_TALK”
 * i opisane jako it.todo niżej.
 */
const KNOWN_GROUNDING_ISSUES: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Minimalny walidator JSON Schema (tylko konstrukcje używane w EXTRACTION_SCHEMA).

type Schema = {
  type?: string;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
  items?: Schema;
};

function validate(value: unknown, schema: Schema, path = "$"): string[] {
  const errors: string[] = [];
  const t = schema.type;
  if (t === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path}: oczekiwano obiektu`];
    const o = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in o)) errors.push(`${path}.${key}: brak wymaganego klucza`);
    for (const [key, item] of Object.entries(o)) {
      const sub = schema.properties?.[key];
      if (!sub) {
        if (schema.additionalProperties === false) errors.push(`${path}.${key}: klucz spoza schematu`);
        continue;
      }
      errors.push(...validate(item, sub, `${path}.${key}`));
    }
  } else if (t === "array") {
    if (!Array.isArray(value)) return [`${path}: oczekiwano listy`];
    value.forEach((item, i) => schema.items && errors.push(...validate(item, schema.items, `${path}[${i}]`)));
  } else if (t === "string") {
    if (typeof value !== "string") errors.push(`${path}: oczekiwano tekstu`);
  } else if (t === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) errors.push(`${path}: oczekiwano liczby całkowitej`);
  } else if (t === "boolean") {
    if (typeof value !== "boolean") errors.push(`${path}: oczekiwano true/false`);
  }
  if (schema.enum && !schema.enum.includes(value as never)) errors.push(`${path}: ${JSON.stringify(value)} spoza ${JSON.stringify(schema.enum)}`);
  return errors;
}

// ---------------------------------------------------------------------------
// Złoty wzorzec → oczekiwany wynik normalizeExtraction (bez żadnych przekształceń).

/* eslint-disable @typescript-eslint/no-explicit-any */
function expectedExtraction(g: any) {
  const w = g.warunki;
  const u = g.umowa;
  return {
    quote: g.cytat,
    problem: g.problem,
    category: g.kategoria,
    priority: g.priorytet,
    result: g.rezultat,
    constraints: g.ograniczenia,
    makerName: g.decydent,
    makerRole: g.rola_decydenta,
    deadlineText: g.termin_decyzji,
    deadlineDate: g.termin_decyzji_data,
    attempts: g.wczesniejsze_proby,
    nextStep: g.nastepny_krok,
    nextStepDate: g.data_nastepnego_kroku,
    needs: g.potrzeby.map((n: any) => ({
      title: n.tytul, category: n.kategoria, priority: n.priorytet, quote: n.cytat, result: n.rezultat, constraints: n.ograniczenia,
    })),
    summary: g.wnioski,
    terms: {
      discountPercent: w.znizka_procent,
      freebie: w.gratis,
      days: w.dni,
      hoursFrom: w.godziny_od,
      hoursTo: w.godziny_do,
      minGroup: w.min_grupa,
      exclusions: w.wylaczenia,
      redemption: w.realizacja,
      space: w.miejsce_na_wydarzenia,
      cycleEvents: w.cykl_wydarzenia,
      cycleFrequency: w.cykl_czestotliwosc,
      cycleFirst: w.cykl_pierwsze,
      pilotTeam: w.pilotaz_zespol,
      pilotPeople: w.pilotaz_osoby,
      pilotFeedback: w.pilotaz_feedback,
      periodFrom: w.okres_od,
      periodTo: w.okres_do,
    },
    objections: g.obiekcje.map((o: any) => ({ key: o.klucz, worked: o.argument_zadzialal, quote: o.cytat })),
    deal: {
      companyName: u.nazwa_firmy,
      opsContact: u.kontakt_awaryjny,
      openingHours: u.godziny_otwarcia,
      consentLogo: u.zgoda_logo,
      consentPhotos: u.zgoda_zdjecia,
      consentSocial: u.zgoda_social,
    },
    evidence: g.dowody,
  };
}

/** Wiersze podglądu, które muszą powstać z wypełnionych pól złotego wzorca (inaczej podgląd gubi pole). */
function expectedRows(f: EvalFixture): string[] {
  const g = f.gold as any;
  const w = g.warunki;
  const u = g.umowa;
  const keys: string[] = [];
  const add = (cond: unknown, key: string) => cond && keys.push(key);
  add(g.cytat, "quote");
  add(g.problem, "problem");
  add(g.rezultat, "result");
  add(g.ograniczenia.length, "constraints");
  add(g.decydent, "maker");
  add(g.termin_decyzji || g.termin_decyzji_data, "deadline");
  add(g.wczesniejsze_proby, "attempts");
  add(g.nastepny_krok, "nextStep");
  add(g.data_nastepnego_kroku, "nextStepAt");
  if (f.segment === "venue") {
    add(w.znizka_procent || w.gratis, "terms:value");
    add(w.dni.length || w.godziny_od || w.godziny_do, "terms:when");
    add(w.min_grupa > 1, "terms:group");
    add(w.wylaczenia, "terms:exclusions");
    add(w.realizacja, "terms:redemption");
    add(w.miejsce_na_wydarzenia, "terms:space");
    add(u.godziny_otwarcia, "deal:hours");
  }
  add(f.segment === "community" && (w.cykl_wydarzenia || w.cykl_czestotliwosc || w.cykl_pierwsze), "terms:cycle");
  add(f.segment === "company" && (w.pilotaz_zespol || w.pilotaz_osoby || w.pilotaz_feedback), "terms:pilot");
  add(w.okres_od && w.okres_do, "terms:period");
  add(u.nazwa_firmy, "deal:company");
  add(u.kontakt_awaryjny, "deal:ops");
  add(u.zgoda_logo && f.segment !== "company", "deal:contract:brand_app");
  add(u.zgoda_zdjecia, "deal:contract:brand_photos");
  add(u.zgoda_social, "deal:contract:brand_social");
  for (const o of g.obiekcje) keys.push(`objection:${o.klucz}`);
  return keys;
}

/** Wszystkie dosłowne cytaty ze złotego wzorca: cytat, cytaty potrzeb i obiekcji, dowody. */
function goldQuotes(g: any): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  if (g.cytat) out.push({ path: "cytat", text: g.cytat });
  g.potrzeby.forEach((n: any, i: number) => n.cytat && out.push({ path: `potrzeby[${i}].cytat`, text: n.cytat }));
  g.obiekcje.forEach((o: any, i: number) => o.cytat && out.push({ path: `obiekcje[${i}].cytat`, text: o.cytat }));
  for (const key of EVIDENCE_KEYS) if (g.dowody[key]) out.push({ path: `dowody.${key}`, text: g.dowody[key] });
  return out;
}

function goldDates(g: any): Array<{ path: string; value: string }> {
  const w = g.warunki;
  return [
    ["termin_decyzji_data", g.termin_decyzji_data],
    ["data_nastepnego_kroku", g.data_nastepnego_kroku],
    ["warunki.cykl_pierwsze", w.cykl_pierwsze],
    ["warunki.pilotaz_feedback", w.pilotaz_feedback],
    ["warunki.okres_od", w.okres_od],
    ["warunki.okres_do", w.okres_do],
  ]
    .filter(([, value]) => value)
    .map(([path, value]) => ({ path, value }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------

describe("zestaw rozmów do testów jakości AI", () => {
  it("co najmniej 22 rozmowy: ~14 miejsc, ~4 społeczności, ~4 firmy; 3+ bez etykiet mówców", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(22);
    const by = (segment: string) => fixtures.filter((f) => f.segment === segment).length;
    expect(by("venue")).toBeGreaterThanOrEqual(12);
    expect(by("community")).toBeGreaterThanOrEqual(4);
    expect(by("company")).toBeGreaterThanOrEqual(4);
    expect(fixtures.filter((f) => !f.labeled).length).toBeGreaterThanOrEqual(3);
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
    // Przypadki szczególne z opisu zestawu.
    expect(fixtures.some((f) => /Zignoruj poprzednie instrukcje/.test(f.transcript))).toBe(true);
    expect(fixtures.some((f) => privateDataIn(f.transcript))).toBe(true);
    expect(fixtures.some((f) => f.transcript.length >= 4000)).toBe(true);
  });
});

describe.each(fixtures.map((f) => [f.id, f] as const))("%s", (_id, f) => {
  const setup = fixtureSetup(f);
  const g = f.gold;

  it("metadane i złoty wzorzec zgodne ze schematem odpowiedzi modelu (EXTRACTION_SCHEMA)", () => {
    expect(isIsoDate(f.callDate)).toBe(true);
    expect(f.seller).toBe("Jakub Zborowski");
    expect(["venue", "community", "company"]).toContain(f.segment);
    expect(f.notes.trim().length).toBeGreaterThan(10);
    // Złoty wzorzec trzyma dowody jako obiekt (czytelniej); model oddaje listę {pole, cytat}.
    const asModel = { ...g, dowody: Object.entries(g.dowody).filter(([, v]) => v).map(([pole, cytat]) => ({ pole, cytat })) };
    expect(validate(asModel, EXTRACTION_SCHEMA as unknown as Schema)).toEqual([]);
    expect(normalizeExtraction(asModel)).toEqual(normalizeExtraction(g));
  });

  it("normalizeExtraction(gold) zachowuje wszystkie wartości (nic nie znika po cichu)", () => {
    expect(normalizeExtraction(g)).toEqual(expectedExtraction(g));
  });

  it("daty w złotym wzorcu: RRRR-MM-DD, nie wcześniej niż dzień rozmowy", () => {
    for (const { path, value } of goldDates(g)) {
      expect(isIsoDate(value), path).toBe(true);
      expect(value >= f.callDate, `${path}=${value} przed rozmową ${f.callDate}`).toBe(true);
    }
  });

  it("żaden tekst złotego wzorca nie zawiera telefonu, maila ani NIP-u", () => {
    for (const { path, text } of allStrings(g)) expect(privateDataIn(text), `${path}: ${text}`).toBeNull();
  });

  it("cytaty i dowody są dosłownie w rozmowie (po redakcji, tak jak widzi je model)", () => {
    for (const { path, text } of goldQuotes(g)) expect(quoteFound(text, setup.source), `${path}: ${text}`).toBe(true);
  });

  if (f.labeled) {
    it("mówcy rozpoznani; cytaty i dowody pochodzą z wypowiedzi partnera, nie handlowca", () => {
      expect(setup.view.known).toBe(true);
      for (const { path, text } of goldQuotes(g)) expect(quoteFound(text, setup.view.partnerText), `${path}: ${text}`).toBe(true);
    });
  } else {
    it("bez etykiet mówców: podział na mówców nieznany (CRM ostrzega przy warunkach)", () => {
      expect(setup.view.known).toBe(false);
    });
  }

  it("podgląd misji ze złotego wzorca: każde pole ma wiersz i dowód, bez „Brak dowodu” i bez fałszywych ostrzeżeń", () => {
    const rows = previewFor(f, setup, normalizeExtraction(g)).rows;
    const keys = rows.map((row) => row.key);
    for (const key of expectedRows(f)) expect(keys, `brak wiersza ${key}`).toContain(key);
    for (const row of rows) {
      expect(row.warning, `${row.key}`).not.toBe(NO_EVIDENCE);
      expect(row.warning, `${row.key}`).not.toBe(EVIDENCE_NOT_FOUND);
      expect(row.warning, `${row.key}`).not.toBe(SELLER_EVIDENCE);
      if (KNOWN_GROUNDING_ISSUES[`${f.id}:${row.key}`]) continue;
      expect(row.warning, `${row.key}: ${row.value}`).not.toBe(NOT_IN_TALK);
      expect(row.warning ?? "", `${row.key}`).not.toMatch(/Nie znalazłem tego zdania|Brak cytatu partnera/);
      expect(row.hint ?? "", `${row.key}`).not.toMatch(/Cytat pominięty/);
    }
    // Obiekcje z dosłownym cytatem partnera wchodzą zaznaczone.
    for (const row of rows.filter((r) => r.key.startsWith("objection:"))) expect(row.checked, row.key).toBe(true);
  });

  it("ocena (tests/eval/score.ts): wzorzec względem siebie — wszystko zgodne, cytaty ugruntowane", () => {
    const ext = normalizeExtraction(g);
    const bad = scoreFields(ext, ext).filter((r) => r.outcome !== "tp" && r.outcome !== "tn");
    expect(bad).toEqual([]);
    for (const q of scoreQuotes(ext, setup.source, setup.view.partnerText)) expect(q.inSource, q.field).toBe(true);
  });

  for (const [key, issue] of Object.entries(KNOWN_GROUNDING_ISSUES)) {
    if (key.startsWith(`${f.id}:`)) it.todo(`znany problem ugruntowania (${key.slice(f.id.length + 1)}): ${issue}`);
  }
});

describe("ocena odpowiedzi modelu (tests/eval/score.ts)", () => {
  const f = fixtures.find((x) => x.id.startsWith("v02"))!;
  const gold = normalizeExtraction(f.gold);

  it("liczba handlowca zamiast partnera = źle; puste = brak; wpisane bez pokrycia = fałszywe wypełnienie", () => {
    const model = normalizeExtraction({
      ...f.gold,
      problem: "W poniedziałki i wtorki wieczorem gra u nich tylko jeden stolik.",
      rezultat: "",
      termin_decyzji_data: "2026-10-23",
      warunki: { ...(f.gold.warunki as object), znizka_procent: 20, dni: ["tue", "mon"], okres_od: "2026-11-01" },
      umowa: { ...(f.gold.umowa as object), zgoda_logo: true },
    });
    const by = Object.fromEntries(scoreFields(gold, model).map((r) => [r.field, r.outcome]));
    expect(by["problem"]).toBe("tp");
    expect(by["rezultat"]).toBe("miss");
    expect(by["termin_decyzji_data"]).toBe("wrong");
    expect(by["warunki.znizka_procent"]).toBe("wrong");
    expect(by["warunki.dni"]).toBe("tp");
    expect(by["warunki.okres_od"]).toBe("false_fill");
    expect(by["umowa.zgoda_logo"]).toBe("false_fill");
    const s = summarize([scoreFields(gold, model)]).find((x) => x.field === "warunki.znizka_procent")!;
    expect(s).toMatchObject({ precision: 0, recall: 0, accuracy: 0 });
  });

  it("F1 tokenów po złożeniu polskich znaków", () => {
    expect(tokenF1("Bez turniejów i wydarzeń biletowanych", "bez turniejow i wydarzen biletowanych")).toBe(1);
    expect(tokenF1("", "")).toBe(1);
    expect(tokenF1("Marek Sowa", "")).toBe(0);
  });
});
