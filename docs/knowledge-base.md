# Lutra CRM — baza wiedzy produktu

Lutra pomaga ludziom organizować wspólne wyjścia: wybrać termin i miejsce, zebrać potwierdzenia, wysłać przypomnienia i ułatwić podział rachunku.

**Cel sprzedaży partnerskiej:** pozyskać lokale, małe firmy i społeczności oraz prowadzić handlowca od kontaktu do umowy i aktywacji.

**Zasada nadrzędna:** nie wysyłamy jednej oferty wszystkim. Każda oferta wynika z potwierdzonych informacji z rozmowy.

---

## 1. Produkt a sprzedaż

Lutra nie jest programem zniżkowym „dla każdego”. Partnerowi sprzedajemy mechanizm, który pomaga grupom *już planującym wyjście* wybrać jego miejsce, na warunkach chroniących marżę i operacje.

Handlowiec nie improwizuje oferty. CRM wymusza discovery, mapę potrzeb, bramki danych i wybór wariantu z zatwierdzonej biblioteki.

---

## 2. Role

| Rola | Co robi | Czego nie robi |
|---|---|---|
| Handlowiec | Prowadzi misję, potwierdza fakty, zatwierdza AI, wysyła ofertę i umowę | Nie obiecuje liczb, rabatów i funkcji spoza biblioteki |
| Infeld AI Copilot | Brief, hipotezy, braki, pytania, recap, warianty A/B/C, obiekcje | Nie ocenia osobowości, nie manipuluje, nie ustala rabatów, nie odrzuca partnerów, nie wysyła wiążących dokumentów |
| Partner / decydent | Potwierdza potrzeby, warunki, umowę, kwartalne odnowienie | — |
| System CRM | Bramki, zgody, audyt, historia zmian, status fakt/hipoteza | Nie traktuje hipotezy AI jako faktu |

Każdy wynik AI i każdy dokument zatwierdza człowiek.

---

## 3. Flow misji

Pełny proces biznesowy:

`Research → zgoda na kontakt → pierwszy kontakt → discovery → potwierdzenie potrzeb → oferta A/B/C → negocjacje → umowa → aktywacja → opieka → uczenie modelu`

Stepper w UI (8 kroków misji):

1. Research
2. Kontakt
3. Discovery
4. Potrzeby
5. Oferta A/B/C
6. Negocjacje
7. Umowa
8. Aktywacja

**Opieka** i **uczenie modelu** są procesami po misji, nie krokami stepper'a.

Wejście: handlowiec klika **„Zajmuję się partnerem”**. CRM pokazuje segment, checklistę, znane fakty, braki danych, pytania pogłębiające, możliwe obiekcje i **jeden następny krok z datą**.

---

## 4. Krok po kroku (UI + logika)

### 4.1 Research

Cel: zebrać publiczne fakty i hipotezę potrzeby *zanim* zadzwonimy. Publiczna informacja nie jest potwierdzoną potrzebą.

Checklista (pilot lokale):

- [ ] Profil, adres i kategoria lokalu sprawdzone
- [ ] Godziny oraz social media sprawdzone
- [ ] Sprawdź obecne promocje i programy zniżkowe
- [ ] Wykryj słabą hipotezę potrzeby
- [ ] Znajdź właściwą osobę kontaktową

Copilot: co wiemy, hipoteza, cel następnego kroku.

Zakaz: nie przekazuj publicznej informacji jako potwierdzonej potrzeby partnera.

Wyjście: `Dalej: Pierwszy kontakt`

### 4.2 Zgoda na kontakt (bramka, nie osobny ekran)

Przed kontaktem CRM sprawdza:

- źródło danych (skąd mamy partnera)
- zgodę dla kanału (telefon / e-mail / LinkedIn)
- status **„nie kontaktować”**

Brak zgody albo DNC blokuje kanał. Nie wolno nagrywać ani transkrybować bez poinformowania.

### 4.3 Pierwszy kontakt

Cel: rozmowa discovery, a nie sprzedaż oferty.

Kanały: telefon, e-mail, LinkedIn, pokrewne (osobiste / polecenie).

Copilot: cel rozmowy, brief, jak obsłużyć odmowę.

Przed nagraniem informujemy o: nagraniu, transkrypcji, analizie AI, celu, dostawcy, retencji i alternatywie bez nagrania.

