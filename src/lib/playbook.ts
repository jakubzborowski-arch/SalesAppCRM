import {
  STAGES,
  type ActivityDirection,
  type ActivityOutcome,
  type Channel,
  type CloseStatus,
  type MissionStatus,
  type NeedCategory,
  type OfferVariant,
  type PartnerSegment,
  type StageId,
} from "./types";

/** Checklista i etykiety UI — nie treść sprzedażowa. */

/**
 * Obietnice, których handlowiec (i AI) nie składa partnerowi.
 * Źródło: KB §11 „Czego nie obiecywać” + Partnerzy „Czego nie robimy”.
 */
export const FORBIDDEN_PROMISES = [
  "Określona liczba klientów (zanim mamy dane z pierwszych wydarzeń)",
  "Pierwsze miejsce / pozycja w aplikacji",
  "Wyłączność",
  "Że gospodarze wydarzeń będą musieli wybierać ten lokal",
  "Dane uczestników dla partnera (nie sprzedajemy ich i nie przekazujemy)",
  "Opłaty w którąkolwiek stronę — nie płacimy za obecność i nie pobieramy opłat za bycie partnerem",
  "Terminy niegotowych funkcji",
  "Działanie funkcji z backlogu",
  "Sprzedaż Premium przed uruchomieniem",
  "Gwarantowany wpływ na retencję",
  "Promocja w social mediach Lutry, dopóki nie jest zatwierdzona",
  "Warunki niezatwierdzone pisemnie",
];

/**
 * Czego Lutra nie gwarantuje — lista do umowy (§ „Czego Lutra nie obiecuje”). Osobno od listy dla
 * handlowca: brak opłat i dane uczestników mają w umowie własne paragrafy.
 */
export const CONTRACT_DISCLAIMERS = [
  "określonej liczby gości, wydarzeń ani realizacji zniżki",
  "pozycji ani wyróżnienia w aplikacji",
  "wyłączności",
  "że organizatorzy wydarzeń wybiorą Partnera",
  "terminów wprowadzenia nowych funkcji aplikacji",
  "wpływu współpracy na sprzedaż albo retencję Partnera",
  "promocji w mediach społecznościowych Lutry bez osobnego uzgodnienia",
];

/** Pierwsza litera małą (do wtrąceń po dwukropku), bez psucia nazwy „Lutra”. */
export function lowerFirst(text: string) {
  if (!text || /^Lutr/.test(text)) return text;
  return text.charAt(0).toLocaleLowerCase("pl") + text.slice(1);
}

/** Zasady współpracy z partnerami (Linear → Partnerzy). Pokazywane w Pomocy i przy umowie. */
export const PARTNERSHIP_RULES = [
  "Umowa na cykl, nie na pojedyncze wydarzenie — jednorazowe testy nie budują nawyku.",
  "Zniżka dla ludzi z Lutry jest warunkiem obecności partnera w aplikacji.",
  "Weryfikacja miejsca przed publikacją: działalność, adres, pojemność, godziny, kontakt awaryjny.",
  "Przegląd po pierwszym cyklu: frekwencja, zgłoszenia uczestników, decyzja o kontynuacji.",
  "Nie płacimy za obecność w lokalu i nie pobieramy opłaty za bycie partnerem — wymieniamy się ruchem.",
];

/** Trzy typy partnerów (Linear → Partnerzy → „Trzy typy partnerów”). */
export const SEGMENTS: Array<{
  id: PartnerSegment;
  label: string;
  who: string;
  gets: string;
  expects: string;
}> = [
  {
    id: "venue",
    label: "Miejsce",
    who: "Kawiarnia, klub, planszówkarnia, przestrzeń do wynajęcia",
    gets: "Wydarzenia w kalendarzu, przewidywalna frekwencja, obecność w aplikacji",
    expects: "Stolik lub przestrzeń w ustalonych godzinach, kontakt awaryjny, zniżka dla ludzi z Lutry",
  },
  {
    id: "community",
    label: "Społeczność",
    who: "Klub, grupa hobbystyczna, koło studenckie",
    gets: "Narzędzie do prowadzenia listy i domykania frekwencji",
    expects: "Cykl wydarzeń prowadzony w Lutrze",
  },
  {
    id: "company",
    label: "Firma",
    who: "Zespoły zdalne, głównie IT",
    gets: "Lutra jako benefit dla pracowników, argument retencyjny",
    expects: "Pilotaż na jednym zespole, feedback",
  },
];

