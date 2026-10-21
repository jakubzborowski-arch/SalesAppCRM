"use client";

import { useState } from "react";
import { DEFAULT_CONTRACT_TEMPLATE, TEMPLATE_FIELDS, unknownFields } from "@/lib/contract-template";
import { useStore } from "@/lib/store";

/** Szablon umowy zespołu: tekst z polami {{…}}. Zmienia administrator, reszta czyta. */
export function ContractTemplateSection() {
  const { state, saveContractTemplate, dbStatus, schemaV6 } = useStore();
  const saved = state.workspace.contractTemplate || DEFAULT_CONTRACT_TEMPLATE;
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const cloud = dbStatus === "ok" && Boolean(state.user.id);
  const canEdit = !cloud || (Boolean(state.user.isAdmin) && schemaV6 === true);
  const unknown = draft ? unknownFields(draft) : [];

  const save = async (text: string) => {
    setBusy(true);
    setMessage(null);
    const result = await saveContractTemplate(text);
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? "Nie udało się zapisać szablonu." });
      return;
    }
    setDraft(null);
    setMessage({ ok: true, text: "Szablon zapisany. Nowe umowy wygenerują się z tej wersji." });
  };

  return (
    <section className="mt-4 rounded-[28px] border border-line bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Szablon umowy</h2>
          <p className="mt-1 text-sm text-muted">
            {state.workspace.contractTemplate ? "Własny szablon zespołu." : "Szablon domyślny (wzór roboczy)."} Krok
            Umowa składa z niego PDF z danymi partnera i misji.
          </p>
        </div>
        {draft === null && canEdit ? (
          <button
            type="button"
            onClick={() => setDraft(saved)}
            className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-lutra"
          >
            Edytuj szablon
          </button>
        ) : null}
      </div>
      {!canEdit ? (
        <p className="mt-2 text-xs text-muted">
          {schemaV6 === true ? "Szablon zmienia administrator zespołu." : "Edycja szablonu wymaga migracji v6."}
        </p>
      ) : null}

      {draft !== null ? (
        <div className="mt-4">
          <textarea
            aria-label="Treść szablonu umowy"
            className="min-h-[360px] w-full rounded-2xl border border-chip-mid bg-surface px-4 py-3 font-mono text-[12px] leading-5 outline-none focus:border-blue"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {unknown.length ? (
            <p className="mt-2 text-xs text-amber-700">
              Nieznane pola: {unknown.map((key) => `{{${key}}}`).join(", ")} — zostaną puste.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => void save(draft)}
              className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Zapisuję…" : "Zapisz szablon"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_CONTRACT_TEMPLATE)}
              className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted"
            >
              Wstaw wzór domyślny
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-xs font-semibold text-muted">
              Anuluj
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</p>
      ) : null}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-navy">Pola do wstawienia i formatowanie</summary>
        <p className="mt-2 text-xs text-muted">
          „# ” na początku linii — tytuł, „## ” — nagłówek paragrafu, „- ” — punkt listy. Pusta linia rozdziela
          akapity.
        </p>
        <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          {TEMPLATE_FIELDS.map((field) => (
            <li key={field.key}>
              <code className="rounded bg-chip px-1.5 py-0.5 text-navy">{`{{${field.key}}}`}</code>{" "}
              <span className="text-muted">{field.label}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
