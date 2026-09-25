"use client";

import { RESEARCH_ITEMS } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import type { Mission } from "@/lib/types";
import { CheckRow } from "@/components/ui";

export function ResearchStep({ mission }: { mission: Mission }) {
  const { toggleChecklist } = useStore();

  return (
    <div>
      <h2 className="text-lg font-semibold">Research partnera</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Checklist idzie do misji w bazie. Publiczne obserwacje to nie potrzeby partnera.
      </p>
      <div className="mt-5 space-y-2.5">
        {RESEARCH_ITEMS.map((item) => (
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