export function segmentLabel(segment: PartnerSegment | undefined) {
  return SEGMENTS.find((item) => item.id === segment)?.label ?? "Miejsce";
}

/** Kategorie do wyboru przy dodawaniu partnera — zależą od typu. */
export const CATEGORIES_BY_SEGMENT: Record<PartnerSegment, string[]> = {
  venue: ["kawiarnia", "restauracja", "bar / pub", "klub", "planszówkarnia", "przestrzeń do wynajęcia", "hotel", "inna"],
  community: ["klub", "grupa hobbystyczna", "koło studenckie / naukowe", "Erasmus / studenci", "inna"],
  company: ["zespół zdalny (IT)", "firma hybrydowa", "firma stacjonarna", "inna"],
};

export const RESEARCH_ITEMS = [
  { key: "profile", label: "Profil, adres i kategoria lokalu sprawdzone" },
  { key: "hours", label: "Godziny oraz social media sprawdzone" },
  { key: "promos", label: "Sprawdź obecne promocje i programy zniżkowe" },
  { key: "hypothesis", label: "Wykryj słabą hipotezę potrzeby" },
  { key: "contact", label: "Znajdź właściwą osobę kontaktową" },
] as const;

/** Research dla społeczności i firm (lokale: `RESEARCH_ITEMS`). */
export const RESEARCH_ITEMS_BY_SEGMENT: Record<PartnerSegment, ReadonlyArray<{ key: string; label: string }>> = {
  venue: RESEARCH_ITEMS,
  community: [
    { key: "c_profile", label: "Profil, kanały i liczba członków sprawdzone" },
    { key: "c_rhythm", label: "Jak często się spotykają i gdzie" },
    { key: "c_organizer", label: "Kto organizuje wydarzenia (osoba kontaktowa)" },
    { key: "hypothesis", label: "Wykryj słabą hipotezę potrzeby" },
  ],
  company: [
    { key: "f_profile", label: "Strona firmy, wielkość i tryb pracy (zdalnie / hybrydowo)" },
    { key: "f_benefits", label: "Obecne benefity i inicjatywy integracyjne" },
    { key: "f_contact", label: "Osoba z HR / People albo lider zespołu" },
    { key: "hypothesis", label: "Wykryj słabą hipotezę potrzeby" },
  ],
};

/** Pozycje sprawdzane przy umowie i aktywacji (zapisują się jak checklista, z datą odhaczenia). */
export const ROLLOUT_ITEMS = [
  { key: "contract:brand_app", label: "Zgoda na nazwę i logo w aplikacji" },
  { key: "contract:brand_photos", label: "Zgoda na zdjęcia w aplikacji" },
  { key: "contract:brand_social", label: "Zgoda na nazwę, logo i zdjęcia w social mediach Lutry" },
  { key: "negotiation:demo", label: "Pokazałem działanie zniżki na telefonie" },
  { key: "activation:business", label: "Działalność sprawdzona (NIP / KRS / CEIDG)" },
  { key: "activation:published", label: "Partner widoczny w aplikacji" },
  { key: "activation:sticker", label: "Naklejka Lutry w lokalu" },
] as const;

