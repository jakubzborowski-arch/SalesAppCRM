"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { daysSince, daysUntil, formatPlDate, relativeDay, relativeDeadline } from "@/lib/dates";
import { MISSION_STATUS_LABEL, activityChannelLabel, activityOutcomeLabel, segmentLabel } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import { STAGES, type Mission, type MissionStatus, type Partner } from "@/lib/types";

const CLOSED: Array<{ id: MissionStatus; label: string }> = [
  { id: "won", label: "Wygrane" },
  { id: "lost", label: "Przegrane" },
  { id: "nurture", label: "Wrócić później" },
  { id: "no_fit", label: "Brak dopasowania" },
  { id: "paused", label: "Pauza" },
];

type Card = {
  key: string;
  href: string;
  title: string;
  meta: string;
  note?: string;
  last?: string;
  stale?: string;
  deadline?: { text: string; late: boolean };
  warn?: string;
};

/** Ile dni bez kontaktu uznajemy za „stygnie”. */
const STALE_DAYS = 7;

function partnerMeta(partner: Partner) {
  return [segmentLabel(partner.segment), partner.city, partner.category].filter(Boolean).join(" · ");
}

function missionCard(partner: Partner, mission: Mission): Card {
  const next = [mission.nextStepLabel, mission.nextStepAt].filter(Boolean).join(" · ");
  const closed = mission.status !== "active";
  const last = mission.activities[0];
  const quiet = daysSince(last?.occurredAt ?? mission.startedAt);
  const reason = [MISSION_STATUS_LABEL[mission.status], mission.lossReason].filter(Boolean).join(": ");
  return {
    key: mission.id,
    href: `/partners/${partner.id}/mission`,
    title: partner.name,
    meta: partnerMeta(partner),
    note: (closed ? reason : next) || undefined,
    last: last
      ? `Ostatni kontakt ${relativeDay(last.occurredAt)}: ${activityChannelLabel(last.channel).toLowerCase()}, ${activityOutcomeLabel(last.channel, last.outcome).toLowerCase()}`
      : "Brak zapisanych kontaktów",
    stale:
      !closed && quiet !== null && quiet >= STALE_DAYS
        ? `Bez kontaktu od ${quiet} dni`
        : undefined,
    deadline: deadlineBadge(mission),
    warn: partner.dnc ? "Nie kontaktować" : undefined,
  };
}

/** Termin decyzji partnera na karcie: od tygodnia przed terminem albo gdy minął. */
function deadlineBadge(mission: Mission): Card["deadline"] {
  if (mission.status !== "active") return undefined;
  const iso = mission.decision.decisionDeadline;
  const days = daysUntil(iso);
  if (days === null || days > 7) return undefined;
  return days < 0
    ? { text: `Termin decyzji minął ${relativeDeadline(iso)} (${formatPlDate(iso)})`, late: true }
    : { text: `Decyzja ${relativeDeadline(iso)} (${formatPlDate(iso)})`, late: false };
}

export default function BoardPage() {
  const { state } = useStore();
  const [view, setView] = useState<"open" | "closed">("open");

  const columns = useMemo(() => {
    const partnerOf = (id: string) => state.partners.find((p) => p.id === id);
    if (view === "closed") {
      return CLOSED.map((col) => ({
        id: col.id,
        label: col.label,
        cards: state.missions
          .filter((m) => m.status === col.id)
          .flatMap((mission) => {
            const partner = partnerOf(mission.partnerId);
            return partner ? [missionCard(partner, mission)] : [];
          }),
      }));
    }

    const withMission = new Set(state.missions.map((m) => m.partnerId));
    const idle: Card[] = state.partners
      .filter((p) => !withMission.has(p.id))
      .map((partner) => ({
        key: partner.id,
        href: `/partners/${partner.id}`,
        title: partner.name,
        meta: partnerMeta(partner),
        warn: partner.dnc ? "Nie kontaktować" : undefined,
      }));

    return [
      { id: "none", label: "Bez misji", cards: idle },
      ...STAGES.map((stage) => ({
        id: stage.id,
        label: stage.label,
        cards: state.missions
          .filter((m) => m.status === "active" && m.currentStage === stage.id)
          .flatMap((mission) => {
            const partner = partnerOf(mission.partnerId);
            return partner ? [missionCard(partner, mission)] : [];
          }),
      })),
    ];
  }, [state.missions, state.partners, view]);

  const openCount = state.missions.filter((m) => m.status === "active").length;
  const closedCount = state.missions.filter((m) => m.status !== "active").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-4 text-sm text-muted sm:px-6 lg:px-8 lg:py-6">
        <span>CRM / Tablica</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-xs font-semibold text-navy">
          {state.user.initials}
        </span>
      </div>
      <div className="px-4 pb-10 sm:px-6 lg:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">Workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Tablica misji</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Wspólny widok tego workspace. Handlowiec A i B widzą te same karty — nie tylko „swoje”.
          Karta nie zmienia etapu: bramki zostają w misji.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView("open")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium",
              view === "open" ? "bg-lutra text-white" : "bg-white text-muted",
            )}
          >
            W toku · {openCount}
          </button>
          <button
            type="button"
            onClick={() => setView("closed")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium",
              view === "closed" ? "bg-lutra text-white" : "bg-white text-muted",
            )}
          >
            Zamknięte · {closedCount}
          </button>
        </div>

        <div className="mt-5 flex gap-3 overflow-x-auto pb-4">
          {columns.map((column) => (
            <section
              key={column.id}
              className="flex w-[240px] shrink-0 flex-col rounded-[24px] border border-line bg-white"
            >
              <header className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">{column.label}</h2>
                <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium text-navy">
                  {column.cards.length}
                </span>
              </header>
              <div className="flex min-h-[120px] flex-col gap-2 px-3 pb-3">
                {column.cards.length === 0 ? (
                  <p className="px-1 py-4 text-xs text-muted">Pusto</p>
                ) : (
                  column.cards.map((card) => (
                    <Link
                      key={card.key}
                      href={card.href}
                      className="rounded-2xl border border-chip-mid bg-surface px-3 py-3 hover:border-blue"
                    >
                      <p className="font-semibold text-foreground">{card.title}</p>
                      <p className="mt-1 text-xs text-muted">{card.meta}</p>
                      {card.note ? <p className="mt-2 text-xs leading-5 text-foreground">{card.note}</p> : null}
                      {card.last ? <p className="mt-1 text-[11px] leading-4 text-muted">{card.last}</p> : null}
                      {card.stale ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-700">{card.stale}</p>
                      ) : null}
                      {card.deadline ? (
                        <p
                          className={cn(
                            "mt-1 text-[11px] font-medium",
                            card.deadline.late ? "text-rose-600" : "text-navy",
                          )}
                        >
                          {card.deadline.text}
                        </p>
                      ) : null}
                      {card.warn ? (
                        <p className="mt-2 text-[11px] font-medium text-rose-600">{card.warn}</p>
                      ) : null}
                    </Link>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
