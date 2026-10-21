"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatPlDate } from "@/lib/dates";
import { activityChannelLabel, MISSION_STATUS_LABEL, stageLabel } from "@/lib/playbook";
import {
  attention,
  contactStats,
  funnel,
  lossReasons,
  outcomes,
  selectMissions,
  type ReportFilter,
  type ReportPeriod,
} from "@/lib/reports";
import { useStore } from "@/lib/store";
import type { Mission, StageId } from "@/lib/types";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 30, label: "30 dni" },
  { id: 90, label: "90 dni" },
  { id: 365, label: "12 mies." },
  { id: "all", label: "Wszystko" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold",
        active ? "bg-lutra text-white" : "bg-chip text-navy",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[24px] border border-line bg-white px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-navy">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Pozioma belka: jedna seria, wartość zawsze podpisana tekstem obok. */
function Bar({ value, max, title }: { value: number; max: number; title: string }) {
  const width = max ? Math.max((value / max) * 100, value ? 2 : 0) : 0;
  return (
    <div className="h-2.5 w-full rounded-full bg-chip" title={title}>
      <div className="h-2.5 rounded-full bg-lutra" style={{ width: `${width}%` }} />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-line bg-white p-6">
      <h2 className="font-semibold text-navy">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function days(value: number | null) {
  if (value === null) return "—";
  return `${value} ${value === 1 ? "dzień" : "dni"}`;
}

export default function ReportsPage() {
  const { state, partnerById, memberName } = useStore();
  const [period, setPeriod] = useState<ReportPeriod>(90);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const owners = useMemo(() => {
    const ids = new Set(state.missions.map((m) => m.ownerUserId).filter((id): id is string => Boolean(id)));
    return [...ids].map((id) => ({ id, name: memberName(id) })).sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [state.missions, memberName]);

  const missions = useMemo(
    () => selectMissions(state.missions, { period, ownerId } satisfies ReportFilter),
    [state.missions, period, ownerId],
  );
  const rows = useMemo(() => funnel(missions), [missions]);
  const result = useMemo(() => outcomes(missions), [missions]);
  const reasons = useMemo(() => lossReasons(missions), [missions]);
  const contacts = useMemo(() => contactStats(state.missions, { period, ownerId }), [state.missions, period, ownerId]);
  const now = useMemo(() => attention(state.missions, ownerId), [state.missions, ownerId]);
  const lostTotal = result.lost + result.no_fit;
  const maxReason = reasons[0]?.count ?? 0;
  const maxContacts = contacts.rows[0]?.total ?? 0;

  const name = (m: Mission) => partnerById(m.partnerId)?.name ?? "Partner";

  return (
    <div>
      <div className="flex items-center justify-end gap-3 px-8 py-6 text-sm text-muted">
        <span>CRM / Raporty</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-xs font-semibold text-navy">
          {state.user.initials}
        </span>
      </div>
      <div className="px-8 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Raporty</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Lejek misji, wyniki i powody przegranych. Liczone z misji rozpoczętych w wybranym okresie; kontakty — z
          wpisów dziennika z tego okresu.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {PERIODS.map((item) => (
            <Chip key={String(item.id)} active={period === item.id} onClick={() => setPeriod(item.id)}>
              {item.label}
            </Chip>
          ))}
          {owners.length > 1 ? (
            <select
              aria-label="Handlowiec"
              className="ml-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-navy"
              value={ownerId ?? ""}
              onChange={(event) => setOwnerId(event.target.value || null)}
            >
              <option value="">Cały zespół</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Misje" value={String(result.total)} hint={`${result.active} w toku`} />
          <Stat label="Wygrane" value={String(result.won)} hint={result.medianDaysToWin === null ? "jeszcze brak" : `mediana ${days(result.medianDaysToWin)} od startu`} />
          <Stat
            label="Przegrane"
            value={String(lostTotal)}
            hint={result.no_fit ? `w tym ${result.no_fit} bez dopasowania` : undefined}
          />
          <Stat
            label="Skuteczność"
            value={result.winRate === null ? "—" : `${result.winRate}%`}
            hint="wygrane z rozstrzygniętych"
          />
          <Stat
            label="Kontakty do wygranej"
            value={result.medianContactsToWin === null ? "—" : String(result.medianContactsToWin)}
            hint="mediana wpisów w dzienniku"
          />
        </div>

        <div className="mt-5 grid items-start gap-4 xl:grid-cols-2">
          <Section
            title="Lejek"
            hint="Ile misji doszło co najmniej do danego etapu. Procent obok = ile przeszło z poprzedniego etapu."
          >
            {result.total ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted">
                    <th className="pb-2 font-bold">Etap</th>
                    <th className="w-[32%] pb-2 font-bold" />
                    <th className="whitespace-nowrap pb-2 pl-3 text-right font-bold">Doszło</th>
                    <th className="whitespace-nowrap pb-2 pl-3 text-right font-bold">Z poprz.</th>
                    <th className="whitespace-nowrap pb-2 pl-3 text-right font-bold">Teraz</th>
                    <th className="whitespace-nowrap pb-2 pl-3 text-right font-bold">Odpadło</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.stage} className="border-t border-line/70">
                      <td className="w-28 whitespace-nowrap py-2 pr-3 font-medium">{row.label}</td>
                      <td className="min-w-[120px] py-2 pr-4">
                        <Bar
                          value={row.reached}
                          max={result.total}
                          title={`${row.label}: ${row.reached} z ${result.total} (${row.shareOfStart}%)`}
                        />
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums">{row.reached}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-muted">
                        {row.fromPrevious === null ? "—" : `${row.fromPrevious}%`}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-muted">{row.activeNow || "—"}</td>
                      <td className={cn("py-2 pl-3 text-right tabular-nums", row.lostHere ? "text-rose-600" : "text-muted")}>
                        {row.lostHere || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">Brak misji w tym okresie.</p>
            )}
          </Section>

          <Section
            title="Powody przegranych"
            hint="Przegrane i brak dopasowania. Etap = gdzie misja była, gdy ją zamknięto."
          >
            {reasons.length ? (
              <ul className="space-y-3">
                {reasons.map((row) => (
                  <li key={row.reason}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{row.reason}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {row.count} · {row.share}%
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Bar value={row.count} max={maxReason} title={`${row.reason}: ${row.count}`} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {Object.entries(row.stages)
                        .map(([stage, count]) => `${stageLabel(stage as StageId)} ${count}`)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Brak przegranych w tym okresie.</p>
            )}
            {result.medianDaysToLoss !== null ? (
              <p className="mt-4 text-xs text-muted">Mediana od startu do przegranej: {days(result.medianDaysToLoss)}.</p>
            ) : null}
          </Section>

          <Section title="Kontakty" hint="Wpisy w dzienniku. Skuteczne = rozmowa, odpowiedź albo umówione spotkanie.">
            {contacts.total ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted">
                    <th className="pb-2 font-bold">Kanał</th>
                    <th className="w-[32%] pb-2 font-bold" />
                    <th className="whitespace-nowrap pb-2 pl-3 text-right font-bold">Razem</th>
                    <th className="whitespace-nowrap pb-2 pl-3 text-right font-bold">Od nas</th>
                    <th className="whitespace-nowrap pb-2 pl-3 text-right font-bold">Skuteczne</th>
                    <th className="whitespace-nowrap pb-2 pl-3 text-right font-bold">Bez odp.</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.rows.map((row) => (
                    <tr key={row.channel} className="border-t border-line/70">
                      <td className="w-28 whitespace-nowrap py-2 pr-3 font-medium">{activityChannelLabel(row.channel)}</td>
                      <td className="min-w-[120px] py-2 pr-4">
                        <Bar value={row.total} max={maxContacts} title={`${activityChannelLabel(row.channel)}: ${row.total}`} />
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums">{row.total}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-muted">{row.outbound}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">
                        {row.positive}
                        {row.positiveRate !== null ? <span className="text-muted"> · {row.positiveRate}%</span> : null}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-muted">{row.noAnswer || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">Brak wpisów w dzienniku w tym okresie.</p>
            )}
          </Section>

          <Section title="Do zrobienia teraz" hint="Bez względu na okres: aktywne misje, które wymagają ruchu.">
            <div className="space-y-4 text-sm">
              <AttentionList
                title="Termin decyzji minął"
                tone="rose"
                items={now.overdue.map((m) => ({
                  mission: m,
                  label: name(m),
                  detail: formatPlDate(m.decision.decisionDeadline),
                }))}
              />
              <AttentionList
                title="Decyzja w ciągu 7 dni"
                tone="navy"
                items={now.soon.map((m) => ({
                  mission: m,
                  label: name(m),
                  detail: formatPlDate(m.decision.decisionDeadline),
                }))}
              />
              <AttentionList
                title="Bez kontaktu od 7+ dni"
                tone="amber"
                items={now.stale.map((m) => ({
                  mission: m,
                  label: name(m),
                  detail: `${stageLabel(m.currentStage)} · ${MISSION_STATUS_LABEL[m.status]}`,
                }))}
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function AttentionList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "rose" | "amber" | "navy";
  items: { mission: Mission; label: string; detail: string }[];
}) {
  const color = tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-700" : "text-navy";
  return (
    <div>
      <p className={cn("text-xs font-semibold", color)}>
        {title} · {items.length}
      </p>
      {items.length ? (
        <ul className="mt-1.5 space-y-1">
          {items.slice(0, 8).map((item) => (
            <li key={item.mission.id} className="flex justify-between gap-3">
              <Link href={`/partners/${item.mission.partnerId}/mission`} className="font-medium text-lutra">
                {item.label}
              </Link>
              <span className="text-xs text-muted">{item.detail}</span>
            </li>
          ))}
          {items.length > 8 ? <li className="text-xs text-muted">i {items.length - 8} więcej</li> : null}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted">Nic.</p>
      )}
    </div>
  );
}
