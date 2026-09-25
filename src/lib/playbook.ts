import type {
  Channel,
  Mission,
  NeedCategory,
  OfferVariant,
  Partner,
  StageId,
} from "./types";

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

export const DISCOVERY_QUESTIONS_VENUE = [
  "Które dni lub godziny są najsłabsze?",
  "Jaka wielkość grupy jest najbardziej opłacalna?",
  "Jaki minimalny rachunek lub liczba osób uzasadnia zniżkę?",
  "Jakie produkty, dni lub godziny muszą być wyłączone?",
  "Co nie zadziałało w poprzednich promocjach?",
  "Po czym za trzy miesiące poznają Państwo, że współpraca ma sens?",
];

export const OFFER_LIBRARY: Array<{
  variant: OfferVariant;
  name: string;
  summary: string;
  matches: NeedCategory[];
}> = [
  {
    variant: "A",
    name: "Ruch poza szczytem",
    summary: "Konkretne dni i godziny, np. środa 16:00–19:00. Zniżka tylko poza szczytem.",
    matches: ["off_peak"],
  },
  {
    variant: "B",
    name: "Oferta grupowa",
    summary: "Minimalna liczba osób albo rachunek chroniący marżę, np. min. 4 osoby.",
    matches: ["margin", "attendance", "acquisition"],
  },
  {
    variant: "C",
    name: "Kontrolowany pilotaż",
    summary: "Ograniczony czas, limit użyć albo limit dzienny — bez wyłączności.",
    matches: ["risk", "operations", "budget"],
  },
];

