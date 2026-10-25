"use client";

import { useEffect, useMemo, useState } from "react";
import { aiQuality, loadAiSuggestions, type AiSuggestion } from "@/lib/ai-log";
import type { ReportPeriod } from "@/lib/reports";

function sinceOf(period: ReportPeriod) {
  if (period === "all") return null;
  return new Date(Date.now() - period * 86_400_000).toISOString();
}

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

/** Jakość podpowiedzi AI z rozmów: co przyjmujesz, co odrzucasz, ile to kosztuje. */
export function AiQualitySection({ period, ownerId }: { period: ReportPeriod; ownerId: string | null }) {
  const [loaded, setLoaded] = useState<{ key: string; list: AiSuggestion[]; missingTable: boolean } | null>(null);
  const key = String(period);

  useEffect(() => {
    let cancelled = false;
    void loadAiSuggestions(sinceOf(period)).then((result) => {
      if (!cancelled) setLoaded({ key, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [period, key]);

  const list = useMemo(
    () => (loaded?.list ?? []).filter((item) => !ownerId || !item.userId || item.userId === ownerId),
    [loaded, ownerId],
  );
  const q = useMemo(() => aiQuality(list), [list]);

  if (!loaded || loaded.key !== key) return <p className="text-xs text-muted">Wczytuję…</p>;
  if (loaded.missingTable) {
    return <p className="text-xs text-muted">Statystyka pojawi się po migracji v8 (żółty pasek u góry → „Kopiuj SQL”).</p>;
  }
  if (!q.runs) {
    return (
      <p className="text-xs text-muted">
        W tym okresie nikt nie wstawił ani nie odrzucił podpowiedzi AI z rozmowy. Liczymy od chwili wdrożenia tej wersji.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Box label="Odczyty rozmów" value={String(q.runs)} hint={`${q.applied} wstawione · ${q.discarded} odrzucone`} />
        <Box label="Średni czas" value={q.avgSeconds !== null ? `${q.avgSeconds} s` : "—"} hint="od wysłania do odpowiedzi" />
        <Box
          label="Koszt Claude"
          value={q.costUsd !== null ? `$${q.costUsd.toFixed(q.costUsd < 1 ? 3 : 2)}` : "—"}
          hint={`${(q.inputTokens / 1000).toFixed(0)} tys. tokenów wejścia · ${(q.outputTokens / 1000).toFixed(0)} tys. wyjścia`}
        />
        <Box
          label="Bez rozpoznanych mówców"
          value={percent(q.speakersUnknown, q.runs)}
          hint="transkrypt bez „Imię: …” — warunki do ręcznego sprawdzenia"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="text-[11px] uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="py-2 pr-3 font-semibold">Pole</th>
              <th className="py-2 pr-3 text-right font-semibold">Zaproponowane</th>
              <th className="py-2 pr-3 text-right font-semibold">Przyjęte</th>
              <th className="py-2 pr-3 text-right font-semibold" title="Zaznaczone przez CRM, a odznaczone przez handlowca">
                Odrzucone mimo zaznaczenia
              </th>
              <th className="py-2 text-right font-semibold" title="Handlowiec zaznaczył wiersz bez dowodu albo z ostrzeżeniem">
                Dodane ręcznie
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {q.fields.map((field) => (
              <tr key={field.key}>
                <td className="py-2 pr-3">
                  <span className="font-medium text-foreground">{field.label}</span>
                  {field.group ? <span className="ml-2 text-muted">{field.group}</span> : null}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{field.proposed}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {field.accepted} <span className="text-muted">({percent(field.accepted, field.proposed)})</span>
                </td>
                <td className={`py-2 pr-3 text-right tabular-nums ${field.rejectedSuggested ? "text-amber-700" : ""}`}>
                  {field.rejectedSuggested}
                </td>
                <td className="py-2 text-right tabular-nums">{field.addedUnsuggested}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-muted">
        Dużo „odrzuconych mimo zaznaczenia” przy jednym polu = AI myli się tam częściej — warto poprawić polecenie albo
        sprawdzić na zestawie testowych rozmów (README → Jakość AI).
      </p>
    </div>
  );
}

function Box({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-surface px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-navy">{value}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted">{hint}</p>
    </div>
  );
}
