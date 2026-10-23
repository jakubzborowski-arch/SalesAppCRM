// Ograniczone długości: bez nich długi ciąg liter albo cyfr (np. wklejony śmieć) mieli regex w nieskończoność.
const EMAIL = /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]{1,64}@[A-Z0-9-]{1,63}(?:\.[A-Z0-9-]{1,63}){0,8}\.[A-Z]{2,24}/gi;
const PHONE = /(?:\+|00)?\d[\d\s().-]{7,20}\d/g;
/** Daty wyglądają jak numer („21.10.2026 16”), ale nie są danymi osobowymi. */
const DATES = /(?<!\d)\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})(?!\d)|(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g;

/** Zdejmuje telefon, mail i NIP. Zostawia daty, godziny i krótkie liczby z faktów. */
export function redactPrivate(text: string) {
  return text
    .replace(EMAIL, "[usunieto]")
    .replace(PHONE, (match) => (match.replace(DATES, " ").replace(/\D/g, "").length >= 9 ? "[usunieto]" : match))
    .replace(/\b\d{10}\b/g, "[usunieto]")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
