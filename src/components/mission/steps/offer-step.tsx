"use client";

import { useState } from "react";
import { offerVariantsFor, segmentLabel, suggestVariant } from "@/lib/playbook";
import { constraintText, offerChecks } from "@/lib/gates";
import { termsChecks, termsLines, termsWarnings, type Check } from "@/lib/terms";
import { formatPlDate, toIsoDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { HelpLink, Note, Requirements, Section } from "@/components/ui";
import { PeriodFields, TermsFields, termsIntro } from "@/components/mission/terms-editor";
import { FromTalkButton } from "@/components/mission/talk-bubble";

/** Podsumowanie warunków do skopiowania (mail, wiadomość, notatka). */
export function TermsSummary({ mission, partner }: { mission: Mission; partner: Partner }) {
  const [copied, setCopied] = useState(false);
  const lines = termsLines(mission, partner.segment);
  if (!lines.length) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.map((line) => `• ${line}`).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-4 rounded-2xl bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">Ustalone warunki</p>
        <button type="button" onClick={() => void copy()} className="text-xs font-semibold text-lutra">
          {copied ? "Skopiowano" : "Kopiuj"}
        </button>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-foreground">
        {lines.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
    </div>
  );
}

export function OfferStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { selectVariant, approveOffer, markOfferSent } = useStore();
  const [error, setError] = useState<string | null>(null);
  const segment = partner.segment;
  const variants = offerVariantsFor(segment);
  const facts = offerChecks(mission, partner);
  const factsMissing = facts.filter((check) => !check.done);
  const terms = termsChecks(mission, segment);
  const warnings = termsWarnings(mission, segment);
  const checks: Check[] = [
    { key: "variant", label: "wybrany wariant", done: Boolean(mission.selectedVariant) },
    ...terms,
  ];
  const ready = !factsMissing.length && checks.every((check) => check.done);
  // Liczone na bieżąco: typ partnera mógł się zmienić po zapisaniu faktów.
  const recommendedVariant = suggestVariant(
    mission.needs.filter((need) => need.status === "fact" && need.confirmed).map((need) => need.category),
    segment,
  );

  const approve = () => {
    const result = approveOffer(mission.id);
    setError(result.ok ? null : (result.reason ?? "Nie można zatwierdzić."));
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Oferta i warunki</h2>
        <span className="flex flex-wrap items-center gap-3">
          <FromTalkButton mission={mission} />
          <HelpLink anchor="oferta">Jak ustalić warunki?</HelpLink>
        </span>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {segmentLabel(segment)}: wybierz wariant, wpisz konkretne warunki i okres. Zatwierdzasz Ty — dopiero potem oferta
        idzie do partnera.
      </p>

      {factsMissing.length ? (
        <div className="mt-4">
          <Note tone="warn">
            Najpierw domknij rozmowę — brakuje: {factsMissing.map((check) => check.label).join(", ")}.
          </Note>
        </div>
      ) : null}

      <Section title="1. Wariant" hint="Rekomendacja wynika z potwierdzonych faktów na mapie potrzeb.">
        <div className="grid gap-3 sm:grid-cols-3">
          {variants.map((offer) => {
            const selected = mission.selectedVariant === offer.variant;
            const recommended = recommendedVariant === offer.variant;
            return (
              <button
                key={offer.variant}
                type="button"
                onClick={() => selectVariant(mission.id, offer.variant)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition",
                  selected ? "border-lutra bg-chip" : "border-chip-mid bg-white hover:border-blue",
                )}
              >
                <span className="block font-semibold text-foreground">
                  {offer.variant}. {offer.name}
                </span>
                {offer.hint ? <span className="mt-1 block text-xs leading-5 text-muted">{offer.hint}</span> : null}
                {recommended ? (
                  <span className="mt-2 inline-block rounded-full bg-lutra-soft px-2 py-0.5 text-[10px] font-semibold text-lutra">
                    Rekomendacja z faktów
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {constraintText(mission) ? (
          <p className="mt-3 text-xs text-muted">
            Ograniczenia z rozmowy: <span className="text-foreground">{constraintText(mission)}</span>
            {mission.decision.expectedResult.trim() ? ` · Rezultat: ${mission.decision.expectedResult}` : ""}
          </p>
        ) : null}
      </Section>

      <Section title="2. Warunki" hint={termsIntro(segment)}>
        <TermsFields mission={mission} segment={segment} />
      </Section>

      <Section title="3. Okres współpracy" hint="Od okresu zależy forma: porozumienie mailowe albo umowa z podpisami.">
        <PeriodFields mission={mission} />
      </Section>

      <TermsSummary mission={mission} partner={partner} />

      <div className="mt-5">
        <Requirements
          checks={checks}
          title="Przed zatwierdzeniem uzupełnij"
          doneText={mission.offerApproved ? "Warunki zatwierdzone." : "Warunki kompletne — możesz zatwierdzić."}
        />
      </div>
      {warnings.length ? (
        <div className="mt-3 space-y-2">
          {warnings.map((warning) => (
            <Note key={warning} tone="warn">
              {warning}
            </Note>
          ))}
        </div>
      ) : null}
      {mission.offerApproved ? (
        <p className="mt-3 text-xs text-muted">
          Zmiany warunków po zatwierdzeniu trafiają do porozumienia albo umowy. Jeśli zmieniasz coś ważnego, powiedz o tym
          partnerowi.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
        <p className="text-sm text-muted">
          {mission.offerSentAt
            ? `Wariant ${mission.selectedVariant} wysłany ${formatPlDate(toIsoDate(new Date(mission.offerSentAt)))}.`
            : mission.offerApproved
              ? `Wariant ${mission.selectedVariant} zatwierdzony. Wyślij go partnerowi i zaznacz wysyłkę.`
              : "Model niczego nie wysyła. Zatwierdzasz wariant i warunki."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!ready || mission.offerApproved}
            onClick={approve}
            className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {mission.offerApproved ? "Zatwierdzone ✓" : "Zatwierdź wariant i warunki"}
          </button>
          <button
            type="button"
            disabled={!mission.offerApproved || Boolean(mission.offerSentAt)}
            onClick={() => {
              const result = markOfferSent(mission.id);
              setError(result.ok ? null : (result.reason ?? null));
            }}
            className="rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra disabled:opacity-40"
          >
            {mission.offerSentAt ? "Wysłana ✓" : "Wysłałem ofertę partnerowi"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