export const CONTACT_CHANNELS: Array<{
  id: Channel;
  label: string;
  hint: string;
}> = [
  { id: "phone", label: "Telefon", hint: "Szybki sygnał i to, czy ktoś odbierze." },
  { id: "email", label: "E-mail", hint: "Zielony, jeśli e-mail istnieje." },
  { id: "linkedin", label: "LinkedIn", hint: "Kontakt ze właścicielem / menedżerem." },
  { id: "in_person", label: "Wizyta / spotkanie", hint: "Wizyta w lokalu albo umówione spotkanie na miejscu." },
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

export const OFFER_VARIANTS: Array<{ variant: OfferVariant; name: string; hint?: string }> = [
  { variant: "A", name: "Ruch poza szczytem", hint: "Konkretne dni i godziny, np. środa 16:00–19:00." },
  { variant: "B", name: "Oferta grupowa", hint: "Minimalna liczba osób lub rachunek chroniący marżę." },
  { variant: "C", name: "Kontrolowany pilotaż", hint: "Ograniczony czas, limit użyć lub limit dzienny." },
];

/** Warianty A/B/C zależą od typu partnera (KB → „Oferta A/B/C”). */
export const OFFER_VARIANTS_BY_SEGMENT: Record<PartnerSegment, typeof OFFER_VARIANTS> = {
  venue: OFFER_VARIANTS,
  company: [
    { variant: "A", name: "Pilot dla wybranej grupy", hint: "Jeden zespół, ograniczony czas, feedback na koniec." },
    { variant: "B", name: "Benefit dla zespołu", hint: "Tylko jeśli produkt jest gotowy." },
    { variant: "C", name: "Program cykliczny", hint: "Po pozytywnym pilotażu." },
  ],
  community: [
    { variant: "A", name: "Pilot 1–3 wydarzeń", hint: "Krótki cykl prowadzony w Lutrze." },
    { variant: "B", name: "Benefit członkowski", hint: "Tylko jeśli mechanizm jest gotowy." },
    { variant: "C", name: "Partnerstwo cykliczne", hint: "Stały cykl wydarzeń." },
  ],
};

export function offerVariantsFor(segment: PartnerSegment | undefined) {
  return OFFER_VARIANTS_BY_SEGMENT[segment ?? "venue"] ?? OFFER_VARIANTS;
}

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

/** Po co jest krok i co otwiera następny (podpowiedzi w stepperze, Pomocy i wprowadzeniu). */
export const STAGE_HELP: Record<StageId, { goal: string; gate: string }> = {
  research: {
    goal: "Sprawdź podstawy: profil, adres, godziny, obecne promocje i kto decyduje.",
    gate: "Bez blokady — ale zrób research, zanim się odezwiesz.",
  },
  contact: {
    goal: "Umów krótką rozmowę (ok. 15 minut) o tym, co nie działa. Bez oferty.",
    gate: "Dalej: zgoda na wybrany kanał kontaktu.",
  },
  discovery: {
    goal: "Rozmowa: problem, rezultat, ograniczenia, decydent, termin decyzji, wcześniejsze próby, następny krok.",
    gate: "Dalej: komplet pól i co najmniej jeden potwierdzony fakt.",
  },
  needs: {
    goal: "Mapa potrzeb: fakty, obserwacje i hipotezy z kategorią i priorytetem.",
    gate: "Ten sam ekran co rozmowa — rekomendacja wariantu liczy się z faktów.",
  },
  offer: {
    goal: "Wariant A/B/C i konkretne warunki: zniżka, cykl wydarzeń albo pilotaż oraz okres.",
    gate: "Dalej: zatwierdzony wariant i komplet warunków.",
  },
  negotiation: {
    goal: "Obiekcje, pokaz na telefonie i ewentualne zmiany warunków.",
    gate: "Dalej: zatwierdzona oferta.",
  },
  contract: {
    goal: "Porozumienie mailowe (do 3 miesięcy) albo umowa z podpisami, zgody na nazwę i logo.",
    gate: "Dalej: potwierdzenie obu stron.",
  },
  activation: {
    goal: "Weryfikacja miejsca, publikacja w aplikacji, naklejka, test i data przeglądu.",
    gate: "Koniec: partner aktywny, zaczyna się opieka.",
  },
};

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

export function offerName(variant: OfferVariant | null | undefined, segment?: PartnerSegment) {
  return offerVariantsFor(segment).find((item) => item.variant === variant)?.name ?? "";
}

export function suggestVariant(categories: NeedCategory[], segment: PartnerSegment = "venue"): OfferVariant {
  // Firmy i społeczności zaczynają od pilotażu; dalsze warianty dopiero po nim.
  if (segment !== "venue") return "A";
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
