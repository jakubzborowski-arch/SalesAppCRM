"use client";

import { useEffect, useState } from "react";
import { getCopilot, categoryLabel } from "@/lib/playbook";
import { infeldDesk } from "@/lib/infeld";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import type { KnowledgeHint } from "@/lib/infeld-suggest";

function clip(text: string, n = 160) {
  const t = text.trim();
  if (!t) return "—";
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function CopilotPanel({ partner, mission }: { partner: Partner; mission: Mission }) {
  const { saveState, dbError, upsertNeed } = useStore();
  const { cards, warning } = getCopilot(mission.currentStage, partner, mission);
  const desk = infeldDesk(partner, mission);
  const [quote, setQuote] = useState("");
  const [kbHints, setKbHints] = useState<KnowledgeHint[]>([]);
  const [kbStatus, setKbStatus] = useState<"idle" | "loading" | "ok" | "empty" | "error">("idle");
  const [kbError, setKbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setKbStatus("loading");
    setKbError(null);
    void fetch("/api/infeld/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner, mission }),
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          hints?: KnowledgeHint[];
          error?: string;
          code?: string;
          empty?: boolean;
        };
        if (cancelled) return;
        if (res.status === 503 && data.code === "missing_key") {
          setKbHints([]);
          setKbStatus("error");
          setKbError("Brak klucza Infelda — dodaj INFELD_API_KEY w .env.local / Vercel.");
          return;
        }
        if (!res.ok) {
          setKbHints([]);
          setKbStatus("error");
          setKbError(data.error || "Infeld nie odpowiedział.");
          return;
        }
        const hints = data.hints ?? [];
        setKbHints(hints);
        setKbStatus(hints.length ? "ok" : "empty");
      })
      .catch(() => {
        if (cancelled) return;
        setKbStatus("error");
        setKbError("Nie udało się zapytać Infelda.");
      });
    return () => {
      cancelled = true;
    };
  }, [partner.id, mission.id, mission.currentStage, desk.facts.length]);

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
          Czyta tylko zatwierdzone fakty. Transkrypt i hipotezy nie są ofertą.
        </p>
        <p
          className={`mt-3 text-[11px] font-medium ${
            saveState === "error" ? "text-rose-600" : "text-lutra"
          }`}
        >
          {saveLabel}
        </p>

        <dl className="mt-4 space-y-3 text-[12px] leading-5 text-muted">
          <div>
            <dt className="font-semibold text-foreground">Fakty</dt>
            <dd>
              {desk.facts.length
                ? desk.facts.map((n) => n.title || n.description).join(" · ")
                : "Brak potwierdzonego faktu"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Obserwacje</dt>
            <dd>
              {desk.observations.length
                ? `${desk.observations.length} do potwierdzenia na mapie potrzeb`
                : "Brak hipotez"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Rekomendacja A/B/C</dt>
            <dd>
              {desk.facts.length
                ? `Wariant ${desk.recommended}${desk.offer ? ` · ${desk.offer.name}` : ""} — z potwierdzonych kategorii, nie z modelu.`
                : "Najpierw potwierdź choć jedną potrzebę."}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Wybrany wariant</dt>
            <dd>
              {mission.selectedVariant
                ? `${mission.selectedVariant}${desk.selected ? ` · ${desk.selected.name}` : ""}${mission.offerApproved ? " · zatwierdzony" : " · szkic"}`
                : "Nie wybrano"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Bramka</dt>
            <dd>{desk.blockers.length ? `Brakuje: ${desk.blockers.join(", ")}` : "Komplet na ten krok"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Następny krok</dt>
            <dd>
              {desk.nextStep}
              {desk.owner ? ` · ${desk.owner}` : ""}
            </dd>
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

      <div className="rounded-[28px] border border-chip-mid bg-white p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Z bazy Infelda
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted">
          Podpowiedzi z knowledge, nie z transkryptu. Fakty nadal zatwierdzasz Ty.
        </p>
        {kbStatus === "loading" ? (
          <p className="mt-3 text-[12px] text-muted">Szukam w Infeldzie…</p>
        ) : null}
        {kbStatus === "error" ? (
          <p className="mt-3 text-[12px] text-rose-600">{kbError}</p>
        ) : null}
        {kbStatus === "empty" ? (
          <p className="mt-3 text-[12px] text-muted">
            Infeld nic nie znalazł na ten krok. Wrzuć playbook do knowledge w Infeldzie.
          </p>
        ) : null}
        {kbHints.length ? (
          <div className="mt-3 space-y-4">
            {kbHints.map((card, i) => (
              <div key={`${card.title}-${i}`}>
                <p className="text-[13px] font-semibold text-foreground">{card.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-muted">{card.body}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-[28px] border border-chip-mid bg-white p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Na tym kroku
        </p>
        <div className="mt-3 space-y-4">
          {cards.map((card) => (
            <div key={card.title}>
              <p className="text-[13px] font-semibold text-foreground">{card.title}</p>
              <p className="mt-1 text-[12px] leading-5 text-muted">{card.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gold-ring/25 bg-cream px-4 py-3 text-[12px] leading-5 text-gold-dark">
        <p className="font-semibold">Nie obiecuj</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {desk.forbidden.slice(0, 4).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-2">{warning}</p>
      </div>

      {desk.facts.length ? (
        <p className="px-1 text-[11px] text-muted">
          Kategorie faktów: {desk.facts.map((n) => categoryLabel(n.category)).join(", ")}
        </p>
      ) : null}
    </aside>
  );
}
