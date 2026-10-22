"use client";

import { lowerFirst, RESEARCH_ITEMS_BY_SEGMENT, SEGMENTS } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { CheckRow, HelpLink, Note } from "@/components/ui";

export function ResearchStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { toggleChecklist } = useStore();
  const items = RESEARCH_ITEMS_BY_SEGMENT[partner.segment] ?? RESEARCH_ITEMS_BY_SEGMENT.venue;
  const segment = SEGMENTS.find((s) => s.id === partner.segment);
  const done = items.filter((item) => mission.checklist[`research:${item.key}`]).length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Research partnera</h2>
        <HelpLink anchor="proces">Jak wygląda cały proces?</HelpLink>
      </div>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Przed pierwszym kontaktem sprawdź podstawy ({done}/{items.length}). Publiczne obserwacje to jeszcze nie potrzeby
        partnera — te potwierdzisz w rozmowie.
      </p>
      {segment ? (
        <div className="mt-4">
          <Note>
            <strong>{segment.label}:</strong> {segment.who}. Dostaje: {lowerFirst(segment.gets)}. Oczekujemy:{" "}
            {lowerFirst(segment.expects)}.
          </Note>
        </div>
      ) : null}
      <div className="mt-5 space-y-2.5">
        {items.map((item) => (
          <CheckRow
            key={item.key}
            checked={Boolean(mission.checklist[`research:${item.key}`])}
            label={item.label}
            onChange={() => toggleChecklist(mission.id, `research:${item.key}`)}
          />
        ))}
      </div>
    </div>
  );
}
