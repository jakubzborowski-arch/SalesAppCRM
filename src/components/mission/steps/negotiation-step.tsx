"use client";

import { useState } from "react";
import { OBJECTION_KEYS } from "@/lib/playbook";
import { termsChecks } from "@/lib/terms";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { CheckRow, HelpLink, Note, Requirements, Section } from "@/components/ui";
import { PeriodFields, TermsFields } from "@/components/mission/terms-editor";
import { TermsSummary } from "@/components/mission/steps/offer-step";

export function NegotiationStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { toggleObjection, setChecklistItem } = useStore();
  const [editTerms, setEditTerms] = useState(false);
  const missingTerms = termsChecks(mission, partner.segment).filter((check) => !check.done);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Negocjacje i obiekcje</h2>
        <HelpLink anchor="oferta">Co z warunkami?</HelpLink>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Zapisz, co partner zgłosił i czy argument zadziałał. Jeśli w rozmowie zmieniły się warunki — popraw je tutaj, żeby
        porozumienie albo umowa miały aktualną wersję.
      </p>

      <div className="mt-4">
        <Requirements
          title="Do umowy brakuje"
          doneText="Oferta zatwierdzona, warunki kompletne — możesz iść do porozumienia albo umowy."
          checks={[
            { key: "offer", label: "zatwierdzona oferta", done: mission.offerApproved },
            ...termsChecks(mission, partner.segment),
          ]}
        />
      </div>

      {partner.segment === "venue" ? (
        <Section
          title="Pokaz na telefonie"
          hint="Przy wizycie pokaż, jak gość tworzy wydarzenie i jak obsługa realizuje zniżkę (QR, kod albo hasło)."
        >
          <CheckRow
            checked={Boolean(mission.checklist["negotiation:demo"])}
            label="Pokazałem działanie zniżki na telefonie"
            onChange={() => setChecklistItem(mission.id, "negotiation:demo", !mission.checklist["negotiation:demo"])}
          />
        </Section>
      ) : null}

      <Section title="Obiekcje z rozmowy">
        <div className="space-y-2.5">
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
      </Section>

      <Section
        title="Warunki po negocjacjach"
        aside={
          <button type="button" onClick={() => setEditTerms((open) => !open)} className="text-xs font-semibold text-lutra">
            {editTerms ? "Zwiń" : "Zmień warunki"}
          </button>
        }
      >
        {missingTerms.length ? (
          <Note tone="warn">Brakuje: {missingTerms.map((check) => check.label).join(", ")}.</Note>
        ) : null}
        <TermsSummary mission={mission} partner={partner} />
        {editTerms ? (
          <div className="mt-4 space-y-5">
            <TermsFields mission={mission} segment={partner.segment} />
            <PeriodFields mission={mission} />
          </div>
        ) : null}
      </Section>
    </div>
  );
}
