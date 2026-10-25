import { fold } from "./text";
import type { ProposalRow } from "./discovery-extract";

/**
 * Dowody z rozmowy: każde pole proponowane przez AI ma wskazać zdanie partnera, z którego wynika.
 * Zdanie musi być dosłownie w wypowiedziach partnera (albo w notatce handlowca). Bez dowodu wiersz
 * w podglądzie jest odznaczony — handlowiec wstawia go świadomie.
 */
export const EVIDENCE_KEYS = [
  "problem",
  "rezultat",
  "ograniczenia",
  "decydent",
  "termin_decyzji",
  "wczesniejsze_proby",
  "nastepny_krok",
  "znizka",
  "kiedy",
  "grupa",
  "wylaczenia",
  "realizacja",
  "miejsce",
  "okres",
  "cykl",
  "pilotaz",
  "nazwa_firmy",
  "kontakt_awaryjny",
  "godziny_otwarcia",
  "zgoda_logo",
  "zgoda_zdjecia",
  "zgoda_social",
] as const;

export type EvidenceKey = (typeof EVIDENCE_KEYS)[number];
export type Evidence = Record<EvidenceKey, string>;

export function emptyEvidence(): Evidence {
  return Object.fromEntries(EVIDENCE_KEYS.map((key) => [key, ""])) as Evidence;
}

/** Który dowód potwierdza który wiersz podglądu. Wiersze spoza mapy (cytat, kategoria, potrzeby…) mają własne reguły. */
export const ROW_EVIDENCE: Record<string, EvidenceKey> = {
  problem: "problem",
  result: "rezultat",
  constraints: "ograniczenia",
  maker: "decydent",
  deadline: "termin_decyzji",
  attempts: "wczesniejsze_proby",
  nextStep: "nastepny_krok",
  nextStepAt: "nastepny_krok",
  "terms:value": "znizka",
  "terms:when": "kiedy",
  "terms:group": "grupa",
  "terms:exclusions": "wylaczenia",
  "terms:redemption": "realizacja",
  "terms:space": "miejsce",
  "terms:period": "okres",
  "terms:cycle": "cykl",
  "terms:pilot": "pilotaz",
  "deal:company": "nazwa_firmy",
  "deal:ops": "kontakt_awaryjny",
  "deal:hours": "godziny_otwarcia",
  "deal:contract:brand_app": "zgoda_logo",
  "deal:contract:brand_photos": "zgoda_zdjecia",
  "deal:contract:brand_social": "zgoda_social",
};

// ---------------------------------------------------------------------------
// Kto mówi

/** Nagłówki notatek ze Spinach / Zooma, które wyglądają jak „Mówca: tekst”, a nie są wypowiedzią. */
const NOT_SPEAKERS = new Set([
  "data",
  "spotkanie",
  "uczestnicy",
  "temat",
  "godzina",
  "czas",
  "notatka",
  "podsumowanie",
  "agenda",
  "meeting",
  "date",
  "participants",
  "summary",
  "transcript",
  "transkrypt",
  "kanal",
  "kanał",
  "uwaga",
]);

const LINE = /^\s*(?:\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?\s*[-–]?\s*)?([^:\n]{2,60}?)\s*(?:\([^)\n]{0,40}\))?\s*:\s+(\S.*)$/;

export type Utterance = { speaker: string | null; text: string };

