"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { firstSteps, openTour, readOnboarding, writeOnboarding } from "@/lib/onboarding";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";

/** „Pierwsze kroki” na pulpicie: znika, gdy wszystko zrobione albo po „Ukryj”. */
export function FirstSteps() {
  const { state } = useStore();
  const userId = state.user.id;
  const [hidden, setHidden] = useState(() => readOnboarding(userId).checklistHidden);
  const steps = useMemo(() => firstSteps(state), [state]);
  const done = steps.filter((step) => step.done).length;
  if (hidden || done === steps.length) return null;
  const next = steps.find((step) => !step.done);

  return (
    <section className="mt-6 max-w-3xl rounded-[28px] border border-line bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-navy">Pierwsze kroki</h2>
          <p className="mt-1 text-xs text-muted">
            {done}/{steps.length} — przejdź jedną misję od początku do końca, a resztę zrobisz z pamięci.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={openTour} className="text-xs font-semibold text-lutra">
            Wprowadzenie
          </button>
          <Link href="/pomoc" className="text-xs font-semibold text-lutra">
            Pomoc
          </Link>
          <button
            type="button"
            onClick={() => {
              writeOnboarding(userId, { checklistHidden: true });
              setHidden(true);
            }}
            className="text-xs font-semibold text-muted"
          >
            Ukryj
          </button>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-chip">
        <div className="h-1.5 rounded-full bg-lutra" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className={cn(
                "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm transition",
                step.done ? "bg-emerald-50/60" : step === next ? "bg-chip hover:bg-chip-mid" : "bg-surface hover:bg-chip",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                  step.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-chip-strong bg-white text-muted",
                )}
              >
                {step.done ? "✓" : ""}
              </span>
              <span className="min-w-0">
                <span className={cn("block font-medium", step.done ? "text-muted line-through" : "text-foreground")}>
                  {step.label}
                </span>
                {!step.done ? <span className="block text-xs text-muted">{step.hint}</span> : null}
              </span>
              {step === next ? <span className="ml-auto shrink-0 text-xs font-semibold text-lutra">Teraz →</span> : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
