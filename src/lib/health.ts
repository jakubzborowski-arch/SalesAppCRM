import { monthLabel, previousMonth } from "./agenda";
import { careMissionOf } from "./care";
import { plural } from "./text";
import type { AppState, Mission, Partner, PartnerMetrics, PartnerMetricsInput } from "./types";

export type HealthLevel = "green" | "yellow" | "red" | "unknown";

export type PartnerHealth = { level: HealthLevel; reason: string };

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  green: "W porządku",
  yellow: "Do sprawdzenia",
  red: "Zagrożony",
  unknown: "Za wcześnie",
};

/** Ile dni po aktywacji bez metryk nie oceniamy zdrowia. */
export const HEALTH_GRACE_DAYS = 30;

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** „2026-10” przesunięte o `delta` miesięcy. */
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthOfIso(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Metryki partnera miesiąc po miesiącu (najnowsze pierwsze). Starsze wpisy „wysłałem informację o realizacjach”
 * (`care.reports`) liczą się jako realizacje, gdy za ten miesiąc nie ma metryk.
 */
export function metricsHistory(
  partnerId: string,
  metrics: PartnerMetrics[] | undefined,
  mission?: Pick<Mission, "care"> | null,
): PartnerMetrics[] {
  const own = (metrics ?? []).filter((m) => m.partnerId === partnerId && MONTH_RE.test(m.month));
  const months = new Set(own.map((m) => m.month));
  const legacy: PartnerMetrics[] = (mission?.care.reports ?? [])
    .filter((r) => MONTH_RE.test(r.month) && !months.has(r.month))
    .map((r) => ({
      id: `report:${r.month}`,
      partnerId,
      month: r.month,
      events: null,
      attendees: null,
      redemptions: r.count,
      notes: "",
      updatedAt: r.sentAt,
    }));
  return [...own, ...legacy].sort((a, b) => b.month.localeCompare(a.month));
}

/** Główna liczba miesiąca: realizacje zniżki w lokalu, uczestnicy w społeczności i firmie. */
export function usageOf(metric: PartnerMetricsInput | undefined, segment: Partner["segment"]): number | null {
  if (!metric) return null;
  if (segment === "venue") return metric.redemptions ?? metric.attendees;
  return metric.attendees ?? metric.redemptions;
}

/** Rzeczownik do liczby: „0 realizacji”, „2 realizacje”, „1 uczestnik”. Bez `n` — dopełniacz liczby mnogiej. */
export function usageNoun(segment: Partner["segment"], n = 0) {
  return segment === "venue" ? plural(n, "realizacja", "realizacje", "realizacji") : plural(n, "uczestnik", "uczestników", "uczestników");
}

function daysBetween(fromIso: string, today: Date) {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  return Math.floor((today.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Zdrowie partnera po aktywacji (czysta funkcja).
 * - unknown: brak wygranej współpracy albo aktywny krócej niż 30 dni i bez metryk,
 * - red: przegląd z decyzją „kończymy”, 0 realizacji/uczestników w 2 ostatnich pełnych miesiącach po aktywacji
 *   albo brak metryk za 2 ostatnie pełne miesiące po aktywacji,
 * - yellow: brak metryk za poprzedni miesiąc albo spadek o co najmniej 50% względem miesiąca wcześniej,
 * - green: w pozostałych przypadkach.
 * Pełny miesiąc = cały miesiąc kalendarzowy po miesiącu aktywacji, zakończony przed dzisiejszym.
 */
export function partnerHealth(input: {
  partner: Pick<Partner, "segment">;
  /** Misja z opieką (najnowsza wygrana) — `careMissionOf`. */
  mission: Pick<Mission, "status" | "care" | "activation" | "closedAt"> | undefined | null;
  /** Metryki tego partnera (np. z `metricsHistory`). */
  metrics: PartnerMetrics[];
  today?: Date;
}): PartnerHealth {
  const { partner, mission, metrics } = input;
  const today = input.today ?? new Date();
  if (!mission || mission.status !== "won") return { level: "unknown", reason: "Brak aktywnej współpracy." };
  if (mission.care.reviews[0]?.decision === "end") {
    return { level: "red", reason: "Przegląd po cyklu: decyzja „kończymy”." };
  }
  const activatedAt = mission.activation.activatedAt ?? mission.closedAt;
  const activationMonth = activatedAt ? monthOfIso(activatedAt) : null;
  if (!activatedAt || !activationMonth) return { level: "unknown", reason: "Brak daty aktywacji." };

  const byMonth = new Map(metrics.filter((m) => m.month >= activationMonth).map((m) => [m.month, m]));
  const age = daysBetween(activatedAt, today) ?? 0;
  if (age < HEALTH_GRACE_DAYS && !byMonth.size) {
    return { level: "unknown", reason: `Aktywny od ${Math.max(0, age)} dni — za wcześnie na ocenę.` };
  }

  const noun = usageNoun(partner.segment);
  const last = previousMonth(today);
  const before = shiftMonth(last, -1);
  // Dwa ostatnie pełne miesiące po aktywacji.
  if (before > activationMonth) {
    const pair = [byMonth.get(before), byMonth.get(last)];
    if (!pair[0] && !pair[1]) {
      return { level: "red", reason: `Brak metryk za ${monthLabel(before)} i ${monthLabel(last)}.` };
    }
    if (pair.every((m) => usageOf(m, partner.segment) === 0)) {
      return { level: "red", reason: `0 ${noun} przez 2 miesiące (${monthLabel(before)}, ${monthLabel(last)}).` };
    }
  }

  const lastMetric = byMonth.get(last);
  if (last >= activationMonth && !lastMetric) {
    return { level: "yellow", reason: `Brak metryk za ${monthLabel(last)}.` };
  }
  const lastUsage = usageOf(lastMetric, partner.segment);
  const beforeUsage = usageOf(byMonth.get(before), partner.segment);
  if (lastUsage !== null && beforeUsage !== null && beforeUsage > 0 && lastUsage <= beforeUsage * 0.5) {
    const drop = Math.round((1 - lastUsage / beforeUsage) * 100);
    return { level: "yellow", reason: `Spadek o ${drop}% (${beforeUsage} → ${lastUsage} ${usageNoun(partner.segment, lastUsage)}, ${monthLabel(last)}).` };
  }
  if (lastUsage === 0) return { level: "yellow", reason: `0 ${noun} za ${monthLabel(last)}.` };
  if (lastUsage !== null) return { level: "green", reason: `${monthLabel(last)}: ${lastUsage} ${usageNoun(partner.segment, lastUsage)}.` };
  return { level: "green", reason: "Metryki wpisane na bieżąco." };
}

/** Zdrowie partnera ze stanu CRM: misja z opieką + metryki (z dawnymi wpisami o realizacjach). */
export function healthFor(
  state: Pick<AppState, "missions" | "metrics">,
  partner: Pick<Partner, "id" | "segment">,
  today = new Date(),
): PartnerHealth {
  const mission = careMissionOf(state.missions, partner.id);
  if (state.metrics === undefined && mission?.status === "won") {
    return { level: "unknown", reason: "Metryki chwilowo niedostępne — odśwież stronę." };
  }
  return partnerHealth({ partner, mission, metrics: metricsHistory(partner.id, state.metrics, mission), today });
}
