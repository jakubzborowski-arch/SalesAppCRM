import { quoteFound, words, type DiscoveryExtraction } from "@/lib/discovery-extract";
import { EVIDENCE_KEYS } from "@/lib/evidence";

/**
 * Ocena odpowiedzi modelu względem złotego wzorca — obie strony po normalizeExtraction, więc „16” i „16:00”
 * albo „środa” i „wed” liczą się tak samo. Wynik pola: tp (zgodne), wrong (inne niż wzorzec), miss (model pusty,
 * wzorzec nie), false_fill (model wpisał coś, czego w rozmowie nie ustalono), tn (oba puste).
 */

export type Outcome = "tp" | "wrong" | "miss" | "false_fill" | "tn";
export type FieldKind = "exact" | "text" | "list" | "quote";

export type FieldResult = {
  field: string;
  kind: FieldKind;
  outcome: Outcome;
  gold: string;
  model: string;
  /** Elementy list (dni, obiekcje, ograniczenia, potrzeby): trafione / nadmiarowe / brakujące. */
  items?: { tp: number; fp: number; fn: number };
};

/** Próg zgodności krótkiego tekstu (F1 tokenów po złożeniu polskich znaków). */
export const TEXT_MATCH = 0.5;

export function tokenF1(a: string, b: string) {
  const left = words(a);
  const right = words(b);
  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;
  const pool = new Map<string, number>();
  for (const w of right) pool.set(w, (pool.get(w) ?? 0) + 1);
  let overlap = 0;
  for (const w of left) {
    const n = pool.get(w) ?? 0;
    if (n > 0) {
      overlap += 1;
      pool.set(w, n - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length);
}

function outcomeOf(goldEmpty: boolean, modelEmpty: boolean, match: boolean): Outcome {
  if (goldEmpty && modelEmpty) return "tn";
  if (goldEmpty) return "false_fill";
  if (modelEmpty) return "miss";
  return match ? "tp" : "wrong";
}

function exact(field: string, gold: string | number | boolean, model: string | number | boolean): FieldResult {
  const empty = (v: string | number | boolean) => v === "" || v === 0 || v === false;
  return { field, kind: "exact", outcome: outcomeOf(empty(gold), empty(model), gold === model), gold: String(gold), model: String(model) };
}

function text(field: string, gold: string, model: string): FieldResult {
  return { field, kind: "text", outcome: outcomeOf(!gold.trim(), !model.trim(), tokenF1(gold, model) >= TEXT_MATCH), gold, model };
}

/** Lista: elementy łączone w pary dokładnie (soft=false) albo po F1 tokenów ≥ próg (soft=true). */
function list(field: string, gold: string[], model: string[], soft: boolean): FieldResult {
  const left = [...model];
  let tp = 0;
  for (const g of gold) {
    const at = left.findIndex((m) => (soft ? tokenF1(g, m) >= TEXT_MATCH : m === g));
    if (at >= 0) {
      tp += 1;
      left.splice(at, 1);
    }
  }
  const fp = model.length - tp;
  const fn = gold.length - tp;
  const f1 = gold.length + model.length ? (2 * tp) / (gold.length + model.length) : 1;
  return {
    field,
    kind: "list",
    outcome: outcomeOf(!gold.length, !model.length, f1 >= TEXT_MATCH),
    gold: gold.join(" | "),
    model: model.join(" | "),
    items: { tp, fp, fn },
  };
}

/** Wszystkie pola porównywane z wzorcem. */
export function scoreFields(gold: DiscoveryExtraction, model: DiscoveryExtraction): FieldResult[] {
  const g = gold;
  const m = model;
  const out: FieldResult[] = [
    text("problem", g.problem, m.problem),
    exact("kategoria", g.category, m.category),
    exact("priorytet", g.priority, m.priority),
    text("rezultat", g.result, m.result),
    list("ograniczenia", g.constraints, m.constraints, true),
    text("decydent", g.makerName, m.makerName),
    text("rola_decydenta", g.makerRole, m.makerRole),
    text("termin_decyzji", g.deadlineText, m.deadlineText),
    exact("termin_decyzji_data", g.deadlineDate, m.deadlineDate),
    text("wczesniejsze_proby", g.attempts, m.attempts),
    text("nastepny_krok", g.nextStep, m.nextStep),
    exact("data_nastepnego_kroku", g.nextStepDate, m.nextStepDate),
    list("potrzeby (tytuły)", g.needs.map((n) => n.title), m.needs.map((n) => n.title), true),
    exact("warunki.znizka_procent", g.terms.discountPercent, m.terms.discountPercent),
    text("warunki.gratis", g.terms.freebie, m.terms.freebie),
    list("warunki.dni", [...g.terms.days].sort(), [...m.terms.days].sort(), false),
    exact("warunki.godziny_od", g.terms.hoursFrom, m.terms.hoursFrom),
    exact("warunki.godziny_do", g.terms.hoursTo, m.terms.hoursTo),
    exact("warunki.min_grupa", g.terms.minGroup, m.terms.minGroup),
    text("warunki.wylaczenia", g.terms.exclusions, m.terms.exclusions),
    exact("warunki.realizacja", g.terms.redemption, m.terms.redemption),
    text("warunki.miejsce_na_wydarzenia", g.terms.space, m.terms.space),
    exact("warunki.cykl_wydarzenia", g.terms.cycleEvents, m.terms.cycleEvents),
    exact("warunki.cykl_czestotliwosc", g.terms.cycleFrequency, m.terms.cycleFrequency),
    exact("warunki.cykl_pierwsze", g.terms.cycleFirst, m.terms.cycleFirst),
    text("warunki.pilotaz_zespol", g.terms.pilotTeam, m.terms.pilotTeam),
    exact("warunki.pilotaz_osoby", g.terms.pilotPeople, m.terms.pilotPeople),
    exact("warunki.pilotaz_feedback", g.terms.pilotFeedback, m.terms.pilotFeedback),
    exact("warunki.okres_od", g.terms.periodFrom, m.terms.periodFrom),
    exact("warunki.okres_do", g.terms.periodTo, m.terms.periodTo),
    list("obiekcje (klucze)", g.objections.map((o) => o.key).sort(), m.objections.map((o) => o.key).sort(), false),
    text("umowa.nazwa_firmy", g.deal.companyName, m.deal.companyName),
    text("umowa.kontakt_awaryjny", g.deal.opsContact, m.deal.opsContact),
    text("umowa.godziny_otwarcia", g.deal.openingHours, m.deal.openingHours),
    exact("umowa.zgoda_logo", g.deal.consentLogo, m.deal.consentLogo),
    exact("umowa.zgoda_zdjecia", g.deal.consentPhotos, m.deal.consentPhotos),
    exact("umowa.zgoda_social", g.deal.consentSocial, m.deal.consentSocial),
  ];
  // „Argument zadziałał” oceniamy tylko dla obiekcji, które padły po obu stronach.
  for (const o of g.objections) {
    const hit = m.objections.find((x) => x.key === o.key);
    if (hit) out.push(exact(`obiekcje.argument_zadzialal`, String(o.worked), String(hit.worked)));
  }
  return out;
}

export type QuoteResult = { field: string; quote: string; inSource: boolean; inPartner: boolean };

/** Cytaty modelu: czy są dosłownie w rozmowie i w wypowiedziach partnera (gdy mówcy znani). */
export function scoreQuotes(model: DiscoveryExtraction, source: string, partnerText: string): QuoteResult[] {
  const quotes: Array<[string, string]> = [];
  if (model.quote) quotes.push(["cytat", model.quote]);
  model.needs.forEach((n) => n.quote && quotes.push(["potrzeby.cytat", n.quote]));
  model.objections.forEach((o) => o.quote && quotes.push(["obiekcje.cytat", o.quote]));
  for (const key of EVIDENCE_KEYS) if (model.evidence[key]) quotes.push([`dowody.${key}`, model.evidence[key]]);
  return quotes.map(([field, quote]) => ({
    field,
    quote,
    inSource: quoteFound(quote, source),
    inPartner: quoteFound(quote, partnerText),
  }));
}

export type FieldSummary = {
  field: string;
  kind: FieldKind;
  n: number;
  tp: number;
  wrong: number;
  miss: number;
  falseFill: number;
  tn: number;
  /** Trafne wśród wypełnionych przez model. */
  precision: number | null;
  /** Trafne wśród wypełnionych we wzorcu. */
  recall: number | null;
  accuracy: number;
  /** Wypełnione przez model, gdy we wzorcu puste (wśród przypadków z pustym wzorcem). */
  falseFillRate: number | null;
  items?: { tp: number; fp: number; fn: number; precision: number | null; recall: number | null };
};

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function summarize(results: FieldResult[][]): FieldSummary[] {
  const by = new Map<string, FieldResult[]>();
  for (const r of results.flat()) by.set(r.field, [...(by.get(r.field) ?? []), r]);
  return [...by.entries()].map(([field, rows]) => {
    const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
    const tp = count("tp");
    const wrong = count("wrong");
    const miss = count("miss");
    const falseFill = count("false_fill");
    const tn = count("tn");
    const summary: FieldSummary = {
      field,
      kind: rows[0].kind,
      n: rows.length,
      tp,
      wrong,
      miss,
      falseFill,
      tn,
      precision: ratio(tp, tp + wrong + falseFill),
      recall: ratio(tp, tp + wrong + miss),
      accuracy: (tp + tn) / rows.length,
      falseFillRate: ratio(falseFill, falseFill + tn),
    };
    if (rows[0].items) {
      const items = rows.reduce((acc, r) => ({ tp: acc.tp + r.items!.tp, fp: acc.fp + r.items!.fp, fn: acc.fn + r.items!.fn }), { tp: 0, fp: 0, fn: 0 });
      summary.items = { ...items, precision: ratio(items.tp, items.tp + items.fp), recall: ratio(items.tp, items.tp + items.fn) };
    }
    return summary;
  });
}

/** Ceny za 1 mln tokenów (wejście / wyjście) — szacunek kosztu przebiegu. */
export function pricing(model: string) {
  if (/haiku/i.test(model)) return { name: "Haiku", input: 0.1, output: 0.5 };
  return { name: "Sonnet", input: 2, output: 10 };
}

export function pct(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
