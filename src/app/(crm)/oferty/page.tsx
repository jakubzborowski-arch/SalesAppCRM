"use client";

import Link from "next/link";
import { OFFER_VARIANTS, offerName } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";

function offerStatus(mission: { offerApproved: boolean; offerSentAt?: string; selectedVariant: string | null }) {
  if (mission.offerSentAt) return "wysłana";
  if (mission.offerApproved) return "zatwierdzona";
  if (mission.selectedVariant) return "szkic";
  return "brak";
}

export default function OffersPage() {
  const { state, partnerById, markOfferSent } = useStore();
  const offers = state.missions
    .filter((m) => m.selectedVariant)
    .map((m) => ({
      mission: m,
      partner: partnerById(m.partnerId),
      offerName: offerName(m.selectedVariant),
      status: offerStatus(m),
    }));

  return (
    <div>
      <div className="flex items-center justify-end px-8 py-6 text-sm text-muted">
        CRM / Oferty
      </div>
      <div className="px-8 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Oferty</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Warianty A/B/C z misji. Treść oferty i zakazy są w Infeldzie. Wysyłka tylko po Twoim zatwierdzeniu.
        </p>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-[0.12em] text-navy">
          Warianty
        </h2>
        <div className="mt-3 grid max-w-4xl gap-3 md:grid-cols-3">
          {OFFER_VARIANTS.map((offer) => (
            <div key={offer.variant} className="rounded-[24px] border border-line bg-white p-5">
              <p className="font-semibold">
                {offer.variant}. {offer.name}
              </p>
              <p className="mt-2 text-sm leading-5 text-muted">Opis i dopasowanie — baza Infelda.</p>
            </div>
          ))}
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-[0.12em] text-navy">
          W misjach
        </h2>
        <div className="mt-3 max-w-3xl space-y-3">
          {offers.map(({ mission, partner, offerName: name, status }) => (
            <div
              key={mission.id}
              className="flex items-start justify-between gap-4 rounded-[24px] border border-line bg-white px-5 py-4"
            >
              <div>
                <p className="font-semibold">
                  {partner?.name} · wariant {mission.selectedVariant}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {name} · {status}
                  {mission.offerSentAt ? ` ${mission.offerSentAt.slice(0, 10)}` : ""}
                </p>
                <p className="mt-2 text-sm leading-5 text-muted">
                  {mission.decision.constraintSummary.trim()
                    ? `Warunki: ${mission.decision.constraintSummary}`
                    : "Brak ograniczeń z discovery — wróć do mapy potrzeb."}
                </p>
                {mission.decision.expectedResult.trim() ? (
                  <p className="mt-1 text-xs text-muted">Rezultat: {mission.decision.expectedResult}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {mission.offerApproved && !mission.offerSentAt ? (
                  <button
                    type="button"
                    onClick={() => markOfferSent(mission.id)}
                    className={cn("rounded-full bg-lutra px-3 py-1.5 text-xs font-semibold text-white")}
                  >
                    Oznacz jako wysłaną
                  </button>
                ) : null}
                {partner ? (
                  <Link href={`/partners/${partner.id}/mission`} className="text-sm font-medium text-lutra">
                    Misja
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
          {offers.length === 0 ? (
            <p className="text-sm text-muted">
              Jeszcze nie ma wariantów w misjach. Domknij discovery, potem wybierz A/B/C.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
