"use client";

import { useState } from "react";
import { nextTermsConfirmation, previousMonth, reportDone } from "@/lib/agenda";
import { healthFor } from "@/lib/health";
import { daysUntil, formatPlDate, isIsoDate, relativeDeadline, toIsoDate } from "@/lib/dates";
import { periodText } from "@/lib/terms";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { CareReview, Mission, Partner } from "@/lib/types";
import { Field, inputClass, Note, Pills, Section } from "@/components/ui";
import { HealthBadge } from "@/components/partners/health-badge";
import { PartnerMetricsPanel } from "@/components/mission/partner-metrics";
import { TermsSummary } from "@/components/mission/steps/offer-step";
import { FollowUpBar } from "@/components/mission/follow-up-bar";

const DECISIONS: { id: CareReview["decision"]; label: string }[] = [
  { id: "continue", label: "Kontynuujemy" },
  { id: "change", label: "Zmieniamy warunki" },
  { id: "end", label: "Kończymy" },
];

function dateOf(iso?: string) {
  return iso ? formatPlDate(toIsoDate(new Date(iso))) : "";
}

function DueBadge({ due }: { due: string | null }) {
  if (!due || !isIsoDate(due)) return null;
  const days = daysUntil(due) ?? 0;
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        days < 0 ? "bg-rose-50 text-rose-700" : days === 0 ? "bg-amber-50 text-amber-800" : "bg-chip text-navy",
      )}
    >
      {days < 0 ? `zaległe ${relativeDeadline(due)}` : days === 0 ? "dziś" : `${formatPlDate(due)} · ${relativeDeadline(due)}`}
    </span>
  );
}

function ReviewForm({ mission }: { mission: Mission }) {
  const { addCareReview } = useStore();
  const [attendance, setAttendance] = useState("");
  const [feedback, setFeedback] = useState("");
  const [decision, setDecision] = useState<CareReview["decision"]>("continue");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const result = addCareReview(mission.id, { attendance, feedback, decision, note });
    if (!result.ok) {
      setError(result.reason ?? "Nie udało się zapisać przeglądu.");
      return;
    }
    setAttendance("");
    setFeedback("");
    setNote("");
    setDecision("continue");
    setError(null);
  };

  return (
    <div className="space-y-3 rounded-2xl bg-surface px-4 py-3">
      <Field label="Frekwencja">
        <input
          className={inputClass}
          placeholder="np. 4 wydarzenia, średnio 6 osób"
          value={attendance}
          onChange={(e) => setAttendance(e.target.value)}
        />
      </Field>
      <Field label="Zgłoszenia uczestników" optional>
        <textarea
          className={`${inputClass} min-h-[64px]`}
          placeholder="Co mówili goście i obsługa: plusy, problemy, prośby"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </Field>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">Decyzja</p>
        <Pills value={decision} onChange={setDecision} options={DECISIONS} />
      </div>
      <Field label="Notatka" optional>
        <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white">
          Zapisz przegląd
        </button>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </div>
    </div>
  );
}

/**
 * Opieka po aktywacji: przegląd po pierwszym cyklu, kwartalne potwierdzenie warunków,
 * miesięczna informacja o realizacjach (lokale) i koniec współpracy.
 */
