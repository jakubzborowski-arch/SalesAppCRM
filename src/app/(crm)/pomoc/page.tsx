"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { openTour } from "@/lib/onboarding";
import {
  CATEGORIES_BY_SEGMENT,
  FORBIDDEN_PROMISES,
  NEED_CATEGORIES,
  OFFER_VARIANTS_BY_SEGMENT,
  PARTNERSHIP_RULES,
  SEGMENTS,
  STAGE_HELP,
} from "@/lib/playbook";
import { DISCOUNT_RANGE, REDEMPTION_METHODS, SHORT_TERM_MONTHS } from "@/lib/terms";
import { STAGES } from "@/lib/types";

const TOC = [
  { id: "start", label: "Pierwsze kroki" },
  { id: "proces", label: "Misja w 8 krokach" },
  { id: "typy", label: "Typy partnerów" },
  { id: "rozmowa", label: "Rozmowa i mapa potrzeb" },
  { id: "oferta", label: "Oferta i warunki" },
  { id: "umowa", label: "Porozumienie albo umowa" },
  { id: "aktywacja", label: "Weryfikacja i publikacja" },
  { id: "opieka", label: "Opieka po aktywacji" },
  { id: "role", label: "Role i maile po kontakcie" },
  { id: "na-dzis", label: "Na dziś i przypomnienia" },
  { id: "zasady", label: "Zasady i czego nie obiecywać" },
  { id: "slownik", label: "Słowniczek" },
  { id: "faq", label: "Częste pytania" },
];

const GLOSSARY: [string, string][] = [
  ["Misja", "Pozyskanie jednego partnera od researchu do aktywacji. Partner ma najwyżej jedną misję w toku."],
  ["Bramka", "Warunek przejścia do następnego kroku. Lista „Czego potrzeba” pokazuje, czego brakuje."],
  ["Fakt", "Potrzeba, którą partner sam potwierdził (najlepiej cytatem). Bez faktu nie ma oferty."],
  ["Obserwacja", "Twoje spostrzeżenie z researchu albo wizyty — do potwierdzenia w rozmowie."],
  ["Hipoteza", "Przypuszczenie (np. z analizy rozmowy) — nigdy nie trafia do oferty bez potwierdzenia."],
  ["Wariant A/B/C", "Trzy typowe oferty dla danego typu partnera. Rekomendacja wynika z potwierdzonych faktów."],
  ["Zniżka dla ludzi z Lutry", "Warunek obecności miejsca w aplikacji: rabat % albo gratis, w ustalonych dniach i godzinach."],
  ["Realizacja", "Sposób naliczenia zniżki: kod QR, kod numeryczny albo hasło lokalu (bez wdrożenia)."],
  ["Porozumienie mailowe", `Mail z warunkami i odpowiedź partnera — wystarcza przy współpracy do ${SHORT_TERM_MONTHS} miesięcy.`],
  ["Umowa", "PDF z szablonu zespołu z podpisem partnera i Lutry — przy dłuższej współpracy."],
  ["Kod partnera", "Stały identyfikator LUTRA-… nadawany przy aktywacji; idzie do produktu Lutra."],
  ["Kontakt awaryjny", "Osoba po stronie lokalu, do której dzwonimy, gdy coś nie działa w trakcie wydarzenia."],
  ["Opieka", "Etap po aktywacji: przegląd po cyklu, kwartalne potwierdzenie warunków, informacja o realizacjach."],
  ["DNC", "„Nie kontaktować” — blokuje misję i kontakt z partnerem."],
  ["Zgoda na kanał", "Potwierdzenie, że można się kontaktować danym kanałem (telefon, mail, LinkedIn, wizyta)."],
];

