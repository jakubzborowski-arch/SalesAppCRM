import { STAGES, type Mission, type Partner, type StageId } from "./types";

export function isValidNip(nip: string) {
  return nip.replace(/\D/g, "").length === 10;
}

export function hasContactConsent(partner: Partner) {
  return partner.consents.some(
    (c) => c.purpose === "contact" && c.status === "granted",
  );
}

export function offerBlockers(mission: Mission) {
  const d = mission.decision;
  const missing: string[] = [];
  if (!d.problem.trim()) missing.push("problem");
  if (!d.expectedResult.trim()) missing.push("oczekiwany rezultat");
  if (!d.constraintSummary.trim()) missing.push("ograniczenie");
  if (!d.decisionMakerId) missing.push("decydent");
  if (!d.decisionDeadline.trim()) missing.push("termin decyzji");
  if (!d.previousAttempts.trim()) missing.push("wcześniejsze próby");
  if (!d.nextStep.trim()) missing.push("następny krok");
  const confirmedNeed = mission.needs.some((n) => n.status === "fact" && n.confirmed);
  if (!confirmedNeed) missing.push("potwierdzona potrzeba (fakt)");
  return missing;
}

export function contractBlockers(mission: Mission) {
  const c = mission.contract;
  const missing: string[] = [];
  if (!mission.offerApproved || !mission.selectedVariant) missing.push("zatwierdzony wariant oferty");
  if (!c.companyName.trim()) missing.push("nazwa firmy");
  if (!isValidNip(c.nip)) missing.push("NIP (10 cyfr)");
  if (!c.startAt.trim()) missing.push("data rozpoczęcia");
  if (!c.endAt.trim()) missing.push("data zakończenia");
  if (!c.documentPath) missing.push("PDF umowy");
  if (!c.signedByHuman) missing.push("podpis handlowca");
  return missing;
}

export function activationBlockers(mission: Mission) {
  const a = mission.activation;
  const missing: string[] = [];
  if (!a.partnerCode.trim()) missing.push("kod partnera");
  if (!a.hoursConfirmed) missing.push("potwierdzone godziny i limity");
  if (!a.testPassed) missing.push("test oferty w Lutrze");
  if (!a.testNotes?.trim()) missing.push("opis testu w Lutrze");
  if (!a.opsContactName.trim()) missing.push("kontakt operacyjny");
  if (!a.checkInAt.trim()) missing.push("data check-inu");
  return missing;
}

export function canEnterStage(
  stage: StageId,
  mission: Mission,
  partner: Partner,
): { ok: boolean; reason?: string } {
  const index = STAGES.findIndex((s) => s.id === stage);
  const current = STAGES.findIndex((s) => s.id === mission.currentStage);

  if (index <= current || mission.completedStages.includes(stage)) return { ok: true };

  if (index > current + 1) {
    return { ok: false, reason: "Najpierw domknij poprzedni krok." };
  }

  if (index >= 1 && partner.dnc) {
    return { ok: false, reason: "Status „nie kontaktować” blokuje kanał." };
  }

  if (stage === "contact" && !hasContactConsent(partner)) {
    return {
      ok: false,
      reason: "Brak zgody na kontakt w żadnym kanale.",
    };
  }

  if (stage === "offer") {
    const missing = offerBlockers(mission);
    if (missing.length) {
      return {
        ok: false,
        reason: `Brakuje: ${missing.join(", ")}.`,
      };
    }
  }

  if (stage === "negotiation" && !mission.offerApproved) {
    return { ok: false, reason: "Zatwierdź wariant oferty, zanim przejdziesz dalej." };
  }

  if (stage === "contract" && !mission.offerApproved) {
    return { ok: false, reason: "Umowa idzie dopiero po zatwierdzonym wariancie." };
  }

  if (stage === "activation") {
    const missing = contractBlockers(mission);
    if (missing.length) {
      return {
        ok: false,
        reason: `Umowa nie jest gotowa: ${missing.join(", ")}.`,
      };
    }
  }

  return { ok: true };
}

export function nextStage(stage: StageId): StageId | null {
  const index = STAGES.findIndex((s) => s.id === stage);
  return STAGES[index + 1]?.id ?? null;
}
