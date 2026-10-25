import { addDaysIso, daysUntil, isIsoDate, toIsoDate } from "./dates";
import { careMissionOf } from "./care";
import { pendingFollowUps, retryCadence, STALE_DAYS } from "./followups";
import { addMonthsIso, agreementFormOf } from "./terms";
import type { AppState, Mission } from "./types";

export type AgendaKind =
  | "task"
  | "next_step"
  | "deadline"
  | "signature"
  | "contract_end"
  | "follow_up"
  | "review"
  | "terms"
  | "report"
  | "retry"
  | "no_response"
  | "stale";

export type AgendaItem = {
  /** Stały klucz — po nim powiadomienie wychodzi raz dziennie. */
  key: string;
  kind: AgendaKind;
  title: string;
  partnerId: string;
  partnerName: string;
  missionId: string;
  due: string;
  /** Dni do terminu (ujemne = zaległe). */
  days: number;
  /** Dla maila po kontakcie: wpis w dzienniku, po którym mail ma wyjść. */
  activityId?: string;
};

export const AGENDA_LABEL: Record<AgendaKind, string> = {
  task: "Zadanie",
  next_step: "Następny krok",
  deadline: "Termin decyzji",
  signature: "Podpis / potwierdzenie",
  contract_end: "Koniec współpracy",
  follow_up: "Mail po kontakcie",
  review: "Przegląd po cyklu",
  terms: "Potwierdzenie warunków",
  report: "Informacja o realizacjach",
  retry: "Ponowienie kontaktu",
  no_response: "Brak odpowiedzi",
  stale: "Misja stygnie",
};

/** Co ile miesięcy partner potwierdza warunki (KB → „Poprawność danych”). */
export const TERMS_CONFIRM_MONTHS = 3;

const MONTHS = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];

/** „2026-10” → „październik 2026” */
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

