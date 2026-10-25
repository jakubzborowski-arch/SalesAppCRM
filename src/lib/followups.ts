import { daysUntil, toIsoDate } from "./dates";
import type { Activity, Mission } from "./types";

/**
 * Maile po kontakcie (Linear → Partnerzy → „Role w zespole”):
 * - pierwszy kontakt telefoniczny → mail z follow-upem,
 * - spotkanie na miejscu → mail ze szczegółami i ustaleniami tego samego dnia.
 */
export type FollowUp = {
  activity: Activity;
  kind: "phone" | "meeting";
  /** Dzień, w którym mail powinien wyjść (dzień kontaktu). */
  due: string;
  title: string;
};

/** Wyniki telefonu, po których wysyłamy follow-up (rozmowa się odbyła albo jest umówiony ciąg dalszy). */
const PHONE_NEEDS_MAIL = new Set(["connected", "callback", "meeting_booked"]);
/** Spotkania, po których mail nie ma sensu (nikogo nie było albo odmowa). */
const MEETING_NO_MAIL = new Set(["no_answer", "refused"]);
/** Starsze kontakty bez maila nie wiszą w nieskończoność na liście „Na dziś”. */
export const FOLLOW_UP_WINDOW_DAYS = 14;

export function followUpTitle(kind: FollowUp["kind"]) {
  return kind === "meeting"
    ? "Mail z ustaleniami po spotkaniu — tego samego dnia"
    : "Mail z follow-upem po telefonie";
}

function needsMail(activity: Activity): FollowUp["kind"] | null {
  if (activity.channel === "in_person") {
    return activity.outcome && MEETING_NO_MAIL.has(activity.outcome) ? null : "meeting";
  }
  if (activity.channel === "phone" && activity.direction === "outbound" && activity.outcome && PHONE_NEEDS_MAIL.has(activity.outcome)) {
    return "phone";
  }
  return null;
}

/** Telefony i spotkania z ostatnich 14 dni, po których w dzienniku nie ma jeszcze wysłanego maila. */
export function pendingFollowUps(mission: Pick<Mission, "activities">, today = new Date()): FollowUp[] {
  const mails = mission.activities.filter((a) => a.channel === "email" && a.direction === "outbound");
  const latest = new Map<FollowUp["kind"], FollowUp>();
  for (const activity of mission.activities) {
    const kind = needsMail(activity);
    if (!kind) continue;
    const due = toIsoDate(new Date(activity.occurredAt));
    const age = daysUntil(due, today);
    if (age === null || age > 0 || -age > FOLLOW_UP_WINDOW_DAYS) continue;
    const answered = mails.some((mail) => new Date(mail.occurredAt).getTime() >= new Date(activity.occurredAt).getTime());
    if (answered) continue;
    const current = latest.get(kind);
    // Kilka telefonów bez maila → jedno przypomnienie (po ostatnim).
    if (!current || current.activity.occurredAt < activity.occurredAt) {
      latest.set(kind, { activity, kind, due, title: followUpTitle(kind) });
    }
  }
  return [...latest.values()].sort((a, b) => a.due.localeCompare(b.due));
}

// ---------------------------------------------------------------------------
// Rytm ponowień, gdy partner nie odpowiada

/** Odstępy kolejnych prób od pierwszej próby bez odpowiedzi (dni): 2, 5, 10. Po czwartej próbie — decyzja. */
export const RETRY_OFFSETS = [2, 5, 10] as const;
/** Po ilu dniach bez żadnego kontaktu aktywna misja „stygnie”. */
export const STALE_DAYS = 7;

/** Wyniki, po których partner się odezwał — rytm liczymy od nowa. */
const RESPONDED = new Set(["connected", "callback", "replied", "meeting_booked"]);

export type Retry =
  | { kind: "retry"; attempt: number; due: string; title: string; lastAt: string }
  | { kind: "no_response"; attempts: number; due: string; title: string; lastAt: string };

function responded(activity: Activity) {
  if (activity.direction === "inbound") return true;
  if (activity.channel === "in_person") return activity.outcome !== "no_answer" && activity.outcome !== "refused";
  return Boolean(activity.outcome && RESPONDED.has(activity.outcome));
}

/**
 * Próby kontaktu bez odpowiedzi od ostatniej odpowiedzi partnera. 1. próba → ponów po 2 dniach,
 * 2. → po 5, 3. → po 10 (licząc od pierwszej). Po 4 próbach bez odpowiedzi CRM proponuje zamknięcie
 * z powodem „Brak kontaktu” albo zmianę kanału.
 */
export function retryCadence(mission: Pick<Mission, "activities" | "status">): Retry | null {
  if (mission.status !== "active") return null;
  const history = [...mission.activities].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const lastResponse = history.map(responded).lastIndexOf(true);
  const attempts = history.slice(lastResponse + 1).filter((a) => a.direction === "outbound" && a.outcome !== "refused");
  if (!attempts.length) return null;
  const first = new Date(attempts[0].occurredAt);
  const last = attempts[attempts.length - 1].occurredAt;
  if (attempts.length > RETRY_OFFSETS.length) {
    return {
      kind: "no_response",
      attempts: attempts.length,
      due: toIsoDate(new Date(last)),
      title: `${attempts.length} próby bez odpowiedzi — spróbuj innym kanałem albo zamknij misję („Brak kontaktu”)`,
      lastAt: last,
    };
  }
  const offset = RETRY_OFFSETS[attempts.length - 1];
  const dueDate = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset);
  const channels = new Set(attempts.map((a) => a.channel));
  const hint = channels.size === 1 && channels.has("phone") ? " — tym razem może mail albo SMS" : "";
  return {
    kind: "retry",
    attempt: attempts.length + 1,
    due: toIsoDate(dueDate),
    title: `Ponów kontakt (próba ${attempts.length + 1} z ${RETRY_OFFSETS.length + 1})${hint}`,
    lastAt: last,
  };
}
