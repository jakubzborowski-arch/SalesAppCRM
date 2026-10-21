"use client";

import { useState } from "react";
import { isValidEmail } from "@/lib/company";
import { useStore } from "@/lib/store";
import type { Partner, PartnerContact } from "@/lib/types";
import { Field, inputClass } from "@/components/ui";

type BasicKey =
  | "name"
  | "city"
  | "address"
  | "category"
  | "subcategory"
  | "hours"
  | "website"
  | "instagram"
  | "facebook"
  | "socialOther"
  | "source"
  | "priorityReason"
  | "notes";

const BASIC: { key: BasicKey; label: string; wide?: boolean; long?: boolean }[] = [
  { key: "name", label: "Nazwa lokalu" },
  { key: "city", label: "Miasto" },
  { key: "address", label: "Adres lokalu", wide: true },
  { key: "category", label: "Kategoria" },
  { key: "subcategory", label: "Subkategoria" },
  { key: "hours", label: "Godziny" },
  { key: "website", label: "Strona www" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "socialOther", label: "Inne social" },
  { key: "source", label: "Źródło" },
  { key: "priorityReason", label: "Uzasadnienie priorytetu", wide: true, long: true },
  { key: "notes", label: "Notatka", wide: true, long: true },
];

function basicOf(partner: Partner): Record<BasicKey, string> {
  return Object.fromEntries(BASIC.map(({ key }) => [key, (partner[key] as string | undefined) ?? ""])) as Record<
    BasicKey,
    string
  >;
}

/** Edycja podstawowych danych karty. Zapisuje tylko pola, które zmieniono w formularzu. */
export function PartnerBasicsForm({ partner, onDone }: { partner: Partner; onDone: () => void }) {
  const { updatePartner } = useStore();
  const [opened] = useState(() => basicOf(partner));
  const [draft, setDraft] = useState(opened);
  const nameMissing = !draft.name.trim();

  const save = () => {
    if (nameMissing) return;
    const patch: Partial<Partner> = {};
    for (const { key } of BASIC) {
      const value = draft[key].trim();
      if (value !== opened[key].trim()) (patch as Record<string, string>)[key] = value;
    }
    if (Object.keys(patch).length) updatePartner(partner.id, patch);
    onDone();
  };

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {BASIC.map((field) => (
        <div key={field.key} className={field.wide ? "sm:col-span-2" : ""}>
          <Field label={field.label}>
            {field.long ? (
              <textarea
                className={inputClass}
                rows={2}
                value={draft[field.key]}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
              />
            ) : (
              <input
                className={inputClass}
                value={draft[field.key]}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
              />
            )}
          </Field>
        </div>
      ))}
      {nameMissing ? <p className="text-xs text-rose-600 sm:col-span-2">Nazwa lokalu jest wymagana.</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={nameMissing}
          className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Zapisz zmiany
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}

type ContactDraft = Pick<PartnerContact, "name" | "role" | "phone" | "email" | "linkedin" | "isDecisionMaker">;

function contactDraft(contact?: PartnerContact): ContactDraft {
  return {
    name: contact?.name ?? "",
    role: contact?.role ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    linkedin: contact?.linkedin ?? "",
    isDecisionMaker: contact?.isDecisionMaker ?? false,
  };
}

/** Edycja jednego kontaktu albo dodanie nowego. */
export function ContactForm({
  partner,
  contact,
  onDone,
}: {
  partner: Partner;
  contact?: PartnerContact;
  onDone: () => void;
}) {
  const { updatePartnerContact, addPartnerContact } = useStore();
  const [draft, setDraft] = useState(() => contactDraft(contact));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailBad = Boolean(draft.email?.trim()) && !isValidEmail(draft.email ?? "");

  const save = async () => {
    if (!draft.name.trim() || emailBad) return;
    const clean: ContactDraft = {
      name: draft.name.trim(),
      role: draft.role.trim(),
      phone: draft.phone?.trim() || undefined,
      email: draft.email?.trim() || undefined,
      linkedin: draft.linkedin?.trim() || undefined,
      isDecisionMaker: draft.isDecisionMaker,
    };
    if (contact) {
      updatePartnerContact(partner.id, contact.id, clean);
      onDone();
      return;
    }
    setBusy(true);
    const added = await addPartnerContact(partner.id, {
      name: clean.name,
      role: clean.role,
      isDecisionMaker: clean.isDecisionMaker,
    });
    setBusy(false);
    if (!added.ok || !added.id) {
      setError(added.error ?? "Nie udało się dodać osoby.");
      return;
    }
    // Telefon, e-mail i LinkedIn dopisujemy do świeżo dodanego kontaktu (zapis w tle).
    updatePartnerContact(partner.id, added.id, clean);
    onDone();
  };

  const set = (key: keyof ContactDraft, value: string | boolean) => setDraft({ ...draft, [key]: value });

  return (
    <form
      className="mt-3 grid gap-2 rounded-2xl bg-surface p-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field label="Imię i nazwisko">
        <input className={inputClass} value={draft.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Rola">
        <input className={inputClass} value={draft.role} onChange={(e) => set("role", e.target.value)} />
      </Field>
      <Field label="Telefon">
        <input className={inputClass} value={draft.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="E-mail">
        <input className={inputClass} value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="LinkedIn">
          <input className={inputClass} value={draft.linkedin ?? ""} onChange={(e) => set("linkedin", e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.isDecisionMaker}
          onChange={(e) => set("isDecisionMaker", e.target.checked)}
        />
        Główny decydent
      </label>
      {emailBad ? <p className="text-xs text-rose-600 sm:col-span-2">Niepoprawny e-mail.</p> : null}
      {error ? <p className="text-xs text-rose-600 sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={busy || !draft.name.trim() || emailBad}
          className="rounded-full bg-lutra px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Zapis…" : contact ? "Zapisz osobę" : "Dodaj osobę"}
        </button>
        <button type="button" onClick={onDone} className="text-xs font-semibold text-muted">
          Anuluj
        </button>
      </div>
    </form>
  );
}
