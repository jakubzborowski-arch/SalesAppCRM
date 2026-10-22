import type { Mission } from "./types";

/**
 * Misja, nad którą trwa opieka: najnowsza wygrana misja partnera. Ta sama reguła rządzi panelem opieki
 * i przypomnieniami w „Na dziś” — odnowienie w toku nie chowa opieki nad obecną współpracą.
 */
export function careMissionOf(missions: Mission[], partnerId: string): Mission | undefined {
  let best: Mission | undefined;
  for (const mission of missions) {
    if (mission.partnerId !== partnerId || mission.status !== "won") continue;
    const at = mission.startedAt ?? mission.closedAt ?? "";
    const bestAt = best ? (best.startedAt ?? best.closedAt ?? "") : "";
    if (!best || at > bestAt) best = mission;
  }
  return best;
}
