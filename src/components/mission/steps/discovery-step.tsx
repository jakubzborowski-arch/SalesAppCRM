"use client";

import { useState } from "react";
import { TagInput, Field, inputClass } from "@/components/ui";
import { offerBlockers } from "@/lib/gates";
import { useInfeldHints } from "@/lib/use-infeld-hints";
import { useStore } from "@/lib/store";
import type { Mission, NeedCategory, Partner } from "@/lib/types";

const SUGGESTED_TAGS = ["Środa 16–19", "Min. 4 osoby", "Bez alkoholu", "Limit dzienny"];

const SLOTS = ["problem", "result", "constraint", "maker", "deadline", "attempts", "next", "fact"] as const;

export function DiscoveryStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { updateDiscovery, updateDecision, setNextStepAt, upsertNeed, confirmNeed, addPartnerContact } =
    useStore();
  const { loading, result } = useInfeldHints(partner, mission);
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const missing = offerBlockers(mission);
  const discovery = mission.discovery;
  const factConfirmed = mission.needs.some((need) => need.confirmed && need.status === "fact");

  const confirmFact = () => {
    const existing = mission.needs.find((need) => !need.confirmed) ?? mission.needs[0];
    if (existing) {
      confirmNeed(mission.id, existing.id, true);
      return;
    }
    const quote = discovery.quote.trim();
    const description = discovery.description.trim();
    if (!quote && !description) return;
    const category = (discovery.category || "off_peak") as NeedCategory;
    upsertNeed(mission.id, {
      id: crypto.randomUUID(),
      category,
      title: quote || description,
      description: description || quote,
      priority: discovery.priority,
      quote: quote || undefined,
      constraints: discovery.constraints.join(", ") || undefined,
      status: "fact",
      confirmed: true,
    });
  };

  const addContact = async () => {
    if (!contactName.trim()) return;
    setContactBusy(true);
    setContactError(null);
    const added = await addPartnerContact(partner.id, {
      name: contactName,
      role: contactRole,
      isDecisionMaker: true,
    });
    setContactBusy(false);
    if (!added.ok || !added.id) {
      setContactError(added.error ?? "Nie udało się dodać osoby.");
      return;
    }
    updateDiscovery(mission.id, { decisionMakerId: added.id });
    setContactName("");
    setContactRole("");
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Rozmowa</h2>
      <p className="mt-3 text-[15px] leading-6 text-foreground">
        {loading ? "Układam zdanie…" : result?.voice || "Infeld nie oddał zdania na ten krok."}
      </p>
      <p className={`mt-3 text-sm ${missing.length ? "text-amber-700" : "text-emerald-700"}`}>
        {missing.length ? `Brakuje do oferty: ${missing.join(", ")}.` : "Możesz iść do oferty."}
      </p>

      <div className="mt-5">
        <Field label="Cytat partnera">
          <input
            className={inputClass}
            placeholder="W środy między 16:00 a 19:00 mamy najmniejszy ruch."
            value={discovery.quote}
            onChange={(event) => updateDiscovery(mission.id, { quote: event.target.value })}
          />
        </Field>
      </div>

      {SLOTS.map((slot) => {
        if (slot === "problem") {
          return (
            <div key={slot} className="mt-4">
              <Field label="Problem">
                <textarea
                  className={`${inputClass} min-h-[72px]`}
                  placeholder="Co partnerowi nie działa."
                  value={discovery.description}
                  onChange={(event) => updateDiscovery(mission.id, { description: event.target.value })}
                />
              </Field>
            </div>
          );
        }
        if (slot === "result") {
          return (
            <div key={slot} className="mt-4">
              <Field label="Oczekiwany rezultat">
                <input
                  className={inputClass}
                  placeholder="Po czym poznają, że to ma sens."
                  value={mission.decision.expectedResult}
                  onChange={(event) => updateDecision(mission.id, { expectedResult: event.target.value })}
                />
              </Field>
            </div>
          );
        }
        if (slot === "constraint") {
          return (
            <div key={slot} className="mt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
                Ograniczenie
              </p>
              <TagInput
                value={discovery.constraints}
                suggestions={SUGGESTED_TAGS}
                placeholder="Co musi być wyłączone"
                onChange={(constraints) => updateDiscovery(mission.id, { constraints })}
              />
            </div>
          );
        }
        if (slot === "maker") {
          return (
            <div key={slot} className="mt-4">
              <Field label="Decydent">
                <select
                  className={inputClass}
                  value={discovery.decisionMakerId}
                  onChange={(event) => updateDiscovery(mission.id, { decisionMakerId: event.target.value })}
                >
                  <option value="">Wybierz osobę</option>
                  {partner.contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                      {contact.role ? ` · ${contact.role}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  className={inputClass}
                  placeholder="Imię i nazwisko"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                />
                <input
                  className={inputClass}
                  placeholder="Rola"
                  value={contactRole}
                  onChange={(event) => setContactRole(event.target.value)}
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
          );
        }
        if (slot === "deadline") {
          return (
            <div key={slot} className="mt-4">
              <Field label="Termin decyzji">
                <input
                  className={inputClass}
                  placeholder="Do końca tygodnia"
                  value={discovery.decisionDeadline}
                  onChange={(event) => updateDiscovery(mission.id, { decisionDeadline: event.target.value })}
                />
              </Field>
            </div>
          );
        }
        if (slot === "attempts") {
          return (
            <div key={slot} className="mt-4">
              <Field label="Wcześniejsze próby">
                <input
                  className={inputClass}
                  placeholder="Co nie zadziałało."
                  value={discovery.previousAttempts}
                  onChange={(event) => updateDiscovery(mission.id, { previousAttempts: event.target.value })}
                />
              </Field>
            </div>
          );
        }
        if (slot === "next") {
          return (
            <div key={slot} className="mt-4">
              <Field label="Następny krok">
                <input
                  className={inputClass}
                  placeholder="Recap i wariant A"
                  value={mission.decision.nextStep}
                  onChange={(event) => updateDecision(mission.id, { nextStep: event.target.value })}
                />
              </Field>
            </div>
          );
        }
        return (
          <div key={slot} className="mt-4">
            {factConfirmed ? (
              <p className="text-sm font-semibold text-emerald-700">Potwierdzone jako fakt.</p>
            ) : (
              <button
                type="button"
                onClick={confirmFact}
                disabled={!discovery.quote.trim() && !discovery.description.trim() && !mission.needs.length}
                className="rounded-full bg-lutra px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Potwierdź jako fakt
              </button>
            )}
          </div>
        );
      })}

      <div className="mt-4">
        <Field label="Data następnego kroku">
          <input
            type="date"
            className={inputClass}
            value={mission.nextStepAt?.slice(0, 10) ?? ""}
            onChange={(event) => setNextStepAt(mission.id, event.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}
