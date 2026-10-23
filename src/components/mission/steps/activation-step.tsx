"use client";

import { useState } from "react";
import { activationChecks } from "@/lib/gates";
import { formatPlDate, isIsoDate } from "@/lib/dates";
import { cycleSummary, discountSummary, pilotSummary, termsChecks } from "@/lib/terms";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { CheckRow, Field, HelpLink, inputClass, Note, NumberInput, Requirements, Section } from "@/components/ui";
import { OpsContactFields } from "@/components/mission/steps/contract-step";
import { suggestedReviewDate, TermsFields } from "@/components/mission/terms-editor";
import { FromTalkButton } from "@/components/mission/talk-bubble";

/** Publiczne rejestry do sprawdzenia działalności (otwierają się w nowej karcie). */
const REGISTRIES = [
  { href: "https://www.biznes.gov.pl/pl/wyszukiwarka-firm", label: "CEIDG / wyszukiwarka firm" },
  { href: "https://wyszukiwarka-krs.ms.gov.pl/", label: "KRS" },
];

function PartnerCode({ mission }: { mission: Mission }) {
  const { assignPartnerCode } = useStore();
  const [copied, setCopied] = useState(false);
  const a = mission.activation;
  const locked = Boolean(a.partnerCode.trim());
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(a.partnerCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div>
      <p className="font-mono text-lg font-semibold tracking-wide">{a.partnerCode || "—"}</p>
      <p className="mt-1 text-xs text-muted">Kod idzie do produktu Lutra. Nie zmienia się po nadaniu.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={locked}
          onClick={() => assignPartnerCode(mission.id)}
          className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {locked ? "Kod nadany" : "Nadaj kod LUTRA-…"}
        </button>
        {locked ? (
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra"
          >
            {copied ? "Skopiowano" : "Kopiuj kod"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReviewDate({ mission, partner, label }: { mission: Mission; partner: Partner; label: string }) {
  const { updateActivation } = useStore();
  const a = mission.activation;
  const suggestion = suggestedReviewDate(mission, partner.segment);
  return (
    <div className="max-w-md">
      <Field label={label}>
        <input
          type="date"
          className={inputClass}
          value={a.checkInAt}
          onChange={(e) => updateActivation(mission.id, { checkInAt: e.target.value })}
        />
      </Field>
      {!a.checkInAt && isIsoDate(suggestion) ? (
        <button
          type="button"
          onClick={() => updateActivation(mission.id, { checkInAt: suggestion })}
          className="mt-2 text-xs font-semibold text-lutra"
        >
          Ustaw {formatPlDate(suggestion)}
        </button>
      ) : null}
      <p className="mt-1 text-xs text-muted">Tego dnia przypomnienie pojawi się w „Na dziś”.</p>
    </div>
  );
}

function TestFields({ mission }: { mission: Mission }) {
  const { updateActivation } = useStore();
  const [error, setError] = useState<string | null>(null);
  const a = mission.activation;
  return (
    <div>
      <Field label="Co sprawdziłeś">
        <textarea
          className={`${inputClass} min-h-[80px]`}
          placeholder="Jedno wejście jako gość: wydarzenie w lokalu, kod / QR / hasło działa, obsługa nalicza zniżkę."
          value={a.testNotes ?? ""}
          onChange={(e) => {
            setError(null);
            updateActivation(mission.id, { testNotes: e.target.value });
          }}
        />
      </Field>
      <div className="mt-2">
        <CheckRow
          checked={a.testPassed}
          label="Testowa realizacja zniżki przeszła"
          onChange={() => {
            if (!a.testPassed && !a.testNotes.trim()) {
              setError("Najpierw opisz, co sprawdziłeś.");
              return;
            }
            setError(null);
            updateActivation(mission.id, { testPassed: !a.testPassed });
          }}
        />
      </div>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}

function VenueActivation({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { updateActivation, updatePartner, setChecklistItem, schemaV7 } = useStore();
  const a = mission.activation;
  const discount = discountSummary(mission.terms.discount);
  const discountMissing = termsChecks(mission, "venue").filter(
    (check) => !check.done && check.key !== "period" && check.key !== "period_order",
  );
  const toggle = (key: string) => setChecklistItem(mission.id, key, !mission.checklist[key]);

  return (
    <>
      <Section
        title="1. Weryfikacja miejsca"
        hint="Przed publikacją sprawdzamy działalność, adres, pojemność, godziny i kontakt awaryjny."
      >
        <CheckRow
          checked={Boolean(mission.checklist["activation:business"])}
          label="Działalność sprawdzona (NIP / KRS / CEIDG)"
          onChange={() => toggle("activation:business")}
        />
        <p className="mt-1.5 flex flex-wrap gap-3 pl-1 text-xs text-muted">
          {mission.contract.nip.trim() ? <span>NIP z umowy: {mission.contract.nip}</span> : null}
          {REGISTRIES.map((registry) => (
            <a key={registry.href} href={registry.href} target="_blank" rel="noreferrer" className="font-semibold text-lutra">
              {registry.label} ↗
            </a>
          ))}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Adres lokalu">
            <input
              className={inputClass}
              value={partner.address}
              placeholder="ulica i numer"
              onChange={(e) => updatePartner(partner.id, { address: e.target.value })}
            />
          </Field>
          <Field label="Pojemność">
            <NumberInput
              value={partner.capacity}
              min={1}
              max={100000}
              suffix="osób"
              onChange={(capacity) =>
                updatePartner(partner.id, { capacity: capacity === null ? null : Math.max(1, Math.round(capacity)) })
              }
            />
          </Field>
        </div>
        {schemaV7 === false ? (
          <p className="mt-1 text-xs text-amber-700">Pojemność zapisze się w bazie po migracji v7 (pasek u góry strony).</p>
        ) : null}
        <div className="mt-3">
          <Field label="Godziny otwarcia">
            <input
              className={inputClass}
              value={partner.hours ?? ""}
              placeholder="np. pn–pt 10–22, sob–nd 12–24"
              onChange={(e) => updatePartner(partner.id, { hours: e.target.value })}
            />
          </Field>
          <div className="mt-2">
            <CheckRow
              checked={a.hoursConfirmed}
              label="Godziny potwierdzone z partnerem (także godziny zniżki)"
              onChange={() => updateActivation(mission.id, { hoursConfirmed: !a.hoursConfirmed })}
            />
          </div>
        </div>
        <div className="mt-4">
          <OpsContactFields mission={mission} partner={partner} />
          <p className="mt-1 text-xs text-muted">Kontakt awaryjny: do kogo dzwonimy, gdy coś nie działa w trakcie wydarzenia.</p>
        </div>
      </Section>

      <Section title="2. Zniżka w aplikacji" hint="Bez zniżki lokal nie jest publikowany.">
        {discount ? <p className="text-sm text-foreground">{discount}</p> : null}
        {discountMissing.length ? (
          <div className="mt-3">
            <TermsFields mission={mission} segment="venue" />
          </div>
        ) : null}
      </Section>

      <Section title="3. Publikacja">
        <PartnerCode mission={mission} />
        <div className="mt-4 space-y-2">
          <CheckRow
            checked={Boolean(mission.checklist["activation:published"])}
            label="Lokal widoczny w aplikacji Lutra (nazwa, logo, zniżka)"
            onChange={() => toggle("activation:published")}
          />
          <CheckRow
            checked={Boolean(mission.checklist["activation:sticker"])}
            label="Naklejka Lutry w lokalu"
            onChange={() => toggle("activation:sticker")}
          />
        </div>
      </Section>

      <Section title="4. Testowa realizacja" hint="Jedno wejście jako gość — razem z obsługą, zanim przyjdą pierwsze grupy.">
        <TestFields mission={mission} />
      </Section>

      <Section title="5. Przegląd po pierwszym cyklu" hint="Frekwencja, zgłoszenia uczestników i decyzja o kontynuacji.">
        <ReviewDate mission={mission} partner={partner} label="Data przeglądu" />
      </Section>
    </>
  );
}

function CommunityActivation({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { setChecklistItem } = useStore();
  const summary = cycleSummary(mission.terms.cycle);
  return (
    <>
      <Section title="1. Organizator">
        <OpsContactFields mission={mission} partner={partner} />
      </Section>
      <Section title="2. Pierwsze wydarzenie" hint={summary || "Ustal cykl w kroku Oferta."}>
        <CheckRow
          checked={Boolean(mission.checklist["activation:published"])}
          label="Pierwsze wydarzenie cyklu utworzone w Lutrze"
          onChange={() => setChecklistItem(mission.id, "activation:published", !mission.checklist["activation:published"])}
        />
      </Section>
      <Section title="3. Przegląd po pierwszym cyklu" hint="Frekwencja, zgłoszenia uczestników i decyzja o kontynuacji.">
        <ReviewDate mission={mission} partner={partner} label="Data przeglądu" />
      </Section>
    </>
  );
}

function CompanyActivation({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { setChecklistItem } = useStore();
  const summary = pilotSummary(mission.terms.pilot);
  return (
    <>
      <Section title="1. Kontakt w firmie">
        <OpsContactFields mission={mission} partner={partner} />
      </Section>
      <Section title="2. Start pilotażu" hint={summary || "Ustal pilotaż w kroku Oferta."}>
        <CheckRow
          checked={Boolean(mission.checklist["activation:published"])}
          label="Zespół pilotażowy ma dostęp do aplikacji"
          onChange={() => setChecklistItem(mission.id, "activation:published", !mission.checklist["activation:published"])}
        />
      </Section>
      <Section title="3. Feedback z pilotażu">
        <ReviewDate mission={mission} partner={partner} label="Termin feedbacku" />
      </Section>
    </>
  );
}

export function ActivationStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const checks = activationChecks(mission, partner);
  const segment = partner.segment;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {segment === "venue" ? "Weryfikacja i publikacja" : segment === "community" ? "Start cyklu" : "Start pilotażu"}
        </h2>
        <span className="flex flex-wrap items-center gap-3">
          <FromTalkButton mission={mission} />
          <HelpLink anchor="aktywacja">Co sprawdzamy przed publikacją?</HelpLink>
        </span>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {segment === "venue"
          ? "Lokal trafia do aplikacji dopiero po weryfikacji, ze zniżką i po testowej realizacji."
          : "Partner jest aktywny, gdy ma kontakt, pierwszy krok w Lutrze i datę przeglądu."}{" "}
        Po zakończeniu misja przechodzi do opieki.
      </p>

      <div className="mt-4">
        <Requirements
          checks={checks}
          title="Do publikacji brakuje"
          doneText="Komplet — zakończ aktywację przyciskiem na dole."
        />
      </div>
      {segment === "venue" && !partner.contacts.length ? (
        <div className="mt-3">
          <Note tone="warn">Na karcie partnera nie ma żadnej osoby kontaktowej.</Note>
        </div>
      ) : null}

      {segment === "venue" ? (
        <VenueActivation mission={mission} partner={partner} />
      ) : segment === "community" ? (
        <CommunityActivation mission={mission} partner={partner} />
      ) : (
        <CompanyActivation mission={mission} partner={partner} />
      )}
    </div>
  );
}
