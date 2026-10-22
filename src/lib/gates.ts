import { isIsoDate } from "./dates";
import { isValidNip } from "./company";
import { agreementFormOf, isShortTerm, LEGACY_CHANGE_RULES, termsChecks, type Check } from "./terms";
import { STAGES, type Mission, type Partner, type PartnerSegment, type StageId } from "./types";

export { isValidNip };

export function hasContactConsent(partner: Partner) {
  return partner.consents.some(
    (c) => c.purpose === "contact" && c.status === "granted",
  );
}

export function constraintText(mission: Mission) {
  const fromDecision = mission.decision.constraintSummary.trim();
  if (fromDecision) return fromDecision;
  const fromDiscovery = mission.discovery.constraints.map((item) => item.trim()).filter(Boolean).join(", ");
  if (fromDiscovery) return fromDiscovery;
  return mission.needs
    .filter((n) => n.confirmed && n.constraints?.trim())
    .map((n) => n.constraints!.trim())
    .join(", ");
}

/** Wymagania przed ofertą (KB → „Mapa potrzeb w CRM”). */
export function offerChecks(mission: Mission): Check[] {
  const d = mission.decision;
  return [
    { key: "problem", label: "problem", done: Boolean(d.problem.trim()) },
    { key: "result", label: "oczekiwany rezultat", done: Boolean(d.expectedResult.trim()) },
    { key: "constraint", label: "ograniczenie", done: Boolean(constraintText(mission)) },
    { key: "maker", label: "decydent", done: Boolean(d.decisionMakerId) },
    {
      key: "deadline",
      label: d.decisionDeadline.trim() && !isIsoDate(d.decisionDeadline) ? "termin decyzji jako data" : "termin decyzji",
      done: isIsoDate(d.decisionDeadline),
    },
    { key: "attempts", label: "wcześniejsze próby", done: Boolean(d.previousAttempts.trim()) },
    { key: "next", label: "następny krok", done: Boolean(d.nextStep.trim()) },
    {
      key: "fact",
      label: "potwierdzona potrzeba (fakt)",
      done: mission.needs.some((n) => n.status === "fact" && n.confirmed),
    },
  ];
}

export function missingOf(checks: Check[]) {
  return checks.filter((check) => !check.done).map((check) => check.label);
}

export function offerBlockers(mission: Mission) {
  return missingOf(offerChecks(mission));
}

const segmentOf = (partner?: Pick<Partner, "segment">): PartnerSegment => partner?.segment ?? "venue";

/** Zasady zmian i wycofania: wpisane i nie jest to stary domyślny tekst. */
function changeRulesSet(rules: string) {
  const text = rules.trim();
  return Boolean(text) && text !== LEGACY_CHANGE_RULES;
}

/**
 * Wymagania przed aktywacją po stronie umowy. Porozumienie mailowe (do 3 miesięcy): mail z warunkami
 * i potwierdzenie partnera. Umowa: dokument i podpisy obu stron.
 */
export function contractChecks(mission: Mission, partner?: Pick<Partner, "segment">): Check[] {
  const c = mission.contract;
  const segment = segmentOf(partner);
  const form = agreementFormOf(mission);
  const short = isShortTerm(c.startAt, c.endAt);
  // Warunki trafiają do porozumienia / umowy — muszą być kompletne także po zmianach w negocjacjach.
  const terms = termsChecks(mission, segment).filter((check) => check.key !== "period" && check.key !== "period_order");
  const checks: Check[] = [
    {
      key: "offer",
      label: "zatwierdzony wariant oferty",
      done: Boolean(mission.offerApproved && mission.selectedVariant),
    },
    ...terms,
    {
      key: "name",
      label: segment === "community" ? "nazwa organizacji" : "nazwa firmy",
      done: Boolean(c.companyName.trim()),
    },
    // Koło studenckie czy klub hobbystów zwykle nie mają NIP.
    ...(segment === "community" ? [] : [{ key: "nip", label: "poprawny NIP", done: isValidNip(c.nip) }]),
    { key: "start", label: "data rozpoczęcia", done: Boolean(c.startAt.trim()) },
    c.endAt.trim() && c.startAt.trim() && c.endAt < c.startAt
      ? { key: "end", label: "koniec okresu po starcie", done: false }
      : { key: "end", label: "data zakończenia", done: Boolean(c.endAt.trim()) },
    { key: "rules", label: "zasady zmian i wycofania (7 dni)", done: changeRulesSet(c.changeRules) },
    ...(segment === "company"
      ? []
      : [
          {
            key: "brand_app",
            label: "zgoda na nazwę i logo w aplikacji",
            done: Boolean(mission.checklist["contract:brand_app"]),
          },
        ]),
  ];
  if (form === "email") {
    checks.push(
      { key: "short", label: "okres do 3 miesięcy (porozumienie mailowe)", done: short === true },
      { key: "sent", label: "mail z warunkami wysłany", done: Boolean(c.sentAt) },
      { key: "partner", label: "potwierdzenie partnera mailem", done: Boolean(c.partnerSignedAt) },
      { key: "lutra", label: "zatwierdzenie Lutry", done: c.signedByHuman },
    );
  } else {
    checks.push(
      { key: "document", label: "dokument umowy", done: Boolean(c.documentPath) },
      { key: "partner", label: "podpis partnera", done: Boolean(c.partnerSignedAt) },
      { key: "lutra", label: "podpis Lutry", done: c.signedByHuman },
    );
  }
  return checks;
}

