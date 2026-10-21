"use client";

import { OFFER_VARIANTS } from "@/lib/playbook";
import { constraintText, offerBlockers } from "@/lib/gates";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Mission } from "@/lib/types";

export function OfferStep({ mission }: { mission: Mission }) {
  const { selectVariant, approveOffer, markOfferSent } = useStore();
  const missing = offerBlockers(mission);
  const blocked = missing.length > 0;

  return (
    <div>
      <h2 className="text-lg font-semibold">Oferta A/B/C</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Wybierz A, B albo C. Rekomendacja wynika z potwierdzonych faktów.
      </p>

      {blocked ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Brakuje danych: {missing.join(", ")}. Uzupełnij discovery i potwierdź choć jedną potrzebę.
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        {OFFER_VARIANTS.map((offer) => {
          const selected = mission.selectedVariant === offer.variant;
          const recommended = mission.recommendedVariant === offer.variant;
          return (
            <button
              key={offer.variant}
              type="button"
              disabled={blocked}
              onClick={() => selectVariant(mission.id, offer.variant)}
              className={cn(
                "rounded-2xl border p-4 text-left transition disabled:opacity-50",
                selected
                  ? "border-lutra bg-chip"
                  : "border-chip-mid bg-white hover:border-blue",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {offer.variant}. {offer.name}
                </span>
                {recommended ? (
                  <span className="rounded-full bg-lutra-soft px-2 py-0.5 text-[10px] font-semibold text-lutra">
                    Rekomendacja z faktów
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
        <div className="rounded-2xl border border-dashed border-chip-strong p-4 text-sm text-muted">
          Warunki z tej misji
          <p className="mt-1 text-xs">
            {constraintText(mission) ||
              "Wróć do mapy potrzeb i zapisz ograniczenia, zanim wyślesz ofertę."}
          </p>
          {mission.decision.expectedResult.trim() ? (
            <p className="mt-2 text-xs">Rezultat: {mission.decision.expectedResult}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
        <p className="text-sm text-muted">
          {mission.offerSentAt
            ? `Wariant ${mission.selectedVariant} wysłany ${mission.offerSentAt.slice(0, 10)}.`
            : mission.offerApproved
              ? `Wariant ${mission.selectedVariant} zatwierdzony. Możesz oznaczyć wysyłkę.`
              : "Model nie wysyła oferty. Zatwierdź wariant, język i warunki."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={blocked || !mission.selectedVariant || mission.offerApproved}
            onClick={() => approveOffer(mission.id)}
            className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Zatwierdź wariant
          </button>
          <button
            type="button"
            disabled={!mission.offerApproved || Boolean(mission.offerSentAt)}
            onClick={() => markOfferSent(mission.id)}
            className="rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra disabled:opacity-40"
          >
            Oznacz wysyłkę
          </button>
        </div>
      </div>
    </div>
  );
}
