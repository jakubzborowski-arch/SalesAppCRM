export const PARTNER_PRIORITIES = ["Wysoki", "Średni", "Niski"] as const;
export type PartnerPriority = (typeof PARTNER_PRIORITIES)[number];

const PRIORITY_DB_VALUES: Record<PartnerPriority, string[]> = {
  Wysoki: ["high", "wysoki", "Wysoki"],
  Średni: ["medium", "sredni", "średni", "Średni"],
  Niski: ["low", "niski", "Niski"],
};

export function normalizePartnerPriority(raw: string): PartnerPriority | "" {
  const fold = raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  if (!fold) return "";
  if (fold.startsWith("wysok") || fold === "high" || fold === "a") return "Wysoki";
  if (fold.startsWith("sred") || fold === "medium" || fold === "mid" || fold === "b") return "Średni";
  if (fold.startsWith("nisk") || fold === "low" || fold === "c") return "Niski";
  return "";
}

export function priorityForDb(raw: string, tried: string[] = []) {
  const label = normalizePartnerPriority(raw);
  if (!label) return "";
  return PRIORITY_DB_VALUES[label].find((value) => !tried.includes(value)) ?? "";
}

export function nextPriorityForDb(raw: string, rejected: string) {
  return priorityForDb(raw, [rejected]);
}
