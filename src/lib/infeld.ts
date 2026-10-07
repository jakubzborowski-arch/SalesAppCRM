import { activationBlockers, contractBlockers, offerBlockers } from "./gates";
import { offerName, suggestVariant } from "./playbook";
import type { Mission, Partner } from "./types";

export function infeldDesk(partner: Partner, mission: Mission) {
  const facts = mission.needs.filter((n) => n.confirmed && n.status === "fact");
  const observations = mission.needs.filter((n) => !n.confirmed);
  const recommended = suggestVariant(facts.map((n) => n.category));
  const offer = { variant: recommended, name: offerName(recommended) };
  const selected = mission.selectedVariant
    ? { variant: mission.selectedVariant, name: offerName(mission.selectedVariant) }
    : null;
  const readyCalls = (mission.calls ?? []).filter((c) => c.transcriptStatus === "ready" && c.transcriptText?.trim());
  const latestTranscript = readyCalls[0]?.transcriptText?.trim() ?? "";

  const blockers =
    mission.currentStage === "contract"
      ? contractBlockers(mission)
      : mission.currentStage === "activation"
        ? activationBlockers(mission)
        : offerBlockers(mission);

  const owner =
    partner.contacts.find((c) => c.id === mission.decision.decisionMakerId)?.name ??
    partner.contacts.find((c) => c.isDecisionMaker)?.name ??
    null;

  return {
    facts,
    observations,
    recommended,
    offer,
    selected,
    blockers,
    latestTranscript,
    owner,
    forbidden: [] as string[],
    nextStep: [mission.nextStepLabel, mission.nextStepAt].filter(Boolean).join(" · "),
  };
}

export function partnerFirstName(partner: Partner, mission: Mission) {
  const named =
    partner.contacts.find((c) => c.id === mission.decision.decisionMakerId)?.name ??
    partner.contacts.find((c) => c.isDecisionMaker)?.name ??
    partner.contacts[0]?.name ??
    "";
  const first = named.trim().split(/\s+/)[0];
  return first || "Partner";
}

export function factDraftPrompt(transcript: string) {
  return `Jesteś asystentem CRM Lutry (sprzedaż partnerska do lokali). To transkrypt z etykietami mówców (Handlowiec / imię partnera). Nie zatwierdzasz faktów — tylko hipotezy do recenzji człowieka.

Z transkryptu wypisz:
- problem
- oczekiwany rezultat
- ograniczenia i warunki
- decydent (jeśli padło)
- termin decyzji
- wcześniejsze próby
- cytaty TYLKO z kwestii partnera
- obiekcje (jeśli pasują do: inne aplikacje, ile osób, marża, brak czasu, zapytam właściciela, wróćcie później)

Zakaz: liczby klientów, rabaty, wyłączność, Premium, emocje, oferta spoza A/B/C. Jeśli czegoś nie ma w tekście, napisz „brak”.

Transkrypt:
${transcript.trim()}`;
}
