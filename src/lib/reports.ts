import { daysSince, daysUntil } from "./dates";
import { STAGES, type Activity, type Channel, type Mission, type MissionStatus, type StageId } from "./types";

export type ReportPeriod = 30 | 90 | 365 | "all";

export type ReportFilter = {
  /** Misje rozpoczęte w ostatnich N dniach (kontakty: zapisane w tym okresie). */
  period: ReportPeriod;
  /** Właściciel misji; `null` = cały zespół. */
  ownerId: string | null;
};

const STAGE_INDEX = new Map<StageId, number>(STAGES.map((s, i) => [s.id, i]));
const LAST_STAGE = STAGES.length - 1;
/** Wynik, który zamyka misję „na nie”. Pauza i „wrócić później” to jeszcze nie przegrana. */
const LOST: MissionStatus[] = ["lost", "no_fit"];
const POSITIVE = new Set(["connected", "replied", "meeting_booked"]);

function inPeriod(iso: string | undefined, period: ReportPeriod) {
  if (period === "all") return true;
  const days = daysSince(iso);
  return days !== null && days < period;
}

/** Najdalszy etap, do którego misja doszła (aktualny, ukończone, historia zmian). Wygrana = cały lejek. */
export function stageReached(mission: Mission) {
  if (mission.status === "won") return LAST_STAGE;
  let max = STAGE_INDEX.get(mission.currentStage) ?? 0;
  for (const stage of mission.completedStages) max = Math.max(max, STAGE_INDEX.get(stage) ?? 0);
  for (const event of mission.events) {
    if (event.kind !== "stage") continue;
    for (const value of [event.fromValue, event.toValue]) {
      const index = value ? STAGE_INDEX.get(value as StageId) : undefined;
      if (index !== undefined) max = Math.max(max, index);
    }
  }
  return max;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

function daysBetween(from?: string, to?: string) {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86400000);
}

export function selectMissions(missions: Mission[], filter: ReportFilter) {
  return missions.filter(
    (m) =>
      (filter.ownerId === null || m.ownerUserId === filter.ownerId) &&
      inPeriod(m.startedAt, filter.period),
  );
}

export type FunnelRow = {
  stage: StageId;
  label: string;
  /** Ile misji doszło co najmniej do tego etapu. */
  reached: number;
  /** % wszystkich misji z okresu. */
  shareOfStart: number;
  /** % misji z poprzedniego etapu, które przeszły dalej. `null` dla pierwszego etapu. */
  fromPrevious: number | null;
  /** Ile misji jest teraz na tym etapie (aktywnych). */
  activeNow: number;
  /** Ile misji przegrało na tym etapie. */
  lostHere: number;
};

export function funnel(missions: Mission[]): FunnelRow[] {
  const reached = missions.map(stageReached);
  const total = missions.length;
  return STAGES.map((stage, i) => {
    const count = reached.filter((r) => r >= i).length;
    const prev = i === 0 ? null : reached.filter((r) => r >= i - 1).length;
    return {
      stage: stage.id,
      label: stage.label,
      reached: count,
      shareOfStart: total ? Math.round((count / total) * 100) : 0,
      fromPrevious: prev === null ? null : prev ? Math.round((count / prev) * 100) : 0,
      activeNow: missions.filter((m) => m.status === "active" && m.currentStage === stage.id).length,
      lostHere: missions.filter((m) => LOST.includes(m.status) && m.currentStage === stage.id).length,
    };
  });
}

export type Outcomes = Record<MissionStatus, number> & {
  total: number;
  /** Wygrane / (wygrane + przegrane + brak dopasowania), w %. `null`, gdy nic się nie rozstrzygnęło. */
  winRate: number | null;
  medianDaysToWin: number | null;
  medianContactsToWin: number | null;
  medianDaysToLoss: number | null;
};