export const OBJECTION_LIBRARY = [
  {
    key: "other_apps",
    label: "„Mam inne aplikacje ze zniżkami.”",
    response:
      "Lutra jest dla grup, które już planują wyjście; zniżka pomaga wybrać Państwa miejsce.",
    followUp:
      "Ilu klientów przychodzi z obecnych programów i ilu z nich tworzy grupy?",
  },
  {
    key: "how_many",
    label: "„Ile osób mi przyprowadzicie?”",
    response:
      "Nie obiecujemy liczby, której nie możemy potwierdzić. Możemy zacząć od warunków kontrolowanych przez partnera.",
    followUp: "Co w trzy miesiące uznaliby Państwo za sensowny wynik?",
  },
  {
    key: "margin",
    label: "„Zniżka mi się nie opłaca.”",
    response:
      "Ustalmy okno godzinowe, minimalną grupę, limit dzienny lub wyłączenia produktów.",
    followUp: "Które godziny chcecie dociążyć bez obniżki w szczycie?",
  },
  {
    key: "no_time",
    label: "„Nie mam czasu tego pilnować.”",
    response:
      "Warunki ustalamy raz; wracamy przy zmianie lub okresowym potwierdzeniu.",
    followUp: "Kto będzie kontaktem do aktualizacji?",
  },
  {
    key: "ask_owner",
    label: "„Muszę zapytać właściciela.”",
    response:
      "Przygotujemy krótkie podsumowanie i umówimy rozmowę z decydentem.",
    followUp: "Co będzie dla właściciela najważniejsze?",
  },
  {
    key: "come_back",
    label: "„Wróćcie, jak będzie więcej użytkowników.”",
    response:
      "Możemy wrócić w ustalonym terminie albo przygotować ograniczony, bezpłatny pilot bez wyłączności.",
    followUp: "Jaki sygnał skłoni Państwa do powrotu?",
  },
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

export const FORBIDDEN_PROMISES = [
  "określona liczba klientów",
  "pierwsze miejsce / pozycja",
  "wyłączność",
  "terminy niegotowych funkcji",
  "działanie funkcji z backlogu",
  "sprzedaż Premium przed uruchomieniem",
  "gwarantowany wpływ na retencję",
  "warunki niezatwierdzone pisemnie",
];

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

export function suggestVariant(categories: NeedCategory[]): OfferVariant {
  const ranked = OFFER_LIBRARY.map((offer) => ({
    variant: offer.variant,
    score: offer.matches.filter((item) => categories.includes(item)).length,
  })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].variant : "A";
}

export type CopilotCard = {
  title: string;
  body: string;
  action?: string;
};

export function getCopilot(
  stage: StageId,
  partner: Partner,
  mission: Mission,
): { cards: CopilotCard[]; warning: string } {
  const owner =
    partner.contacts.find((c) => c.id === mission.decision.decisionMakerId)?.name ??
    partner.contacts.find((c) => c.isDecisionMaker)?.name ??
    "decydent";
  const confirmed = mission.needs.filter((n) => n.confirmed);
  const next = `${mission.nextStepLabel}${mission.nextStepAt ? ` · ${mission.nextStepAt}` : ""}`;

  if (stage === "research") {
    return {
      cards: [
        {
          title: "Co jest w profilu",
          body: `${partner.name} · ${partner.category}${partner.subcategory ? ` / ${partner.subcategory}` : ""}, ${partner.city}. ${partner.hours ?? "Godziny do uzupełnienia"}.`,
        },
        {
          title: "Hipoteza",
          body: "To, co widać publicznie, nie jest potrzebą. Potwierdź w rozmowie.",
        },
        {
          title: "Następny krok",
          body: next,
        },
      ],
      warning: "Nie przekazuj publicznej informacji jako potwierdzonej potrzeby partnera.",
    };
  }

  if (stage === "contact") {
    return {
      cards: [
        {
          title: "Cel rozmowy",
          body: `Umów 15 min z ${owner}. Nie sprzedawaj oferty na pierwszym sygnale.`,
        },
        {
          title: "Kanał i zgoda",
          body: `${mission.selectedChannel ?? "brak kanału"} · nagranie ${mission.recordingConsent}.`,
        },
        {
          title: "Jeśli odmowa",
          body: "Zostaw termin powrotu. Nie obiecuj liczby gości.",
        },
      ],
      warning: "Przed nagraniem poinformuj o nagraniu, transkrypcji i retencji.",
    };
  }

  if (stage === "discovery") {
    return {
      cards: [
        {
          title: "Usłyszałem",
          body: mission.discovery.quote
            ? `Cytat: „${mission.discovery.quote}”`
            : mission.discovery.description.trim()
              ? mission.discovery.description
              : "Brak cytatu i opisu — wpisz po rozmowie.",
        },
        {
          title: "Dopytaj teraz",
          body: DISCOVERY_QUESTIONS_VENUE[2],
        },
        {
          title: "Następny krok",
          body: mission.decision.nextStep.trim() || next,
        },
      ],
      warning: "Kategorię i cytat zapisujesz Ty. Infeld nie kategoryzuje rozmowy na tym etapie.",
    };
  }

  if (stage === "needs") {
    return {
      cards: [
        {
          title: "Potwierdzone fakty",
          body: confirmed.length
            ? confirmed.map((n) => n.title || n.description).join(" · ")
            : "Brak potwierdzonej potrzeby. Hipoteza nie otwiera oferty.",
        },
        {
          title: "Obserwacje",
          body: mission.needs.filter((n) => !n.confirmed).length
            ? `${mission.needs.filter((n) => !n.confirmed).length} bez potwierdzenia handlowca.`
            : "Nie ma luźnych obserwacji.",
        },
        {
          title: "Rezultat",
          body: mission.decision.expectedResult.trim() || "Brak oczekiwanego rezultatu.",
        },
      ],
      warning: "Potrzeba bez Twojego potwierdzenia nie otwiera oferty.",
    };
  }

  if (stage === "offer") {
    const rec = OFFER_LIBRARY.find((o) => o.variant === mission.recommendedVariant);
    const fromNeeds = confirmed.map((n) => n.title || n.category).join(", ");
    return {
      cards: [
        {
          title: "Rekomendacja z potrzeb",
          body: `Wariant ${mission.recommendedVariant}: ${rec?.name}. ${fromNeeds ? `Z faktów: ${fromNeeds}.` : "Brak faktu — nie wysyłaj."}`,
        },
        {
          title: "Status",
          body: mission.offerSentAt
            ? `Wysłana ${mission.offerSentAt.slice(0, 10)}.`
            : mission.offerApproved
              ? `Wariant ${mission.selectedVariant} zatwierdzony, jeszcze nie wysłany.`
              : mission.selectedVariant
                ? `Wybrany ${mission.selectedVariant}, czeka na zatwierdzenie.`
                : "Nie wybrano wariantu.",
        },
        {
          title: "Do zatwierdzenia",
          body: "Rabatu i wysyłki nie ustala model. Warunki zatwierdza handlowiec.",
        },
      ],
      warning: "Oferty A/B/C wyłącznie z biblioteki. Zero liczby gości.",
    };
  }

  if (stage === "negotiation") {
    const active = mission.objections.find((o) => o.checked);
    const fromLib = active ? OBJECTION_LIBRARY.find((o) => o.key === active.key) : undefined;
    return {
      cards: [
        {
          title: "Obiekcja z rozmowy",
          body: fromLib?.label ?? "Żadna obiekcja z biblioteki nie jest zaznaczona.",
        },
        {
          title: "Odpowiedź z biblioteki",
          body: fromLib?.response ?? "Zaznacz obiekcję, zanim pójdziesz w obietnice.",
        },
        {
          title: "Cel",
          body: mission.decision.nextStep.trim() || "Ustal warunki i jedną datę decyzji.",
        },
      ],
      warning: "Odpowiedź bez konkretnej liczby gości. Inaczej psujemy zaufanie i dane.",
    };
  }

  if (stage === "contract") {
    const c = mission.contract;
    return {
      cards: [
        {
          title: "Oferta w umowie",
          body: mission.selectedVariant
            ? `Wariant ${mission.selectedVariant}${mission.offerApproved ? ", zatwierdzony" : ""}.`
            : "Brak wybranego wariantu.",
        },
        {
          title: "Dokument",
          body: [
            c.companyName.trim() || "brak firmy",
            c.documentPath ? "PDF w storage" : "brak PDF",
            c.signedByHuman ? "podpis handlowca" : "bez podpisu",
          ].join(" · "),
        },
        {
          title: "Daty",
          body: c.startAt && c.endAt ? `${c.startAt} → ${c.endAt}` : "Wpisz start i koniec. Bez domyślnej daty.",
        },
      ],
      warning: "Dokumentów nie podpisuje model. Kontrakt zatwierdza człowiek.",
    };
  }

  const a = mission.activation;
  return {
    cards: [
      {
        title: "Kod partnera",
        body: a.partnerCode || "Nadaj kod LUTRA-… przed publikacją.",
      },
      {
        title: "Test w Lutrze",
        body: a.testPassed
          ? a.testNotes.trim() || "Test oferty odhaczony."
          : "Jedno wejście jako gość. Bez testu i opisu oferta nie jest aktywna.",
      },
      {
        title: "Check-in",
        body: a.checkInAt
          ? `Check-in ${a.checkInAt}${a.opsContactName ? ` · ${a.opsContactName}` : ""}`
          : "Zapisz kontakt operacyjny i datę 30/60/90.",
      },
    ],
    warning: "Nie obiecuj konkretnej liczby gości, nawet po aktywacji.",
  };
}

export const CONTACT_SCRIPT = `Dzień dobry, tu [imię] z Lutry, aplikacji do wspólnych wyjść. Grupy szukają miejsca na spotkanie, czyli konkretnego okna, a nie kolejnego kuponu. Czy 15 minut w tym tygodniu na krótkie discovery będzie w porządku?`;

export const RECORDING_DISCLOSURE = `Zanim włączę nagranie: rozmowa może być nagrywana, transkrybowana i analizowana przez AI po to, by lepiej zapisać potrzeby i nie pomylić oferty. Dostawca przetwarza nagranie, a plik kasujemy po okresie retencji. Możemy rozmawiać bez nagrania — wtedy spiszę notatki ręcznie. Czy zgadzają się Państwo na nagranie?`;
