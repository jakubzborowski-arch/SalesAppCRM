"use client";

import { useState } from "react";
import { categoryLabel, CONTACT_CHANNELS } from "@/lib/playbook";
import { infeldDesk } from "@/lib/infeld";
import { readableInfeldCards } from "@/lib/infeld-suggest";
import { useInfeldHints } from "@/lib/use-infeld-hints";
import { STAGES } from "@/lib/types";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";

function clip(text: string, n = 160) {
  const t = text.trim();
  if (!t) return "—";
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function CopilotPanel({ partner, mission }: { partner: Partner; mission: Mission }) {
  const { saveState, dbError, upsertNeed } = useStore();
  const desk = infeldDesk(partner, mission);
  const { loading: infeldLoading, result: infeld } = useInfeldHints(partner, mission);
  const hints = readableInfeldCards(infeld?.hints ?? []);
  const klub = /klub/i.test(partner.category);
  const stageLabel = STAGES.find((s) => s.id === mission.currentStage)?.label ?? mission.currentStage;
  const channelLabel = CONTACT_CHANNELS.find((c) => c.id === mission.selectedChannel)?.label;
  const place = [partner.category, partner.city].filter(Boolean).join(" · ") || "lokal";
  const [quote, setQuote] = useState("");

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
        <h2 className="font-brand text-lg font-semibold text-navy">Infeld</h2>
        <p className="mt-1 text-xs leading-4 text-muted">
          {infeld?.composer === "mcp"
            ? `Z Infelda, krok ${stageLabel}${channelLabel ? ` · ${channelLabel}` : ""} · ${place}.`
            : `Krok ${stageLabel}${channelLabel ? ` · ${channelLabel}` : ""} · ${place}.`}
        </p>
        <p
          className={`mt-3 text-[11px] font-medium ${
            saveState === "error" || infeld?.error ? "text-rose-600" : "text-lutra"
          }`}
        >
          {infeldLoading
            ? "Układam zdanie na ten krok…"
            : infeld?.error && !infeld.voice
              ? infeld.error
              : infeld?.voice
                ? infeld.label
                : hints.length
                  ? `${hints.length} podpowiedzi z Infelda`
                  : saveLabel}
        </p>

        <div className={`mt-4 space-y-4 ${klub ? "max-h-[32rem] overflow-y-auto pr-1" : ""}`}>
          {infeld?.voice ? (
            <p className="whitespace-pre-wrap text-[13px] leading-5 text-foreground">{infeld.voice}</p>
          ) : null}
          {infeld?.voiceError ? (
            <p className="text-[12px] leading-5 text-rose-600">{infeld.voiceError}</p>
          ) : null}
          {infeld?.voice && hints.length ? (
            <details className="text-[12px] text-muted">
              <summary className="cursor-pointer font-medium text-foreground">Sekcja playbooka</summary>
              <div className="mt-3 space-y-4">
                {hints.map((hint) => (
                  <div key={hint.title}>
                    <p className="text-[13px] font-semibold text-foreground">{hint.title}</p>
                    <p className="mt-1 whitespace-pre-wrap leading-5">{hint.body}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            hints.map((hint) => (
              <div key={hint.title}>
                <p className="text-[13px] font-semibold text-foreground">{hint.title}</p>
                <p className={`mt-1 text-[12px] leading-5 text-muted ${klub ? "whitespace-pre-wrap" : ""}`}>
                  {hint.body}
                </p>
              </div>
            ))
          )}
        </div>

        <dl className="mt-4 space-y-2 border-t border-white/60 pt-3 text-[12px] leading-5 text-muted">
          <div>
            <dt className="font-semibold text-foreground">Fakty w tej misji</dt>
            <dd>
              {desk.facts.length
                ? desk.facts.map((n) => n.title || n.description).join(" · ")
                : "Brak potwierdzonego faktu — Infeld nie zrobi z tego oferty"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Bramka</dt>
            <dd>{desk.blockers.length ? `Brakuje: ${desk.blockers.join(", ")}` : "Komplet na ten krok"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-[28px] border border-chip-mid bg-white p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Z transkryptu
        </p>
        <p className="mt-2 text-[12px] leading-5 text-muted">
          {desk.latestTranscript
            ? clip(desk.latestTranscript)
            : "Brak gotowego transkryptu. Infeld nie zgaduje z nagrania."}
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