Wyjście: `Dalej: Rozmowa discovery`

### 4.4 Discovery

Cel: usłyszeć problem, ograniczenia i proces decyzji. Kategoria zaproponowana przez AI jest hipotezą do potwierdzenia.

Pola:

- główna potrzeba (kategoria)
- priorytet 1–5
- własny opis potrzeby partnera
- cytat partnera
- decydent
- termin decyzji
- warunki i ograniczenia (tagi, np. środa 16–19, min. 4 osoby, bez alkoholu, limit dzienny)

Akcja: „Przeanalizuj i skategoryzuj przez AI” — wynik ma status hipotezy, dopóki handlowiec nie potwierdzi.

Wyjście: `Dalej: Mapa potrzeb`

### 4.5 Mapa potrzeb

Karty potrzeb z priorytetem. Każda potrzeba ma pola z sekcji 6.

Status diagnostyczny misji, np. „Fakty potwierdzone” vs „Brakuje pól do oferty”.

Brak kluczowych danych **blokuje przygotowanie oferty**.

Wyjście: `Dalej: Oferta A/B/C`

### 4.6 Oferta A/B/C

Trzy warianty z zatwierdzonej biblioteki, dopasowane do segmentu i potwierdzonych potrzeb. AI tylko rekomenduje. Handlowiec zatwierdza: wariant, język, warunki, wysyłkę.

AI nie ustala rabatu i nie wysyła oferty.

Wyjście: `Dalej: Negocjacje i obiekcje`

### 4.7 Negocjacje

Biblioteka obiekcji: odpowiedź + pytanie pogłębiające. Handlowiec oznacza, które obiekcje padły i który argument zadziałał.

Nie obiecujemy konkretnej liczby klientów.

Wyjście: `Dalej: Umowa i podpis`

### 4.8 Umowa

Checklista kompletności umowy (wariant, dane firmy, osoba, daty, zasady zmian, podpis człowieka). AI nie podpisuje i nie wysyła wiążącego dokumentu.

Wyjście: `Dalej: Aktywacja partnera`

### 4.9 Aktywacja

Kod partnera, manual, test oferty, godziny, kontakt operacyjny, cennik, zaplanowany check-in.

Nie obiecujemy liczby klientów w aktywacji.

Wyjście: `Zakończ aktywację` → opieka + kolejka uczenia modelu.

### 4.10 Opieka i uczenie

Opieka: kwartalne potwierdzenie warunków, odnowienie, check-in, aktualność oferty.

Uczenie: tylko dane zatwierdzone przez handlowca (sekcja 9). Nigdy surowe nagrania.

---

## 5. Segmenty i discovery

### 5.1 Lokale (pilot Etapu 1)

Potrzeby: słabe dni/godziny, większy ruch grupowy, ochrona marży, pojemność, prostota obsługi.

Pytania:

- Które dni lub godziny są najsłabsze?
- Jaka wielkość grupy jest najbardziej opłacalna?
- Jaki minimalny rachunek lub liczba osób uzasadnia zniżkę?
- Jakie produkty, dni lub godziny muszą być wyłączone?
- Co nie zadziałało w poprzednich promocjach?
- Po czym za trzy miesiące poznają Państwo, że współpraca ma sens?

Oferty A/B/C:

- **A. Ruch poza szczytem** — konkretne dni i godziny, np. środa 16:00–19:00
- **B. Oferta grupowa** — minimalna liczba osób lub rachunek chroniący marżę
- **C. Kontrolowany pilotaż** — ograniczony czas, limit użyć lub limit dzienny

### 5.2 Małe korporacje i firmy (Etap 2+)

Potrzeby: integracja, samotność, praca hybrydowa, wellbeing, retencja, employer branding, frekwencja w biurze.

Pytania:

- Dlaczego temat benefitu pojawia się teraz?
- Która grupa pracowników najbardziej odczuwa problem?
- Jakie benefity już istnieją i czego w nich brakuje?
- Kto zatwierdza zakup po stronie HR, finansów i zarządu?
- Ilu pracowników obejmie pilot?
- Jak zmierzycie sukces po trzech miesiącach?

Oferty:

