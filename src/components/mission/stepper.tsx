"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { STAGES, type StageId } from "@/lib/types";

export function MissionStepper({
  current,
  completed,
  onSelect,
  viewing,
}: {
  current: StageId;
  completed: StageId[];
  onSelect: (id: StageId) => void;
  /** Krok oglądany, gdy jest inny niż bieżący krok misji. */
  viewing?: StageId | null;
}) {
  const currentIndex = STAGES.findIndex((s) => s.id === current);

  return (
    <ol className="flex items-start justify-between px-2 pt-2">
      {STAGES.map((stage, index) => {
        const done = completed.includes(stage.id) || index < currentIndex;
        const active = stage.id === current;
        const peek = Boolean(viewing && viewing !== current && stage.id === viewing);
        return (
          <li key={stage.id} className="relative flex flex-1 flex-col items-center">
            {index < STAGES.length - 1 ? (
              <span
                className={cn(
                  "absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[15px] h-[2px]",
                  index < currentIndex ? "bg-emerald-400" : "bg-chip",
                )}
              />
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(stage.id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition",
                peek && "ring-2 ring-blue ring-offset-2",
                done && "bg-emerald-500 text-white",
                active && !done && "border-[3px] border-lutra bg-white text-lutra",
                !done && !active && "border-2 border-chip-mid bg-white text-muted",
              )}
            >
              {done ? <Check size={14} strokeWidth={3} /> : index + 1}
            </button>
            <span
              className={cn(
                "mt-2 max-w-[72px] text-center text-[10px] leading-3",
                active ? "font-semibold text-lutra" : peek ? "font-semibold text-blue" : "text-muted",
              )}
            >
              {stage.short}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
