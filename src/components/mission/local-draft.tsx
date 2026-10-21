"use client";

import { useEffect, useState } from "react";
import type { FactFields, LocalDraftMode } from "@/lib/local-llm";
import { getSupabase } from "@/lib/supabase";
import type { Mission, Partner, PartnerContact } from "@/lib/types";

function draftBody(partner: Partner, mission: Mission, mode: LocalDraftMode) {
  const maker =
    partner.contacts.find((contact) => contact.id === mission.decision.decisionMakerId) ??
    partner.contacts.find((contact) => contact.isDecisionMaker);
  const contact: PartnerContact | null = maker
    ? { id: maker.id, name: maker.name, role: maker.role, isDecisionMaker: true }
    : null;
  return {
    mode,
    partner: {
      ...partner,
      address: "",
      website: "",
      instagram: "",
      facebook: "",
      socialOther: "",
      notes: "",
      contacts: contact ? [contact] : [],
      consents: [],
    },
    mission: {
      ...mission,
      conversationNote: mission.conversationNote,
      calls: [],
      contract: { ...mission.contract, nip: "", address: "" },
      activation: { ...mission.activation, opsContactName: "", opsContactPhone: "" },
    },
  };
}

export async function requestFactFill(partner: Partner, mission: Mission) {
  const res = await fetch("/api/local-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(draftBody(partner, mission, "pola")),
  });
  const data = (await res.json()) as { fields?: FactFields; error?: string };
  if (!res.ok || !data.fields) throw new Error(data.error ?? "Nie udało się odczytać rozmowy.");
  return data.fields;
}

export async function requestLocalDraft(partner: Partner, mission: Mission, mode: LocalDraftMode) {
  const res = await fetch("/api/local-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(draftBody(partner, mission, mode)),
  });
  const data = (await res.json()) as { draft?: string; error?: string };
  if (!res.ok || !data.draft) throw new Error(data.error ?? "Nie udało się ułożyć szkicu.");
  return data.draft;
}

async function authHeaders(): Promise<Record<string, string>> {
  const sb = getSupabase();
  const session = sb ? (await sb.auth.getSession()).data.session : null;
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function LocalDraft({
  partner,
  mission,
  mode,
}: {
  partner: Partner;
  mission: Mission;
  mode: LocalDraftMode;
}) {
  const [enabled, setEnabled] = useState(false);
  const [place, setPlace] = useState<"mac" | "zen" | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authHeaders().then((headers) =>
      fetch("/api/local-llm", { headers })
        .then((res) => res.json())
        .then((data: { enabled?: boolean; place?: "mac" | "zen" }) => {
          if (cancelled) return;
          setEnabled(Boolean(data.enabled));
          setPlace(data.place ?? null);
        }),
    )
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  const write = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setDraft(await requestLocalDraft(partner, mission, mode));
    } catch (err) {
      setDraft("");
      const message = err instanceof Error ? err.message : "";
      setError(
        message && !/fetch|network/i.test(message)
          ? message
          : place === "zen"
            ? "Brak połączenia z OpenCode Zen."
            : "Brak połączenia z lokalnym modelem.",
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
  };

  return (
    <div className="mt-4 rounded-2xl border border-chip-mid bg-surface px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
        {mode === "umowa" ? "Szkic do umowy" : mode === "mail" ? "Mail z faktów" : "Wniosek z faktów"}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {mode === "umowa"
          ? "Qwen układa tekst z potwierdzonych pól. Telefon, mail, NIP i nagranie nie idą do modelu. To szkic do skopiowania, nie wiadomość do partnera."
          : place === "zen"
            ? "Skill czyta notatkę z dzwonienia i pola. Telefon, mail i NIP są wycinane. Notatka wychodzi na serwer Zenu. To szkic do skopiowania, nie wysyłka."
            : "Skill i Qwen czytają notatkę z dzwonienia oraz pola. Telefon, mail i NIP z notatki są wycinane. Zostaje na tym Macu. To szkic do skopiowania, nie wysyłka."}
      </p>
      <button
        type="button"
        onClick={() => void write()}
        disabled={busy}
        className="mt-3 rounded-full bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Pisze…" : mode === "umowa" ? "Ułóż, co powiedzieć" : mode === "mail" ? "Ułóż mail" : "Ułóż wniosek"}
      </button>
      {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}
      {draft ? (
        <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-white px-3 py-3 text-sm leading-6 text-foreground">
          {draft}
          <button type="button" onClick={() => void copy()} className="mt-2 block text-xs font-semibold text-lutra">
            {copied ? "Skopiowane" : "Kopiuj szkic"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
