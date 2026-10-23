"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { OPEN_TOUR_EVENT, readOnboarding, writeOnboarding } from "@/lib/onboarding";
import { SEGMENTS, STAGE_HELP } from "@/lib/playbook";
import { REDEMPTION_METHODS } from "@/lib/terms";
import { STAGES } from "@/lib/types";
import { cn } from "@/lib/cn";

type Slide = { title: string; body: ReactNode };

const SLIDES: Slide[] = [
  {
    title: "Witaj w Lutra CRM",
    body: (
      <>
        <p>
          CRM prowadzi pozyskanie partnera dla Lutry — miejsca, społeczności albo firmy — od pierwszego researchu do
          aktywnego partnera w aplikacji.
        </p>
        <ul className="mt-3 space-y-1.5">
          <li>• Jeden partner = jedna <strong>misja</strong> w 8 krokach.</li>
          <li>
            • Kroki z warunkiem przejścia mają listę <strong>„Czego potrzeba”</strong> — dalej przejdziesz, gdy jest
            komplet.
          </li>
          <li>• Nic nie wychodzi do partnera bez Ciebie: oferty, maile i umowy zatwierdzasz sam.</li>
        </ul>
      </>
    ),
  },
  {
    title: "Trzy typy partnerów",
    body: (
      <ul className="space-y-3">
        {SEGMENTS.map((segment) => (
          <li key={segment.id} className="rounded-2xl bg-surface px-4 py-3">
            <p className="font-semibold text-foreground">{segment.label}</p>
            <p className="text-xs leading-5 text-muted">{segment.who}</p>
            <p className="mt-1 text-xs leading-5">
              <span className="text-muted">Dostaje:</span> {segment.gets}.{" "}
              <span className="text-muted">Oczekujemy:</span> {segment.expects}.
            </p>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: "Misja w 8 krokach",
    body: (
      <ol className="space-y-1.5">
        {STAGES.map((stage) => (
          <li key={stage.id} className="flex gap-2">
            <span className="w-28 shrink-0 font-semibold text-foreground">{stage.label}</span>
            <span className="text-muted">{STAGE_HELP[stage.id].goal}</span>
          </li>
        ))}
        <li className="pt-1 text-xs text-muted">
          Rozmowa i mapa potrzeb (kroki 3–4) są na jednym ekranie. Kroki możesz oglądać w dowolnej kolejności — postęp
          się nie cofa.
        </li>
      </ol>
    ),
  },
  {
    title: "Warunki i porozumienie",
    body: (
      <ul className="space-y-2">
        <li>
          • <strong>Zniżka dla ludzi z Lutry</strong> (zwykle 10–15% albo gratis) jest warunkiem obecności miejsca w
          aplikacji. Ustalasz też, kiedy obowiązuje i jak gość ją realizuje:{" "}
          {REDEMPTION_METHODS.map((m) => m.label).join(", ")}.
        </li>
        <li>
          • <strong>Do 3 miesięcy</strong> wystarczy porozumienie mailowe — CRM wypełnia treść maila, wysyłasz go ze
          swojej skrzynki. <strong>Dłużej</strong> — umowa w PDF z podpisami obu stron.
        </li>
        <li>• Zasady zmian (7 dni) wpisują się same. Bez zgody na nazwę i logo partner nie trafi do aplikacji.</li>
        <li>• Bez opłat w obie strony i bez danych uczestników dla partnera.</li>
      </ul>
    ),
  },
  {
    title: "Po aktywacji: opieka",
    body: (
      <ul className="space-y-2">
        <li>• Przegląd po pierwszym cyklu: frekwencja, zgłoszenia uczestników, decyzja o kontynuacji.</li>
        <li>• Co kwartał potwierdzenie warunków, co miesiąc liczba realizacji zniżki dla lokalu.</li>
        <li>
          • Po telefonie mail z follow-upem, po spotkaniu mail z ustaleniami <strong>tego samego dnia</strong> — CRM
          przypomni, dopóki mail nie trafi do dziennika.
        </li>
      </ul>
    ),
  },
  {
    title: "Na dziś i pomoc",
    body: (
      <>
        <p>
          Pulpit pokazuje <strong>„Na dziś”</strong>: zaległe kroki, terminy decyzji, maile po kontakcie, podpisy i opiekę.
          Liczba przy „Zadaniach” w menu to rzeczy do ruchu dziś.
        </p>
        <p className="mt-3">
          Gdy nie wiesz, co dalej — w każdym kroku misji, w prawym górnym rogu, jest link do wyjaśnienia, a w menu
          strona <strong>Pomoc</strong> ze słowniczkiem i odpowiedziami na częste pytania.
        </p>
      </>
    ),
  },
];

/** Wprowadzenie przy pierwszym uruchomieniu (raz na osobę w tej przeglądarce). */
export function WelcomeTour({ userId }: { userId?: string }) {
  const [open, setOpen] = useState(() => !readOnboarding(userId).tourDone);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  useEffect(() => {
    const show = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_TOUR_EVENT, show);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        writeOnboarding(userId, { tourDone: true });
        setOpen(false);
      }
      if (event.key === "ArrowRight") setIndex((i) => Math.min(SLIDES.length - 1, i + 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, userId]);

  if (!open) return null;
  const close = () => {
    writeOnboarding(userId, { tourDone: true });
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(9,12,155,0.25)]">
        <div className="flex items-center justify-between gap-3 px-7 pt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
            Wprowadzenie · {index + 1} z {SLIDES.length}
          </p>
          <button type="button" onClick={close} className="text-xs font-semibold text-muted hover:text-foreground">
            Pomiń
          </button>
        </div>
        <div className="overflow-y-auto px-7 pb-2 pt-3">
          <h2 id="tour-title" className="font-brand text-2xl text-navy">
            {slide.title}
          </h2>
          <div className="mt-4 text-sm leading-6 text-foreground">{slide.body}</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line px-7 py-4">
          <div className="flex gap-1.5" aria-hidden>
            {SLIDES.map((item, i) => (
              <button
                key={item.title}
                type="button"
                tabIndex={-1}
                onClick={() => setIndex(i)}
                className={cn("h-2 rounded-full transition-all", i === index ? "w-6 bg-lutra" : "w-2 bg-chip-strong")}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="rounded-full px-4 py-2 text-sm text-muted"
              >
                Wstecz
              </button>
            ) : null}
            {last ? (
              <>
                <Link href="/pomoc" onClick={close} className="rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra">
                  Otwórz Pomoc
                </Link>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full bg-lutra px-5 py-2 text-sm font-medium text-white"
                >
                  Zaczynamy
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                className="rounded-full bg-lutra px-5 py-2 text-sm font-medium text-white"
              >
                Dalej
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
