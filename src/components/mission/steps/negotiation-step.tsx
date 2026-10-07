"use client";

import { OBJECTION_KEYS } from "@/lib/playbook";
import { readableInfeldCards } from "@/lib/infeld-suggest";
import { useInfeldHints } from "@/lib/use-infeld-hints";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { CheckRow } from "@/components/ui";

const MATCH: Record<string, RegExp> = {
  other_apps: /inne aplikacje|inne apki|kuponem na weekend/i,
  how_many: /ile osób|przyprowadz/i,
  margin: /zniżka mi się nie|zepsuję bar|nie opłaca/i,
  no_time: /nie mam czasu|ochrona nie|pilnować/i,
  ask_owner: /zapytać właściciela|recap z oknem/i,
  come_back: /wróćcie|więcej użytkowników/i,
};

export function NegotiationStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { toggleObjection } = useStore();
  const { result: infeld } = useInfeldHints(partner, mission);
  const hints = readableInfeldCards(infeld?.hints ?? []);

  return (
    <div>
      <h2 className="text-lg font-semibold">Negocjacje i obiekcje</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Oznacz obiekcję z rozmowy. Pod spodem odpowiedź i dopytanie z playbooka — nie ogólny blok o zniżce.
      </p>
      <div className="mt-5 space-y-2.5">
        {OBJECTION_KEYS.map((item) => {
          const state = mission.objections.find((o) => o.key === item.key);
          const hint = hints.find((h) => MATCH[item.key]?.test(`${h.title} ${h.body}`));
          return (
            <div key={item.key}>
              <CheckRow
                checked={Boolean(state?.checked)}
                label={item.label}
                onChange={() => toggleObjection(mission.id, item.key, "checked")}
              />
              {state?.checked ? (
                <div className="ml-4 mt-2 rounded-2xl bg-surface px-4 py-3 text-xs leading-5 text-muted">
                  {hint ? (
                    <>
                      <p className="font-semibold text-foreground">{hint.title}</p>
                      <p className="mt-1">{hint.body}</p>
                    </>
                  ) : (
                    <p>Szukam odpowiedzi w Infeldzie…</p>
                  )}
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
