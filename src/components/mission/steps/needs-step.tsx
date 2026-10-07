"use client";

import { useEffect, useState } from "react";
import { NEED_CATEGORIES, PRIORITIES, categoryLabel } from "@/lib/playbook";
import { offerBlockers } from "@/lib/gates";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Mission, NeedCategory, Partner } from "@/lib/types";
import { Field, TagInput, inputClass } from "@/components/ui";

const SUGGESTED_TAGS = ["Środa 16–19", "Min. 4 osoby", "Bez alkoholu", "Limit dzienny"];

function tagsFrom(text?: string) {
  return (text ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function NeedsStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const {
    seedNeedsIfEmpty,
    confirmNeed,
    updateDecision,
    updateDiscovery,
    upsertNeed,
    removeNeed,
    addPartnerContact,
  } = useStore();
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const missing = offerBlockers(mission);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quote, setQuote] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [category, setCategory] = useState<NeedCategory>("off_peak");
  const [priority, setPriority] = useState(3);
  const constraints = mission.discovery.constraints;

  useEffect(() => {
    seedNeedsIfEmpty(mission.id);
    // tylko raz na misję — seedNeedsIfEmpty w deps zapętlał setState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id]);

  const addNeed = () => {
    if (!title.trim() && !description.trim() && !quote.trim()) return;
    upsertNeed(mission.id, {
      id: crypto.randomUUID(),
      category,
      title: title.trim() || categoryLabel(category),
      description: description.trim(),
      priority,
      quote: quote.trim() || undefined,
      expectedResult: expectedResult.trim() || undefined,
      constraints: constraints.join(", ") || undefined,
      status: "observation",
      confirmed: false,
    });
    setTitle("");
    setDescription("");
    setQuote("");
    setExpectedResult("");
  };

  const addDecisionMaker = async () => {
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
      <h2 className="text-lg font-semibold">Mapa potrzeb</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Tylko to, co partner powiedział albo Ty potwierdzasz. Infeld nie dopisuje kart.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {mission.needs.map((need) => (
          <article
            key={need.id}
            className={cn(
              "rounded-2xl border px-4 py-4",
              need.confirmed ? "border-emerald-100 bg-emerald-50/50" : "border-chip-mid bg-surface",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground">
                {need.title}
                <span className="ml-1 text-sm font-medium text-muted">
                  {need.priority ? `${need.priority}/5` : "?"}
                </span>
              </h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-muted">
                {need.confirmed || need.status === "fact" ? "fakt" : "obserwacja"}
              </span>
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-navy">
              {categoryLabel(need.category)}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">{need.description}</p>
            {need.quote ? (
              <p className="mt-2 text-xs italic text-muted">„{need.quote}”</p>
            ) : null}
            {need.expectedResult ? (
              <p className="mt-2 text-xs text-muted">Rezultat: {need.expectedResult}</p>
            ) : null}
            {tagsFrom(need.constraints).length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {tagsFrom(need.constraints).map((tag) => (
                  <span key={tag} className="rounded-full bg-chip px-2 py-0.5 text-[10px] text-lutra">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => confirmNeed(mission.id, need.id, !need.confirmed)}
                className="text-xs font-semibold text-lutra"
              >
                {need.confirmed ? "Cofnij potwierdzenie" : "Potwierdź jako fakt"}
              </button>
              {!need.confirmed ? (
                <button
                  type="button"
                  onClick={() => removeNeed(mission.id, need.id)}
                  className="text-xs font-semibold text-rose-600"
                >
                  Usuń
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-chip-mid bg-surface px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Dodaj własną potrzebę
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Kategoria">
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as NeedCategory)}
            >
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
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Tytuł">
            <input
              className={inputClass}
              value={title}
              placeholder="Np. puste środy 16–19"
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Opis">
            <textarea
              className={cn(inputClass, "min-h-[72px]")}
              value={description}
              placeholder="Słowami z rozmowy"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Cytat partnera">
            <input
              className={inputClass}
              value={quote}
              placeholder="Dokładne słowa, jeśli padły"
              onChange={(e) => setQuote(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Oczekiwany rezultat">
            <input
              className={inputClass}
              value={expectedResult}
              placeholder="Po czym poznają, że zadziałało"
              onChange={(e) => setExpectedResult(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
            Warunki i ograniczenia
          </p>
          <TagInput
            value={constraints}
            suggestions={SUGGESTED_TAGS}
            placeholder="Własny warunek albo ograniczenie"
            onChange={(next) => updateDiscovery(mission.id, { constraints: next })}
          />
        </div>
        <button
          type="button"
          onClick={addNeed}
          className="mt-3 rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white"
        >
          Zapisz potrzebę
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-line px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Status diagnostyczny
        </p>
        <p className={cn("mt-2 text-sm font-medium", missing.length ? "text-amber-700" : "text-emerald-600")}>
          {missing.length ? `Brakuje do oferty: ${missing.join(", ")}` : "Fakty potwierdzone"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Oczekiwany rezultat">
            <input
              className={inputClass}
              value={mission.decision.expectedResult}
              placeholder="Pełniejsze środy 16–19 bez cięcia szczytu"
              onChange={(e) => updateDecision(mission.id, { expectedResult: e.target.value })}
            />
          </Field>
          <Field label="Następny krok">
            <input
              className={inputClass}
              value={mission.decision.nextStep}
              placeholder="Wysłać recap i wariant A do końca tygodnia"
              onChange={(e) => updateDecision(mission.id, { nextStep: e.target.value })}
            />
          </Field>
          <Field label="Decydent">
            <select
              className={inputClass}
              value={mission.decision.decisionMakerId || mission.discovery.decisionMakerId}
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
              placeholder="Np. piątek po recapie"
              value={mission.decision.decisionDeadline || mission.discovery.decisionDeadline}
              onChange={(e) => updateDiscovery(mission.id, { decisionDeadline: e.target.value })}
            />
          </Field>
          <Field label="Wcześniejsze próby">
            <input
              className={inputClass}
              placeholder="Co nie zadziałało w poprzednich promocjach?"
              value={mission.decision.previousAttempts || mission.discovery.previousAttempts}
              onChange={(e) => updateDiscovery(mission.id, { previousAttempts: e.target.value })}
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
              disabled={contactBusy}
              onClick={() => void addDecisionMaker()}
              className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {contactBusy ? "…" : "Dodaj"}
            </button>
          </div>
          {contactError ? <p className="mt-2 text-xs text-rose-600">{contactError}</p> : null}
        </div>
        {missing.includes("potwierdzona potrzeba (fakt)") ? (
          <p className="mt-3 text-xs text-amber-700">
            Potwierdź jedną kartę powyżej jako fakt — hipoteza AI nie otwiera oferty.
          </p>
        ) : null}
      </div>
    </div>
  );
}
