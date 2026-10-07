"use client";

import { useStore } from "@/lib/store";

export default function SettingsPage() {
  const { reset, state, dbStatus, authEmail, signOut } = useStore();

  const mode =
    dbStatus === "ok"
      ? "Supabase — zapis w chmurze"
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
          Misje zapisują się w Twoim projekcie Supabase, z kopią w przeglądarce na wypadek offline.
        </p>

        <section className="mt-6 rounded-[28px] border border-line bg-white p-6">
          <h2 className="font-semibold">Połączenie</h2>
          <p className="mt-2 text-sm text-muted">
            Workspace: {state.workspace.name}. Konto: {authEmail ?? "—"}.
          </p>
          <p className="mt-1 text-sm text-muted">Tryb danych: {mode}.</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-4 rounded-full border border-line px-4 py-2 text-sm text-muted"
          >
            Wyloguj
          </button>
        </section>

        <section className="mt-4 rounded-[28px] border border-line bg-white p-6">
          <h2 className="font-semibold">Czego nie obiecywać</h2>
          <p className="mt-2 text-sm text-muted">
            Lista zakazów jest w Infeldzie (playbook / guardrails). CRM jej nie dubluje.
          </p>
        </section>

        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full border border-line px-4 py-2 text-sm text-muted"
        >
          Resetuj dane demo
        </button>
      </div>
    </div>
  );
}