- **A.** Pilot dla wybranej grupy
- **B.** Benefit dla zespołu, jeśli produkt jest gotowy
- **C.** Program cykliczny po pozytywnym pilotażu

### 5.3 Społeczności (Etap 2+)

Potrzeby: frekwencja, organizacja wydarzeń, aktywizacja członków, wybór miejsca, komunikacja i partnerstwa cykliczne.

Pytania:

- Jak dziś organizujecie wydarzenie od pomysłu do listy uczestników?
- Co najczęściej obniża frekwencję?
- Jak często odbywają się spotkania?
- Ilu jest członków i aktywnych uczestników?
- Kto może komunikować współpracę?
- Jakie 1–3 wydarzenia mogłyby być pilotem?

Oferty:

- **A.** Pilot 1–3 wydarzeń
- **B.** Benefit członkowski, jeśli mechanizm jest gotowy
- **C.** Partnerstwo cykliczne

---

## 6. Mapa potrzeb — model pola

Każda potrzeba:

| Pole | Zasada |
|---|---|
| kategoria | pozyskanie, frekwencja, ruch poza szczytem, marża, operacje, marketing, wellbeing, integracja, budżet, ryzyko |
| opis | własnymi słowami partnera / handlowca |
| priorytet | 1–5 |
| cytat lub źródło | cytat z transkrypcji ze znacznikiem czasu albo źródło ręczne |
| oczekiwany rezultat | mierzalny, jeśli możliwe |
| ograniczenia | godziny, produkty, min. grupa, limit, budżet |
| status | **fakt** / **obserwacja** / **hipoteza AI** |
| potwierdzenie handlowca | wymagane, zanim status stanie się faktem |

### Bramka oferty

Przed ofertą wymagane:

1. problem
2. oczekiwany rezultat
3. ograniczenie
4. decydent
5. termin decyzji
6. wcześniejsze próby
7. następny krok (z datą)

Brak któregokolwiek pola blokuje generowanie i wysyłkę oferty.

---

## 7. Biblioteka obiekcji

Każda obiekcja ma: etykietę, zatwierdzoną odpowiedź, pytanie pogłębiające. AI może tylko cytować bibliotekę.

**„Mam inne aplikacje ze zniżkami.”**  
Odpowiedź: Lutra jest dla grup, które już planują wyjście; zniżka pomaga wybrać Państwa miejsce.  
Dopytaj: Ilu klientów przychodzi z obecnych programów i ilu z nich tworzy grupy?

**„Ile osób mi przyprowadzicie?”**  
Odpowiedź: Nie obiecujemy liczby, której nie możemy potwierdzić. Możemy zacząć od warunków kontrolowanych przez partnera.  
Dopytaj: Co w trzy miesiące uznaliby Państwo za sensowny wynik?

**„Zniżka mi się nie opłaca.”**  
Odpowiedź: Ustalmy okno godzinowe, minimalną grupę, limit dzienny lub wyłączenia produktów.  
Dopytaj: Które godziny chcecie dociążyć bez obniżki w szczycie?

**„Nie mam czasu tego pilnować.”**  
Odpowiedź: Warunki ustalamy raz; wracamy przy zmianie lub okresowym potwierdzeniu.  
Dopytaj: Kto będzie kontaktem do aktualizacji?

**„Muszę zapytać właściciela.”**  
Odpowiedź: Przygotujemy krótkie podsumowanie i umówimy rozmowę z decydentem.  
Dopytaj: Co będzie dla właściciela najważniejsze?

**„Wróćcie, jak będzie więcej użytkowników.”**  
Odpowiedź: Możemy wrócić w ustalonym terminie albo przygotować ograniczony, bezpłatny pilot bez wyłączności.  
Dopytaj: Jaki sygnał skłoni Państwa do powrotu?

---

## 8. Infeld AI — kontrakt

### Przed rozmową

Brief, hipoteza potrzeby, braki danych, pytania, bezpieczne argumenty, lista zakazanych obietnic.

### W trakcie

Transkrypcja dopiero po prawidłowym poinformowaniu. Wykrywanie potrzeb i obiekcji, cytaty ze znacznikami czasu, 1–2 pytania pogłębiające, zatwierdzone odpowiedzi z biblioteki.

### Po rozmowie

