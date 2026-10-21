import { ACTIVATION_ITEMS, CONTRACT_ITEMS, RESEARCH_ITEMS } from "./playbook";
import type { CallRecord, Mission, Need, Partner } from "./types";

export const SKILL_SMOKE_TRANSCRIPT = `A: Dzień dobry, tu Kuba z Lutry. Czy 15 minut na discovery będzie w porządku?
B: Jasne, mów.
A: Które dni albo godziny są u Państwa najsłabsze?
B: Środy po 16. jest pusto. Weekend i tak mamy pełno, tego nie ruszamy.
A: Jaka wielkość grupy jest dla Was opłacalna?
B: Od sześciu osób zaczyna się to liczyć. Cztery osoby to nam się nie spina.
A: Co z zniżką — jest jakiś próg, którego nie chcecie przekraczać?
B: Zniżka mi się nie opłaca w szczycie. Po 16. w środę mogę dać 10 procent, ale bez alkoholu i bez weekendów.
A: Co nie zadziałało w poprzednich promocjach?
B: Robiliśmy happy hour na Instagramie i przyszło pięć osób, a i tak pytali o rabat w sobotę.
A: Po czym za trzy miesiące poznacie, że to ma sens?
B: Jak w te puste środy będzie regularnie choć jedna grupa, nie jednorazowy cyrk.
A: Decyzję podejmuje Pani, czy ktoś jeszcze?
B: Ja. Jestem właścicielką, nie muszę nikogo pytać.
A: Kiedy moglibyśmy wrócić z wariantem?
B: Nie wiem jeszcze. Najpierw chcę zobaczyć, co dokładnie proponujecie na piśmie.
A: To ja w czwartek o 10. wrzucam recap mailem i umawiamy 15 minut na warianty. Pasuje?
B: Czwartek o 10. ok, wyślij maila.`;

export function isSkillDemoPartner(name: string) {
  return name.trim().toLowerCase() === "test";
}

/** Smoke test dopisuje przykładowe dane (kontakt, zgodę, transkrypt). Tylko gdy włączony flagą. */
export function skillSmokeEnabled() {
  return process.env.NEXT_PUBLIC_SKILL_SMOKE === "1";
}

export function skillSmokeNeeds(): Need[] {
  return [
    {
      id: crypto.randomUUID(),
      category: "off_peak",
      title: "Puste środy po 16:00",
      description: "Najsłabszy moment to środy po 16. Weekend pełny — nie ruszać.",
      priority: 4,
      quote: "Środy po 16. jest pusto. Weekend i tak mamy pełno, tego nie ruszamy.",
      expectedResult: "Regularna grupa w puste środy, nie jednorazowa akcja.",
      constraints: "Bez weekendu",
      status: "fact",
      confirmed: true,
    },
    {
      id: crypto.randomUUID(),
      category: "margin",
      title: "Zniżka tylko poza szczytem",
      description: "W szczycie zniżka się nie opłaca. Środa po 16. max 10%, bez alkoholu.",
      priority: 4,
      quote: "Zniżka mi się nie opłaca w szczycie. Po 16. w środę mogę dać 10 procent, ale bez alkoholu i bez weekendów.",
      constraints: "Bez alkoholu, max 10%, min. 6 osób",
      status: "observation",
      confirmed: false,
    },
    {
      id: crypto.randomUUID(),
      category: "attendance",
      title: "Grupa od 6 osób",
      description: "Cztery osoby się nie spinają. Od sześciu zaczyna się liczyć.",
      priority: 3,
      quote: "Od sześciu osób zaczyna się to liczyć. Cztery osoby to nam się nie spina.",
      status: "observation",
      confirmed: false,
    },
    {
      id: crypto.randomUUID(),
      category: "off_peak",
      title: "Hipoteza: pilotaż środa 16–19",
      description:
        "AI: pilotaż ograniczony do środy 16:00–19:00 i min. 6 osób przejdzie łatwiej niż stała zniżka. Do potwierdzenia.",
      priority: 4,
      status: "ai_hypothesis",
      confirmed: false,
    },
  ];
}

