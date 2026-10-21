"use client";

import { useEffect, useState } from "react";
import { requestLocalDraft } from "@/components/mission/local-draft";
import type { LocalDraftMode } from "@/lib/local-llm";
import { getSupabase } from "@/lib/supabase";
import type { Mission, Partner, StageId } from "@/lib/types";

const AFTER_FACTS: StageId[] = ["discovery", "needs", "offer", "negotiation", "contract", "activation"];

export function DraftBubble({
  partner,
  mission,
  stage,
}: {
  partner: Partner;
  mission: Mission;
  stage: StageId;
}) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LocalDraftMode | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    void (sb ? sb.auth.getSession() : Promise.resolve({ data: { session: null } })).then(async ({ data }) => {
      const headers: Record<string, string> = {};
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
      try {
        const res = await fetch("/api/local-llm", { headers });
        const body = (await res.json()) as { enabled?: boolean };
        if (!cancelled) setEnabled(Boolean(body.enabled));
      } catch {
        if (!cancelled) setEnabled(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled || !AFTER_FACTS.includes(stage)) return null;

  const write = async (next: LocalDraftMode) => {
    setOpen(true);
    setMode(next);
    setBusy(true);
    setError(null);
    setCopied(false);
    setDraft("");
    try {
      setDraft(await requestLocalDraft(partner, mission, next));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message && !/fetch|network/i.test(message) ? message : "Nie udało się ułożyć szkicu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {open ? (
        <div className="w-[min(22rem,calc(100vw-3rem))] rounded-3xl border border-chip-mid bg-white p-4 shadow-[0_12px_40px_rgba(9,12,155,0.16)]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
              {mode === "mail" ? "Mail z faktów" : "Wniosek z faktów"}
            </p>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
              Zamknij
            </button>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            Skill czyta notatkę z dzwonienia i układa wniosek albo mail. Bez wysyłki.
          </p>
          {busy ? <p className="mt-3 text-sm text-muted">Pisze…</p> : null}
          {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}
          {draft ? (
            <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
              {draft}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(draft).then(() => setCopied(true));
                }}
                className="mt-2 block text-xs font-semibold text-lutra"
              >
                {copied ? "Skopiowane" : "Kopiuj szkic"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void write("wniosek")}
          className="rounded-full bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-lg disabled:opacity-50"
        >
          Wniosek
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void write("mail")}
          className="rounded-full bg-lutra px-4 py-2.5 text-sm font-medium text-white shadow-lg disabled:opacity-50"
        >
          Mail
        </button>
      </div>
    </div>
  );
}