export function contractBlockers(mission: Mission, partner?: Pick<Partner, "segment">) {
  return missingOf(contractChecks(mission, partner));
}

/** Etykieta kontaktu „na miejscu” zależnie od typu partnera. */
export function opsContactLabel(segment: PartnerSegment) {
  return segment === "venue" ? "kontakt awaryjny" : segment === "community" ? "organizator (kontakt)" : "kontakt w firmie";
}

/**
 * Wymagania przed aktywacją (publikacją). Lokal: weryfikacja miejsca, zniżka i wdrożenie
 * (lokal w aplikacji, naklejka, testowa realizacja). Społeczność i firma: kontakt, start i przegląd.
 */
export function activationChecks(
  mission: Mission,
  partner?: Pick<Partner, "segment" | "address" | "capacity" | "hours">,
): Check[] {
  const a = mission.activation;
  const segment = segmentOf(partner);
  const contact = { key: "ops", label: opsContactLabel(segment), done: Boolean(a.opsContactName.trim() && a.opsContactPhone.trim()) };
  if (segment === "venue") {
    const discount = termsChecks(mission, "venue").filter((check) => check.key !== "period" && check.key !== "period_order");
    return [
      { key: "business", label: "działalność sprawdzona", done: Boolean(mission.checklist["activation:business"]) },
      { key: "address", label: "adres lokalu", done: Boolean(partner?.address?.trim()) },
      { key: "capacity", label: "pojemność miejsca", done: Boolean(partner?.capacity && partner.capacity > 0) },
      { key: "hours", label: "godziny potwierdzone", done: Boolean(partner?.hours?.trim()) && a.hoursConfirmed },
      contact,
      ...discount,
      { key: "code", label: "kod partnera", done: Boolean(a.partnerCode.trim()) },
      { key: "published", label: "lokal widoczny w aplikacji", done: Boolean(mission.checklist["activation:published"]) },
      { key: "sticker", label: "naklejka Lutry w lokalu", done: Boolean(mission.checklist["activation:sticker"]) },
      { key: "test", label: "testowa realizacja zniżki", done: a.testPassed && Boolean(a.testNotes?.trim()) },
      { key: "review", label: "data przeglądu po pierwszym cyklu", done: Boolean(a.checkInAt.trim()) },
    ];
  }
  if (segment === "community") {
    return [
      contact,
      { key: "published", label: "pierwsze wydarzenie cyklu w Lutrze", done: Boolean(mission.checklist["activation:published"]) },
      { key: "review", label: "data przeglądu po pierwszym cyklu", done: Boolean(a.checkInAt.trim()) },
    ];
  }
  return [
    contact,
    { key: "published", label: "zespół pilotażowy ma dostęp", done: Boolean(mission.checklist["activation:published"]) },
    { key: "review", label: "termin feedbacku z pilotażu", done: Boolean(a.checkInAt.trim()) },
  ];
}

export function activationBlockers(
  mission: Mission,
  partner?: Pick<Partner, "segment" | "address" | "capacity" | "hours">,
) {
  return missingOf(activationChecks(mission, partner));
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

  if (stage === "discovery" && !hasContactConsent(partner)) {
    return {
      ok: false,
      reason: "Zaznacz zgodę na kanał w kroku Kontakt.",
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
    const missing = contractBlockers(mission, partner);
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
