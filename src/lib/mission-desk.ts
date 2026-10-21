import { activationBlockers, contractBlockers, offerBlockers } from "./gates";
import { offerName, suggestVariant } from "./playbook";
import type { Mission, Partner } from "./types";

/** Co już wiemy w misji: fakty, blokery bramki, ostatni transkrypt. Liczone lokalnie. */
export function missionDesk(partner: Partner, mission: Mission) {
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
