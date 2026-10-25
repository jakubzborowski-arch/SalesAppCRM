import type { Consent, Partner } from "./types";

/**
 * Partner wie, że rozmowy są transkrybowane i analizowane przez AI (RODO: informacja o przetwarzaniu).
 * Zapis w zgodach partnera: cel „ai_analysis”, kanał „other”.
 */
export function aiNoticeGiven(partner: Pick<Partner, "consents">) {
  return partner.consents.some((c) => c.purpose === "ai_analysis" && c.status === "granted");
}

export function withAiNotice(partner: Pick<Partner, "consents">, informed: boolean): Consent[] {
  const rest = partner.consents.filter((c) => !(c.purpose === "ai_analysis" && c.channel === "other"));
  return [...rest, { channel: "other", purpose: "ai_analysis", status: informed ? "granted" : "withdrawn" }];
}

/** Zdanie, które handlowiec może powiedzieć albo dopisać do maila. */
export const AI_NOTICE_SCRIPT =
  "Robię notatki z rozmowy z pomocą narzędzia AI (transkrypcja i podsumowanie). Dane zostają u nas i służą tylko do przygotowania współpracy.";
