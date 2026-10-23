"use client";

import { useState } from "react";
import { categoryLabel, CONTACT_CHANNELS } from "@/lib/playbook";
import { daysUntil, formatPlDate, isIsoDate, relativeDeadline } from "@/lib/dates";
import { missionDesk } from "@/lib/mission-desk";
import { STAGES } from "@/lib/types";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";

function clip(text: string, n = 160) {
  const t = text.trim();
  if (!t) return "—";
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** Prawy panel misji: stan zapisu, fakty, bramka kroku i cytat z transkryptu. Bez zewnętrznego AI. */
export function MissionPanel({ partner, mission }: { partner: Partner; mission: Mission }) {
  const { saveState, dbError, upsertNeed } = useStore();
  const desk = missionDesk(partner, mission);
  const stageLabel = STAGES.find((s) => s.id === mission.currentStage)?.label ?? mission.currentStage;
  const channelLabel = CONTACT_CHANNELS.find((c) => c.id === mission.selectedChannel)?.label;
  const place = [partner.category, partner.city].filter(Boolean).join(" · ") || "lokal";
  const [quote, setQuote] = useState("");
  const deadline = mission.decision.decisionDeadline || mission.discovery.decisionDeadline;
  const deadlineLate = (daysUntil(deadline) ?? 0) < 0 && mission.status === "active";

  const saveLabel =
    saveState === "saving"
      ? "Zapisuję do bazy…"
      : saveState === "saved"
        ? "Zapisane w Supabase"
        : saveState === "error"
          ? dbError || "Błąd zapisu w Supabase"
          : "Czeka na pierwszą zmianę";

  const addQuote = () => {
    const text = (quote.trim() || desk.latestTranscript).trim();
    if (!text) return;
    const category = desk.facts[0]?.category ?? (mission.discovery.category || "off_peak");
    upsertNeed(mission.id, {
      id: crypto.randomUUID(),
      category,
      title: "Cytat z rozmowy",
      description: clip(text, 220),
      priority: null,
      quote: text,
      status: "observation",
      confirmed: false,
    });
    setQuote("");
  };

  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-3">
      <div className="rounded-[28px] bg-chip p-5">
        <h2 className="font-brand text-lg font-semibold text-navy">Ta misja</h2>
        <p className="mt-1 text-xs leading-4 text-muted">
          Krok {stageLabel}
          {channelLabel ? ` · ${channelLabel}` : ""} · {place}.
        </p>
        <p className={`mt-3 text-[11px] font-medium ${saveState === "error" ? "text-rose-600" : "text-lutra"}`}>
          {saveLabel}
        </p>

        <dl className="mt-4 space-y-2 border-t border-white/60 pt-3 text-[12px] leading-5 text-muted">
          <div>
            <dt className="font-semibold text-foreground">Fakty w tej misji</dt>
            <dd>
              {desk.facts.length
                ? desk.facts.map((n) => n.title || n.description).join(" · ")
                : "Brak potwierdzonego faktu — bez tego nie ma oferty"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Termin decyzji</dt>
            <dd className={deadlineLate ? "font-semibold text-rose-600" : ""}>
              {isIsoDate(deadline)
                ? `${formatPlDate(deadline)} · ${deadlineLate ? `minął ${relativeDeadline(deadline)}` : relativeDeadline(deadline)}`
                : deadline.trim()
                  ? `„${deadline.trim()}” — ustaw datę w kroku Rozmowa`
                  : "Nie ustalony"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Bramka</dt>
            <dd>{desk.blockers.length ? `Brakuje: ${desk.blockers.join(", ")}` : "Komplet na ten krok"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-[28px] border border-chip-mid bg-white p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">Z transkryptu</p>
        <p className="mt-2 text-[12px] leading-5 text-muted">
          {desk.latestTranscript ? clip(desk.latestTranscript) : "Brak gotowego transkryptu."}
        </p>
        {desk.latestTranscript ? (
          <>
            <textarea
              className="mt-3 min-h-[72px] w-full rounded-2xl border border-chip-mid bg-surface px-3 py-2 text-[12px] outline-none focus:border-blue"
              placeholder="Wklej cytat partnera — trafi jako obserwacja, nie fakt"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            />
            <button
              type="button"
              onClick={addQuote}
              className="mt-2 rounded-full bg-lutra px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              Dodaj jako obserwację
            </button>
          </>
        ) : null}
      </div>

      {desk.facts.length ? (
        <p className="px-1 text-[11px] text-muted">
          Kategorie faktów: {desk.facts.map((n) => categoryLabel(n.category)).join(", ")}
        </p>
      ) : null}
    </aside>
  );
}
