"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Mail, MessageSquare, Phone, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ACTIVITY_CHANNELS,
  ACTIVITY_DIRECTIONS,
  ACTIVITY_OUTCOMES,
  MISSION_STATUS_LABEL,
  activityChannelLabel,
  activityOutcomeLabel,
  defaultOutcome,
  stageLabel,
} from "@/lib/playbook";
import { relativeDay } from "@/lib/dates";
import { useStore } from "@/lib/store";
import type {
  Activity,
  ActivityDirection,
  ActivityOutcome,
  Channel,
  Mission,
  MissionEvent,
  MissionStatus,
  Partner,
} from "@/lib/types";
import { Field, inputClass } from "@/components/ui";

const DATE_TIME = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function localNow() {
  const date = new Date();
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function inDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/** Podpowiedź następnego kroku po wyniku kontaktu. */
function suggestedNextStep(outcome: ActivityOutcome, channel: Channel): { label: string; at: string } | null {
  switch (outcome) {
    case "no_answer":
      return { label: channel === "phone" ? "Zadzwonić ponownie" : "Ponowić kontakt", at: inDays(2) };
    case "callback":
      return { label: "Oddzwonić w umówionym terminie", at: inDays(1) };
    case "sent":
      return { label: "Follow-up, jeśli nie odpisze", at: inDays(3) };
    case "meeting_booked":
      return { label: "Spotkanie / discovery z partnerem", at: "" };
    default:
      return null;
  }
}

function ChannelIcon({ channel }: { channel: string }) {
  const Icon = channel === "email" ? Mail : channel === "linkedin" ? MessageSquare : channel === "in_person" ? Users : Phone;
  return <Icon size={14} />;
}

type Row =
  | { type: "activity"; at: string; activity: Activity }
  | { type: "event"; at: string; event: MissionEvent };

function eventText(event: MissionEvent) {
  if (event.kind === "created") return "Misja założona";
  if (event.kind === "stage") return `Etap: ${stageLabel(event.fromValue)} → ${stageLabel(event.toValue)}`;
  const from = MISSION_STATUS_LABEL[event.fromValue as MissionStatus] ?? event.fromValue ?? "—";
  const to = MISSION_STATUS_LABEL[event.toValue as MissionStatus] ?? event.toValue ?? "—";
  return `Status: ${from} → ${to}${event.note ? ` · ${event.note}` : ""}`;
}

/** Statystyki kontaktów: ile prób, ile rozmów, kiedy ostatni. Początek analizy procesu. */
function ContactStats({ activities }: { activities: Activity[] }) {
  if (!activities.length) return null;
  const calls = activities.filter((a) => a.channel === "phone");
  const connected = calls.filter((a) => a.outcome === "connected" || a.outcome === "meeting_booked").length;
  const written = activities.filter((a) => a.channel === "email" || a.channel === "linkedin").length;
  const inbound = activities.filter((a) => a.direction === "inbound").length;
  const last = activities[0];
  const boxes = [
    { label: "Kontakty", value: String(activities.length) },
    { label: "Telefony / dodzwonione", value: `${calls.length} / ${connected}` },
    { label: "Maile i wiadomości", value: String(written) },
    { label: "Od partnera", value: String(inbound) },
    { label: "Ostatni kontakt", value: last ? relativeDay(last.occurredAt) : "—" },
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
      {boxes.map((box) => (
        <div key={box.label} className="rounded-2xl bg-surface px-3 py-2">
          <dt className="text-muted">{box.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">{box.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActivityForm({
  partner,
  mission,
  onDone,
}: {
  partner: Partner;
  mission: Mission;
  onDone: () => void;
}) {
  const { logActivity } = useStore();
  const decisionMaker = partner.contacts.find((c) => c.isDecisionMaker) ?? partner.contacts[0];
  const [channel, setChannel] = useState<Channel>(mission.selectedChannel ?? "phone");
  const [direction, setDirection] = useState<ActivityDirection>("outbound");
  const [outcome, setOutcome] = useState<ActivityOutcome>(defaultOutcome(mission.selectedChannel ?? "phone", "outbound"));
  const [contactId, setContactId] = useState(decisionMaker?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(localNow);
  const [durationMin, setDurationMin] = useState("");
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepAt, setNextStepAt] = useState("");
  const [nextTouched, setNextTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outcomes = ACTIVITY_OUTCOMES[channel];
  const written = channel === "email" || channel === "linkedin";

  const applyOutcome = (next: ActivityOutcome, nextChannel = channel) => {
    setOutcome(next);
    if (nextTouched) return;
    const suggestion = suggestedNextStep(next, nextChannel);
    setNextStep(suggestion?.label ?? "");
    setNextStepAt(suggestion?.at ?? "");
  };

  const pickChannel = (next: Channel) => {
    setChannel(next);
    const keep = ACTIVITY_OUTCOMES[next].some((item) => item.id === outcome);
    applyOutcome(keep ? outcome : defaultOutcome(next, direction), next);
  };

  const pickDirection = (next: ActivityDirection) => {
    setDirection(next);
    if (written) applyOutcome(defaultOutcome(channel, next));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const when = new Date(occurredAt);
    if (Number.isNaN(when.getTime())) {
      setError("Podaj datę i godzinę kontaktu.");
      return;
    }
    if (when.getTime() > Date.now() + 5 * 60000) {
      setError("Kontakt z przyszłości zapisz jako następny krok, nie jako wpis w dzienniku.");
      return;
    }
    if (!summary.trim() && !subject.trim() && outcome !== "no_answer") {
      setError("Dopisz jedno zdanie: co padło albo co wysłałeś.");
      return;
    }
    const minutes = durationMin.trim() ? Number(durationMin) : null;
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 600)) {
      setError("Czas rozmowy: od 0 do 600 minut.");
      return;
    }
    if (nextStep.trim() && !nextStepAt) {
      setError("Następny krok potrzebuje daty.");
      return;
    }
    setSaving(true);
    const result = await logActivity({
      missionId: mission.id,
      channel,
      direction,
      outcome,
      subject: written ? subject : "",
      summary,
      contactId,
      occurredAt,
      durationMin: written ? null : minutes,
      nextStep: nextStep.trim() || undefined,
      nextStepAt: nextStep.trim() ? nextStepAt : undefined,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Nie udało się zapisać kontaktu.");
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="mt-4 rounded-[24px] border border-chip-mid bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {ACTIVITY_CHANNELS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => pickChannel(item.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
              channel === item.id ? "bg-lutra text-white" : "bg-white text-lutra",
            )}
          >
            <ChannelIcon channel={item.id} />
            {item.label}
          </button>
        ))}
        <span className="mx-1 h-6 w-px self-center bg-chip-strong" />
        {ACTIVITY_DIRECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => pickDirection(item.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium",
              direction === item.id ? "bg-navy text-white" : "bg-white text-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Wynik">
          <select
            className={inputClass}
            value={outcome}
            onChange={(e) => applyOutcome(e.target.value as ActivityOutcome)}
          >
            {outcomes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Osoba" optional>
          <select className={inputClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">—</option>
            {partner.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
                {contact.role ? ` · ${contact.role}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kiedy">
          <input
            type="datetime-local"
            className={inputClass}
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_160px]">
        {written ? (
          <Field label="Temat" optional>
            <input
              className={inputClass}
              placeholder="Temat maila albo wiadomości"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
        ) : (
          <Field label="Notatka">
            <textarea
              className={`${inputClass} min-h-[76px]`}
              placeholder="Co padło, kto odebrał, na czym stanęło."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
        )}
        {written ? null : (
          <Field label="Minuty" optional>
            <input
              inputMode="numeric"
              className={inputClass}
              placeholder="np. 12"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value.replace(/[^\d]/g, ""))}
            />
          </Field>
        )}
      </div>
      {written ? (
        <div className="mt-3">
          <Field label="Treść / notatka">
            <textarea
              className={`${inputClass} min-h-[76px]`}
              placeholder="Najważniejsze zdania z maila albo co odpisał partner."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_200px]">
        <Field label="Następny krok" optional>
          <input
            className={inputClass}
            placeholder={mission.nextStepLabel || "Co i kiedy robimy dalej"}
            value={nextStep}
            onChange={(e) => {
              setNextTouched(true);
              setNextStep(e.target.value);
            }}
          />
        </Field>
        <Field label="Data kroku" optional>
          <input
            type="date"
            className={inputClass}
            value={nextStepAt}
            onChange={(e) => {
              setNextTouched(true);
              setNextStepAt(e.target.value);
            }}
          />
        </Field>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Wypełniony następny krok zastępuje obecny ({mission.nextStepLabel || "brak"}) i trafia do Zadań.
      </p>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Zapisuję…" : "Zapisz w dzienniku"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-muted">
          Anuluj
        </button>
      </div>
    </form>
  );
}

function ActivityItem({
  activity,
  partner,
  canDelete,
  showMission,
}: {
  activity: Activity;
  partner: Partner;
  canDelete: boolean;
  showMission?: string;
}) {
  const { memberName, removeActivity } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contact = partner.contacts.find((c) => c.id === activity.contactId);
  const author = memberName(activity.createdBy);
  const negative = activity.outcome === "refused";
  const missed = activity.outcome === "no_answer";

  return (
    <li className="relative pl-7">
      <span
        className={cn(
          "absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full",
          negative ? "bg-rose-50 text-rose-600" : missed ? "bg-amber-50 text-amber-700" : "bg-chip text-lutra",
        )}
      >
        <ChannelIcon channel={activity.channel} />
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-foreground">
          {activityChannelLabel(activity.channel)}
          <span className="font-normal text-muted"> · {activity.direction === "inbound" ? "od partnera" : "od nas"} · </span>
          <span className={cn(negative && "text-rose-700", missed && "text-amber-800")}>
            {activityOutcomeLabel(activity.channel, activity.outcome)}
          </span>
        </p>
        <p className="text-[11px] text-muted">
          {DATE_TIME.format(new Date(activity.occurredAt))}
          {activity.durationMin ? ` · ${activity.durationMin} min` : ""}
        </p>
      </div>
      {activity.subject ? <p className="mt-1 text-sm font-medium text-foreground">{activity.subject}</p> : null}
      {activity.summary ? (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-foreground">{activity.summary}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted">
        {[
          contact ? `${contact.name}${contact.role ? `, ${contact.role}` : ""}` : "",
          author ? `zapisał(a): ${author}` : "",
          activity.hasRecording ? "nagranie" : "",
          activity.hasTranscript ? "transkrypt" : "",
          showMission ?? "",
        ]
          .filter(Boolean)
          .join(" · ")}
        {canDelete && !activity.hasRecording && !activity.hasTranscript ? (
          confirm ? (
            <span className="ml-2">
              <button
                type="button"
                className="font-semibold text-rose-600"
                onClick={async () => {
                  const result = await removeActivity(activity.missionId, activity.id);
                  if (!result.ok) setError(result.error ?? "Nie udało się usunąć.");
                  setConfirm(false);
                }}
              >
                Usuń na pewno
              </button>
              <button type="button" className="ml-2" onClick={() => setConfirm(false)}>
                Anuluj
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label="Usuń wpis"
              className="ml-2 inline-flex translate-y-0.5 text-muted hover:text-rose-600"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={12} />
            </button>
          )
        ) : null}
      </p>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </li>
  );
}

/**
 * Dziennik kontaktów: każdy telefon, mail, wiadomość i spotkanie jako osobny wpis,
 * razem ze zmianami etapu i statusu misji.
 */
export function ActivityLog({
  partner,
  missions,
  activeMission,
  formOpen,
  onFormOpenChange,
  title = "Dziennik kontaktów",
}: {
  partner: Partner;
  missions: Mission[];
  activeMission?: Mission;
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  title?: string;
}) {
  const { memberName, state, schemaV4, dbStatus } = useStore();
  const [showEvents, setShowEvents] = useState(true);
  const multi = missions.length > 1;

  const activities = useMemo(
    () => missions.flatMap((m) => m.activities).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [missions],
  );
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = activities.map((activity) => ({ type: "activity", at: activity.occurredAt, activity }));
    if (showEvents) {
      for (const event of missions.flatMap((m) => m.events)) list.push({ type: "event", at: event.at, event });
    }
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [activities, missions, showEvents]);

  const missionLabel = (missionId: string) => {
    if (!multi) return undefined;
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return undefined;
    const started = mission.startedAt ? new Date(mission.startedAt).toLocaleDateString("pl-PL") : "";
    return `misja ${started}${mission.status !== "active" ? ` (${MISSION_STATUS_LABEL[mission.status].toLowerCase()})` : ""}`;
  };

  const me = state.user.id;
  const isAdmin = Boolean(state.user.isAdmin);
  const needsMigration = dbStatus === "ok" && schemaV4 === false;

  return (
    <section id="dziennik" className="rounded-[28px] border border-line bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
            Każdy telefon, mail i spotkanie osobno: kiedy, z kim, z jakim wynikiem. Wspólna notatka misji z
            kroku Kontakt zostaje bez zmian.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
            Zmiany etapów
          </label>
          {activeMission && !formOpen ? (
            <button
              type="button"
              onClick={() => onFormOpenChange(true)}
              disabled={needsMigration}
              className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              + Zapisz kontakt
            </button>
          ) : null}
        </div>
      </div>

      {needsMigration ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Dziennik wymaga migracji bazy v4. W Supabase → SQL Editor wklej plik supabase/v4-team-timeline.sql i
          kliknij Run.
        </p>
      ) : null}

      {activeMission && formOpen ? (
        <ActivityForm
          key={activeMission.id}
          partner={partner}
          mission={activeMission}
          onDone={() => onFormOpenChange(false)}
        />
      ) : null}

      <ContactStats activities={activities} />

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {activeMission
            ? "Jeszcze nic nie zapisano. Po każdym telefonie albo mailu dodaj jeden wpis."
            : "Brak kontaktów z tym partnerem."}
        </p>
      ) : (
        <ol className="mt-5 space-y-4">
          {rows.map((row) =>
            row.type === "activity" ? (
              <ActivityItem
                key={row.activity.id}
                activity={row.activity}
                partner={partner}
                canDelete={isAdmin || !row.activity.createdBy || row.activity.createdBy === me}
                showMission={missionLabel(row.activity.missionId)}
              />
            ) : (
              <li key={row.event.id} className="relative pl-7 text-xs text-muted">
                <span className="absolute left-[7px] top-1 h-2 w-2 rounded-full bg-chip-strong" />
                {eventText(row.event)}
                <span className="ml-2 text-[11px]">
                  {DATE_TIME.format(new Date(row.event.at))}
                  {row.event.actorId ? ` · ${memberName(row.event.actorId)}` : ""}
                  {missionLabel(row.event.missionId) ? ` · ${missionLabel(row.event.missionId)}` : ""}
                </span>
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}
