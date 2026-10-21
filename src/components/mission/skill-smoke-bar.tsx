"use client";

import { useState } from "react";
import type { InfeldSuggestResult } from "@/lib/infeld-client";
import { readableInfeldCards } from "@/lib/infeld-suggest";
import { isSkillDemoPartner, skillSmokeEnabled } from "@/lib/skill-smoke-test";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";

export function SkillSmokeBar({ partner, mission }: { partner: Partner; mission: Mission }) {
  const { applySkillSmokeTest } = useStore();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [infeld, setInfeld] = useState<InfeldSuggestResult | null>(null);

  if (!skillSmokeEnabled() || !isSkillDemoPartner(partner.name)) return null;

  return (
    <div className="mb-4 rounded-2xl border border-lutra/30 bg-lutra-soft px-4 py-3">
      <p className="text-sm font-medium text-navy">Smoke test skilla + Infeld</p>
      <p className="mt-1 text-xs text-muted">
        Wczyta całą misję Test i zapyta Infelda o playbook do faktów z rozmowy.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          setError(null);
          setInfeld(null);
          void applySkillSmokeTest(mission.id, partner.id).then((result) => {
            setPending(false);
            if (!result.ok) setError(result.error ?? "Nie udało się wczytać przykładu.");
            else {
              setDone(true);
              setInfeld(result.infeld ?? null);
            }
          });
        }}
        className="mt-3 rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Wczytuję i pytam Infelda…" : done ? "Wczytano — pełna misja + Infeld" : "Wczytaj całe zgłoszenie"}
      </button>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      {infeld ? (
        <div className="mt-3 rounded-2xl border border-lutra/20 bg-white px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
            Co zasugerował Infeld
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted">
            To nie nowa oferta — wycinek playbooka do faktów z tej rozmowy.
          </p>
          {infeld.error ? <p className="mt-2 text-xs text-rose-600">{infeld.error}</p> : null}
          {infeld.hints.length ? (
            <ul className="mt-3 space-y-3">
              {readableInfeldCards(infeld.hints).map((hint) => (
                <li key={hint.title}>
                  <p className="text-xs font-semibold text-foreground">{hint.title}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-muted">{hint.body}</p>
                </li>
              ))}
            </ul>
          ) : !infeld.error ? (
            <p className="mt-2 text-xs text-muted">Infeld nic nie zwrócił.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
