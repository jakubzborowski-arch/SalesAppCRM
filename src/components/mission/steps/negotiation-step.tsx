"use client";

import { OBJECTION_KEYS } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { CheckRow } from "@/components/ui";

export function NegotiationStep({ mission }: { mission: Mission; partner?: Partner }) {
  const { toggleObjection } = useStore();

  return (
    <div>
      <h2 className="text-lg font-semibold">Negocjacje i obiekcje</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Oznacz obiekcję z rozmowy, a potem zaznacz, czy Twój argument zadziałał.
      </p>
      <div className="mt-5 space-y-2.5">
        {OBJECTION_KEYS.map((item) => {
          const state = mission.objections.find((o) => o.key === item.key);
          return (
            <div key={item.key}>
              <CheckRow
                checked={Boolean(state?.checked)}
                label={item.label}
                onChange={() => toggleObjection(mission.id, item.key, "checked")}
              />
              {state?.checked ? (
                <div className="ml-4 mt-2 rounded-2xl bg-surface px-4 py-3 text-xs leading-5 text-muted">
                  <button
                    type="button"
                    onClick={() => toggleObjection(mission.id, item.key, "argumentWorked")}
                    className="font-semibold text-lutra"
                  >
                    {state.argumentWorked ? "Argument zadziałał ✓" : "Oznacz: argument zadziałał"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