export function outcomes(missions: Mission[]): Outcomes {
  const count = (status: MissionStatus) => missions.filter((m) => m.status === status).length;
  const won = missions.filter((m) => m.status === "won");
  const lost = missions.filter((m) => LOST.includes(m.status));
  const decided = won.length + lost.length;
  return {
    total: missions.length,
    active: count("active"),
    won: won.length,
    lost: count("lost"),
    no_fit: count("no_fit"),
    nurture: count("nurture"),
    paused: count("paused"),
    winRate: decided ? Math.round((won.length / decided) * 100) : null,
    medianDaysToWin: median(won.map((m) => daysBetween(m.startedAt, m.closedAt)).filter((d): d is number => d !== null)),
    medianContactsToWin: median(won.map((m) => m.activities.length)),
    medianDaysToLoss: median(lost.map((m) => daysBetween(m.startedAt, m.closedAt)).filter((d): d is number => d !== null)),
  };
}

export type ReasonRow = { reason: string; count: number; share: number; stages: Partial<Record<StageId, number>> };

/** Powody zamknięcia „na nie” (przegrana i brak dopasowania), od najczęstszego. */
export function lossReasons(missions: Mission[]): ReasonRow[] {
  const lost = missions.filter((m) => LOST.includes(m.status));
  const map = new Map<string, ReasonRow>();
  for (const m of lost) {
    const reason = m.lossReason.trim() || "Bez podanego powodu";
    const row = map.get(reason) ?? { reason, count: 0, share: 0, stages: {} };
    row.count += 1;
    row.stages[m.currentStage] = (row.stages[m.currentStage] ?? 0) + 1;
    map.set(reason, row);
  }
  return [...map.values()]
    .map((row) => ({ ...row, share: Math.round((row.count / lost.length) * 100) }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "pl"));
}

export type ChannelRow = { channel: Channel | "other"; total: number; outbound: number; positive: number; noAnswer: number; positiveRate: number | null };

/** Kontakty z dziennika w okresie: ile prób i ile zakończyło się rozmową / odpowiedzią / spotkaniem. */
export function contactStats(missions: Mission[], filter: ReportFilter) {
  const activities: Activity[] = missions
    .flatMap((m) => m.activities)
    .filter(
      (a) =>
        inPeriod(a.occurredAt, filter.period) && (filter.ownerId === null || a.createdBy === filter.ownerId),
    );
  const channels = new Map<ChannelRow["channel"], ChannelRow>();
  for (const a of activities) {
    const row =
      channels.get(a.channel) ??
      { channel: a.channel, total: 0, outbound: 0, positive: 0, noAnswer: 0, positiveRate: null };
    row.total += 1;
    if (a.direction === "outbound") row.outbound += 1;
    if (a.outcome && POSITIVE.has(a.outcome)) row.positive += 1;
    if (a.outcome === "no_answer") row.noAnswer += 1;
    channels.set(a.channel, row);
  }
  const rows = [...channels.values()]
    .map((row) => ({ ...row, positiveRate: row.total ? Math.round((row.positive / row.total) * 100) : null }))
    .sort((a, b) => b.total - a.total);
  return { total: activities.length, rows };
}

/** Co wymaga uwagi teraz (niezależnie od okresu): stygnące misje i minione terminy decyzji. */
export function attention(missions: Mission[], ownerId: string | null, staleDays = 7) {
  const active = missions.filter((m) => m.status === "active" && (ownerId === null || m.ownerUserId === ownerId));
  const stale = active.filter((m) => {
    const quiet = daysSince(m.activities[0]?.occurredAt ?? m.startedAt);
    return quiet !== null && quiet >= staleDays;
  });
  const overdue = active.filter((m) => (daysUntil(m.decision.decisionDeadline) ?? 0) < 0);
  const soon = active.filter((m) => {
    const days = daysUntil(m.decision.decisionDeadline);
    return days !== null && days >= 0 && days <= 7;
  });
  return { stale, overdue, soon };
}