function speakerLabel(raw: string) {
  const label = raw.replace(/\s+/g, " ").trim();
  const wordsCount = label.split(" ").length;
  if (wordsCount > 4 || !/\p{L}/u.test(label) || /\d{3,}/.test(label)) return null;
  if (NOT_SPEAKERS.has(fold(label))) return null;
  // Mówca to imię / imię i nazwisko: każde słowo z wielkiej litery, co najmniej dwie litery
  // („Wariant B: 20%” albo „Uwaga: …” w środku wypowiedzi to nie nowy mówca).
  const parts = label.split(" ");
  if (!parts.every((part) => /^\p{Lu}[\p{Ll}'’-]+$/u.test(part))) return null;
  return label;
}

/** Wypowiedzi z transkryptu „Mówca: tekst”. Linie bez mówcy doklejamy do poprzedniej wypowiedzi. */
export function utterances(text: string): Utterance[] {
  const out: Utterance[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const match = line.match(LINE);
    const speaker = match ? speakerLabel(match[1]) : null;
    if (speaker && match) {
      out.push({ speaker, text: match[2].trim() });
    } else if (out.length && out[out.length - 1].speaker) {
      out[out.length - 1] = { ...out[out.length - 1], text: `${out[out.length - 1].text} ${line.trim()}` };
    } else {
      out.push({ speaker: null, text: line.trim() });
    }
  }
  return out;
}

function nameWords(value: string) {
  return fold(value)
    .replace(/[^\p{L}\s]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

/** Zdrobnienia, które zdarzają się w transkryptach („Kuba” zamiast „Jakub”). */
const NICKNAMES: Record<string, string[]> = {
  jakub: ["kuba"],
  aleksandra: ["ola"],
  aleksander: ["olek"],
  katarzyna: ["kasia"],
  malgorzata: ["gosia", "malgosia"],
  magdalena: ["magda"],
  tomasz: ["tomek"],
  michal: ["michal"],
  krzysztof: ["krzysiek"],
  agnieszka: ["aga"],
  joanna: ["asia"],
  bartlomiej: ["bartek"],
  wojciech: ["wojtek"],
  mateusz: ["mateusz"],
  piotr: ["piotrek"],
  pawel: ["pawel"],
  zuzanna: ["zuza"],
};

function sameNameWord(a: string, b: string) {
  if (a === b) return true;
  return (NICKNAMES[a] ?? []).includes(b) || (NICKNAMES[b] ?? []).includes(a);
}

/** Mówca to ta osoba: wspólne słowo nazwiska albo imię (także zdrobnione). */
export function sameSpeaker(speaker: string, person: string) {
  const left = nameWords(speaker);
  const right = nameWords(person);
  if (!left.length || !right.length) return false;
  return left.some((a) => right.some((b) => sameNameWord(a, b)));
}

export type SpeakerView = {
  /** Czy da się odróżnić wypowiedzi handlowca od wypowiedzi partnera. */
  known: boolean;
  /** Notatka + wypowiedzi strony partnera (gdy mówcy nieznani — całe źródło). */
  partnerText: string;
  /** Wypowiedzi handlowca Lutry (puste, gdy nieznani). */
  sellerText: string;
  speakers: string[];
};

/**
 * Podział rozmowy na stronę partnera i handlowca. Handlowiec = mówca z imieniem/nazwiskiem handlowca
 * albo z „Lutra” w nazwie; gdy go nie widać, a jest dwóch mówców i jeden to osoba partnera — drugi.
 */
export function speakerView(input: {
  note: string;
  transcripts: Array<{ text: string }>;
  seller: string;
  contacts: Array<{ name: string }>;
}): SpeakerView {
  const isContact = (speaker: string) => input.contacts.some((c) => sameSpeaker(speaker, c.name));
  const isSellerName = (speaker: string) =>
    (input.seller.trim() && sameSpeaker(speaker, input.seller) && !isContact(speaker)) || /lutr/i.test(speaker);
  // Etykieta, która pada raz i nie jest ani handlowcem, ani osobą partnera, to raczej fragment wypowiedzi
  // („Propozycja: …”) niż nowy mówca — doklejamy ją do poprzedniej wypowiedzi.
  const raw = input.transcripts.flatMap((t) => utterances(t.text));
  const counts = new Map<string, number>();
  for (const u of raw) if (u.speaker) counts.set(u.speaker, (counts.get(u.speaker) ?? 0) + 1);
  const all: Utterance[] = [];
  for (const u of raw) {
    const rare = u.speaker && (counts.get(u.speaker) ?? 0) < 2 && !isContact(u.speaker) && !isSellerName(u.speaker);
    if (rare && all.length) {
      const prev = all[all.length - 1];
      all[all.length - 1] = { ...prev, text: `${prev.text} ${u.speaker}: ${u.text}` };
    } else all.push(u);
  }
  const speakers = [...new Set(all.map((u) => u.speaker).filter((s): s is string => Boolean(s)))];
  let sellers = speakers.filter(isSellerName);
  if (!sellers.length && speakers.length === 2) {
    const partnerSide = speakers.filter(isContact);
    if (partnerSide.length === 1) sellers = speakers.filter((speaker) => speaker !== partnerSide[0]);
  }
  const unlabeled = all.filter((u) => !u.speaker).reduce((sum, u) => sum + u.text.length, 0);
  const labeled = all.filter((u) => u.speaker).reduce((sum, u) => sum + u.text.length, 0);
  const known = sellers.length > 0 && speakers.some((speaker) => !sellers.includes(speaker)) && labeled >= unlabeled;
  const full = [input.note, ...input.transcripts.map((t) => t.text)].filter((part) => part.trim()).join("\n");
  if (!known) return { known: false, partnerText: full, sellerText: "", speakers };
  const partnerLines = all.filter((u) => u.speaker && !sellers.includes(u.speaker)).map((u) => u.text);
  const sellerLines = all.filter((u) => u.speaker && sellers.includes(u.speaker)).map((u) => u.text);
  return {
    known: true,
    partnerText: [input.note, ...partnerLines].filter((part) => part.trim()).join("\n"),
    sellerText: sellerLines.join("\n"),
    speakers,
  };
}

// ---------------------------------------------------------------------------
// Liczby w dowodzie

/** Liczebniki po polsku (bez znaków diakrytycznych, różne przypadki) → liczba. */
const UNITS: Record<string, number> = {
  jeden: 1, jedna: 1, jedno: 1, jednej: 1, jednego: 1,
  dwa: 2, dwie: 2, dwoch: 2, dwoje: 2, dwom: 2,
  trzy: 3, trzech: 3, troje: 3, trzem: 3,
  cztery: 4, czterech: 4, czworo: 4, czterem: 4,
  piec: 5, pieciu: 5, piecioro: 5,
  szesc: 6, szesciu: 6, szescioro: 6,
  siedem: 7, siedmiu: 7,
  osiem: 8, osmiu: 8,
  dziewiec: 9, dziewieciu: 9,
};
const TEENS: Record<string, number> = {
  dziesiec: 10, dziesieciu: 10,
  jedenascie: 11, jedenastu: 11,
  dwanascie: 12, dwunastu: 12,
  trzynascie: 13, trzynastu: 13,
  czternascie: 14, czternastu: 14,
  pietnascie: 15, pietnastu: 15,
  szesnascie: 16, szesnastu: 16,
  siedemnascie: 17, siedemnastu: 17,
  osiemnascie: 18, osiemnastu: 18,
  dziewietnascie: 19, dziewietnastu: 19,
};
const TENS: Record<string, number> = {
  dwadziescia: 20, dwudziestu: 20,
  trzydziesci: 30, trzydziestu: 30,
  czterdziesci: 40, czterdziestu: 40,
  piecdziesiat: 50, piecdziesieciu: 50,
  szescdziesiat: 60, siedemdziesiat: 70, osiemdziesiat: 80, dziewiecdziesiat: 90,
  sto: 100, stu: 100,
};

/** Liczby zapisane słownie w tekście („trzydzieści pięć” → 35, „sześciu” → 6, „połowę” → 50). */
export function spokenNumbers(text: string): number[] {
  const tokens = fold(text).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const out: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    if (TENS[word] !== undefined) {
      const next = UNITS[tokens[i + 1] ?? ""];
      if (next !== undefined && TENS[word] < 100) {
        out.push(TENS[word] + next);
        i += 1;
      } else out.push(TENS[word]);
    } else if (TEENS[word] !== undefined) out.push(TEENS[word]);
    else if (UNITS[word] !== undefined) out.push(UNITS[word]);
    else if (/^polow/.test(word)) out.push(50);
  }
  return out;
}

/** Wszystkie liczby w tekście: cyframi i słownie. */
export function numbersIn(text: string): number[] {
  const digits = (text.match(/\d+/g) ?? []).map(Number);
  return [...digits, ...spokenNumbers(text)];
}

function normWords(text: string) {
  return fold(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
}

/**
 * Zdanie (linia, ewentualnie z następną) w tekście, które odpowiada cytatowi: dosłownie (bez interpunkcji)
 * albo w 85% słów po kolei. Zwraca prawdziwe zdanie z rozmowy, żeby liczby sprawdzać w nim, a nie w cytacie od AI.
 */
export function matchSentence(quote: string, text: string): { line: string; exact: boolean } | null {
  const q = normWords(quote);
  if (q.join("").length < 8) return null;
  const needle = ` ${q.join(" ")} `;
  const lines = text.split("\n").filter((line) => line.trim());
  for (const span of [1, 2]) {
    for (let i = 0; i + span <= lines.length; i++) {
      const chunk = lines.slice(i, i + span).join(" ");
      if (` ${normWords(chunk).join(" ")} `.includes(needle)) return { line: chunk, exact: true };
    }
  }
  let best: { line: string; score: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const chunk = lines.slice(i, i + 2).join(" ");
    const hay = normWords(chunk);
    let pos = 0;
    let hits = 0;
    for (const word of q) {
      const at = hay.indexOf(word, pos);
      if (at < 0) continue;
      hits += 1;
      pos = at + 1;
    }
    const score = hits / q.length;
    if (score >= 0.85 && (!best || score > best.score)) best = { line: chunk, score };
  }
  return best ? { line: best.line, exact: false } : null;
}

/** Liczba z wiersza (np. zniżka 15%, grupa od 6 osób) pada w tekście — cyframi albo słownie. */
export function numberInText(value: number, text: string) {
  if (new RegExp(`(^|[^\\d])${value}([^\\d]|$)`).test(text)) return true;
  return spokenNumbers(text).includes(value);
}

// ---------------------------------------------------------------------------
// Bramka dowodów w podglądzie

export const NO_EVIDENCE = "Brak dowodu w słowach partnera — AI nie wskazało zdania z rozmowy. Wstaw, jeśli to padło.";
export const SELLER_EVIDENCE = "To powiedział handlowiec, nie partner — wstaw tylko, jeśli partner się zgodził.";
export const EVIDENCE_NOT_FOUND = "Nie znalazłem zdania-dowodu w wypowiedziach partnera — sprawdź, zanim wstawisz.";
export const SPEAKERS_UNKNOWN = "Nie rozpoznałem mówców w transkrypcie — sprawdź, czy to mówił partner.";

type Found = (quote: string, source: string) => boolean;

/**
 * Wiersze podglądu bez dowodu w słowach partnera → odznaczone z ostrzeżeniem; z dowodem → dowód w podpowiedzi.
 * Warunki i dane do umowy przy nieznanych mówcach też odznaczamy (mogła to być propozycja handlowca).
 */
export function applyEvidence(
  rows: ProposalRow[],
  evidence: Evidence,
  view: SpeakerView,
  found: Found,
  values: { discountPercent?: number; minGroup?: number },
): ProposalRow[] {
  if (!view.partnerText.trim()) return rows;
  return rows.map((row) => {
    const key = ROW_EVIDENCE[row.key];
    if (!key) return row;
    const quote = evidence[key]?.trim() ?? "";
    const strict = row.key.startsWith("terms:") || row.key.startsWith("deal:");
    let warning = row.warning;
    let checked = row.checked;
    let hint = row.hint;
    const match = quote ? matchSentence(quote, view.partnerText) : null;
    if (!quote) {
      warning = warning ?? NO_EVIDENCE;
      checked = false;
    } else if (!match) {
      warning = warning ?? (view.known && view.sellerText && found(quote, view.sellerText) ? SELLER_EVIDENCE : EVIDENCE_NOT_FOUND);
      checked = false;
    } else {
      hint = [hint, `Dowód: „${match.exact ? quote : match.line.trim()}”`].filter(Boolean).join(" ");
      // Liczby sprawdzamy w zdaniu, które naprawdę padło — nie w cytacie od AI (mógł podmienić „15” na „20”).
      const spoken = numbersIn(match.line);
      const invented = numbersIn(quote).filter((n) => !spoken.includes(n));
      const number =
        row.key === "terms:value" && values.discountPercent
          ? values.discountPercent
          : row.key === "terms:group" && values.minGroup
            ? values.minGroup
            : 0;
      if (invented.length) {
        warning = warning ?? `Cytat od AI ma liczbę ${invented[0]}, której nie ma w tym zdaniu rozmowy — sprawdź.`;
        checked = false;
      } else if (number && !spoken.includes(number)) {
        warning = warning ?? `W zdaniu partnera nie ma liczby ${number} — sprawdź, na co partner się zgodził.`;
        checked = false;
      } else if (strict && !match.exact) {
        warning = warning ?? "Zdanie-dowód nie jest dosłowne — porównaj z rozmową, zanim wstawisz.";
        checked = false;
      } else if (strict && !view.known) {
        warning = warning ?? SPEAKERS_UNKNOWN;
        checked = false;
      }
    }
    return { ...row, warning, checked, hint };
  });
}
