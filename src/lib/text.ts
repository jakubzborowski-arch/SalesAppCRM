/** Małe litery bez polskich znaków („Łódź” → „lodz”) — do porównań nazw i zdań. */
export function fold(value: string) {
  return value
    .toLocaleLowerCase("pl")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Polska odmiana po liczbie: 1 wydarzenie, 2 wydarzenia, 5 wydarzeń (bez liczby w wyniku). */
export function plural(n: number, one: string, few: string, many: string) {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const tens = abs % 100;
  const units = abs % 10;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}