const FAQ: [string, ReactNode][] = [
  [
    "Dlaczego nie mogę przejść do następnego kroku?",
    "Bramka czeka na brakujące dane. W kroku jest lista „Czego potrzeba” z odhaczonymi i brakującymi pozycjami — uzupełnij te bez ✓.",
  ],
  [
    "Kto widzi moje misje i kto może je edytować?",
    "Cały zespół widzi wszystkich partnerów i misje. Edytuje właściciel misji albo administrator; administrator może też przekazać misję innej osobie.",
  ],
  [
    "Partner chce zmienić warunki po aktywacji. Co robię?",
    "W opiece zapisz przegląd z decyzją „Zmieniamy warunki”, potem zacznij nową misję (odnowienie) — nowa oferta i nowe porozumienie albo umowa.",
  ],
  [
    "Skąd biorą się treść maila i umowy?",
    "Z szablonów zespołu w Ustawieniach → „Szablony umowy i porozumienia”. Pola {{…}} wypełniają się danymi partnera i misji. Szablony zmienia administrator.",
  ],
  [
    "Czy CRM sam wysyła maile albo oferty?",
    "Nie. CRM przygotowuje treść, a Ty wysyłasz ją ze swojej skrzynki i zaznaczasz wysyłkę. Wpis trafia do dziennika kontaktów.",
  ],
  [
    "U góry jest żółty pasek z migracją bazy. Co z nim zrobić?",
    "Administrator kopiuje SQL z paska, wkleja w Supabase → SQL Editor i klika Run. Migracje można uruchamiać wielokrotnie.",
  ],
  [
    "Jak wypełnić Discovery z transkryptu Spinach bez klucza API?",
    "W „Notatce z rozmowy” rozwiń „Przez Claude (bez klucza API)”, skopiuj polecenie z rozmową i wklej je w Claude (claude.ai albo Cowork). Odpowiedź (JSON) wklej z powrotem w CRM i obejrzyj podgląd. Z kluczem ANTHROPIC_API_KEY na serwerze CRM robi to jednym kliknięciem.",
  ],
  [
    "Jak dodać wielu partnerów naraz?",
    <>
      Partnerzy → <Link href="/partners/import" className="font-semibold text-lutra">Import Excel / CSV</Link>. Przeciągasz
      kolumny na pola CRM; kolumna „Typ partnera” jest opcjonalna — bez niej wybierasz jeden typ dla całego pliku.
    </>,
  ],
];

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-[28px] border border-line bg-white p-6">
      <h2 className="text-lg font-semibold text-navy">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-foreground">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <div>
      <div className="flex items-center justify-end px-8 py-6 text-sm text-muted">CRM / Pomoc</div>
      <div className="px-8 pb-12">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">Jak używać CRM</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Pomoc</h1>
          <button
            type="button"
            onClick={openTour}
            className="rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra"
          >
            Pokaż wprowadzenie
          </button>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Co jest czym i jak przejść partnera od researchu do aktywacji. Zasady pochodzą z dokumentów „Partnerzy” i „Sales
          AI Knowledge Base”.
        </p>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[220px_1fr]">
          <nav className="rounded-[24px] border border-line bg-white p-4 text-sm lg:sticky lg:top-6">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Spis treści</p>
            <ul className="space-y-1">
              {TOC.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="block rounded-full px-3 py-1.5 text-muted hover:bg-chip hover:text-navy">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 max-w-3xl space-y-4">
            <Block id="start" title="Pierwsze kroki">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>
                  <Link href="/partners/new" className="font-semibold text-lutra">
                    Dodaj partnera
                  </Link>{" "}
                  (wystarczy nazwa i typ) albo{" "}
                  <Link href="/partners/import" className="font-semibold text-lutra">
                    zaimportuj listę
                  </Link>
                  .
                </li>
                <li>Na karcie partnera kliknij „Zajmuję się partnerem” — powstaje misja.</li>
                <li>Idź krokami misji. Lista „Czego potrzeba” mówi, co uzupełnić, zanim przejdziesz dalej.</li>
                <li>Każdy telefon, mail i spotkanie zapisuj w dzienniku kontaktów („+ Zapisz kontakt”).</li>
                <li>Codziennie zaczynaj od Pulpitu: „Na dziś” zbiera wszystko, co wymaga ruchu.</li>
              </ol>
            </Block>

            <Block id="proces" title="Misja w 8 krokach">
              <ol className="space-y-2">
                {STAGES.map((stage, index) => (
                  <li key={stage.id} className="rounded-2xl bg-surface px-4 py-3">
                    <p className="font-semibold">
                      {index + 1}. {stage.label}
                    </p>
                    <p className="text-muted">{STAGE_HELP[stage.id].goal}</p>
                    <p className="text-xs text-navy">{STAGE_HELP[stage.id].gate}</p>
                  </li>
                ))}
              </ol>
              <p>
                <strong>Szybka wizyta (lokal).</strong> Domknąłeś warunki w jednej wizycie? W nagłówku misji kliknij
                „Szybka wizyta”. Jeden formularz zapisuje wizytę w dzienniku, problem jako potwierdzony fakt, decydenta,
                zniżkę, okres i zgodę na logo, zatwierdza rekomendowany wariant i przenosi misję do kroku Umowa. Przycisk
                jest na krokach od Kontaktu do Negocjacji.
              </p>
              <p className="text-muted">
                Wcześniejsze kroki możesz oglądać i poprawiać — postęp misji się nie cofa. Misję, która nie idzie, zamykasz
                z powodem („Zamknij misję”), żeby raport przegranych miał sens.
              </p>
            </Block>

            <Block id="typy" title="Typy partnerów">
              <div className="grid gap-3 sm:grid-cols-3">
                {SEGMENTS.map((segment) => (
                  <div key={segment.id} className="rounded-2xl bg-surface px-4 py-3">
                    <p className="font-semibold">{segment.label}</p>
                    <p className="text-xs leading-5 text-muted">{segment.who}</p>
                    <p className="mt-2 text-xs leading-5">
                      <span className="font-semibold">Dostaje:</span> {segment.gets}
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      <span className="font-semibold">Oczekujemy:</span> {segment.expects}
                    </p>
                    <p className="mt-2 text-[11px] leading-4 text-muted">
                      Kategorie: {CATEGORIES_BY_SEGMENT[segment.id].join(", ")}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-muted">
                Typ ustawiasz przy dodawaniu partnera i zmieniasz na karcie („Edytuj”). Od typu zależą research, warianty
                oferty, wymagane warunki i lista kroków aktywacji.
              </p>
            </Block>

            <Block id="rozmowa" title="Rozmowa i mapa potrzeb">
              <p>
                W rozmowie zbierasz siedem rzeczy: <strong>problem</strong>, <strong>oczekiwany rezultat</strong>,{" "}
                <strong>ograniczenia</strong>, <strong>decydenta</strong>, <strong>termin decyzji</strong> (jako datę),{" "}
                <strong>wcześniejsze próby</strong> i <strong>następny krok</strong>. Potem wybierasz kategorię potrzeby i
                klikasz „Potwierdź jako fakt”.
              </p>
              <p>
                <strong>Lokal:</strong> oczekiwany rezultat, termin decyzji i wcześniejsze próby są opcjonalne — kawiarnię
                często zamykasz w jednej wizycie. Przed ofertą wymagane są problem, ograniczenie, decydent, następny krok i
                potwierdzony fakt. Dla społeczności i firm wymagane są wszystkie siedem.
              </p>
              <p>
                Na <strong>mapie potrzeb</strong> może być kilka potrzeb. Każda ma kategorię, priorytet i status: fakt
                (partner to powiedział), obserwacja (Twoje spostrzeżenie) albo hipoteza (do sprawdzenia). Rekomendacja
                wariantu liczy się tylko z faktów.
              </p>
              <p className="text-xs text-muted">Kategorie: {NEED_CATEGORIES.map((c) => c.label).join(", ")}.</p>
              <p>
                <strong>Rozmowa nagrana w Spinach?</strong> Otwórz bąbelek „Notatka z rozmowy” w prawym dolnym rogu misji,
                wklej transkrypt (albo wczytaj plik .txt / .vtt / .srt) i kliknij „Wypełnij pola z rozmowy”. AI proponuje
                cytat, problem, ograniczenia, decydenta, terminy i potrzeby — każdą pozycję zaznaczasz sam, a fakt
                potwierdzasz przyciskiem. Cytat, którego nie ma dosłownie w transkrypcie, jest oznaczony do sprawdzenia.
              </p>
            </Block>

            <Block id="oferta" title="Oferta i warunki">
              <div className="grid gap-3 sm:grid-cols-3">
                {SEGMENTS.map((segment) => (
                  <div key={segment.id} className="rounded-2xl bg-surface px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">{segment.label}</p>
                    <ul className="mt-1 space-y-1 text-xs leading-5">
                      {OFFER_VARIANTS_BY_SEGMENT[segment.id].map((offer) => (
                        <li key={offer.variant}>
                          <strong>
                            {offer.variant}. {offer.name}
                          </strong>
                          {offer.hint ? <span className="block text-muted">{offer.hint}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p>
                <strong>Miejsce:</strong> zniżka dla ludzi z Lutry (zwykle {DISCOUNT_RANGE.min}–{DISCOUNT_RANGE.max}% albo
                gratis), dni i godziny (np. godziny martwe), minimalna grupa (np. 3+), wyłączenia i sposób realizacji:
              </p>
              <ul className="space-y-1 pl-1">
                {REDEMPTION_METHODS.map((method) => (
                  <li key={method.id}>
                    • <strong>{method.label}</strong> — {method.hint}
                  </li>
                ))}
              </ul>
              <p>
                Opcjonalnie miejsce na wydarzenia (stolik albo przestrzeń w ustalonych godzinach).{" "}
                <strong>Społeczność:</strong> cykl wydarzeń w Lutrze (ile, jak często, kiedy pierwsze).{" "}
                <strong>Firma:</strong> pilotaż na jednym zespole (kto, ile osób, termin feedbacku).
              </p>
              <p>
                Do tego <strong>okres współpracy</strong> (od–do). Zatwierdzasz wariant i warunki sam — dopiero wtedy oferta
                idzie do partnera. Przycisk „Kopiuj” daje gotowe podsumowanie do maila.
              </p>
            </Block>

            <Block id="umowa" title="Porozumienie mailowe albo umowa">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-surface px-4 py-3">
                  <p className="font-semibold">Do {SHORT_TERM_MONTHS} miesięcy: porozumienie mailowe</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs leading-5">
                    <li>CRM wypełnia mail z warunkami — kopiujesz albo otwierasz w programie pocztowym.</li>
                    <li>Wysyłasz ze swojej skrzynki i zaznaczasz „Wysłałem mail z warunkami”.</li>
                    <li>Partner odpisuje z potwierdzeniem — zaznaczasz (opcjonalnie dołączasz zrzut).</li>
                    <li>Zatwierdzasz za Lutrę.</li>
                  </ol>
                  <p className="mt-2 text-xs text-muted">
                    Partner może zakończyć zniżkę w każdej chwili, ale honoruje ją dla utworzonych wydarzeń (do 7 dni).
                  </p>
                </div>
                <div className="rounded-2xl bg-surface px-4 py-3">
                  <p className="font-semibold">Dłużej: umowa z podpisami</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs leading-5">
                    <li>„Wygeneruj PDF z szablonu” (albo wgraj własny).</li>
                    <li>Wyślij partnerowi i zaznacz wysyłkę.</li>
                    <li>Wgraj podpisany skan albo zaznacz podpis partnera.</li>
                    <li>Podpisz za Lutrę.</li>
                  </ol>
                  <p className="mt-2 text-xs text-muted">Zmianę albo wycofanie zniżki partner zgłasza z 7-dniowym wyprzedzeniem.</p>
                </div>
              </div>
              <p>
                W obu formach: zasady zmian wpisują się same po ustaleniu okresu, a <strong>zgoda na nazwę i logo</strong>{" "}
                jest obowiązkowa dla miejsc i społeczności (zdjęcia i social media Lutry — osobne, opcjonalne zgody). Szablon
                zawiera brak opłat w obie strony, mechanizm realizacji, zgody na markę i comiesięczną informację o
                realizacjach.
              </p>
            </Block>

            <Block id="aktywacja" title="Weryfikacja i publikacja">
              <p>Zanim miejsce pojawi się w aplikacji, sprawdzamy:</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                <li>• działalność (NIP / KRS / CEIDG)</li>
                <li>• adres i pojemność miejsca</li>
                <li>• godziny (także godziny zniżki)</li>
                <li>• kontakt awaryjny</li>
                <li>• zniżkę i sposób realizacji</li>
                <li>• kod partnera i widoczność w aplikacji</li>
                <li>• naklejkę Lutry w lokalu</li>
                <li>• testową realizację zniżki</li>
              </ul>
              <p>
                Na koniec ustawiasz datę przeglądu po pierwszym cyklu. Społeczność: organizator, pierwsze wydarzenie cyklu
                w Lutrze i przegląd. Firma: kontakt w firmie, dostęp zespołu pilotażowego i termin feedbacku.
              </p>
            </Block>

            <Block id="opieka" title="Opieka po aktywacji">
              <ul className="space-y-1.5">
                <li>
                  • <strong>Przegląd po pierwszym cyklu:</strong> frekwencja, zgłoszenia uczestników i decyzja — kontynuujemy,
                  zmieniamy warunki albo kończymy.
                </li>
                <li>
                  • <strong>Co kwartał:</strong> potwierdzenie z partnerem, że warunki, godziny i kontakt są aktualne.
                </li>
                <li>
                  • <strong>Co miesiąc:</strong> metryki z panelu Lutry — wydarzenia, uczestnicy, a w lokalach realizacje
                  zniżki. Z nich powstaje mail z podsumowaniem dla partnera (kopiujesz albo otwierasz w poczcie, CRM nic
                  nie wysyła sam). Zapis za poprzedni miesiąc odhacza przypomnienie w „Na dziś”.
                </li>
                <li>
                  • <strong>Zdrowie partnera:</strong> zielony — w porządku; żółty — brak liczb za poprzedni miesiąc albo
                  spadek o połowę; czerwony — 2 miesiące bez liczb, 2 miesiące z zerem albo decyzja „kończymy”. Przez
                  pierwsze 30 dni bez liczb — „za wcześnie”.
                </li>
                <li>
                  • <strong>Koniec okresu:</strong> 30 dni wcześniej przypomnienie o przedłużeniu. Odnowienie = nowa misja.
                </li>
              </ul>
              <p className="text-muted">Panel opieki jest na stronie misji aktywnego partnera. Przypomnienia trafiają do „Na dziś”.</p>
            </Block>

            <Block id="role" title="Role i maile po kontakcie">
              <ul className="space-y-1.5">
                <li>
                  • <strong>Pierwszy kontakt telefoniczny (Kuba):</strong> po rozmowie wychodzi mail z follow-upem.
                </li>
                <li>
                  • <strong>Spotkania na miejscu (Julia, Ilona):</strong> mail ze szczegółami i ustaleniami tego samego dnia.
                </li>
                <li>
                  • <strong>Administrator:</strong> szablony, zespół i przekazywanie misji.
                </li>
              </ul>
              <p>
                Po zapisaniu telefonu albo spotkania w dzienniku CRM pokazuje przypomnienie „Mail po kontakcie” — w misji i
                w „Na dziś”. Przycisk „Mail wysłany” zapisuje mail w dzienniku i zamyka przypomnienie.
              </p>
            </Block>

            <Block id="na-dzis" title="Na dziś i przypomnienia">
              <p>
                „Na dziś” na Pulpicie zbiera zaległe i dzisiejsze: zadania i następne kroki, terminy decyzji, maile po
                kontakcie, umowy czekające na podpis, przeglądy, kwartalne potwierdzenia, informacje o realizacjach i końce
                umów. Liczba przy „Zadaniach” w menu to rzeczy do ruchu dziś.
              </p>
              <p>
                Powiadomienia systemowe włączysz w{" "}
                <Link href="/ustawienia" className="font-semibold text-lutra">
                  Ustawieniach
                </Link>{" "}
                — działają, gdy CRM jest otwarty w przeglądarce.
              </p>
            </Block>

            <Block id="zasady" title="Zasady i czego nie obiecywać">
              <ul className="space-y-1">
                {PARTNERSHIP_RULES.map((rule) => (
                  <li key={rule}>• {rule}</li>
                ))}
              </ul>
              <p className="pt-1 font-semibold">Nie obiecujemy:</p>
              <ul className="grid gap-1 text-muted sm:grid-cols-2">
                {FORBIDDEN_PROMISES.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </Block>

            <Block id="slownik" title="Słowniczek">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]">
                {GLOSSARY.map(([term, meaning]) => (
                  <div key={term} className="contents">
                    <dt className="font-semibold">{term}</dt>
                    <dd className="text-muted">{meaning}</dd>
                  </div>
                ))}
              </dl>
            </Block>

            <Block id="faq" title="Częste pytania">
              <div className="space-y-2">
                {FAQ.map(([question, answer]) => (
                  <details key={question} className="rounded-2xl bg-surface px-4 py-3">
                    <summary className="cursor-pointer font-semibold">{question}</summary>
                    <div className="mt-2 text-muted">{answer}</div>
                  </details>
                ))}
              </div>
            </Block>
          </div>
        </div>
      </div>
    </div>
  );
}
