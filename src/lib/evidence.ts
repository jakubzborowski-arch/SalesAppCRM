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
  // Mówca to nazwa własna: zaczyna się wielką literą (albo „Handlowiec”, „Partner”, „Speaker 1”).
  if (!/^\p{Lu}/u.test(label)) return null;
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
  const all = input.transcripts.flatMap((t) => utterances(t.text));
  const speakers = [...new Set(all.map((u) => u.speaker).filter((s): s is string => Boolean(s)))];
  const isContact = (speaker: string) => input.contacts.some((c) => sameSpeaker(speaker, c.name));
  let sellers = speakers.filter(
    (speaker) => (input.seller.trim() && sameSpeaker(speaker, input.seller) && !isContact(speaker)) || /lutr/i.test(speaker),
  );
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

const NUMBER_WORDS: Array<[number, RegExp]> = [
  [5, /\bpi[eę]ć\b|\bpi[eę]ciu\b/],
  [10, /\bdziesi[eę]ć\b|\bdziesi[eę]ciu\b/],
  [12, /\bdwana[sś]cie\b|\bdwunastu\b/],
  [15, /\bpi[eę]tna[sś]cie\b|\bpi[eę]tnastu\b/],
  [20, /\bdwadzie[sś]cia\b|\bdwudziestu\b/],
  [25, /\bdwadzie[sś]cia pi[eę]ć\b/],
  [30, /\btrzydzie[sś]ci\b|\btrzydziestu\b/],
  [40, /\bczterdzie[sś]ci\b/],
  [50, /\bpi[eę][cć]dziesi[aą]t\b|\bpo[lł]ow[eęa]\b/],
];

/** Liczba z wiersza (np. zniżka 15%) pada w dowodzie — cyframi albo słownie. */
export function numberInText(value: number, text: string) {
  const lower = text.toLowerCase();
  if (new RegExp(`(^|[^\\d])${value}([^\\d]|$)`).test(lower)) return true;
  return NUMBER_WORDS.some(([n, pattern]) => n === value && pattern.test(lower));
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
    if (!quote) {
      warning = warning ?? NO_EVIDENCE;
      checked = false;
    } else if (!found(quote, view.partnerText)) {
      warning = warning ?? (view.known && view.sellerText && found(quote, view.sellerText) ? SELLER_EVIDENCE : EVIDENCE_NOT_FOUND);
      checked = false;
    } else {
      hint = [hint, `Dowód: „${quote}”`].filter(Boolean).join(" ");
      const number =
        row.key === "terms:value" && values.discountPercent
          ? values.discountPercent
          : row.key === "terms:group" && values.minGroup
            ? values.minGroup
            : 0;
      if (number && !numberInText(number, quote)) {
        warning = warning ?? `W zdaniu-dowodzie nie ma liczby ${number} — sprawdź, na co partner się zgodził.`;
        checked = false;
      } else if (strict && !view.known) {
        warning = warning ?? SPEAKERS_UNKNOWN;
        checked = false;
      }
    }
    return { ...row, warning, checked, hint };
  });
}
