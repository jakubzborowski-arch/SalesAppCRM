"use client";

import { cn } from "@/lib/cn";
import { FIT_CRITERIA, FIT_MAX, fitOf, fitScore, suggestFitCapacity } from "@/lib/fit";
import { useStore } from "@/lib/store";
import type { FitLevel, Partner } from "@/lib/types";

/** Odznaka „5/6” w liście partnerów (tylko lokale). */
export function FitBadge({ partner }: { partner: Partner }) {
  if (partner.segment !== "venue") return null;
  const { score, rated } = fitScore(partner);
  if (score === null) {
    return (
      <span title="Dopasowanie lokalu: nieocenione" className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted">
        –/{FIT_MAX}
      </span>
    );
  }
  return (
    <span
      title={`Dopasowanie lokalu ${score}/${FIT_MAX}${rated < 3 ? ` (ocenione ${rated} z 3 kryteriów)` : ""}`}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        score >= 5 ? "bg-emerald-50 text-emerald-800" : score >= 3 ? "bg-chip text-navy" : "bg-amber-50 text-amber-900",
      )}
    >
      {score}/{FIT_MAX}
    </span>
  );
}

/** Wynik dopasowania lokalu na karcie partnera: trzy kryteria po 0–2. */
export function FitEditor({ partner, editable }: { partner: Partner; editable: boolean }) {
  const { updatePartner, schemaV8 } = useStore();
  const fit = fitOf(partner);
  const { score, rated } = fitScore(partner);
  const capacityHint = fit.capacity === null ? suggestFitCapacity(partner.capacity) : null;

  const set = (key: keyof typeof fit, value: FitLevel | null) => {
    updatePartner(partner.id, { fit: { ...fit, [key]: value } });
  };

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(9,12,155,0.05)] lg:col-span-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-navy">Dopasowanie lokalu</h2>
          <p className="mt-1 text-xs font-medium text-muted">
            Trzy kryteria po 0–2 punkty. Wyższy wynik = lokal idzie wyżej na liście i na pulpicie.
          </p>
        </div>
        <p className="rounded-full bg-chip px-4 py-1.5 text-sm font-bold text-navy" data-testid="fit-total">
          {score === null ? "Dopasowanie: nieocenione" : `Dopasowanie ${score}/${FIT_MAX}`}
          {score !== null && rated < FIT_CRITERIA.length ? (
            <span className="ml-1 font-medium text-muted">
              ({rated} z {FIT_CRITERIA.length})
            </span>
          ) : null}
        </p>
      </div>
      <fieldset disabled={!editable} className="mt-4 grid gap-4 md:grid-cols-3">
        {FIT_CRITERIA.map((criterion) => {
          const value = fit[criterion.key];
          return (
            <div key={criterion.key} className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{criterion.label}</p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={criterion.label}>
                {criterion.options.map((label, index) => {
                  const level = index as FitLevel;
                  const on = value === level;
                  return (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set(criterion.key, on ? null : level)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                        on ? "bg-lutra text-white" : "bg-chip text-lutra hover:bg-chip-strong",
                      )}
                    >
                      {level} · {label}
                    </button>
                  );
                })}
              </div>
              {criterion.key === "capacity" && capacityHint !== null ? (
                <p className="mt-2 text-xs text-muted">
                  Podpowiedź z pojemności ({partner.capacity} osób): {capacityHint} · {criterion.options[capacityHint]}.{" "}
                  {editable ? (
                    <button type="button" onClick={() => set("capacity", capacityHint)} className="font-semibold text-lutra">
                      Przyjmij
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>
          );
        })}
      </fieldset>
      {schemaV8 === false ? (
        <p className="mt-3 text-xs text-amber-700">Wynik zapisze się w bazie po migracji v8 (żółty pasek u góry).</p>
      ) : null}
    </section>
  );
}
