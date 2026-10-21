"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { STAGES } from "@/lib/types";
import { useStore } from "@/lib/store";
import { Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isIsoDate } from "@/lib/dates";

type Filter = "open" | "done" | "all";

export default function TasksPage() {
  const { state, partnerById, addTask, completeTask } = useStore();
  const [filter, setFilter] = useState<Filter>("open");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(new Date().toISOString().slice(0, 10));
  const [missionId, setMissionId] = useState(state.missions.find((m) => m.status === "active")?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeMissions = state.missions.filter((m) => m.status === "active");
  // „Wrócić później” i pauza też mają termin powrotu — ma być widoczny w zadaniach.
  const followUpMissions = state.missions.filter(
    (m) => m.status === "active" || m.status === "nurture" || m.status === "paused",
  );

  const rows = useMemo(() => {
    const fromTable = state.tasks.map((task) => {
      const mission = state.missions.find((m) => m.id === task.missionId);
      return {
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        doneAt: task.doneAt,
        source: task.source,
        mission,
        partner: mission ? partnerById(mission.partnerId) : undefined,
      };
    });

    // Następny krok z misji, którego baza jeszcze nie ma jako zadania (np. zmieniony przed chwilą).
    const stepKey = (missionId: string, title: string, dueAt?: string) =>
      `${missionId}|${title.trim()}|${(dueAt ?? "").slice(0, 10)}`;
    const covered = new Set(
      state.tasks.filter((t) => t.source === "next_step").map((t) => stepKey(t.missionId, t.title, t.dueAt)),
    );
    const fallback = followUpMissions
      .filter((m) => m.nextStepLabel.trim() && !covered.has(stepKey(m.id, m.nextStepLabel, m.nextStepAt)))
      .map((m) => ({
        id: `next:${m.id}`,
        title: m.nextStepLabel,
        dueAt: m.nextStepAt,
        doneAt: undefined as string | undefined,
        source: "next_step" as "next_step" | "deadline",
        mission: m,
        partner: partnerById(m.partnerId),
      }));

    // Termin decyzji partnera — przypomnienie wyliczane z misji, nie zadanie w bazie.
    const deadlines = activeMissions
      .filter((m) => isIsoDate(m.decision.decisionDeadline))
      .map((m) => ({
        id: `deadline:${m.id}`,
        title: "Termin decyzji partnera",
        dueAt: m.decision.decisionDeadline,
        doneAt: undefined as string | undefined,
        source: "deadline" as const,
        mission: m,
        partner: partnerById(m.partnerId),
      }));

    const all = [...fromTable, ...fallback, ...deadlines].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    if (filter === "open") return all.filter((row) => !row.doneAt);
    if (filter === "done") return all.filter((row) => row.doneAt);
    return all;
  }, [state.tasks, state.missions, followUpMissions, activeMissions, filter, partnerById]);

  return (
    <div>
      <div className="flex items-center justify-end px-8 py-6 text-sm text-muted">
        CRM / Zadania
      </div>
      <div className="px-8 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Zadania</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Następny krok z misji plus zadania, które dodajesz sam. Jedna lista, nie tablica 30 follow-upów.
        </p>

        <form
          className="mt-6 grid max-w-3xl gap-3 rounded-[24px] border border-line bg-white p-5 md:grid-cols-[1fr_160px_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!missionId) {
              setError("Wybierz misję.");
              return;
            }
            setSaving(true);
            setError(null);
            const result = await addTask({ missionId, title, dueAt });
            setSaving(false);
            if (!result.ok) {
              setError(result.error ?? "Nie udało się dodać.");
              return;
            }
            setTitle("");
          }}
        >
          <Field label="Nowe zadanie">
            <input
              className={inputClass}
              placeholder="Co zrobisz i z kim"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Termin">
            <input
              type="date"
              className={inputClass}
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-lutra px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Dodaj
            </button>
          </div>
          <div className="md:col-span-3">
            <Field label="Misja">
              <select
                className={inputClass}
                value={missionId}
                onChange={(e) => setMissionId(e.target.value)}
              >
                <option value="">Wybierz misję</option>
                {activeMissions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {partnerById(m.partnerId)?.name ?? m.id} ·{" "}
                    {STAGES.find((s) => s.id === m.currentStage)?.label}
                  </option>
                ))}
              </select>
            </Field>
            {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
          </div>
        </form>

        <div className="mt-6 flex gap-2">
          {(
            [
              ["open", "Otwarte"],
              ["done", "Zrobione"],
              ["all", "Wszystkie"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                filter === id ? "bg-lutra text-white" : "bg-chip text-navy",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 max-w-3xl space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between gap-4 rounded-[24px] border border-line bg-white px-5 py-4"
            >
              <label className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(row.doneAt)}
                  disabled={row.id.startsWith("next:") || row.id.startsWith("deadline:")}
                  onChange={(e) => completeTask(row.id, e.target.checked)}
                />
                <span>
                  <span className={cn("font-semibold", row.doneAt && "text-muted line-through")}>
                    {row.partner?.name ?? "Misja"}
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    {row.title} · {row.dueAt || "bez daty"} ·{" "}
                    {row.source === "human" ? "ręczne" : row.source === "deadline" ? "termin decyzji" : "następny krok"}
                    {row.mission
                      ? ` · ${STAGES.find((s) => s.id === row.mission?.currentStage)?.label}`
                      : ""}
                  </span>
                </span>
              </label>
              {row.partner ? (
                <Link
                  href={`/partners/${row.partner.id}/mission`}
                  className="shrink-0 text-sm font-medium text-lutra"
                >
                  Misja
                </Link>
              ) : null}
            </div>
          ))}
          {rows.length === 0 ? <p className="text-sm text-muted">Brak zadań w tym filtrze.</p> : null}
        </div>
      </div>
    </div>
  );
}