Robocze podsumowanie, mapa potrzeb, e-mail recap, trzy warianty oferty, lista brakujących pól, następne zadania.

### Twarde zakazy AI

- ocena osobowości i emocji
- manipulacja
- ustalanie rabatów
- odrzucanie partnerów
- wysyłka wiążących dokumentów
- traktowanie hipotezy jako faktu
- obietnice spoza listy zakazanej (sekcja 11)

---

## 9. Jak karmić model

Po każdej rozmowie handlowiec:

1. poprawia podsumowanie
2. potwierdza potrzeby i priorytety
3. oznacza prawdziwe obiekcje
4. wskazuje, który argument zadziałał
5. zapisuje wynik: wygrana / przegrana / nurture / brak dopasowania

Do uczenia przekazujemy **wyłącznie dane zatwierdzone**:

- segment
- potrzeby
- ograniczenia
- wybrany wariant
- wynik
- powód przegranej
- korekty handlowca
- aktywacja
- odnowienie

Nie uczymy modelu bezpośrednio na surowych, niezweryfikowanych nagraniach.

W v1 nie robimy fine-tuningu. Zbieramy `training_examples` i używamy ich jako RAG / few-shot. Fine-tuning dopiero przy wystarczającej liczbie zatwierdzonych przykładów.

---

## 10. Poprawność danych

CRM stosuje:

- wybieralne pola (nie wolny tekst tam, gdzie da się enumerację)
- obowiązkowe bramki
- historię zmian (audit log)
- datę aktualizacji
- właściciela rekordu
- rozróżnienie fakt / obserwacja / hipoteza AI
- zatwierdzanie człowieka
- kwartalne potwierdzenie warunków przez partnera

Pola wybieralne: segment, kategoria, potrzeba, priorytet, etap decyzji, typ obiekcji, status decydenta, wynik, wariant oferty, powód przegranej, aktualność danych.

---

## 11. Czego nie obiecywać

Zakazane obietnice (UI + prompt AI + recap + umowa):

- określona liczba klientów
- pierwsze miejsce / pozycja
- wyłączność
- terminy niegotowych funkcji
- działanie funkcji z backlogu
- sprzedaż Premium przed uruchomieniem
- gwarantowany wpływ na retencję
- warunki niezatwierdzone pisemnie

---

## 12. Zgodność i nagrania

Przed kontaktem: źródło danych, zgoda kanału, status DNC.

Przed nagraniem informujemy o:

1. nagraniu
2. transkrypcji
3. analizie AI
4. celu
5. dostawcy
6. retencji
7. alternatywie bez nagrania

Zgoda (lub odmowa) jest zapisana przy rozmowie. Odmowa nie blokuje misji — rozmowa idzie bez nagrania, notatki ręczne.

Nagranie musi zawierać **obu rozmówców**. Handlowiec dzwoni telefonem: telefon na głośniku przy mikrofonie CRM. System operacyjny telefonu nie oddaje drugiej linii z zwykłego połączenia. Docelowo mostek telefoniczny (Twilio), nie sam mikrofon z głośnikiem.

---

## 13. KPI

- kompletność discovery
- czas do oferty
- konwersja: kontakt → rozmowa → oferta → umowa → aktywacja
- korekty AI (ile handlowiec poprawia)
- powody przegranych
- aktualność ofert
- odnowienia

---

## 14. UI — stały szkielet

Z mocków:

- lewy sidebar: Pulpit, Partnerzy, Zadania, Oferty, Ustawienia
- tryb CRM: handlowiec prowadzi tylko jedną najpilniejszą misję naraz
- header misji: „Misja pozyskania partnera”, nazwa, lokalizacja, właściciel
- poziomy stepper 1–8
- główna karta kroku
- prawy panel Infeld AI Copilot (podpowiedzi + ostrzeżenie bezpieczeństwa)
- stopka: „Krok X z 8”, Wstecz, główny CTA

Pilot UI i copy: partner „Kawiarnia Nova”, lokal Kraków, właścicielka Anna Kowalska.

---

## 15. Wdrożenie produktowe

- **Etap 1:** playbook, pola CRM, obiekcje, pilot na lokalach
- **Etap 2:** AI po rozmowie i rekomendacje A/B/C
- **Etap 3:** sugestie pytań i odpowiedzi w czasie rzeczywistym
