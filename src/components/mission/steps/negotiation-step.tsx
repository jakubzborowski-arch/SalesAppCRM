"use client";

import { OBJECTION_LIBRARY } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import type { Mission } from "@/lib/types";
import { CheckRow } from "@/components/ui";

export function NegotiationStep({ mission }: { mission: Mission }) {
  const { toggleObjection } = useStore();

  return (
    <div>
      <h2 className="text-lg font-semibold">Negocjacje i obiekcje</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Oznacz konkretną obiekcję, której AI użyje do personalizowanego argumentu. Następny argument dopiero po tym, jak partner potwierdzi.
      </p>
      <div className="mt-5 space-y-2.5">
        {OBJECTION_LIBRARY.map((item) => {
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
                  <p>
                    <span className="font-semibold">Odpowiedź: </span>
                    {item.response}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold">Dopytaj: </span>
                    {item.followUp}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleObjection(mission.id, item.key, "argumentWorked")}
                    className="mt-2 font-semibold text-lutra"
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
