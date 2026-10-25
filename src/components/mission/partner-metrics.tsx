"use client";

import { useState } from "react";
import { monthLabel, previousMonth } from "@/lib/agenda";
import { metricsHistory, shiftMonth } from "@/lib/health";
import { mailtoHref, partnerReportEmail } from "@/lib/partner-report";
import { useStore } from "@/lib/store";
import { plural } from "@/lib/text";
import type { Mission, Partner, PartnerMetrics, PartnerMetricsInput } from "@/lib/types";
import { Field, inputClass, Note, NumberInput } from "@/components/ui";

/** Ostatnie 12 miesięcy do wyboru (najnowszy: bieżący, domyślnie poprzedni). */
function monthOptions(today = new Date()) {
  const current = shiftMonth(previousMonth(today), 1);
  return Array.from({ length: 13 }, (_, i) => shiftMonth(current, -i));
}

function emptyValues(metric?: PartnerMetrics): PartnerMetricsInput {
  return {
    events: metric?.events ?? null,
    attendees: metric?.attendees ?? null,
    redemptions: metric?.redemptions ?? null,
    notes: metric?.notes ?? "",
  };
}

function summary(metric: PartnerMetrics, venue: boolean) {
  const count = (n: number | null, one: string, few: string, many: string) => (n === null ? "" : `${n} ${plural(n, one, few, many)}`);
  const parts = [
    count(metric.events, "wydarzenie", "wydarzenia", "wydarzeń"),
    count(metric.attendees, "uczestnik", "uczestników", "uczestników"),
    venue ? count(metric.redemptions, "realizacja", "realizacje", "realizacji") : "",
  ].filter(Boolean);
  return parts.join(" · ") || "bez liczb";
}

function MetricsForm({
  partner,
  month,
  existing,
  disabled,
}: {
  partner: Partner;
  month: string;
  existing?: PartnerMetrics;
  disabled: boolean;
}) {
  const { savePartnerMetrics } = useStore();
  const [values, setValues] = useState<PartnerMetricsInput>(() => emptyValues(existing));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const venue = partner.segment === "venue";
  const set = (patch: Partial<PartnerMetricsInput>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    setMessage(null);
  };

  const save = async () => {
    setBusy(true);
    const result = await savePartnerMetrics(partner.id, month, values);
    setBusy(false);
    setMessage(result.ok ? { ok: true, text: `Zapisane: ${monthLabel(month)}.` } : { ok: false, text: result.error ?? "Nie udało się zapisać." });
  };

  return (
    <div className="space-y-3">
      <div className={venue ? "grid gap-3 sm:grid-cols-3" : "grid gap-3 sm:grid-cols-2"}>
        <Field label="Wydarzenia">
          <NumberInput value={values.events} min={0} max={100000} onChange={(events) => set({ events })} placeholder="np. 4" />
        </Field>
        <Field label="Uczestnicy">
          <NumberInput value={values.attendees} min={0} max={100000} onChange={(attendees) => set({ attendees })} placeholder="np. 32" />
        </Field>
        {venue ? (
          <Field label="Realizacje zniżki">
            <NumberInput
              value={values.redemptions}
              min={0}
              max={100000}
              onChange={(redemptions) => set({ redemptions })}
              placeholder="z panelu Lutry"
            />
          </Field>
        ) : null}
      </div>
      <Field label="Notatka" optional>
        <input
          className={inputClass}
          maxLength={1000}
          placeholder="Tylko dla zespołu, np. „w listopadzie remont sali”"
          value={values.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => void save()}
          className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Zapisuję…" : existing ? "Popraw metryki" : "Zapisz metryki"}
        </button>
        {message ? <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-rose-600"}>{message.text}</p> : null}
      </div>
    </div>
  );
}

function ReportMail({ partner, month, metric, previous }: { partner: Partner; month: string; metric: PartnerMetrics; previous?: PartnerMetrics }) {
  const { state } = useStore();
  const [copied, setCopied] = useState(false);
  const mail = partnerReportEmail({ partner, month, metric, previous, senderName: state.user.name });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-4 rounded-2xl bg-surface px-4 py-3" data-testid="report-mail">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">Mail z podsumowaniem dla partnera</p>
      <p className="mt-2 text-xs text-muted">
        Do: {mail.to || "brak maila w kontaktach — wpisz adres w poczcie"} · CRM niczego nie wysyła sam.
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">{mail.subject}</p>
      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{mail.body}</pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-lutra">
          {copied ? "Skopiowano" : "Kopiuj"}
        </button>
        <a href={mailtoHref(mail)} className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white">
          Otwórz w poczcie
        </a>
      </div>
    </div>
  );
}

/**
 * Miesięczne metryki partnera (wydarzenia, uczestnicy, realizacje zniżki) i mail z podsumowaniem.
 * Zapis metryk za poprzedni miesiąc odhacza przypomnienie „Informacja o realizacjach” w „Na dziś”.
 */
export function PartnerMetricsPanel({ partner, mission, editable }: { partner: Partner; mission: Mission; editable: boolean }) {
  const { state, metricsMissing } = useStore();
  const [month, setMonth] = useState(() => previousMonth());
  const history = metricsHistory(partner.id, state.metrics, mission);
  const byMonth = new Map(history.map((m) => [m.month, m]));
  const existing = byMonth.get(month);
  const venue = partner.segment === "venue";

  return (
    <div>
      {metricsMissing ? (
        <div className="mb-3">
          <Note tone="warn">Metryki zapiszesz po migracji v8 (żółty pasek u góry → „Kopiuj SQL”).</Note>
        </div>
      ) : null}
      <div className="mb-3 w-[220px]">
        <Field label="Miesiąc">
          <select className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Miesiąc metryk">
            {monthOptions().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {byMonth.has(m) ? " · wpisane" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {editable ? (
        <MetricsForm
          key={month}
          partner={partner}
          month={month}
          existing={existing}
          disabled={metricsMissing}
        />
      ) : null}
      {existing ? <ReportMail partner={partner} month={month} metric={existing} previous={byMonth.get(shiftMonth(month, -1))} /> : null}
      {!existing ? (
        <p className="mt-3 text-xs text-muted">Po zapisaniu liczb pojawi się gotowy mail z podsumowaniem dla partnera.</p>
      ) : null}
      {history.length ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">Ostatnie miesiące</p>
          <ul className="mt-2 space-y-1 text-xs text-muted" data-testid="metrics-history">
            {history.slice(0, 6).map((m) => (
              <li key={m.month}>
                <button type="button" onClick={() => setMonth(m.month)} className="text-left hover:text-lutra">
                  <span className="font-semibold text-foreground">{monthLabel(m.month)}</span>: {summary(m, venue)}
                  {m.notes ? ` · ${m.notes}` : ""}
                  {m.id.startsWith("report:") ? " · wpis o realizacjach" : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
