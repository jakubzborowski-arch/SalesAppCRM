"use client";

import { useEffect, useState } from "react";
import { requestFactFill } from "@/components/mission/local-draft";
import { TagInput, Field, inputClass } from "@/components/ui";
import { offerBlockers } from "@/lib/gates";
import { getSupabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import type { Mission, NeedCategory, Partner } from "@/lib/types";

const SUGGESTED_TAGS = ["Środa 16–19", "Min. 4 osoby", "Bez alkoholu", "Limit dzienny"];

const KLUB_QUOTE = "W środy 20:00–22:00 przed DJ-em stoi pusto.";
const KLUB_PROBLEM = "Puste wtorki i środy 20:00–22:00 przed wejściem DJ-a. Niedziela i weekend zostają nietknięte.";
const KLUB_RESULT = "Jedna regularna grupa w środę.";
const KLUB_CONSTRAINTS = ["Od 8 osób", "Bez shotów", "Bez weekendu", "Tylko bar"];

function nextThursday() {
  const date = new Date();
  const delta = (4 + 7 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + delta);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const SLOTS = ["problem", "result", "constraint", "maker", "deadline", "attempts", "next", "fact"] as const;

export function DiscoveryStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { updateDiscovery, updateDecision, setNextStepAt, upsertNeed, confirmNeed, addPartnerContact } =
    useStore();
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [fillBusy, setFillBusy] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const [talkBusy, setTalkBusy] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);
  const [llmOn, setLlmOn] = useState(false);
  const klub = /klub/i.test(partner.category);
  const missing = offerBlockers(mission);
  const discovery = mission.discovery;
  const factConfirmed = mission.needs.some((need) => need.confirmed && need.status === "fact");

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    void (sb ? sb.auth.getSession() : Promise.resolve({ data: { session: null } })).then(async ({ data }) => {
      const headers: Record<string, string> = {};
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
      try {
        const res = await fetch("/api/local-llm", { headers });
        const body = (await res.json()) as { enabled?: boolean };
        if (!cancelled) setLlmOn(Boolean(body.enabled));
      } catch {
        if (!cancelled) setLlmOn(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fillFromTalk = async () => {
    setTalkBusy(true);
    setTalkError(null);
    try {
      const fields = await requestFactFill(partner, mission);
      let makerId = discovery.decisionMakerId;
      if (fields.makerName) {
        const existing = partner.contacts.find(
          (contact) => contact.name.toLocaleLowerCase("pl") === fields.makerName.toLocaleLowerCase("pl"),
        );
        if (existing) makerId = existing.id;
        else {
          const added = await addPartnerContact(partner.id, {
            name: fields.makerName,
            role: fields.makerRole,
            isDecisionMaker: true,
          });
          if (added.ok && added.id) makerId = added.id;
          else setTalkError(added.error ?? "Nie udało się dodać decydenta. Reszta pól jest uzupełniona.");
        }
      }
      updateDiscovery(mission.id, {
        ...(fields.quote ? { quote: fields.quote } : {}),
        ...(fields.problem ? { description: fields.problem } : {}),
        ...(fields.constraints.length ? { constraints: fields.constraints } : {}),
        ...(makerId ? { decisionMakerId: makerId } : {}),
        ...(fields.deadline ? { decisionDeadline: fields.deadline } : {}),
        ...(fields.attempts ? { previousAttempts: fields.attempts } : {}),
      });
      updateDecision(mission.id, {
        ...(fields.result ? { expectedResult: fields.result } : {}),
        ...(fields.nextStep ? { nextStep: fields.nextStep } : {}),
      });
      if (fields.nextStepAt) setNextStepAt(mission.id, fields.nextStepAt);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setTalkError(message && !/fetch|network/i.test(message) ? message : "Nie udało się odczytać rozmowy.");
    } finally {
      setTalkBusy(false);
    }
  };

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

  const fillKlub = async () => {
    setFillBusy(true);
    setFillError(null);
    let makerId =
      discovery.decisionMakerId ||
      partner.contacts.find((contact) => contact.isDecisionMaker)?.id ||
      partner.contacts[0]?.id ||
      "";
    if (!makerId) {
      const added = await addPartnerContact(partner.id, {
        name: "Manager",
        role: "menedżer",
        isDecisionMaker: true,
      });
      if (added.ok && added.id) makerId = added.id;
      else setFillError(added.error ?? "Nie udało się dodać decydenta. Reszta pól jest uzupełniona.");
    }
    updateDiscovery(mission.id, {
      category: "off_peak",
      categorySource: "human",
      priority: 4,
      quote: KLUB_QUOTE,
      description: KLUB_PROBLEM,
      constraints: [...KLUB_CONSTRAINTS],
      decisionMakerId: makerId,
      decisionDeadline: "Czwartek",
      previousAttempts: "Ladies night nie weszło.",
    });
    updateDecision(mission.id, {
      expectedResult: KLUB_RESULT,
      nextStep: "Recap i 15 min na wariant",
    });
    setNextStepAt(mission.id, nextThursday());
    const existing = mission.needs[0];
    upsertNeed(mission.id, {
      id: existing?.id ?? crypto.randomUUID(),
      category: "off_peak",
      title: "Puste środy przed DJ-em",
      description: KLUB_PROBLEM,
      priority: 4,
      quote: KLUB_QUOTE,
      expectedResult: KLUB_RESULT,
      constraints: KLUB_CONSTRAINTS.join(", "),
      status: "fact",
      confirmed: true,
    });
    setFillBusy(false);
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
      <p className={`mt-3 text-sm ${missing.length ? "text-amber-700" : "text-emerald-700"}`}>
        {missing.length ? `Brakuje do oferty: ${missing.join(", ")}.` : "Możesz iść do oferty."}
      </p>
      {klub ? (
        <div className="mt-4">
          <button
            type="button"
            disabled={fillBusy}
            onClick={() => void fillKlub()}
            className="rounded-full bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {fillBusy ? "Uzupełniam…" : "Uzupełnij dane klubu"}
          </button>
          <p className="mt-2 text-xs leading-5 text-muted">
            Wstawia pola z rozmowy klubowej: puste środy, ograniczenia, decydenta i następny krok. Możesz je
            poprawić.
          </p>
          {fillError ? <p className="mt-2 text-xs text-rose-600">{fillError}</p> : null}
        </div>
      ) : null}

      {llmOn && mission.conversationNote.trim().length >= 40 ? (
        <div className="mt-4">
          <button
            type="button"
            disabled={talkBusy}
            onClick={() => void fillFromTalk()}
            className="rounded-full bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {talkBusy ? "Czytam rozmowę…" : "Wypełnij pola z rozmowy"}
          </button>
          <p className="mt-2 text-xs leading-5 text-muted">
            Qwen bierze notatkę z dzwonienia i wstawia cytat, problem, ograniczenia i następny krok. Fakt
            zatwierdzasz sam.
          </p>
          {talkError ? <p className="mt-2 text-xs text-rose-600">{talkError}</p> : null}
        </div>
      ) : null}

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
