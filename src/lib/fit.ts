import type { AppState, FitLevel, Mission, Partner, PartnerFit } from "./types";

export const FIT_MAX = 6;

export type FitKey = keyof PartnerFit;

/** Trzy kryteria dopasowania lokalu, każde 0–2. */
export const FIT_CRITERIA: { key: FitKey; label: string; options: [string, string, string] }[] = [
  { key: "deadHours", label: "Martwe godziny", options: ["nie ma", "trochę", "wyraźne puste godziny"] },
  { key: "capacity", label: "Pojemność dla grup", options: ["poniżej 6 osób", "6–15 osób", "16+ albo osobna sala"] },
  { key: "area", label: "Dzielnica blisko użytkowników Lutry", options: ["daleko", "średnio", "w centrum aktywności"] },
];

export function emptyFit(): PartnerFit {
  return { deadHours: null, capacity: null, area: null };
}

/** Wartość z bazy albo z przeglądarki → 0/1/2 albo `null`. */
export function fitLevel(value: unknown): FitLevel | null {
  return value === 0 || value === 1 || value === 2 ? value : null;
}

export function fitOf(partner: Pick<Partner, "fit">): PartnerFit {
  const fit = partner.fit;
  if (!fit) return emptyFit();
  return { deadHours: fitLevel(fit.deadHours), capacity: fitLevel(fit.capacity), area: fitLevel(fit.area) };
}

/** Suma ocenionych kryteriów (0–6) i ile kryteriów oceniono. `score` = null, gdy nic nie oceniono. */
export function fitScore(partner: Pick<Partner, "fit">): { score: number | null; rated: number } {
  const fit = fitOf(partner);
  const values = [fit.deadHours, fit.capacity, fit.area].filter((v): v is FitLevel => v !== null);
  return { score: values.length ? values.reduce<number>((sum, v) => sum + v, 0) : null, rated: values.length };
}

/** Podpowiedź pojemności dla grup z pojemności lokalu (osób): <6 → 0, 6–15 → 1, 16+ → 2. */
export function suggestFitCapacity(capacity: number | null | undefined): FitLevel | null {
  if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity <= 0) return null;
  if (capacity < 6) return 0;
  if (capacity <= 15) return 1;
  return 2;
}

/** „Dopasowanie 5/6” (z dopiskiem, gdy nie wszystkie kryteria ocenione). */
export function fitLabel(partner: Pick<Partner, "fit">) {
  const { score, rated } = fitScore(partner);
  if (score === null) return "Dopasowanie: nieocenione";
  return `Dopasowanie ${score}/${FIT_MAX}${rated < FIT_CRITERIA.length ? ` (${rated} z ${FIT_CRITERIA.length})` : ""}`;
}

/** Klucz sortowania: wyższy wynik pierwszy, nieocenione na końcu. */
export function fitRank(partner: Pick<Partner, "fit" | "segment"> | undefined) {
  if (!partner || partner.segment !== "venue") return -1;
  return fitScore(partner).score ?? -1;
}

export type PartnerSort = "added" | "name" | "fit";

/** Kolejność listy partnerów: jak w bazie (dodanie), po nazwie albo po dopasowaniu lokalu (nieocenione na końcu). */
export function sortPartners<T extends Pick<Partner, "name" | "fit" | "segment">>(partners: T[], sort: PartnerSort): T[] {
  if (sort === "added") return partners;
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "pl");
  if (sort === "name") return [...partners].sort(byName);
  return [...partners].sort((a, b) => fitRank(b) - fitRank(a) || byName(a, b));
}

/**
 * Najpilniejsza misja w toku: najwcześniejszy następny krok (jak dotąd),
 * przy tej samej dacie — lokal z wyższym wynikiem dopasowania.
 */
export function pickUrgentMission(
  state: Pick<AppState, "missions" | "partners">,
): { partner: Partner; mission: Mission } | undefined {
  const partners = new Map(state.partners.map((p) => [p.id, p]));
  const mission = state.missions
    .filter((m) => m.status === "active" && partners.has(m.partnerId))
    .sort(
      (a, b) =>
        a.nextStepAt.localeCompare(b.nextStepAt) ||
        fitRank(partners.get(b.partnerId)) - fitRank(partners.get(a.partnerId)),
    )[0];
  if (!mission) return undefined;
  return { partner: partners.get(mission.partnerId)!, mission };
}
