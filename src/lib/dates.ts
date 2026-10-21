function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Pełne dni kalendarzowe od daty do dziś. `null` dla pustej albo złej daty. */
export function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);
}

export function relativeDay(iso: string | null | undefined) {
  const days = daysSince(iso);
  if (days === null) return "";
  if (days <= 0) return "dziś";
  if (days === 1) return "wczoraj";
  return `${days} dni temu`;
}

/** „2026-11-12” — sama data, bez godziny. */
export function isIsoDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function toIsoDate(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function localDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Dni od dziś do daty (ujemne = minęła). `null`, gdy to nie jest data. */
export function daysUntil(iso: string | null | undefined, today = new Date()) {
  if (!iso || !isIsoDate(iso)) return null;
  return Math.round((startOfDay(localDate(iso)) - startOfDay(today)) / 86400000);
}

/** „12.11.2026” */
export function formatPlDate(iso: string) {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** „za 3 dni”, „jutro”, „dziś”, „2 dni temu”. */
export function relativeDeadline(iso: string | null | undefined, today = new Date()) {
  const days = daysUntil(iso, today);
  if (days === null) return "";
  if (days === 0) return "dziś";
  if (days === 1) return "jutro";
  if (days === -1) return "wczoraj";
  return days > 0 ? `za ${days} dni` : `${-days} dni temu`;
}

const WEEKDAYS: [RegExp, number][] = [
  [/^niedziel/, 0],
  [/^poniedzia/, 1],
  [/^wtor/, 2],
  [/^środ|^srod/, 3],
  [/^czwart/, 4],
  [/^piąt|^piat/, 5],
  [/^sobot/, 6],
];

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Termin decyzji z tekstu rozmowy albo starego pola tekstowego → data.
 * Rozumie daty (2026-11-12, 12.11.2026, 12.11, 12/11) i proste zwroty
 * („jutro”, „w czwartek”, „do końca tygodnia”, „za 2 tygodnie”, „koniec miesiąca”).
 * `null`, gdy nie da się ustalić dnia.
 */
export function parseDeadline(text: string | null | undefined, today = new Date()): string | null {
  if (!text) return null;
  const raw = text.trim();
  if (isIsoDate(raw)) return raw;
  const t = raw.toLowerCase().replace(/^(do|na|przed|najpóźniej)\s+/, "").replace(/[.,!]+$/, "").trim();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const full = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (full) {
    const iso = `${full[3]}-${full[2].padStart(2, "0")}-${full[1].padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  }
  const short = t.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (short) {
    const day = Number(short[1]);
    const month = Number(short[2]);
    let candidate = new Date(base.getFullYear(), month - 1, day);
    if (candidate.getMonth() !== month - 1) return null;
    if (candidate < base) candidate = new Date(base.getFullYear() + 1, month - 1, day);
    return toIsoDate(candidate);
  }

  // Data wpisana w środku zdania („czwartek 12.11”) wygrywa ze zwrotem.
  const embedded = t.match(/(?:^|\D)(\d{1,2}[./]\d{1,2}(?:[./]\d{4})?)(?:\D|$)/);
  if (embedded) return parseDeadline(embedded[1], today);

  if (/^(dziś|dzis|dzisiaj)$/.test(t)) return toIsoDate(base);
  if (/^jutr/.test(t)) return toIsoDate(addDays(base, 1));
  if (/^pojutrz/.test(t)) return toIsoDate(addDays(base, 2));

  const inDays = t.match(/^za\s+(\d+)\s+dn/);
  if (inDays) return toIsoDate(addDays(base, Number(inDays[1])));
  if (/^za\s+tydzień|^za\s+tydzien/.test(t)) return toIsoDate(addDays(base, 7));
  const inWeeks = t.match(/^za\s+(\d+)\s+tygod/);
  if (inWeeks) return toIsoDate(addDays(base, 7 * Number(inWeeks[1])));
  if (/^za\s+miesiąc|^za\s+miesiac/.test(t)) {
    return toIsoDate(new Date(base.getFullYear(), base.getMonth() + 1, base.getDate()));
  }

  if (/^(końca|konca|koniec)\s+tygodnia/.test(t)) {
    // Najbliższy piątek (w piątek — dziś; w weekend — piątek następnego tygodnia).
    return toIsoDate(addDays(base, (5 - base.getDay() + 7) % 7));
  }
  if (/^(końca|konca|koniec)\s+miesiąca|^(końca|konca|koniec)\s+miesiaca/.test(t)) {
    return toIsoDate(new Date(base.getFullYear(), base.getMonth() + 1, 0));
  }
  if (/^(przyszłego|przyszlego|następnego|nastepnego)\s+tygodnia|^przyszły tydzień|^przyszly tydzien/.test(t)) {
    // Poniedziałek następnego tygodnia.
    const diff = ((8 - base.getDay()) % 7) || 7;
    return toIsoDate(addDays(base, diff));
  }

  const nextWeek = /^(w\s+|we\s+)?(przyszł|przyszl|następn|nastepn)/.test(t);
  const day = t.replace(/^(w|we)\s+/, "").replace(/^(przyszł\S*|przyszl\S*|następn\S*|nastepn\S*)\s+/, "");
  // Sam dzień tygodnia — „czwartek jak szef wróci” to już nie jest pewny termin.
  if (/\s/.test(day)) return null;
  for (const [pattern, weekday] of WEEKDAYS) {
    if (pattern.test(day)) {
      if (nextWeek) {
        // „Przyszły wtorek” = wtorek w następnym tygodniu (od poniedziałku).
        const toMonday = ((8 - base.getDay()) % 7) || 7;
        return toIsoDate(addDays(base, toMonday + (weekday === 0 ? 6 : weekday - 1)));
      }
      return toIsoDate(addDays(base, (weekday - base.getDay() + 7) % 7 || 7));
    }
  }
  return null;
}

/** Czy tekst podaje konkretny dzień (a nie zwrot zależny od dnia, w którym go zapisano). */
export function hasExplicitDate(text: string) {
  return /\d{1,2}[./-]\d{1,2}/.test(text) || isIsoDate(text.trim());
}

/** Data za `days` dni od dziś jako „RRRR-MM-DD”. */
export function addDaysIso(days: number, today = new Date()) {
  return toIsoDate(addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), days));
}
