"use client";

import { openTour, writeOnboarding } from "@/lib/onboarding";

/**
 * Stały bąbelek w lewym dolnym rogu (pod menu): otwiera wprowadzenie od pierwszego slajdu
 * i przywraca „Pierwsze kroki” na pulpicie — tak samo jak przycisk w Ustawieniach.
 * Prawy dolny róg zostaje dla bąbelków misji („Notatka z rozmowy”, szkice).
 * Poniżej `lg` (telefon, tablet) to sam okrągły „?”, żeby nie zasłaniał treści.
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
      className="group fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-sm font-medium text-navy shadow-[0_8px_24px_rgba(9,12,155,0.14)] transition hover:border-lutra hover:text-lutra lg:bottom-5 lg:left-5 lg:w-auto lg:justify-start lg:gap-2 lg:pl-1.5 lg:pr-4"
    >
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-base font-bold text-lutra group-hover:bg-lutra group-hover:text-white"
      >
        ?
      </span>
      <span className="hidden lg:inline">Wprowadzenie</span>
    </button>
  );
}
