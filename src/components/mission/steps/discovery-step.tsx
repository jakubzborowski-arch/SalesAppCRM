"use client";

import { useState } from "react";
import { NEED_CATEGORIES, PRIORITIES, categoryLabel } from "@/lib/playbook";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Mission, NeedCategory, Partner } from "@/lib/types";
import { Field, TagInput, inputClass } from "@/components/ui";

const SUGGESTED_TAGS = ["Środa 16–19", "Min. 4 osoby", "Bez alkoholu", "Limit dzienny"];

export function DiscoveryStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { updateDiscovery, upsertNeed, addPartnerContact } = useStore();
  const d = mission.discovery;
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [needTitle, setNeedTitle] = useState("");
  const [needDescription, setNeedDescription] = useState("");

  const addNeedFromDiscovery = () => {
    const description = needDescription.trim() || d.description.trim();
    const title = needTitle.trim();
    if (!title && !description && !d.quote.trim()) return;
    const category = (d.category || "off_peak") as NeedCategory;
    upsertNeed(mission.id, {
      id: crypto.randomUUID(),
      category,
      title: title || categoryLabel(category),
      description,
      priority: d.priority,
      quote: d.quote.trim() || undefined,
      constraints: d.constraints.join(", ") || undefined,
      status: "observation",
      confirmed: false,
    });
    setNeedTitle("");
    setNeedDescription("");
  };

  const addContact = async () => {
    if (!contactName.trim()) return;
    setContactBusy(true);
    setContactError(null);
    const result = await addPartnerContact(partner.id, {
      name: contactName,
      role: contactRole,
      isDecisionMaker: true,
    });
    setContactBusy(false);
    if (!result.ok || !result.id) {
      setContactError(result.error ?? "Nie udało się dodać osoby.");
      return;
    }
    updateDiscovery(mission.id, { decisionMakerId: result.id });
    setContactName("");
    setContactRole("");
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Rozmowa discovery</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Zbierz problem, rezultat, ograniczenia i proces decyzji. Hipoteza z transkryptu nie jest faktem, dopóki jej nie potwierdzisz.
      </p>

      {mission.calls?.some((c) => c.transcriptText?.trim()) ? (
        <div className="mt-4 max-h-48 overflow-auto rounded-2xl border border-chip-mid bg-surface px-4 py-3 text-xs leading-5 text-muted whitespace-pre-wrap">
          {mission.calls.find((c) => c.transcriptText?.trim())?.transcriptText}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Field label="Główna potrzeba · kategoria">
          <select
            className={inputClass}
            value={d.category}
            onChange={(e) =>
              updateDiscovery(mission.id, {
                category: e.target.value as NeedCategory,
                categorySource: "human",
              })
            }
          >
            <option value="">Wybierz kategorię</option>
            {NEED_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priorytet">
          <select
            className={inputClass}
            value={d.priority}
            onChange={(e) => updateDiscovery(mission.id, { priority: Number(e.target.value) })}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Własny opis potrzeby partnera">
          <textarea
            className={cn(inputClass, "min-h-[92px]")}
            placeholder="Słowami partnera albo Twoimi."
            value={d.description}
            onChange={(e) => updateDiscovery(mission.id, { description: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Cytat partnera">
          <input
            className={inputClass}
            placeholder="W środy między 16:00 a 19:00 mamy najmniejszy ruch."
            value={d.quote}
            onChange={(e) => updateDiscovery(mission.id, { quote: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Decydent">
          <select
            className={inputClass}
            value={d.decisionMakerId}
            onChange={(e) => updateDiscovery(mission.id, { decisionMakerId: e.target.value })}
          >
            <option value="">Wybierz osobę</option>
            {partner.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.role}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Termin decyzji">
          <input
            className={inputClass}
            placeholder="Do końca tygodnia"
            value={d.decisionDeadline}
            onChange={(e) => updateDiscovery(mission.id, { decisionDeadline: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-3 rounded-2xl border border-chip-mid bg-surface px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Dodaj decydenta, jeśli nie ma na liście
        </p>
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            className={inputClass}
            placeholder="Imię i nazwisko"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Rola, np. właściciel"
            value={contactRole}
            onChange={(e) => setContactRole(e.target.value)}
          />
          <button
            type="button"
            disabled={contactBusy || !contactName.trim()}
            onClick={() => void addContact()}
            className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {contactBusy ? "Zapis…" : "Dodaj"}
          </button>
        </div>
        {contactError ? <p className="mt-2 text-xs text-rose-600">{contactError}</p> : null}
      </div>

      <div className="mt-4">
        <Field label="Wcześniejsze próby">
          <input
            className={inputClass}
            placeholder="Co nie zadziałało w poprzednich promocjach?"
            value={d.previousAttempts}
            onChange={(e) => updateDiscovery(mission.id, { previousAttempts: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Warunki i ograniczenia
        </p>
        <TagInput
          value={d.constraints}
          suggestions={SUGGESTED_TAGS}
          placeholder="Własny warunek albo ograniczenie"
          onChange={(constraints) => updateDiscovery(mission.id, { constraints })}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-chip-mid bg-surface px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Kolejna własna potrzeba
        </p>
        <p className="mt-1 text-xs text-muted">
          Kategoria z listy powyżej, tytuł i opis Twoje. Trafi na mapę potrzeb jako obserwacja, nie fakt.
        </p>
        {mission.needs.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {mission.needs.map((need) => (
              <li key={need.id} className="rounded-full bg-chip px-3 py-1 text-xs text-lutra">
                {need.title}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Tytuł potrzeby">
            <input
              className={inputClass}
              value={needTitle}
              placeholder="Np. puste środy, za drogi alkohol"
              onChange={(e) => setNeedTitle(e.target.value)}
            />
          </Field>
          <Field label="Opis (opcjonalnie)">
            <input
              className={inputClass}
              value={needDescription}
              placeholder="Słowami z rozmowy"
              onChange={(e) => setNeedDescription(e.target.value)}
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={addNeedFromDiscovery}
          className="mt-3 rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white"
        >
          Zapisz potrzebę
        </button>
      </div>

      <p className="mt-5 text-xs text-muted">Pytania discovery na ten lokal — w Infeldzie po prawej.</p>
    </div>
  );
}
