import {
  STAGES,
  type ActivityDirection,
  type ActivityOutcome,
  type Channel,
  type CloseStatus,
  type MissionStatus,
  type NeedCategory,
  type OfferVariant,
  type StageId,
} from "./types";

/** Checklista i etykiety UI — nie treść sprzedażowa. Wiedza idzie z Infelda. */

export const RESEARCH_ITEMS = [
  { key: "profile", label: "Profil, adres i kategoria lokalu sprawdzone" },
  { key: "hours", label: "Godziny oraz social media sprawdzone" },
  { key: "promos", label: "Sprawdź obecne promocje i programy zniżkowe" },
  { key: "hypothesis", label: "Wykryj słabą hipotezę potrzeby" },
  { key: "contact", label: "Znajdź właściwą osobę kontaktową" },
] as const;

export const CONTACT_CHANNELS: Array<{
  id: Channel;
  label: string;
  hint: string;
}> = [
  { id: "phone", label: "Telefon", hint: "Szybki sygnał i to, czy ktoś odbierze." },
  { id: "email", label: "E-mail", hint: "Zielony, jeśli e-mail istnieje." },
  { id: "linkedin", label: "LinkedIn", hint: "Kontakt ze właścicielem / menedżerem." },
  { id: "in_person", label: "Pokrewne", hint: "Zysk z polecenia albo kontakt osobisty." },
];

export const NEED_CATEGORIES: Array<{ id: NeedCategory; label: string }> = [
  { id: "off_peak", label: "Ruch poza szczytem" },
  { id: "margin", label: "Marża" },
  { id: "operations", label: "Operacje" },
  { id: "attendance", label: "Frekwencja" },
  { id: "acquisition", label: "Pozyskanie" },
  { id: "marketing", label: "Marketing" },
  { id: "wellbeing", label: "Wellbeing" },
  { id: "integration", label: "Integracja" },
  { id: "budget", label: "Budżet" },
  { id: "risk", label: "Ryzyko" },
];

export const PRIORITIES = [
  { value: 1, label: "1 — Niski" },
  { value: 2, label: "2 — Umiarkowany" },
  { value: 3, label: "3 — Średni" },
  { value: 4, label: "4 — Wysoki" },
  { value: 5, label: "5 — Krytyczny" },
];

export const OFFER_VARIANTS: Array<{ variant: OfferVariant; name: string }> = [
  { variant: "A", name: "Ruch poza szczytem" },
  { variant: "B", name: "Oferta grupowa" },
  { variant: "C", name: "Kontrolowany pilotaż" },
];

export const OBJECTION_KEYS = [
  { key: "other_apps", label: "„Mam inne aplikacje ze zniżkami.”" },
  { key: "how_many", label: "„Ile osób mi przyprowadzicie?”" },
  { key: "margin", label: "„Zniżka mi się nie opłaca.”" },
  { key: "no_time", label: "„Nie mam czasu tego pilnować.”" },
  { key: "ask_owner", label: "„Muszę zapytać właściciela.”" },
  { key: "come_back", label: "„Wróćcie, jak będzie więcej użytkowników.”" },
] as const;

export const CONTRACT_ITEMS = [
  { key: "variant", label: "Wybrany wariant i warunki potwierdzone" },
  { key: "company", label: "Dane firmy / lokalu, NIP i korespondencja" },
  { key: "signer", label: "Osoba odpowiedzialna za aktualność oferty" },
  { key: "dates", label: "Data rozpoczęcia i zakończenia" },
  { key: "changes", label: "Zasady zmian, wypowiedzenia i potwierdzenia kwartalnego" },
  { key: "human", label: "Pisma i kontrakt zatwierdza człowiek przed wysyłką" },
] as const;

export const ACTIVATION_ITEMS = [
  { key: "code", label: "Utwórz kod partnera" },
  { key: "manual", label: "Manual i skrót języka z misji" },
  { key: "test", label: "Test oferty sprawdzony jednym uderzeniem" },
  { key: "hours", label: "Godziny, limity i wyłączenia zaktualizowane" },
  { key: "ops", label: "Kontakt operacyjny przesłany do nas" },
  { key: "pricing", label: "Cennik i warunki zatwierdzone" },
  { key: "checkin", label: "Zaplanowany check-in na 30/60/90 dni" },
] as const;

export const STAGE_CTA: Record<StageId, string> = {
  research: "Dalej: Pierwszy kontakt",
  contact: "Dalej: Rozmowa discovery",
  discovery: "Dalej: Oferta A/B/C",
  needs: "Dalej: Oferta A/B/C",
  offer: "Dalej: Negocjacje i obiekcje",
  negotiation: "Dalej: Umowa i podpis",
  contract: "Dalej: Aktywacja partnera",
  activation: "Zakończ aktywację",
};

export const STAGE_BADGE: Record<StageId, string> = {
  research: "Research",
  contact: "Kontakt",
  discovery: "Discovery w toku",
  needs: "Potrzeby do potwierdzenia",
  offer: "Wybór wariantu",
  negotiation: "Negocjacje",
  contract: "Umowa przed podpisem",
  activation: "Gotowość do publikacji",
};

export function categoryLabel(id: NeedCategory | "") {
  return NEED_CATEGORIES.find((item) => item.id === id)?.label ?? "—";
}

