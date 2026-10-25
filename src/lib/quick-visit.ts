import { addDaysIso, formatPlDate, isIsoDate, toIsoDate } from "./dates";
import { constraintText } from "./gates";
import {
  advanceGate,
  approveGate,
  stepForward,
  withAgreementForm,
  withChecklistItem,
  withConsent,
  withContract,
  withDecision,
  withDiscovery,
  withNeed,
  withTerms,
  type GateResult,
} from "./mission-ops";
import { suggestVariant } from "./playbook";
import { defaultAgreementForm, periodEndIso, SHORT_TERM_MONTHS, WEEKDAYS } from "./terms";
import {
  STAGES,
  type DiscountTerms,
  type Mission,
  type NeedCategory,
  type Partner,
  type SpaceTerms,
  type StageId,
} from "./types";

/**
 * Szybka ścieżka po wizycie w lokalu: jeden formularz domyka Kontakt, Discovery, Ofertę i Negocjacje
 * i przenosi misję do kroku Umowa — tymi samymi zmianami i bramkami co kroki misji.
 */

export const QUICK_VISIT_SUBJECT = "Wizyta — szybka ścieżka";

/** Kroki, na których przycisk „Szybka wizyta” ma sens. */
export const QUICK_VISIT_STAGES: StageId[] = ["contact", "discovery", "needs", "offer", "negotiation"];

export type QuickVisitInput = {
  /** Dzień wizyty (RRRR-MM-DD). */
  visitDate: string;
  problem: string;
  category: NeedCategory | "";
  quote: string;
  /** Istniejąca osoba z karty partnera; puste = nowa osoba z `makerName` i `makerRole`. */
  makerId: string;
  makerName: string;
  makerRole: string;
  discount: DiscountTerms;
  space: SpaceTerms;
  startAt: string;
  endAt: string;
  brandConsent: boolean;
  note: string;
};

export type QuickVisitField =
  | "visitDate"
  | "problem"
  | "category"
  | "maker"
  | "discount"
  | "hours"
  | "redemption"
  | "password"
  | "space"
  | "period";

export type QuickVisitErrors = Partial<Record<QuickVisitField, string>>;

export type QuickVisitResult = GateResult & { errors?: QuickVisitErrors };

export function quickVisitAvailable(mission: Pick<Mission, "status" | "currentStage">, partner: Pick<Partner, "segment" | "dnc">) {
  return (
    partner.segment === "venue" &&
    !partner.dnc &&
    mission.status === "active" &&
    QUICK_VISIT_STAGES.includes(mission.currentStage)
  );
}

/** Proponowany okres: od najbliższego poniedziałku na 3 miesiące (porozumienie mailowe). */
export function defaultQuickPeriod(today = new Date()) {
  const delta = (8 - today.getDay()) % 7 || 7;
  const startAt = addDaysIso(delta, today);
  return { startAt, endAt: periodEndIso(startAt, SHORT_TERM_MONTHS) };
}

function hoursOrderError(from: string, to: string) {
  return from && to && to <= from ? "Godzina „do” musi być po „od”." : "";
}

/** Walidacja formularza — komunikaty pod polami. */
export function quickVisitErrors(input: QuickVisitInput, today = new Date()): QuickVisitErrors {
  const errors: QuickVisitErrors = {};
  const todayIso = toIsoDate(today);
  if (!isIsoDate(input.visitDate)) errors.visitDate = "Podaj datę wizyty.";
  else if (input.visitDate > todayIso) errors.visitDate = "Wizyta nie może być w przyszłości.";
  if (!input.problem.trim()) errors.problem = "Wpisz jednym zdaniem, co partnerowi nie działa.";
  if (!input.category) errors.category = "Wybierz kategorię — potwierdzony fakt musi ją mieć.";
  if (!input.makerId && !input.makerName.trim()) errors.maker = "Wybierz decydenta albo wpisz imię i nazwisko.";
  const d = input.discount;
  if (d.kind === "percent") {
    if (!d.percent || d.percent < 1 || d.percent > 100) errors.discount = "Podaj rabat od 1 do 100%.";
  } else if (!d.freebie.trim()) {
    errors.discount = "Wpisz, co gość dostaje gratis.";
  }
  const hours = hoursOrderError(d.hoursFrom, d.hoursTo);
  if (hours) errors.hours = hours;
  if (!d.redemption) errors.redemption = "Wybierz, jak gość realizuje zniżkę.";
  else if (d.redemption === "password" && !d.password.trim()) errors.password = "Wpisz hasło dla obsługi.";
  if (input.space.offered) {
    const space = hoursOrderError(input.space.hoursFrom, input.space.hoursTo);
    if (space) errors.space = space;
  }
  if (!isIsoDate(input.startAt) || !isIsoDate(input.endAt)) errors.period = "Ustaw obie daty okresu.";
  else if (input.endAt < input.startAt) errors.period = "Koniec okresu musi być po początku.";
  return errors;
}