export function CarePanel({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { confirmTerms, canEditMission, canEditPartner, state } = useStore();
  const editable = canEditMission(mission);
  const health = healthFor(state, partner);
  const care = mission.care;
  const a = mission.activation;
  const lastReview = care.reviews[0];
  const ended = lastReview?.decision === "end";
  const confirmAt = nextTermsConfirmation(mission);
  const reviewDue = isIsoDate(a.checkInAt) && !care.reviews.length ? a.checkInAt : null;
  const end = mission.contract.endAt;
  const endDays = isIsoDate(end) ? daysUntil(end) : null;
  const month = previousMonth();
  const activated = a.activatedAt ?? mission.closedAt;
  // Jak w „Na dziś”: za poprzedni miesiąc, jeśli partner był już wtedy aktywny.
  const reportDue =
    partner.segment === "venue" &&
    activated &&
    toIsoDate(new Date(activated)).slice(0, 7) <= month &&
    !reportDone(state, mission, month)
      ? `${toIsoDate(new Date()).slice(0, 7)}-01`
      : null;

  return (
    <section className="mt-6 max-w-4xl rounded-[28px] border border-line bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Aktywny partner · opieka</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {ended ? "Współpraca zakończona po przeglądzie" : "Co robimy po aktywacji"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Aktywny od {dateOf(a.activatedAt ?? mission.closedAt) || "—"}
            {periodText(mission.contract) ? ` · okres ${periodText(mission.contract)}` : ""}
            {a.partnerCode ? ` · kod ${a.partnerCode}` : ""}
          </p>
        </div>
        <HealthBadge health={health} />
      </div>
      <TermsSummary mission={mission} partner={partner} />
      <FollowUpBar mission={mission} />

      <fieldset disabled={!editable} className="min-w-0">
        <Section
          title="1. Przegląd po pierwszym cyklu"
          hint="Frekwencja, zgłoszenia uczestników i decyzja o kontynuacji."
          aside={reviewDue ? <DueBadge due={reviewDue} /> : null}
        >
          {care.reviews.length ? (
            <ul className="mb-3 space-y-2">
              {care.reviews.map((review) => (
                <li key={review.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
                  <p className="font-medium text-foreground">
                    {dateOf(review.at)} · {DECISIONS.find((d) => d.id === review.decision)?.label}
                  </p>
                  {review.attendance ? <p className="mt-1 text-muted">Frekwencja: {review.attendance}</p> : null}
                  {review.feedback ? <p className="mt-1 whitespace-pre-wrap text-muted">Zgłoszenia: {review.feedback}</p> : null}
                  {review.note ? <p className="mt-1 text-muted">{review.note}</p> : null}
                </li>
              ))}
            </ul>
          ) : !isIsoDate(a.checkInAt) ? (
            <p className="mb-3 text-xs text-muted">Data przeglądu nie była ustawiona przy aktywacji — zapisz przegląd, gdy się odbędzie.</p>
          ) : null}
          {lastReview?.decision === "change" ? (
            <div className="mb-3">
              <Note>Zmiana warunków: zacznij nową misję (odnowienie) poniżej — nowa oferta i nowe porozumienie.</Note>
            </div>
          ) : null}
          {editable ? <ReviewForm mission={mission} /> : null}
        </Section>

        {ended ? null : (
          <Section
            title="2. Potwierdzenie warunków (co kwartał)"
            hint="Krótki kontakt: czy zniżka, godziny i kontakt awaryjny są aktualne."
            aside={<DueBadge due={confirmAt} />}
          >
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => confirmTerms(mission.id)}
                className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white"
              >
                Partner potwierdził aktualne warunki
              </button>
              <span className="text-xs text-muted">
                {care.termsConfirmedAt ? `Ostatnio: ${dateOf(care.termsConfirmedAt)}` : "Jeszcze nie potwierdzano po aktywacji."}
              </span>
            </div>
          </Section>
        )}

      </fieldset>
      {ended ? null : (
        <Section
          title="3. Metryki i podsumowanie dla partnera (co miesiąc)"
          hint={
            partner.segment === "venue"
              ? "Raz w miesiącu wpisz wydarzenia, uczestników i realizacje zniżki z panelu Lutry, potem wyślij partnerowi podsumowanie."
              : "Raz w miesiącu wpisz wydarzenia i uczestników z panelu Lutry, potem wyślij partnerowi podsumowanie."
          }
          aside={<DueBadge due={reportDue} />}
        >
          <PartnerMetricsPanel partner={partner} mission={mission} editable={canEditPartner(partner)} />
        </Section>
      )}
      <fieldset disabled={!editable} className="min-w-0">
        <Section title={ended ? "Koniec okresu" : "4. Koniec okresu"}>
          <p className="text-sm text-muted">
            {isIsoDate(end)
              ? endDays !== null && endDays < 0
                ? `Okres skończył się ${formatPlDate(end)}. Jeśli współpraca trwa, zacznij nową misję (odnowienie).`
                : `Okres kończy się ${formatPlDate(end)} (${relativeDeadline(end)}). Na 30 dni przed końcem przypomnienie pojawi się w „Na dziś”.`
              : "Brak daty końca okresu."}
          </p>
        </Section>
      </fieldset>
    </section>
  );
}