export function offerName(variant: OfferVariant | null | undefined) {
  return OFFER_VARIANTS.find((item) => item.variant === variant)?.name ?? "";
}

export function suggestVariant(categories: NeedCategory[]): OfferVariant {
  if (categories.includes("off_peak")) return "A";
  if (categories.some((c) => c === "margin" || c === "attendance" || c === "acquisition")) return "B";
  if (categories.some((c) => c === "risk" || c === "operations" || c === "budget")) return "C";
  return "A";
}

export function stageLabel(id: string | null | undefined) {
  return STAGES.find((stage) => stage.id === id)?.label ?? (id === "care" ? "Opieka" : id ?? "—");
}

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  active: "W toku",
  won: "Wygrana",
  lost: "Przegrana",
  nurture: "Wrócić później",
  no_fit: "Brak dopasowania",
  paused: "Pauza",
};

/** Zamknięcie misji: status + powód z listy (żeby dało się policzyć powody przegranych). */
export const CLOSE_OPTIONS: Array<{ status: CloseStatus; label: string; hint: string }> = [
  { status: "lost", label: "Przegrana", hint: "Partner odmówił albo rozmowa się urwała." },
  { status: "nurture", label: "Wrócić później", hint: "Nie teraz, ale jest termin powrotu." },
  { status: "no_fit", label: "Brak dopasowania", hint: "Lokal nie pasuje do pilota." },
  { status: "paused", label: "Pauza", hint: "Wstrzymane po naszej stronie." },
];

export const CLOSE_REASONS = [
  "Zniżka / marża się nie opłaca",
  "Ma inne aplikacje lub programy",
  "Nie widzi wartości dla gości",
  "Brak czasu po stronie lokalu",
  "Decydent odmówił",
  "Brak kontaktu — nie odbiera",
  "Za wcześnie — za mało użytkowników",
  "Lokal nie pasuje do pilota",
  "Zamknięty lub zmiana właściciela",
  "Wstrzymane po naszej stronie",
  "Inny powód",
] as const;

export const ACTIVITY_CHANNELS: Array<{ id: Channel; label: string }> = [
  { id: "phone", label: "Telefon" },
  { id: "email", label: "E-mail" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "in_person", label: "Spotkanie" },
];

export const ACTIVITY_DIRECTIONS: Array<{ id: ActivityDirection; label: string }> = [
  { id: "outbound", label: "Od nas" },
  { id: "inbound", label: "Od partnera" },
];

/** Wyniki kontaktu per kanał. Ta sama wartość w bazie, inna etykieta dla telefonu i maila. */
export const ACTIVITY_OUTCOMES: Record<Channel, Array<{ id: ActivityOutcome; label: string }>> = {
  phone: [
    { id: "connected", label: "Rozmowa odbyta" },
    { id: "no_answer", label: "Nie odebrał" },
    { id: "callback", label: "Oddzwonić / prosi o termin" },
    { id: "meeting_booked", label: "Umówione discovery / spotkanie" },
    { id: "refused", label: "Odmowa" },
    { id: "other", label: "Inne" },
  ],
  email: [
    { id: "sent", label: "Mail wysłany" },
    { id: "replied", label: "Partner odpisał" },
    { id: "meeting_booked", label: "Umówione spotkanie" },
    { id: "callback", label: "Prosi o kontakt później" },
    { id: "refused", label: "Odmowa" },
    { id: "other", label: "Inne" },
  ],
  linkedin: [
    { id: "sent", label: "Wiadomość wysłana" },
    { id: "replied", label: "Partner odpisał" },
    { id: "meeting_booked", label: "Umówione spotkanie" },
    { id: "callback", label: "Prosi o kontakt później" },
    { id: "refused", label: "Odmowa" },
    { id: "other", label: "Inne" },
  ],
  in_person: [
    { id: "connected", label: "Spotkanie odbyte" },
    { id: "meeting_booked", label: "Umówione kolejne spotkanie" },
    { id: "callback", label: "Prosi o kontakt później" },
    { id: "refused", label: "Odmowa" },
    { id: "other", label: "Inne" },
  ],
};

export function defaultOutcome(channel: Channel, direction: ActivityDirection): ActivityOutcome {
  if (channel === "email" || channel === "linkedin") return direction === "inbound" ? "replied" : "sent";
  return "connected";
}

export function activityChannelLabel(channel: string) {
  return ACTIVITY_CHANNELS.find((item) => item.id === channel)?.label ?? "Inny kanał";
}

export function activityOutcomeLabel(channel: string, outcome: ActivityOutcome | null) {
  if (!outcome) return "Notatka z kontaktu";
  const list = ACTIVITY_OUTCOMES[channel as Channel] ?? ACTIVITY_OUTCOMES.phone;
  return (
    list.find((item) => item.id === outcome)?.label ??
    Object.values(ACTIVITY_OUTCOMES)
      .flat()
      .find((item) => item.id === outcome)?.label ??
    outcome
  );
}

/** Wynik, po którym warto od razu zaplanować kolejny krok. */
export function outcomeNeedsFollowUp(outcome: ActivityOutcome) {
  return outcome === "no_answer" || outcome === "callback" || outcome === "sent" || outcome === "meeting_booked";
}
