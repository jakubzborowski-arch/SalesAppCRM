import { contractStatus } from "./mission-core";
import { canEnterStage, nextStage, offerBlockers } from "./gates";
import { suggestVariant } from "./playbook";
import { agreementFormOf, changeRulesFor, isDefaultChangeRules, isShortTerm, termsChecks } from "./terms";
import type {
  AgreementForm,
  Channel,
  ConsentStatus,
  Mission,
  MissionTerms,
  Need,
  Partner,
  PartnerSegment,
} from "./types";

/**
 * Zmiany misji jako czyste funkcje. Akcje sklepu (updateDiscovery, upsertNeed, updateContract, approveOffer,
 * advance…) i szybka ścieżka po wizycie korzystają z tych samych funkcji — jedna logika, jeden zapis.
 */

export type GateResult = { ok: boolean; reason?: string };

export function syncDecisionFromDiscovery(mission: Mission): Mission {
  const d = mission.discovery;
  return {
    ...mission,
    decision: {
      ...mission.decision,
      problem: d.description || mission.decision.problem,
      constraintSummary: d.constraints.join(", ") || mission.decision.constraintSummary,
      decisionMakerId: d.decisionMakerId || mission.decision.decisionMakerId,
      decisionDeadline: d.decisionDeadline || mission.decision.decisionDeadline,
      previousAttempts: d.previousAttempts || mission.decision.previousAttempts,
    },
  };
}

export function withRecommended(mission: Mission, segment: PartnerSegment = "venue"): Mission {
  const cats = mission.needs.filter((n) => n.confirmed && n.status === "fact").map((n) => n.category);
  return { ...mission, recommendedVariant: suggestVariant(cats, segment) };
}

export function withDiscovery(mission: Mission, patch: Partial<Mission["discovery"]>): Mission {
  return syncDecisionFromDiscovery({ ...mission, discovery: { ...mission.discovery, ...patch } });
}

export function withDecision(mission: Mission, patch: Partial<Mission["decision"]>): Mission {
  return {
    ...mission,
    nextStepLabel: patch.nextStep !== undefined ? patch.nextStep : mission.nextStepLabel,
    decision: { ...mission.decision, ...patch },
  };
}

export function withNeed(mission: Mission, need: Need, segment: PartnerSegment): Mission {
  return withRecommended(
    {
      ...mission,
      needs: mission.needs.some((n) => n.id === need.id)
        ? mission.needs.map((n) => (n.id === need.id ? need : n))
        : [...mission.needs, need],
    },
    segment,
  );
}

export function withTerms<K extends keyof MissionTerms>(
  mission: Mission,
  section: K,
  patch: Partial<MissionTerms[K]>,
): Mission {
  return { ...mission, terms: { ...mission.terms, [section]: { ...mission.terms[section], ...patch } } };
}

/** Zmiana danych porozumienia / umowy: status, podpis Lutry, zasady zmian zgodne z okresem. */
export function withContract(mission: Mission, patch: Partial<Mission["contract"]>, segment: PartnerSegment): Mission {
  const m = mission;
  const form = agreementFormOf({ ...m, contract: { ...m.contract, ...patch } });
  // Umowę podpisuje się na dokumencie; porozumienie mailowe zatwierdza się bez PDF.
  if (patch.signedByHuman === true && form === "contract" && !m.contract.documentPath && !patch.documentPath) {
    return m;
  }
  const contract = { ...m.contract, ...patch };
  if (patch.signedByHuman === true) contract.signedAt = new Date().toISOString();
  if (patch.signedByHuman === false) contract.signedAt = undefined;
  // Okres ustalony, zasady puste albo gotowy wzór → zasady zgodne z okresem i typem partnera (7 dni).
  const datesChanged = patch.startAt !== undefined || patch.endAt !== undefined;
  const short = isShortTerm(contract.startAt, contract.endAt);
  if (datesChanged && short !== null && isDefaultChangeRules(contract.changeRules) && patch.changeRules === undefined) {
    contract.changeRules = changeRulesFor(short, segment);
  }
  contract.status = contractStatus(contract, agreementFormOf({ ...m, contract }));
  return { ...m, contract };
}

export function withAgreementForm(mission: Mission, form: AgreementForm): Mission {
  const next = { ...mission, agreementForm: form };
  return { ...next, contract: { ...mission.contract, status: contractStatus(mission.contract, agreementFormOf(next)) } };
}

export function withChecklistItem(mission: Mission, key: string, done: boolean): Mission {
  return Boolean(mission.checklist[key]) === done ? mission : { ...mission, checklist: { ...mission.checklist, [key]: done } };
}

/** Zgoda na kanał kontaktu na karcie partnera. */
export function withConsent(partner: Partner, channel: Channel, status: ConsentStatus): Partner {
  const exists = partner.consents.some((c) => c.channel === channel && c.purpose === "contact");
  const consents = exists
    ? partner.consents.map((c) => (c.channel === channel && c.purpose === "contact" ? { ...c, status } : c))
    : [...partner.consents, { channel, purpose: "contact" as const, status }];
  return { ...partner, consents };
}

/** Bramka zatwierdzenia wariantu: wariant, komplet rozmowy (wg typu partnera) i warunki. */
export function approveGate(mission: Mission, segment: PartnerSegment): GateResult {
  if (!mission.selectedVariant) return { ok: false, reason: "Wybierz wariant A, B albo C." };
  const missing = offerBlockers(mission, { segment });
  if (missing.length) return { ok: false, reason: `Brakuje: ${missing.join(", ")}.` };
  const terms = termsChecks(mission, segment).filter((check) => !check.done);
  if (terms.length) {
    return { ok: false, reason: `Ustal warunki: ${terms.map((check) => check.label).join(", ")}.` };
  }
  return { ok: true };
}

/** Bramka przejścia o krok dalej. Z rozmowy (Discovery) misja idzie od razu do oferty. */
export function advanceGate(mission: Mission, partner: Partner): GateResult {
  if (mission.status !== "active") return { ok: false, reason: "Misja jest zamknięta. Najpierw ją wznów." };
  const nxt = nextStage(mission.currentStage);
  if (!nxt) return { ok: true };
  if (mission.currentStage === "discovery") {
    const toNeeds = canEnterStage("needs", mission, partner);
    if (!toNeeds.ok) return toNeeds;
    const missing = offerBlockers(mission, partner);
    if (missing.length) return { ok: false, reason: `Brakuje: ${missing.join(", ")}.` };
    return { ok: true };
  }
  return canEnterStage(nxt, mission, partner);
}

/** Krok dalej (bez bramki — sprawdza ją `advanceGate`). Po aktywacji misja jest wygrana. */
export function stepForward(mission: Mission): Mission {
  const m = mission;
  const nxt = nextStage(m.currentStage);
  if (!nxt) {
    return {
      ...m,
      status: "won",
      outcome: "won",
      closedAt: m.closedAt ?? new Date().toISOString(),
      nextStepLabel: "Opieka: check-in 30 dni",
    };
  }
  if (m.currentStage === "discovery") {
    return {
      ...m,
      completedStages: [...new Set([...m.completedStages, "discovery" as const, "needs" as const])],
      currentStage: "offer",
    };
  }
  return {
    ...m,
    completedStages: m.completedStages.includes(m.currentStage) ? m.completedStages : [...m.completedStages, m.currentStage],
    currentStage: nxt,
  };
}
