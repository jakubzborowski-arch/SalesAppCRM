"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Mission } from "@/lib/types";

/** Przekazanie misji innej osobie z zespołu (właściciel albo administrator). */
export function TransferMission({ mission }: { mission: Mission }) {
  const { state, transferMission, schemaV6 } = useStore();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = state.team.filter((member) => member.id !== mission.ownerUserId);
  if (schemaV6 !== true || !others.length) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-muted"
      >
        Przekaż misję
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Nowy prowadzący"
        className="rounded-full border border-line bg-white px-3 py-1.5 text-xs"
        value={target}
        onChange={(event) => setTarget(event.target.value)}
      >
        <option value="">Komu?</option>
        {others.map((member) => (
          <option key={member.id} value={member.id}>
            {member.fullName}
            {member.isMe ? " (Ty)" : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!target || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await transferMission(mission.id, target);
          setBusy(false);
          if (!result.ok) setError(result.error ?? "Nie udało się przekazać misji.");
          else setOpen(false);
        }}
        className="rounded-full bg-lutra px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Przekazuję…" : "Przekaż"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
        Anuluj
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
