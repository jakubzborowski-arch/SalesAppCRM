"use client";

import Link from "next/link";
import { OFFER_VARIANTS_BY_SEGMENT, offerName, SEGMENTS } from "@/lib/playbook";
import { termsLines } from "@/lib/terms";
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
    .map((m) => {
      const partner = partnerById(m.partnerId);
      return {
        mission: m,
        partner,
        offerName: offerName(m.selectedVariant, partner?.segment),
        status: offerStatus(m),
        terms: partner ? termsLines(m, partner.segment) : [],
      };
    });

  return (
    <div>
      <div className="flex items-center justify-end px-8 py-6 text-sm text-muted">
        CRM / Oferty
      </div>
      <div className="px-8 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Oferty</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Warianty A/B/C z misji i ustalone warunki. Wysyłka tylko po Twoim zatwierdzeniu.
        </p>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-[0.12em] text-navy">
          Warianty według typu partnera
        </h2>
        <div className="mt-3 grid max-w-5xl gap-3 lg:grid-cols-3">
          {SEGMENTS.map((segment) => (
            <div key={segment.id} className="rounded-[24px] border border-line bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">{segment.label}</p>
              <ul className="mt-2 space-y-2">
                {OFFER_VARIANTS_BY_SEGMENT[segment.id].map((offer) => (
                  <li key={offer.variant} className="text-sm">
                    <span className="font-semibold text-foreground">
                      {offer.variant}. {offer.name}
                    </span>
                    {offer.hint ? <span className="block text-xs text-muted">{offer.hint}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-[0.12em] text-navy">
          W misjach
        </h2>
        <div className="mt-3 max-w-3xl space-y-3">
          {offers.map(({ mission, partner, offerName: name, status, terms }) => (
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
                {terms.length ? (
                  <ul className="mt-2 space-y-0.5 text-sm leading-5 text-foreground">
                    {terms.map((line) => (
                      <li key={line}>• {line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-5 text-amber-700">Warunki nieustalone — uzupełnij w kroku Oferta.</p>
                )}
                <p className="mt-1 text-xs leading-5 text-muted">
                  {mission.decision.constraintSummary.trim()
                    ? `Ograniczenia: ${mission.decision.constraintSummary}`
                    : "Brak ograniczeń z rozmowy."}
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
                    Wysłałem ofertę
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
