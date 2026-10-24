"use client";

import { openTour, writeOnboarding } from "@/lib/onboarding";

/**
 * Stały bąbelek w lewym dolnym rogu (pod menu): otwiera wprowadzenie od pierwszego slajdu
 * i przywraca „Pierwsze kroki” na pulpicie — tak samo jak przycisk w Ustawieniach.
 * Prawy dolny róg zostaje dla bąbelków misji („Notatka z rozmowy”, szkice).
 */
export function TourBubble({ userId }: { userId: string | undefined }) {
  return (
    <button
      type="button"
      onClick={() => {
        writeOnboarding(userId, { tourDone: false, checklistHidden: false });
        openTour();
      }}
      title="Pokaż wprowadzenie do Lutra CRM"
      aria-label="Otwórz wprowadzenie"
      className="group fixed bottom-5 left-5 z-40 flex h-11 items-center gap-2 rounded-full border border-line bg-white pl-1.5 pr-4 text-sm font-medium text-navy shadow-[0_8px_24px_rgba(9,12,155,0.14)] transition hover:border-lutra hover:text-lutra"
    >
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-base font-bold text-lutra group-hover:bg-lutra group-hover:text-white"
      >
        ?
      </span>
      Wprowadzenie
    </button>
  );
}
