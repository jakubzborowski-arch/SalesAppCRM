import { addDaysIso, daysUntil, isIsoDate, toIsoDate } from "./dates";
import type { AppState, Mission } from "./types";

export type AgendaKind = "task" | "next_step" | "deadline" | "signature" | "contract_end";

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
};

export const AGENDA_LABEL: Record<AgendaKind, string> = {
  task: "Zadanie",
  next_step: "Następny krok",
  deadline: "Termin decyzji",
  signature: "Podpis umowy",
  contract_end: "Koniec umowy",
};

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
  const push = (mission: Mission, kind: AgendaKind, title: string, due: string, keyPart = "") => {
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
    });
  };

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
      const deadline = mission.decision.decisionDeadline;
      if (isIsoDate(deadline) && deadline <= todayIso) push(mission, "deadline", "Partner miał dać odpowiedź — zadzwoń po decyzję", deadline);
      const c = mission.contract;
      if (c.sentAt && !c.partnerSignedAt) {
        const nudge = addDaysIso(SIGNATURE_NUDGE_DAYS, new Date(c.sentAt));
        if (nudge <= todayIso) push(mission, "signature", "Umowa czeka na podpis partnera", nudge);
      }
    }
    if (mission.status === "won" && isIsoDate(mission.contract.endAt)) {
      const days = daysUntil(mission.contract.endAt, today) ?? 0;
      if (days <= CONTRACT_END_NOTICE_DAYS && days >= -CONTRACT_END_NOTICE_DAYS) {
        push(mission, "contract_end", "Umowa się kończy — porozmawiaj o przedłużeniu", mission.contract.endAt);
      }
    }
  }

  return items.sort((a, b) => a.days - b.days || a.partnerName.localeCompare(b.partnerName, "pl"));
}

/** Ile pozycji wymaga ruchu dziś (zaległe + dzisiejsze; końce umów liczymy dopiero od 7 dni). */
export function agendaCount(items: AgendaItem[]) {
  return items.filter((item) => item.kind !== "contract_end" || item.days <= 7).length;
}
