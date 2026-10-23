"use client";

import { useState } from "react";
import { isSkillDemoPartner, skillSmokeEnabled } from "@/lib/skill-smoke-test";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";

export function SkillSmokeBar({ partner, mission }: { partner: Partner; mission: Mission }) {
  const { applySkillSmokeTest } = useStore();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!skillSmokeEnabled() || !isSkillDemoPartner(partner.name)) return null;

  return (
    <div className="mb-4 rounded-2xl border border-lutra/30 bg-lutra-soft px-4 py-3">
      <p className="text-sm font-medium text-navy">Smoke test skilla</p>
      <p className="mt-1 text-xs text-muted">
        Wczyta całą misję Test z przykładową rozmową.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          setError(null);
          void applySkillSmokeTest(mission.id, partner.id).then((result) => {
            setPending(false);
            if (!result.ok) setError(result.error ?? "Nie udało się wczytać przykładu.");
            else setDone(true);
          });
        }}
        className="mt-3 rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Wczytuję…" : done ? "Wczytano — pełna misja" : "Wczytaj całe zgłoszenie"}
      </button>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
