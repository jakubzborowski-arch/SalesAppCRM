import { STAGES, type AppState } from "./types";

/**
 * Stan wprowadzenia dla jednej osoby w tej przeglądarce (wygoda, nie dane CRM).
 * Brak albo błąd pamięci przeglądarki = wprowadzenie pokaże się jeszcze raz — nic się nie psuje.
 */
export type OnboardingState = {
  tourDone: boolean;
  checklistHidden: boolean;
};

const EMPTY: OnboardingState = { tourDone: false, checklistHidden: false };
/** Zdarzenie, którym Ustawienia i Pomoc otwierają wprowadzenie ponownie. */
export const OPEN_TOUR_EVENT = "lutra:open-tour";

function key(userId: string | undefined) {
  return `lutra-onboarding:${userId || "local"}`;
}

export function readOnboarding(userId: string | undefined): OnboardingState {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return { tourDone: Boolean(parsed.tourDone), checklistHidden: Boolean(parsed.checklistHidden) };
  } catch {
    return EMPTY;
  }
}

export function writeOnboarding(userId: string | undefined, patch: Partial<OnboardingState>) {
  try {
    const next = { ...readOnboarding(userId), ...patch };
    window.localStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    // Prywatne okno albo zablokowane dane — wprowadzenie po prostu pokaże się znowu.
  }
}

export function openTour() {
  try {
    window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
  } catch {
    // Starsza przeglądarka — bez ponownego otwarcia.
  }
}

export type FirstStep = { key: string; label: string; hint: string; href: string; done: boolean };

/** „Pierwsze kroki” na pulpicie — liczone z danych, bez osobnego zapisu. */
export function firstSteps(state: AppState): FirstStep[] {
  // Postęp tej osoby: jej misje (w zespole cudze misje nie odhaczają kroków nowemu handlowcowi).
  const me = state.user.id;
  const missions = state.missions.filter((m) => !me || !m.ownerUserId || m.ownerUserId === me);
  const offerIndex = STAGES.findIndex((stage) => stage.id === "offer");
  const pastDiscovery = missions.some(
    (m) => m.status === "won" || STAGES.findIndex((stage) => stage.id === m.currentStage) >= offerIndex,
  );
  const firstMissionPartner = missions[0]?.partnerId;
  const missionHref = firstMissionPartner ? `/partners/${firstMissionPartner}/mission` : "/partners";
  const steps: FirstStep[] = [
    {
      key: "partner",
      label: "Dodaj partnera albo zaimportuj listę",
      hint: "Wystarczy nazwa i typ: miejsce, społeczność albo firma.",
      href: state.partners.length ? "/partners" : "/partners/new",
      done: state.partners.length > 0,
    },
    {
      key: "mission",
      label: "Zacznij misję",
      hint: "Na karcie partnera kliknij „Zajmuję się partnerem”.",
      href: "/partners",
      done: missions.length > 0,
    },
    {
      key: "contact",
      label: "Zapisz pierwszy kontakt w dzienniku",
      hint: "Telefon, mail albo wizyta — każdy osobno, z wynikiem.",
      href: missionHref,
      done: missions.some((m) => m.activities.length > 0),
    },
    {
      key: "fact",
      label: "Potwierdź fakt w rozmowie",
      hint: "Problem, rezultat, ograniczenia, decydent i termin — potem „Potwierdź jako fakt”.",
      href: missionHref,
      done: pastDiscovery || missions.some((m) => m.needs.some((n) => n.status === "fact" && n.confirmed)),
    },
    {
      key: "offer",
      label: "Zatwierdź warunki oferty",
      hint: "Wariant A/B/C, zniżka albo cykl, sposób realizacji i okres.",
      href: missionHref,
      done: missions.some((m) => m.offerApproved),
    },
    {
      key: "active",
      label: "Aktywuj pierwszego partnera",
      hint: "Porozumienie albo umowa, weryfikacja i publikacja.",
      href: missionHref,
      done: missions.some((m) => m.status === "won"),
    },
  ];
  if (state.user.isAdmin) {
    steps.push({
      key: "team",
      label: "Zaproś zespół",
      hint: "Ustawienia → Zespół → link z zaproszeniem.",
      href: "/ustawienia",
      done: state.team.length > 1,
    });
  }
  return steps;
}
