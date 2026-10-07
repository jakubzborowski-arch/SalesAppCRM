import type { Channel, NeedCategory, OfferVariant, StageId } from "./types";

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
  discovery: "Dalej: Mapa potrzeb",
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
