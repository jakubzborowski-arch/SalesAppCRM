"use client";

import { useState } from "react";
import {
  DEFAULT_AGREEMENT_TEMPLATE,
  DEFAULT_CONTRACT_TEMPLATE,
  TEMPLATE_FIELDS,
  unknownFields,
} from "@/lib/contract-template";
import { useStore } from "@/lib/store";
import { Pills } from "@/components/ui";

type Kind = "contract" | "agreement";

const KINDS: { id: Kind; label: string }[] = [
  { id: "contract", label: "Umowa (PDF)" },
  { id: "agreement", label: "Porozumienie mailowe" },
];

function TemplateEditor({ kind }: { kind: Kind }) {
  const { state, saveContractTemplate, saveAgreementTemplate, dbStatus, schemaV6, schemaV7 } = useStore();
  const own = kind === "contract" ? state.workspace.contractTemplate : state.workspace.agreementTemplate;
  const fallback = kind === "contract" ? DEFAULT_CONTRACT_TEMPLATE : DEFAULT_AGREEMENT_TEMPLATE;
  const saved = own || fallback;
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const cloud = dbStatus === "ok" && Boolean(state.user.id);
  const schemaReady = kind === "contract" ? schemaV6 === true : schemaV7 === true;
  const canEdit = !cloud || (Boolean(state.user.isAdmin) && schemaReady);
  const unknown = draft ? unknownFields(draft) : [];

  const save = async (text: string) => {
    setBusy(true);
    setMessage(null);
    const result = await (kind === "contract" ? saveContractTemplate(text) : saveAgreementTemplate(text));
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? "Nie udało się zapisać szablonu." });
      return;
    }
    setDraft(null);
    setMessage({
      ok: true,
      text: kind === "contract" ? "Szablon zapisany. Nowe umowy wygenerują się z tej wersji." : "Szablon maila zapisany.",
    });
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          {own ? "Własny szablon zespołu." : "Szablon domyślny (wzór roboczy)."}{" "}
          {kind === "contract"
            ? "Krok Umowa składa z niego PDF z danymi partnera i misji (współpraca dłuższa niż 3 miesiące)."
            : "Krok Umowa wypełnia z niego mail z warunkami przy krótkiej współpracy (do 3 miesięcy). Pierwsza linia „Temat: …” to temat maila."}
        </p>
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
          {schemaReady
            ? "Szablon zmienia administrator zespołu."
            : `Edycja szablonu wymaga migracji ${kind === "contract" ? "v6" : "v7"} (pasek u góry strony).`}
        </p>
      ) : null}

      {draft !== null ? (
        <div className="mt-4">
          <textarea
            aria-label={kind === "contract" ? "Treść szablonu umowy" : "Treść szablonu porozumienia"}
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
              onClick={() => setDraft(fallback)}
              className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted"
            >
              Wstaw wzór domyślny
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-xs font-semibold text-muted">
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-navy">Podejrzyj aktualny szablon</summary>
          <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-2xl bg-surface px-4 py-3 font-mono text-[12px] leading-5 text-foreground">
            {saved}
          </pre>
        </details>
      )}
      {message ? (
        <p className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</p>
      ) : null}
    </div>
  );
}

/** Szablony zespołu: umowa (PDF) i porozumienie mailowe. Zmienia administrator, reszta czyta. */
export function ContractTemplateSection() {
  const [kind, setKind] = useState<Kind>("contract");
  return (
    <section className="mt-4 rounded-[28px] border border-line bg-white p-4 sm:p-6">
      <h2 className="font-semibold">Szablony umowy i porozumienia</h2>
      <p className="mt-1 text-sm text-muted">
        Do 3 miesięcy wystarczy porozumienie mailowe, dłużej — umowa w PDF z podpisami obu stron.
      </p>
      <div className="mt-4">
        <Pills value={kind} onChange={setKind} options={KINDS} size="sm" />
      </div>
      <TemplateEditor key={kind} kind={kind} />

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-navy">Pola do wstawienia i formatowanie</summary>
        <p className="mt-2 text-xs text-muted">
          „# ” na początku linii — tytuł, „## ” — nagłówek paragrafu, „- ” — punkt listy. Pusta linia rozdziela akapity.
          Puste pole zostaje w dokumencie jako „……………”, żeby było widać, co uzupełnić.
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
