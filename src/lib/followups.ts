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