/** Ograniczenie do bramki oferty z warunków zniżki (dni, godziny, grupa, wyłączenia). */
export function constraintFromDiscount(d: DiscountTerms) {
  const order = WEEKDAYS.map((w) => w.id);
  const days =
    d.days.length && d.days.length < 7
      ? [...d.days]
          .sort((a, b) => order.indexOf(a) - order.indexOf(b))
          .map((day) => WEEKDAYS.find((w) => w.id === day)?.short ?? day)
          .join(", ")
      : "";
  const hours = d.hoursFrom && d.hoursTo ? `${d.hoursFrom}–${d.hoursTo}` : d.hoursFrom ? `od ${d.hoursFrom}` : d.hoursTo ? `do ${d.hoursTo}` : "";
  const parts = [
    [days, hours].filter(Boolean).join(" "),
    d.minGroup && d.minGroup > 1 ? `od ${d.minGroup} osób` : "",
    d.exclusions.trim() ? `bez: ${d.exclusions.trim()}` : "",
  ].filter(Boolean);
  return parts.length ? `Zniżka: ${parts.join(", ")}` : "Zniżka bez dodatkowych ograniczeń";
}

/** Notatka z wizyty dopisana pod wspólną notatką misji. */
export function appendVisitNote(current: string, visitDate: string, note: string) {
  const text = note.trim();
  if (!text) return current;
  const entry = `Wizyta ${formatPlDate(visitDate)}: ${text}`;
  return current.trim() ? `${current.trimEnd()}\n\n${entry}` : entry;
}

/** Zgoda na kontakt osobisty po wizycie — chyba że partner wcześniej odmówił. */
export function partnerAfterVisit(partner: Partner): Partner {
  const current = partner.consents.find((c) => c.channel === "in_person" && c.purpose === "contact");
  if (current?.status === "granted" || current?.status === "denied" || current?.status === "withdrawn") return partner;
  return withConsent(partner, "in_person", "granted");
}

export function nextStepAfterVisit(input: Pick<QuickVisitInput, "startAt" | "endAt">) {
  return defaultAgreementForm(input) === "email" ? "Wyślij porozumienie mailowe z warunkami" : "Przygotuj umowę do podpisu";
}

/**
 * Zmiany z formularza na misji, a potem kroki do Umowy przez te same bramki co w misji.
 * Zwraca misję po zmianach albo powód (z listą braków), na którym kroku stanęło.
 */
export function applyQuickVisit(
  mission: Mission,
  partner: Partner,
  input: QuickVisitInput,
  opts: { makerId: string; needId: string; today: string },
): { ok: true; mission: Mission } | { ok: false; reason: string; stage: StageId } {
  const segment = partner.segment;
  const problem = input.problem.trim();
  const quote = input.quote.trim();
  let m: Mission = { ...mission, selectedChannel: "in_person" };

  m = withDiscovery(m, {
    description: problem,
    quote,
    category: input.category,
    categorySource: "human",
    decisionMakerId: opts.makerId,
  });
  if (!constraintText(m)) m = withDecision(m, { constraintSummary: constraintFromDiscount(input.discount) });
  m = withDecision(m, { nextStep: nextStepAfterVisit(input) });
  m = { ...m, nextStepAt: opts.today };

  const category = input.category as NeedCategory;
  const existing = m.needs.find((need) => need.description === problem);
  m = withNeed(
    m,
    {
      id: existing?.id ?? opts.needId,
      category,
      title: (problem || quote).slice(0, 120),
      description: problem,
      priority: m.discovery.priority || null,
      quote: quote || undefined,
      expectedResult: m.decision.expectedResult.trim() || undefined,
      constraints: constraintText(m) || undefined,
      status: "fact",
      confirmed: true,
    },
    segment,
  );

  m = withTerms(m, "discount", input.discount);
  m = withTerms(m, "space", input.space);
  m = withContract(m, { startAt: input.startAt, endAt: input.endAt }, segment);
  m = withAgreementForm(m, defaultAgreementForm(input));
  if (input.brandConsent) m = withChecklistItem(m, "contract:brand_app", true);
  m = { ...m, conversationNote: appendVisitNote(m.conversationNote, input.visitDate, input.note) };

  const index = (stage: StageId) => STAGES.findIndex((s) => s.id === stage);
  const goTo = (target: StageId): { ok: true } | { ok: false; reason: string; stage: StageId } => {
    while (index(m.currentStage) < index(target)) {
      const gate = advanceGate(m, partner);
      if (!gate.ok) return { ok: false, reason: gate.reason ?? "Bramka blokuje przejście.", stage: m.currentStage };
      m = stepForward(m);
    }
    return { ok: true };
  };

  const toOffer = goTo("offer");
  if (!toOffer.ok) return toOffer;

  // Wariant z rekomendacji (potwierdzone fakty), zatwierdzony jak w kroku Oferta. Już zatwierdzony zostaje.
  if (!m.offerApproved || !m.selectedVariant) {
    const facts = m.needs.filter((need) => need.status === "fact" && need.confirmed).map((need) => need.category);
    m = { ...m, selectedVariant: suggestVariant(facts, segment) };
  }
  const approval = approveGate(m, segment);
  if (!approval.ok) return { ok: false, reason: approval.reason ?? "Nie można zatwierdzić wariantu.", stage: m.currentStage };
  m = { ...m, offerApproved: true };

  const toContract = goTo("contract");
  if (!toContract.ok) return toContract;
  return { ok: true, mission: m };
}
