"use client";

import { useState } from "react";
import { cleanCompany, companyErrors, companyMissing, formatNip } from "@/lib/company";
import { useStore } from "@/lib/store";
import type { CompanyData, Partner } from "@/lib/types";
import { Field, inputClass } from "@/components/ui";

const FIELDS: { key: keyof CompanyData; label: string; placeholder: string; wide?: boolean }[] = [
  { key: "legalName", label: "Nazwa firmy (z rejestru)", placeholder: "Nova Kawiarnie sp. z o.o.", wide: true },
  { key: "nip", label: "NIP", placeholder: "123-456-78-90" },
  { key: "regon", label: "REGON", placeholder: "9 albo 14 cyfr" },
  { key: "legalAddress", label: "Adres siedziby", placeholder: "ul. Długa 12, 31-147 Kraków", wide: true },
  { key: "mailingAddress", label: "Adres do korespondencji", placeholder: "Jeśli inny niż siedziba", wide: true },
  { key: "billingEmail", label: "E-mail do faktur", placeholder: "faktury@…" },
];

function shown(key: keyof CompanyData, value: string) {
  if (!value) return "—";
  return key === "nip" ? formatNip(value) : value;
}

/** Dane rejestrowe partnera. Trafiają do umowy, gdy pola umowy są puste. */
export function CompanyCard({ partner }: { partner: Partner }) {
  const { updatePartner, schemaV5, dbStatus } = useStore();
  const [draft, setDraft] = useState<CompanyData | null>(null);
  // Stan z chwili otwarcia formularza: zapisujemy tylko pola, które ktoś tu zmienił.
  const [opened, setOpened] = useState<CompanyData | null>(null);
  const company = partner.company;
  const missing = companyMissing(company);
  const errors = draft ? companyErrors(draft) : {};
  const blocked = dbStatus === "ok" && schemaV5 === false;

  const save = () => {
    if (!draft || !opened || Object.keys(errors).length) return;
    const next = cleanCompany(draft);
    const start = cleanCompany(opened);
    const changed = (Object.keys(next) as (keyof CompanyData)[]).filter((key) => next[key] !== start[key]);
    if (changed.length) {
      // Pola, których nie ruszano, zostają w wersji z bazy (np. REGON wpisany w międzyczasie przez kolegę).
      const merged = { ...partner.company };
      for (const key of changed) merged[key] = next[key];
      updatePartner(partner.id, { company: merged });
    }
    setDraft(null);
    setOpened(null);
  };

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(9,12,155,0.05)] lg:col-span-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-navy">Dane firmy</h2>
          <p className="mt-1 text-xs text-muted">
            {missing.length
              ? `Do umowy brakuje: ${missing.join(", ")}.`
              : "Komplet do umowy. Krok Umowa weźmie je stąd."}
          </p>
        </div>
        {draft ? null : (
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              const start = { ...company, nip: company.nip ? formatNip(company.nip) : "" };
              setDraft(start);
              setOpened(start);
            }}
            className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-lutra disabled:opacity-50"
          >
            {missing.length === 3 ? "Uzupełnij" : "Edytuj"}
          </button>
        )}
      </div>
      {blocked ? (
        <p className="mt-3 text-xs text-amber-700">Zapis danych firmy wymaga migracji v5 (pasek u góry strony).</p>
      ) : null}

      {draft ? (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {FIELDS.map((field) => (
            <div key={field.key} className={field.wide ? "sm:col-span-2" : ""}>
              <Field label={field.label}>
                <input
                  className={inputClass}
                  placeholder={field.placeholder}
                  value={draft[field.key]}
                  inputMode={field.key === "nip" || field.key === "regon" ? "numeric" : undefined}
                  onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                />
              </Field>
              {errors[field.key] ? <p className="mt-1 text-xs text-rose-600">{errors[field.key]}</p> : null}
            </div>
          ))}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={Object.keys(errors).length > 0}
              className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Zapisz dane firmy
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setOpened(null);
              }}
              className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted"
            >
              Anuluj
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{field.label}</dt>
              <dd className="mt-0.5 font-semibold text-foreground">{shown(field.key, company[field.key])}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
