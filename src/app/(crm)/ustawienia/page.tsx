"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { listInvites as fetchInvites } from "@/lib/db";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { TeamInvite } from "@/lib/types";
import { Field, inputClass } from "@/components/ui";

function inviteLink(token: string) {
  return `${window.location.origin}/login?invite=${token}`;
}

function TeamSection() {
  const { state, schemaV4, createInvite, revokeInvite, removeMember, renameWorkspace, refresh } = useStore();
  const isAdmin = Boolean(state.user.isAdmin);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [name, setName] = useState(state.workspace.name);
  const [nameSaved, setNameSaved] = useState(false);

  const loadInvites = useCallback(async () => {
    try {
      setInvites(await fetchInvites());
    } catch {
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin || schemaV4 !== true) return;
    let cancelled = false;
    fetchInvites()
      .then((rows) => {
        if (!cancelled) setInvites(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAdmin, schemaV4]);

  if (schemaV4 === false) {
    return (
      <section className="mt-4 rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <h2 className="font-semibold">Zespół</h2>
        <p className="mt-2">
          Wspólny workspace wymaga migracji bazy v4. W Supabase otwórz SQL Editor, wklej cały plik
          supabase/v4-team-timeline.sql i kliknij Run. Potem odśwież tę stronę.
        </p>
      </section>
    );
  }

  const admins = state.team.filter((member) => member.role === "admin");

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    const result = await createInvite(email);
    setBusy(false);
    if (!result.ok || !result.token) {
      setError(result.error ?? "Nie udało się utworzyć zaproszenia.");
      return;
    }
    setLink(inviteLink(result.token));
    setEmail("");
    void loadInvites();
  };

  return (
    <section className="mt-4 rounded-[28px] border border-line bg-white p-6">
      <h2 className="font-semibold">Zespół</h2>
      <p className="mt-1 text-sm text-muted">
        Wszyscy w workspace widzą tych samych partnerów, misje, dziennik kontaktów i umowy.
      </p>

      {isAdmin ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await renameWorkspace(name);
            setError(result.ok ? null : (result.error ?? "Nie udało się zmienić nazwy."));
            setNameSaved(result.ok);
          }}
        >
          <div className="min-w-[220px] flex-1">
            <Field label="Nazwa workspace">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameSaved(false);
                }}
              />
            </Field>
          </div>
          <button type="submit" className="rounded-full border border-line px-4 py-3 text-sm text-muted">
            {nameSaved ? "Zapisano" : "Zmień nazwę"}
          </button>
        </form>
      ) : null}

      <ul className="mt-5 divide-y divide-line rounded-2xl border border-line">
        {state.team.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div>
              <p className="font-medium text-foreground">
                {member.fullName}
                {member.isMe ? <span className="ml-2 text-xs text-muted">(Ty)</span> : null}
              </p>
              <p className="text-xs text-muted">{member.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-chip px-2.5 py-0.5 text-[11px] font-medium text-navy">
                {member.role === "admin" ? "Administrator" : "Handlowiec"}
              </span>
              {isAdmin && !member.isMe ? (
                confirmRemove === member.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      className="font-semibold text-rose-600"
                      onClick={async () => {
                        const result = await removeMember(member.id);
                        setConfirmRemove(null);
                        setError(result.ok ? null : (result.error ?? "Nie udało się usunąć osoby."));
                      }}
                    >
                      Odbierz dostęp
                    </button>
                    <button type="button" className="text-muted" onClick={() => setConfirmRemove(null)}>
                      Anuluj
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-rose-600"
                    onClick={() => setConfirmRemove(member.id)}
                  >
                    Usuń z zespołu
                  </button>
                )
              ) : null}
            </div>
          </li>
        ))}
        {state.team.length === 0 ? <li className="px-4 py-3 text-sm text-muted">Ładuję zespół…</li> : null}
      </ul>

      {isAdmin ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground">Zaproś handlowca</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            Dostajesz jednorazowy link na 14 dni. Wyślij go sam (mail, Slack). Z adresem e-mail link zadziała tylko
            dla konta z tym adresem.
          </p>
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={submitInvite}>
            <div className="min-w-[240px] flex-1">
              <Field label="E-mail osoby" optional>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="ola@firma.pl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-lutra px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Tworzę…" : "Utwórz link"}
            </button>
          </form>
          {link ? (
            <div className="mt-3 rounded-2xl bg-surface px-4 py-3 text-xs">
              <p className="break-all font-mono text-foreground">{link}</p>
              <button
                type="button"
                className="mt-2 font-semibold text-lutra"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? "Skopiowano" : "Kopiuj link"}
              </button>
              <p className="mt-1 text-muted">Link widzisz tylko teraz. W bazie zostaje wyłącznie jego skrót.</p>
            </div>
          ) : null}

          {invites.length ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-navy">Czekające zaproszenia</p>
              <ul className="mt-2 space-y-2 text-sm">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {invite.email ?? "bez adresu"}
                      <span className="ml-2 text-xs text-muted">
                        do {new Date(invite.expiresAt).toLocaleDateString("pl-PL")}
                        {invite.createdByName ? ` · od ${invite.createdByName}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-rose-600"
                      onClick={async () => {
                        const result = await revokeInvite(invite.id);
                        setError(result.ok ? null : (result.error ?? "Nie udało się cofnąć."));
                        void loadInvites();
                      }}
                    >
                      Cofnij
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted">
          Nowe osoby zaprasza administrator
          {admins.length ? `: ${admins.map((member) => member.fullName).join(", ")}` : ""}.
        </p>
      )}

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      <button type="button" onClick={() => void refresh()} className="mt-4 text-xs font-semibold text-lutra">
        Odśwież dane zespołu
      </button>
    </section>
  );
}

function JoinSection() {
  const { checkInvite, schemaV4 } = useStore();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (schemaV4 === false) return null;

  return (
    <section className="mt-4 rounded-[28px] border border-line bg-white p-6">
      <h2 className="font-semibold">Masz zaproszenie do zespołu?</h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Wklej link albo kod. Najpierw zobaczysz, do jakiego zespołu dołączasz i co stanie się z Twoimi danymi.
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const outcome = await checkInvite(value);
          setBusy(false);
          setError(outcome.ok ? null : (outcome.error ?? "Nie udało się sprawdzić zaproszenia."));
          if (outcome.ok) {
            setValue("");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
      >
        <div className="min-w-[280px] flex-1">
          <Field label="Link albo kod zaproszenia">
            <input className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </div>
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="rounded-full bg-navy px-5 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "Sprawdzam…" : "Sprawdź zaproszenie"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
    </section>
  );
}

export default function SettingsPage() {
  const { reset, state, dbStatus, authEmail, signOut } = useStore();
  const cloud = isSupabaseConfigured();

  const mode =
    dbStatus === "ok"
      ? cloud
        ? "Supabase — zapis w chmurze"
        : "demo w przeglądarce"
      : dbStatus === "need-sql"
        ? "Supabase podłączony, czeka na SQL"
        : dbStatus === "error"
          ? "Błąd połączenia"
          : "lokalny";

  return (
    <div>
      <div className="flex items-center justify-end gap-3 px-8 py-6 text-sm text-muted">
        CRM / Ustawienia
      </div>
      <div className="max-w-3xl px-8 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Ustawienia</h1>
        <p className="mt-2 text-sm text-muted">
          {cloud
            ? "Dane zapisują się w Twoim projekcie Supabase. Przeglądarka nie trzyma kopii kontaktów."
            : "Tryb demo: dane zostają tylko w tej przeglądarce."}
        </p>

        <section className="mt-6 rounded-[28px] border border-line bg-white p-6">
          <h2 className="font-semibold">Połączenie</h2>
          <p className="mt-2 text-sm text-muted">
            Workspace: {state.workspace.name}. Konto: {authEmail ?? "—"}.
          </p>
          <p className="mt-1 text-sm text-muted">Tryb danych: {mode}.</p>
          {cloud ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-4 rounded-full border border-line px-4 py-2 text-sm text-muted"
            >
              Wyloguj
            </button>
          ) : null}
        </section>

        {cloud && dbStatus === "ok" ? (
          <>
            <TeamSection key={state.workspace.id} />
            <JoinSection />
          </>
        ) : null}

        <section className="mt-4 rounded-[28px] border border-line bg-white p-6">
          <h2 className="font-semibold">Czego nie obiecywać</h2>
          <p className="mt-2 text-sm text-muted">
            Lista zakazów jest w Infeldzie (playbook / guardrails). CRM jej nie dubluje.
          </p>
        </section>

        {cloud ? null : (
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full border border-line px-4 py-2 text-sm text-muted"
          >
            Resetuj dane demo
          </button>
        )}
      </div>
    </div>
  );
}
