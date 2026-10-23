"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { CLOSE_OPTIONS, CLOSE_REASONS } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import type { CloseStatus, Mission } from "@/lib/types";
import { Field, inputClass } from "@/components/ui";

function inDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export function CloseMissionPanel({
  mission,
  onCancel,
  onClosed,
}: {
  mission: Mission;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const { closeMission } = useStore();
  const [status, setStatus] = useState<CloseStatus>("lost");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const option = CLOSE_OPTIONS.find((item) => item.status === status) ?? CLOSE_OPTIONS[0];
  const showDate = status === "nurture" || status === "paused";

  const pick = (next: CloseStatus) => {
    setStatus(next);
    setError(null);
    if (next === "nurture" && !returnAt) setReturnAt(inDays(30));
    if (next === "paused" && reason === "") setReason("Wstrzymane po naszej stronie");
  };

  const submit = () => {
    const result = closeMission(mission.id, { status, reason, note, returnAt: showDate ? returnAt : "" });
    if (!result.ok) {
      setError(result.reason ?? "Nie udało się zamknąć misji.");
      return;
    }
    onClosed();
  };

  return (
    <section className="mt-4 rounded-[24px] border border-rose-100 bg-rose-50/40 p-5">
      <h2 className="text-base font-semibold text-foreground">Zamknij misję</h2>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
        Powód z listy trafia do historii i do raportu przegranych. Zamkniętą misję da się potem wznowić.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {CLOSE_OPTIONS.map((item) => (
          <button
            key={item.status}
            type="button"
            onClick={() => pick(item.status)}
            className={cn(
              "rounded-2xl border px-4 py-3 text-left transition",
              status === item.status ? "border-lutra bg-white" : "border-line bg-white/60 hover:border-blue",
            )}
          >
            <span className="block text-sm font-semibold text-foreground">{item.label}</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-muted">{item.hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Powód" optional={status === "paused"}>
          <select
            className={inputClass}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
          >
            <option value="">Wybierz powód</option>
            {CLOSE_REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        {showDate ? (
          <Field label="Wracamy do partnera" optional={status === "paused"}>
            <input
              type="date"
              className={inputClass}
              min={new Date().toISOString().slice(0, 10)}
              value={returnAt}
              onChange={(e) => setReturnAt(e.target.value)}
            />
          </Field>
        ) : null}
      </div>
      <div className="mt-3">
        <Field label="Notatka" optional={reason !== "Inny powód"}>
          <textarea
            className={`${inputClass} min-h-[72px]`}
            placeholder="Co dokładnie padło. Przyda się, gdy ktoś wróci do tego partnera."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      {showDate && status === "nurture" ? (
        <p className="mt-2 text-xs text-muted">W dniu powrotu misja pojawi się w Zadaniach jako następny krok.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-navy"
        >
          Zamknij jako: {option.label}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted">
          Anuluj
        </button>
      </div>
    </section>
  );
}
