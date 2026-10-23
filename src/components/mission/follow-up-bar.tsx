"use client";

import { useState } from "react";
import { formatPlDate, relativeDeadline, toIsoDate } from "@/lib/dates";
import { pendingFollowUps } from "@/lib/followups";
import { useStore } from "@/lib/store";
import type { Mission } from "@/lib/types";

/**
 * Mail po kontakcie (Partnerzy → „Role w zespole”): po telefonie follow-up, po spotkaniu ustalenia
 * tego samego dnia. Znika, gdy w dzienniku jest wysłany mail.
 */
export function FollowUpBar({ mission }: { mission: Mission }) {
  const { logFollowUpMail, canEditMission, memberName } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = pendingFollowUps(mission);
  if (!items.length) return null;
  const editable = canEditMission(mission);

  return (
    <div className="mt-4 space-y-2">
      {items.map((item) => {
        const late = item.due < toIsoDate(new Date());
        return (
          <div
            key={item.activity.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
          >
            <p className="text-amber-950">
              <strong>{item.title}</strong>
              <span className="block text-xs text-amber-900">
                {item.kind === "meeting" ? "Spotkanie" : "Telefon"} {formatPlDate(item.due)} ({relativeDeadline(item.due)})
                {item.activity.createdBy ? ` · zapisał(a): ${memberName(item.activity.createdBy)}` : ""}
                {late && item.kind === "meeting" ? " · mail miał wyjść tego samego dnia" : ""}
              </span>
            </p>
            {editable ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(item.activity.id);
                  setError(null);
                  const result = await logFollowUpMail(mission.id, item.activity.id);
                  setBusy(null);
                  if (!result.ok) setError(result.error ?? "Nie udało się zapisać maila.");
                }}
                className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {busy === item.activity.id ? "Zapisuję…" : "Mail wysłany"}
              </button>
            ) : null}
          </div>
        );
      })}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
