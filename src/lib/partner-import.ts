import { normalizePartnerPriority } from "./partner-priority";
import type { NewPartnerInput, PartnerSegment } from "./types";

export const PARTNER_IMPORT_FIELDS = [
  { key: "name", label: "Nazwa", hint: "Lokal, społeczność albo firma", required: true },
  { key: "segment", label: "Typ partnera", hint: "miejsce / społeczność / firma" },
  { key: "address", label: "Adres", hint: "Pełny adres w jednej komórce" },
  { key: "city", label: "Miasto", hint: "Opcjonalnie — z pełnego adresu, jeśli puste" },
  { key: "category", label: "Kategoria", hint: "kawiarnia, restauracja…" },
  { key: "subcategory", label: "Subkategoria", hint: "np. specialty, wege" },
  { key: "website", label: "Strona www", hint: "https://…" },
  { key: "instagram", label: "Instagram", hint: "@konto albo link" },
  { key: "facebook", label: "Facebook", hint: "Strona albo profil" },
  { key: "socialOther", label: "Inne social", hint: "LinkedIn, TikTok, mapa…" },
  { key: "priority", label: "Priorytet", hint: "Wysoki / Średni / Niski" },
  { key: "priorityReason", label: "Uzasadnienie priorytetu", hint: "Dlaczego ten lokal teraz" },
  { key: "source", label: "Źródło", hint: "Skąd rekord" },
  { key: "hours", label: "Godziny", hint: "Godziny otwarcia" },
  { key: "capacity", label: "Pojemność", hint: "Ile osób zmieści lokal (liczba)" },
  { key: "notes", label: "Notatka", hint: "Obserwacja, nie fakt" },
  { key: "legalName", label: "Nazwa firmy", hint: "Pełna nazwa z rejestru (sp. z o.o.…)" },
  { key: "nip", label: "NIP", hint: "10 cyfr, z kreskami albo bez" },
  { key: "contactName", label: "Osoba kontaktowa", hint: "Imię i nazwisko" },
  { key: "contactRole", label: "Rola", hint: "właściciel, menedżer…" },
  { key: "contactPhone", label: "Telefon", hint: "Numer do kontaktu" },
  { key: "contactEmail", label: "E-mail", hint: "Adres mailowy" },
] as const;

