/** Małe litery bez polskich znaków („Łódź” → „lodz”) — do porównań nazw i zdań. */
export function fold(value: string) {
  return value
    .toLocaleLowerCase("pl")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
