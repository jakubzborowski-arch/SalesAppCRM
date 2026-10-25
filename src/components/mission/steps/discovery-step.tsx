"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { TagInput, Field, HelpLink, inputClass, Requirements } from "@/components/ui";
import { NeedsMap } from "@/components/mission/needs-map";
import { openTalk } from "@/components/mission/talk-bubble";
import { readyTranscripts } from "@/lib/discovery-extract";
import { offerChecks } from "@/lib/gates";
import { NEED_CATEGORIES, PRIORITIES } from "@/lib/playbook";
import { formatPlDate, parseDeadline, toIsoDate } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { DeadlineField } from "@/components/mission/deadline-field";
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

/** Transkrypt ze Spinach → pola Discovery. Sama ekstrakcja i podgląd są w bąbelku „Notatka z rozmowy”. */
function TalkCallout({ mission }: { mission: Mission }) {
  const latest = readyTranscripts(mission)[0];
  const day = latest ? formatPlDate(toIsoDate(new Date(latest.createdAt))) : "";
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-chip-mid bg-surface px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <MessageSquareText size={18} className="mt-0.5 shrink-0 text-navy" aria-hidden />
        <p className="text-sm leading-5 text-foreground">
          {latest
            ? `Transkrypt rozmowy z ${day} jest w notatce. AI zaproponuje pola, a Ty zaznaczysz, co wstawić.`
            : "Rozmowa nagrana w Spinach? Wklej transkrypt — AI zaproponuje pola Discovery do sprawdzenia."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => openTalk(latest ? "fill" : "transcript")}
        className="rounded-full bg-navy px-4 py-2 text-sm font-medium text-white"
      >
        {latest ? "Wypełnij pola z rozmowy" : "Wklej transkrypt"}
      </button>
    </div>
  );
}

const SLOTS = ["problem", "result", "constraint", "maker", "deadline", "attempts", "next", "fact"] as const;

export function DiscoveryStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { updateDiscovery, updateDecision, setNextStepAt, upsertNeed, addPartnerContact } = useStore();
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [fillBusy, setFillBusy] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const [factError, setFactError] = useState<string | null>(null);
  const klub = /klub/i.test(partner.category);
  const checks = offerChecks(mission, partner);
  // Lokal: rezultat, termin decyzji i wcześniejsze próby nie blokują oferty.
  const venue = partner.segment === "venue";
  const discovery = mission.discovery;
  const factConfirmed = mission.needs.some((need) => need.confirmed && need.status === "fact");

  /** Fakt z pól rozmowy: cytat / problem + kategoria i priorytet wybrane przez handlowca. */
  const confirmFact = () => {
    const quote = discovery.quote.trim();
    const description = discovery.description.trim();
    if (!quote && !description) {
      // Bez pól rozmowy nie zgadujemy, którą potrzebę potwierdzić — wybór (z kategorią) jest na mapie.
      setFactError(
        mission.needs.length
          ? "Wpisz cytat albo problem z rozmowy — albo oznacz potrzebę jako „Fakt” na mapie potrzeb poniżej."
          : "Wpisz cytat albo problem z rozmowy.",
      );
      return;
    }
    if (!discovery.category) {
      setFactError("Wybierz kategorię potrzeby — od niej zależy rekomendacja wariantu.");
      return;
    }
    const category = discovery.category as NeedCategory;
    // Ten sam cytat / problem → aktualizacja istniejącej potrzeby (np. zmiana kategorii), nie duplikat.
    const existing = mission.needs.find(
      (need) => (description && need.description === description) || (quote && need.quote === quote),
    );
    upsertNeed(mission.id, {
      id: existing?.id ?? crypto.randomUUID(),
      category,
      title: (quote || description).slice(0, 120),
      description: description || quote,
      priority: discovery.priority || null,
      quote: quote || undefined,
      expectedResult: mission.decision.expectedResult.trim() || undefined,
      constraints: discovery.constraints.join(", ") || undefined,
      status: "fact",
      confirmed: true,
    });
    setFactError(null);
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
      decisionDeadline: parseDeadline("czwartek") ?? "",
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Rozmowa i mapa potrzeb</h2>
        <HelpLink anchor="rozmowa">Co zebrać w rozmowie?</HelpLink>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {venue
          ? "Zapisz, co partner powiedział: problem, ograniczenia i decydenta. Rezultat, termin i wcześniejsze próby są dla lokalu opcjonalne. Potwierdzony fakt otwiera ofertę."
          : "Zapisz, co partner powiedział: problem, rezultat, ograniczenia, decydenta i termin. Potwierdzony fakt otwiera ofertę."}
      </p>
      <div className="mt-4">
        <Requirements checks={checks} title="Do oferty brakuje" doneText="Komplet — możesz iść do oferty." />
      </div>
      <TalkCallout mission={mission} />
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
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Kategoria potrzeby">
                  <select
                    className={inputClass}
                    value={discovery.category}
                    onChange={(event) =>
                      updateDiscovery(mission.id, {
                        category: event.target.value as NeedCategory | "",
                        categorySource: event.target.value ? "human" : "",
                      })
                    }
                  >
                    <option value="">Wybierz kategorię</option>
                    {NEED_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Priorytet dla partnera">
                  <select
                    className={inputClass}
                    value={discovery.priority || ""}
                    onChange={(event) => updateDiscovery(mission.id, { priority: Number(event.target.value) || 0 })}
                  >
                    <option value="">Wybierz</option>
                    {PRIORITIES.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          );
        }
        if (slot === "result") {
          return (
            <div key={slot} className="mt-4">
              <Field label="Oczekiwany rezultat" optional={venue}>
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
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
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
              <DeadlineField
                optional={venue}
                value={discovery.decisionDeadline || mission.decision.decisionDeadline}
                onChange={(iso) => {
                  updateDiscovery(mission.id, { decisionDeadline: iso });
                  updateDecision(mission.id, { decisionDeadline: iso });
                }}
              />
            </div>
          );
        }
        if (slot === "attempts") {
          return (
            <div key={slot} className="mt-4">
              <Field label="Wcześniejsze próby" optional={venue}>
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
              <p className="text-sm font-semibold text-emerald-700">
                Potwierdzone jako fakt.{" "}
                <button type="button" onClick={confirmFact} className="font-semibold text-lutra">
                  Zapisz fakt z pól powyżej
                </button>
              </p>
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
            {factError ? <p className="mt-2 text-xs text-rose-600">{factError}</p> : null}
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

      <NeedsMap mission={mission} partner={partner} />
    </div>
  );
}