/** Poprzedni miesiąc kalendarzowy jako „RRRR-MM”. */
export function previousMonth(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Kiedy partner powinien znowu potwierdzić warunki (ostatnie potwierdzenie albo aktywacja + 3 mies.). */
export function nextTermsConfirmation(mission: Pick<Mission, "care" | "activation" | "closedAt">) {
  const base = mission.care.termsConfirmedAt ?? mission.activation.activatedAt ?? mission.closedAt;
  if (!base) return null;
  return addMonthsIso(toIsoDate(new Date(base)), TERMS_CONFIRM_MONTHS);
}

/** Ile dni przed końcem umowy przypominamy o przedłużeniu. */
export const CONTRACT_END_NOTICE_DAYS = 30;
/** Po ilu dniach od wysyłki przypominamy o podpisie partnera. */
export const SIGNATURE_NUDGE_DAYS = 5;

function mine(state: AppState, mission: Mission, onlyMine: boolean) {
  if (!onlyMine || !state.user.id) return true;
  return !mission.ownerUserId || mission.ownerUserId === state.user.id;
}

/**
 * Co jest na dziś i co zaległe: zadania, następne kroki, terminy decyzji, umowy czekające na podpis
 * i umowy kończące się w ciągu 30 dni. `onlyMine` — tylko misje użytkownika (i bez właściciela).
 */
export function agenda(state: AppState, onlyMine = true, today = new Date()): AgendaItem[] {
  const todayIso = toIsoDate(today);
  const items: AgendaItem[] = [];
  const partnerName = (id: string) => state.partners.find((p) => p.id === id)?.name ?? "Partner";
  const missions = state.missions.filter((m) => mine(state, m, onlyMine));
  const byId = new Map(missions.map((m) => [m.id, m]));
  const push = (mission: Mission, kind: AgendaKind, title: string, due: string, keyPart = "", activityId?: string) => {
    const days = daysUntil(due, today);
    if (days === null) return;
    items.push({
      key: `${kind}:${mission.id}:${keyPart || due}`,
      kind,
      title,
      partnerId: mission.partnerId,
      partnerName: partnerName(mission.partnerId),
      missionId: mission.id,
      due,
      days,
      activityId,
    });
  };
  const segmentOf = (partnerId: string) => state.partners.find((p) => p.id === partnerId)?.segment ?? "venue";
  /** Nowsza misja tego partnera w danym statusie (odnowienie) — wtedy stara przestaje przypominać. */
  const newer = (mission: Mission, statuses: Mission["status"][]) =>
    state.missions.some(
      (other) =>
        other.partnerId === mission.partnerId &&
        other.id !== mission.id &&
        statuses.includes(other.status) &&
        (other.startedAt ?? "") > (mission.startedAt ?? ""),
    );

  // Zadania z bazy (otwarte, na dziś albo zaległe).
  const openStepTasks = new Set<string>();
  for (const task of state.tasks) {
    if (task.doneAt) continue;
    const mission = byId.get(task.missionId);
    if (!mission) continue;
    if (task.source === "next_step") openStepTasks.add(mission.id);
    const due = (task.dueAt ?? "").slice(0, 10);
    if (isIsoDate(due) && due <= todayIso) push(mission, "task", task.title, due, task.id);
  }

  for (const mission of missions) {
    const followUp = mission.status === "active" || mission.status === "nurture" || mission.status === "paused";
    // Następny krok bez zadania w bazie (np. zmieniony przed chwilą).
    if (followUp && !openStepTasks.has(mission.id) && mission.nextStepLabel.trim() && isIsoDate(mission.nextStepAt)) {
      if (mission.nextStepAt <= todayIso) push(mission, "next_step", mission.nextStepLabel, mission.nextStepAt);
    }
    if (mission.status === "active") {
      // Zaplanowany krok w przyszłości (albo otwarte zadanie) = handlowiec ma plan; rytm i „stygnie” nie przeszkadzają.
      const planned = (isIsoDate(mission.nextStepAt) && mission.nextStepAt > todayIso) || openStepTasks.has(mission.id);
      const retry = planned ? null : retryCadence(mission);
      if (retry && retry.due <= todayIso) {
        push(mission, retry.kind, retry.title, retry.due, retry.lastAt);
      } else if (!planned && !retry) {
        const lastTouch = mission.activities.reduce<string>((max, a) => (a.occurredAt > max ? a.occurredAt : max), "") || mission.startedAt;
        const since = lastTouch ? toIsoDate(new Date(lastTouch)) : "";
        const quiet = since ? -(daysUntil(since, today) ?? 0) : 0;
        if (since && quiet >= STALE_DAYS) {
          push(
            mission,
            "stale",
            `Bez kontaktu od ${quiet} dni — zaplanuj następny krok albo zamknij misję`,
            addDaysIso(STALE_DAYS, new Date(`${since}T12:00:00`)),
            since,
          );
        }
      }
      const deadline = mission.decision.decisionDeadline;
      if (isIsoDate(deadline) && deadline <= todayIso) push(mission, "deadline", "Partner miał dać odpowiedź — zadzwoń po decyzję", deadline);
      const c = mission.contract;
      if (c.sentAt && !c.partnerSignedAt) {
        const nudge = addDaysIso(SIGNATURE_NUDGE_DAYS, new Date(c.sentAt));
        const title =
          agreementFormOf(mission) === "email"
            ? "Porozumienie czeka na potwierdzenie partnera"
            : "Umowa czeka na podpis partnera";
        if (nudge <= todayIso) push(mission, "signature", title, nudge);
      }
    }
    if (mission.status === "active" || mission.status === "won" || mission.status === "nurture" || mission.status === "paused") {
      // Mail po telefonie albo spotkaniu, którego jeszcze nie ma w dzienniku (także po odłożeniu misji).
      for (const followUp of pendingFollowUps(mission, today)) {
        push(mission, "follow_up", followUp.title, followUp.due, followUp.activity.id, followUp.activity.id);
      }
    }
    if (mission.status === "won") {
      const care = mission.care;
      // Po przeglądzie z decyzją „kończymy” albo po końcu okresu opieka nie generuje już przypomnień.
      const endedByReview = care.reviews[0]?.decision === "end";
      const periodOver = isIsoDate(mission.contract.endAt) && mission.contract.endAt < todayIso;
      // Odnowiona współpraca (nowsza wygrana misja) przejmuje opiekę.
      const current = careMissionOf(state.missions, mission.partnerId)?.id === mission.id;
      const caring = !endedByReview && !periodOver && current;
      // Przegląd po pierwszym cyklu: frekwencja, zgłoszenia, decyzja o kontynuacji.
      const reviewAt = mission.activation.checkInAt;
      if (isIsoDate(reviewAt) && reviewAt <= todayIso && !care.reviews.length && current) {
        push(mission, "review", "Przegląd po pierwszym cyklu: frekwencja, zgłoszenia, decyzja", reviewAt);
      }
      const confirmAt = nextTermsConfirmation(mission);
      if (caring && confirmAt && confirmAt <= todayIso) {
        push(mission, "terms", "Kwartalne potwierdzenie warunków z partnerem", confirmAt);
      }
      // Miesięczna informacja o liczbie realizacji zniżki (tylko lokale).
      const activated = mission.activation.activatedAt ?? mission.closedAt;
      const month = previousMonth(today);
      if (
        caring &&
        segmentOf(mission.partnerId) === "venue" &&
        activated &&
        toIsoDate(new Date(activated)).slice(0, 7) <= month &&
        !care.reports.some((report) => report.month === month)
      ) {
        push(mission, "report", `Wyślij partnerowi liczbę realizacji za ${monthLabel(month)}`, `${todayIso.slice(0, 7)}-01`, month);
      }
      // Rozmowa o przedłużeniu już trwa (nowa misja) — nie przypominamy o końcu starej umowy.
      if (!endedByReview && !newer(mission, ["active", "won"]) && isIsoDate(mission.contract.endAt)) {
        const days = daysUntil(mission.contract.endAt, today) ?? 0;
        if (days <= CONTRACT_END_NOTICE_DAYS && days >= -CONTRACT_END_NOTICE_DAYS) {
          push(mission, "contract_end", "Współpraca się kończy — porozmawiaj o przedłużeniu", mission.contract.endAt);
        }
      }
    }
  }

  return items.sort((a, b) => a.days - b.days || a.partnerName.localeCompare(b.partnerName, "pl"));
}

/** Ile pozycji wymaga ruchu dziś (zaległe + dzisiejsze; końce umów liczymy dopiero od 7 dni). */
export function agendaCount(items: AgendaItem[]) {
  return items.filter((item) => item.kind !== "contract_end" || item.days <= 7).length;
}