export type PartnerImportField = (typeof PARTNER_IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<PartnerImportField, number>>;

const ALIASES: Record<PartnerImportField, string[]> = {
  name: ["nazwa", "nazwa lokalu", "nazwa kolu", "name", "lokal", "partner", "firma", "venue", "nazwa firmy", "title"],
  segment: ["typ partnera", "segment", "rodzaj partnera", "segment partnera", "partner type"],
  city: ["miasto", "city", "miejscowosc", "town"],
  address: [
    "adres",
    "address",
    "ulica",
    "street",
    "ul",
    "adres / lokalizacja",
    "adres lokalizacja",
    "lokalizacja",
    "adres / lokalizacja",
  ],
  category: ["kategoria", "category", "typ", "rodzaj", "branża", "branza"],
  subcategory: ["subkategoria", "subcategory", "podkategoria", "podtyp", "sub kategoria"],
  website: ["strona www", "strona", "www", "url", "website", "link", "strona internetowa"],
  instagram: ["instagram", "ig", "insta", "insta gram"],
  facebook: ["facebook", "fb", "fanpage"],
  socialOther: ["inne social", "social", "linkedin", "tiktok", "inne", "social media"],
  priority: ["priorytet", "priority"],
  priorityReason: [
    "uzasadnienie priorytetu",
    "uzasadnienie",
    "priority reason",
    "dlaczego",
    "uzasadnienie priorytetu",
  ],
  source: ["zrodlo", "źródło", "source", "skad", "lead source"],
  hours: ["godziny", "hours", "otwarcie", "godziny otwarcia", "opening hours"],
  capacity: ["pojemnosc", "pojemność", "capacity", "liczba miejsc", "ile osob"],
  notes: ["notatka", "notatki", "notes", "uwagi", "komentarz", "opis", "description"],
  legalName: ["nazwa firmy z rejestru", "nazwa prawna", "firma (rejestr)", "nazwa spolki", "nazwa spółki", "legal name", "spolka", "spółka"],
  nip: ["nip", "nip firmy", "vat", "vat id", "nr nip", "numer nip"],
  contactName: ["kontakt", "osoba", "imie", "nazwisko", "wlasciciel", "owner", "osoba kontaktowa", "imię i nazwisko"],
  contactRole: ["rola", "stanowisko", "role", "funkcja"],
  contactPhone: ["telefon", "phone", "tel", "komorka", "mobile", "nr telefonu", "numer telefonu"],
  contactEmail: ["email", "e mail", "mail", "adres email"],
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    // „ł” nie rozkłada się w NFD — bez tego „Właściciel” i „Społeczność” nie pasowały do aliasów.
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .replace(/e[\s-]?mail/g, "email")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function headerMatches(header: string, alias: string) {
  const h = fold(header);
  const a = fold(alias);
  if (!h || !a) return false;
  if (h === a) return true;
  const headerWords = h.split(" ").filter(Boolean);
  const aliasWords = a.split(" ").filter(Boolean);
  if (aliasWords.length > 1) {
    return aliasWords.every((word) => headerWords.includes(word));
  }
  if (a.length < 4) return false;
  return headerWords.some((word) => word === a || (a.length >= 5 && word.startsWith(a)));
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  // Bardziej szczegółowe pola najpierw: „Typ partnera” nie może zostać nazwą, a „Telefon właściciela”
  // osobą kontaktową (słowo „właściciel” to też alias osoby).
  const first: PartnerImportField[] = [
    "segment",
    "priorityReason",
    "subcategory",
    "website",
    "address",
    "contactPhone",
    "contactEmail",
    "capacity",
  ];
  const fields = [
    ...PARTNER_IMPORT_FIELDS.filter((field) => first.includes(field.key)),
    ...PARTNER_IMPORT_FIELDS.filter((field) => !first.includes(field.key)),
  ];

  for (const field of fields) {
    const aliases = ALIASES[field.key];
    const exact = headers.findIndex(
      (header, i) => !used.has(i) && aliases.some((alias) => fold(header) === fold(alias)),
    );
    const index =
      exact >= 0
        ? exact
        : headers.findIndex(
            (header, i) => !used.has(i) && aliases.some((alias) => headerMatches(header, alias)),
          );
    if (index >= 0) {
      mapping[field.key] = index;
      used.add(index);
    }
  }

  return mapping;
}

export function cell(row: string[], index: number | undefined) {
  if (index == null || index < 0) return "";
  return (row[index] ?? "").trim();
}

export function cityFromAddress(address: string) {
  const postal = address.match(/\d{2}-\d{3}\s+([^\d,]+)$/);
  if (postal?.[1]) return postal[1].trim();
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  if (parts.length >= 2 && last && !/\d/.test(last)) return last;
  return "";
}

/** „Społeczność”, „community”, „koło” → społeczność; „firma”, „company” → firma; „miejsce”, „lokal” → miejsce. */
export function parseSegment(value: string): PartnerSegment | null {
  const words = fold(value).split(" ").filter(Boolean);
  if (!words.length) return null;
  const has = (test: (word: string) => boolean) => words.some(test);
  if (has((w) => w.startsWith("spolecz") || w === "community" || w.startsWith("grup") || w === "kolo" || w.startsWith("stowarzysz"))) {
    return "community";
  }
  if (has((w) => w.startsWith("firm") || w === "company" || w.startsWith("pracodaw") || w.startsWith("zespol") || w === "b2b")) {
    return "company";
  }
  if (
    has(
      (w) =>
        w.startsWith("miejsc") ||
        w.startsWith("lokal") ||
        w === "venue" ||
        w.startsWith("kawiarn") ||
        w.startsWith("restaurac") ||
        w === "bar" ||
        w === "pub" ||
        w === "klub" ||
        w.startsWith("planszow") ||
        w.startsWith("przestrzen") ||
        w === "hotel",
    )
  ) {
    return "venue";
  }
  return null;
}

/** „ok. 40 osób” → 40. Poza zakresem 1–100 000 → `null`. */
export function parseCapacity(value: string): number | null {
  const digits = value.match(/\d+/)?.[0];
  if (!digits) return null;
  const n = Number(digits);
  return n >= 1 && n <= 100000 ? n : null;
}

export function rowToPartnerInput(
  row: string[],
  mapping: ColumnMapping,
  defaultSegment: PartnerSegment = "venue",
): NewPartnerInput | null {
  const name = cell(row, mapping.name);
  if (!name) return null;
  const segment = parseSegment(cell(row, mapping.segment)) ?? defaultSegment;

  const address = cell(row, mapping.address);
  const city = cell(row, mapping.city) || cityFromAddress(address);
  const contactPhone = cell(row, mapping.contactPhone);
  const contactEmail = cell(row, mapping.contactEmail);
  let contactName = cell(row, mapping.contactName);
  if (!contactName && (contactPhone || contactEmail)) contactName = "Kontakt";

  return {
    name,
    city,
    address,
    category: cell(row, mapping.category),
    subcategory: cell(row, mapping.subcategory),
    website: cell(row, mapping.website),
    instagram: cell(row, mapping.instagram),
    facebook: cell(row, mapping.facebook),
    socialOther: cell(row, mapping.socialOther),
    priority: normalizePartnerPriority(cell(row, mapping.priority)) || cell(row, mapping.priority),
    priorityReason: cell(row, mapping.priorityReason),
    source: cell(row, mapping.source) || "import z pliku",
    hours: cell(row, mapping.hours),
    notes: cell(row, mapping.notes),
    segment,
    capacity: segment === "venue" ? parseCapacity(cell(row, mapping.capacity)) : null,
    legalName: cell(row, mapping.legalName),
    nip: cell(row, mapping.nip),
    contactName,
    contactRole: cell(row, mapping.contactRole) || (contactName ? "kontakt" : ""),
    contactPhone,
    contactEmail,
    phoneConsent: "unknown",
    emailConsent: "unknown",
  };
}

export const SAMPLE_CSV = `Nazwa;Typ partnera;Miasto;Adres;Kategoria;Subkategoria;Pojemność;Priorytet;Uzasadnienie priorytetu;Strona www;Instagram;Facebook;Inne social;Telefon;E-mail
Kawiarnia Nova;miejsce;Kraków;ul. Długa 12, 31-147 Kraków;kawiarnia;specialty coffee;40;Wysoki;Puste środy po 16;https://nova.example;@kawiarnianova;facebook.com/nova;linkedin.com/company/nova;500100200;nova@example.com
Klub Planszówkowy Pionek;społeczność;Kraków;;grupa hobbystyczna;;;Średni;Spotkania co tydzień;;@pionek;;;;
`;