export function skillSmokeFullMission(
  mission: Mission,
  partner: Partner,
  input: { contactId?: string; call: CallRecord },
): Mission {
  const contactId = input.contactId || mission.decision.decisionMakerId || "";
  const needs = skillSmokeNeeds();
  const owner =
    partner.contacts.find((c) => c.id === contactId)?.name ??
    partner.contacts.find((c) => c.isDecisionMaker)?.name ??
    "Anna Kowalska";

  return {
    ...mission,
    selectedChannel: "phone",
    conversationNote: "Smoke test — pełna misja Test od researchu do aktywacji. Umowa i PDF są fikcyjne.",
    nextStepLabel: "Check-in 30 dni po starcie pilotażu",
    nextStepAt: "2026-11-10",
    recordingConsent: "denied",
    disclosureShown: true,
    calls: [input.call, ...(mission.calls ?? []).filter((item) => item.id !== input.call.id)],
    checklist: {
      ...mission.checklist,
      ...Object.fromEntries(RESEARCH_ITEMS.map((item) => [`research:${item.key}`, true])),
      ...Object.fromEntries(CONTRACT_ITEMS.map((item) => [`contract:${item.key}`, true])),
      ...Object.fromEntries(ACTIVATION_ITEMS.map((item) => [`activation:${item.key}`, true])),
    },
    discovery: {
      ...mission.discovery,
      category: "off_peak",
      categorySource: "ai",
      priority: 4,
      description: "Puste środy po 16:00. Weekend pełny — nie ruszać.",
      quote: "Środy po 16. jest pusto. Weekend i tak mamy pełno, tego nie ruszamy.",
      decisionMakerId: contactId,
      decisionDeadline: "2026-10-10",
      previousAttempts: "Happy hour na IG — słaby ruch i presja na rabat w sobotę.",
      constraints: ["Bez weekendu", "Bez alkoholu", "Max 10% poza szczytem", "Min. 6 osób"],
    },
    decision: {
      problem: "Puste środy po 16:00",
      expectedResult: "Regularna grupa w te środy, nie jednorazowa akcja",
      constraintSummary: "Bez weekendu, bez alkoholu, max 10% tylko środa po 16., min. 6 osób",
      decisionMakerId: contactId,
      decisionDeadline: "2026-10-10",
      previousAttempts: "Happy hour na IG — słaby ruch i presja na rabat w sobotę",
      nextStep: "Recap mailem + 15 min na warianty, czwartek 10:00",
    },
    needs,
    recommendedVariant: "A",
    selectedVariant: "A",
    offerApproved: true,
    offerSentAt: mission.offerSentAt ?? new Date().toISOString(),
    objections: mission.objections.map((item) =>
      item.key === "margin" || item.key === "ask_owner"
        ? { ...item, checked: true, argumentWorked: item.key === "margin" }
        : item,
    ),
    contract: {
      companyName: partner.name || "Test",
      nip: "5252341138",
      address: partner.address || partner.city || "Kraków",
      startAt: "2026-10-13",
      endAt: "2027-01-13",
      changeRules: "Zmiany tylko pisemnie. Potwierdzenie kwartalne. Smoke — nie wysyłać do partnera.",
      documentPath: mission.contract.documentPath || `smoke/${mission.id}.pdf`,
      signedByHuman: true,
      signedAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      partnerSignedAt: new Date().toISOString(),
      status: "signed",
    },
    activation: {
      partnerCode: mission.activation.partnerCode.trim() || `LUTRA-TEST-${mission.id.slice(0, 4).toUpperCase()}`,
      hoursConfirmed: true,
      opsContactName: owner,
      opsContactPhone: partner.contacts.find((c) => c.id === contactId)?.phone || "500100200",
      testPassed: true,
      testNotes: "Smoke: jeden testowy booking środa 16–19, min. 6 osób, bez alkoholu.",
      checkInAt: "2026-11-10",
    },
    currentStage: "activation",
    completedStages: [
      "research",
      "contact",
      "discovery",
      "needs",
      "offer",
      "negotiation",
      "contract",
    ],
  };
}
