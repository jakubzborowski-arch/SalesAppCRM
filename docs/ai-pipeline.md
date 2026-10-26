# Lutra CRM — pipeline głosu, AI i uczenia

## Zasada

Nagranie → transkrypt → hipotezy AI → korekta człowieka → fakty w CRM → opcjonalnie `training_examples`.

Model nigdy nie uczy się z surowego audio ani z niezatwierdzonego transkryptu.

---

## 1. Nagrywanie

Handlowiec dzwoni **telefonem**. Transkrypt i AI muszą mieć **obie strony**: handlowca i partnera.

Zwykłe połączenie GSM/iOS/Android **nie oddaje** drugiej linii do przeglądarki. `getUserMedia` słyszy tylko mikrofon urządzenia.

**v1 (teraz):** telefon na głośniku, mikrofon laptopa albo telefonu z otwartym CRM. Wyłączone `echoCancellation` i `noiseSuppression`. Transkrypt: darmowe rozpoznawanie mowy w Chrome/Edge w trakcie nagrania (bez Whisper). Ręczna korekta zawsze możliwa.

**v2 (docelowo):** mostek telefoniczny (Twilio / analog). Handlowiec dzwoni z CRM albo dokłada cichego uczestnika nagrywającego. Wtedy mamy pewne dwie nogi rozmowy, często osobne kanały, i da się oznaczyć kto mówi.

Klient (przeglądarka, Next.js):

1. Handlowiec otwiera rozmowę w misji.
2. UI pokazuje disclosure (nagranie, transkrypcja, AI, cel, dostawca, retencja, opcja bez nagrania) i przypomina o głośniku.
3. Partner zgadza się albo odmawia. Decyzja idzie do `conversations.recording_consent`.
4. Przy zgodzie: `MediaRecorder` (webm/opus), mikrofon bez tłumienia echa, upload do Supabase Storage (`recordings/`).
5. Przy odmowie: tylko notatki ręczne. Misja działa dalej.

Retencja: `recordings.retention_until`. Po dacie plik jest usuwany; zatwierdzone potrzeby i training examples zostają.

---

## 2. Transkrypcja

v1, bezpłatnie:

1. W trakcie nagrania Chrome / Edge (`webkitSpeechRecognition`, język `pl-PL`) zbiera tekst z mikrofonu.
2. Po Stop: audio do Storage, tekst do `transcripts` (`provider = web-speech` albo `manual`).
3. Handlowiec poprawia transkrypt w CRM. To jest źródło robocze, nie wiedza modelu.

Bez klucza OpenAI. Safari / Firefox: nagranie zostaje, transkrypt dopisujesz ręcznie.

Później (płatne / lokalne, nie teraz): Deepgram, lokalny Whisper, mostek Twilio.

---

## 3. Ekstrakcja po rozmowie (Etap 2)

LLM ze structured output, osobny prompt per typ. Każdy wynik = wiersz `ai_outputs` ze statusem `draft`.

Wyciągane szkice:

- podsumowanie rozmowy
- potrzeby (kategoria, opis, priorytet, cytat+timestamp, ograniczenia)
- obiekcje z biblioteki (match do `objection_library.key`)
- brakujące pola bramki oferty
- recap e-mail
- 3 warianty z `offer_library` (nie z wolnej inwencji)
- 1 następny krok z datą

Twarde reguły promptu:

- nie oceniaj emocji ani osobowości
- nie wymyślaj liczb klientów
- nie ustawiaj rabatu
- każda kategoria potrzeby = hipoteza, dopóki handlowiec nie potwierdzi
- cytaty tylko z transkryptu, z timestampem
- oferty tylko z podanej biblioteki
- dołącz listę zakazanych obietnic

---

### Discovery z transkryptu (wdrożone)

Transkrypt ze Spinach AI (albo Zoom / Meet / Teams, także .vtt / .srt) + notatka misji → pola ekranu „Rozmowa i mapa potrzeb”.

- Kod: `src/lib/discovery-extract.ts` (kontekst, polecenie, schemat JSON, walidacja, podgląd), `src/app/api/discovery-extract/route.ts`, UI w `src/components/mission/talk-bubble.tsx`.
- Silnik: Claude API z `output_config.format` (JSON Schema, wszystkie pola wymagane, `additionalProperties: false`). Schemat jest celowo płaski — bez enumów i opisów, dowody listą `{pole, cytat}` — bo Claude kompiluje go do gramatyki o ograniczonym rozmiarze. Gdy API mimo to odrzuci schemat („compiled grammar is too large”), zapytanie idzie raz jeszcze z opisem JSON w poleceniu (`JSON_ONLY`) i do końca działania serwera już tą drogą. Bez klucza: lokalny Qwen / Zen (JSON z tekstu) albo ręcznie przez Claude (polecenie do skopiowania, odpowiedź wklejana do CRM).
- Przed wysyłką: `redactPrivate` (telefon, mail, NIP), limit 150 tys. znaków rozmów. Transkrypt i notatka są w znacznikach jako dane, nie polecenia.
- Po odpowiedzi: cytat sprawdzany dosłownie w transkrypcie, pozostałe pola — czy dotyczą rozmowy; terminy liczone od dnia rozmowy (`parseDeadline`), daty spoza okna odrzucane; decydent dopasowany do karty partnera albo dopisany jako nowa osoba.
- Nic nie zapisuje się samo: podgląd z checkboxami, potrzeby jako `ai_hypothesis`, „Potwierdź jako fakt” robi handlowiec.
- Zakres to cała misja (`src/lib/mission-extract.ts`): warunki dla typu partnera, obiekcje z biblioteki (tylko które padły), dane do porozumienia i aktywacji. Zgody na markę nigdy nie są zaznaczone domyślnie; telefonów kontaktu awaryjnego AI nie widzi.
- **Dowody** (`src/lib/evidence.ts`): model zwraca `dowody` — listę `{pole, cytat}` ze zdaniem partnera dosłownie z rozmowy dla każdego wypełnionego pola (ręczna ścieżka może też oddać obiekt pole → zdanie). CRM dzieli transkrypt na mówców (handlowiec = imię/nazwisko z CRM albo „Lutra”), szuka zdania tylko w wypowiedziach partnera i notatce, a liczby (zniżka, grupa — także słownie) sprawdza w zdaniu, które naprawdę padło. Bez dowodu, z dowodem handlowca, z inną liczbą albo (dla warunków i umowy) przy nieznanych mówcach — wiersz odznaczony z ostrzeżeniem.
- **RODO**: rozmowa idzie do AI dopiero po zaznaczeniu, że partner wie o transkrypcji i analizie (zgoda `ai_analysis` partnera). Ścieżka ręczna „Przez Claude” kopiuje tylko zredagowane polecenie; dane partnera wklejać tylko do Claude w planie firmowym albo z wyłączonym „Pomagaj ulepszać Claude”. Wcześniejsze wnioski AI z notatki nie są źródłem dla modelu ani weryfikacji.
- **Pomiar** (`src/lib/ai-log.ts`, tabela `ai_suggestions`, v8): każdy podgląd zakończony wstawieniem albo odrzuceniem zapisuje model, tokeny, czas, wersję polecenia i decyzje per pole (bez treści rozmowy). Raporty → „Podpowiedzi AI z rozmów”: akceptacja per pole, koszt, odsetek transkryptów bez mówców.
- **Zestaw testowy** (`tests/eval/`): 22 opisane rozmowy z wzorcowymi odpowiedziami i dowodami. `npm test` sprawdza offline, że wzorce przechodzą przez weryfikację; `ANTHROPIC_API_KEY=… npm run eval:ai` ocenia model per pole. Dokładaj zanonimizowane prawdziwe rozmowy.
- **Dostęp i koszty** (`src/lib/ai-access.ts`): zalogowany, potwierdzony mail, lista `AI_ALLOWED_EMAILS` (na produkcji obowiązkowa), limity w bazie (`take_ai_quota`: 30 odczytów i 60 szkiców na godzinę na osobę), logi serwera w JSON (`extract_done`, `extract_failed`).

## 4. Zatwierdzenie człowieka

Ekran po rozmowie:

1. Handlowiec poprawia podsumowanie.
2. Potwierdza / odrzuca / edytuje potrzeby i priorytety.
3. Oznacza prawdziwe obiekcje i argument, który zadziałał.
4. Zatwierdza albo odrzuca recap i warianty oferty.
5. Zapisuje wynik misji, jeśli znany.

Skutek:

- `needs.status` → `fact` tylko po `confirmed_by`
- `ai_outputs.status` → `approved` | `edited` | `rejected`
- korekty lądują w `seller_corrections`

---

## 5. Copilot w trakcie rozmowy (Etap 3)

Nie budujemy tego na starcie.

Później: strumień STT (Deepgram live) → co N sekund krótka ekstrakcja → 1–2 pytania i odpowiedź z biblioteki obiekcji.

Nadal: zero wolnych obietnic, zero rabatów, zero wysyłki.

---

## 6. Karmienie modelu

v1: **brak fine-tuningu**.

Zamiast tego:

- tabela `training_examples` z zatwierdzonymi snapshotami
- RAG / few-shot przy generowaniu briefu, recapu i rekomendacji A/B/C
- metryka `korekty AI` = różnica draft vs edited

v2 (gdy będzie skala):

- eksport tylko `training_examples` gdzie `excluded = false`
- fine-tune albo własny klasyfikator: kategoria potrzeby, obiekcja, wariant oferty
- nadal bez raw audio

Dane do przykładu treningowego:

- segment
- potrzeby i ograniczenia
- wybrany wariant
- wynik i powód przegranej
- korekty handlowca
- czy aktywacja i odnowienie nastąpiły

---

## 7. Dostawcy (rekomendacja startowa)

| Warstwa | Start | Później |
|---|---|---|
| App | Next.js App Router + TypeScript | — |
| DB / auth / files | Supabase Postgres + Auth + Storage + RLS | Realtime dla live copilot |
| STT | Web Speech API (Chrome/Edge, darmowe) albo ręczny transkrypt | lokalny Whisper / Deepgram |
| LLM | GPT-4.1 / Claude, structured outputs | ten sam + RAG z training_examples |
| Fine-tune | nie | po min. kilkuset zatwierdzonych misjach |

---

## 8. Bezpieczeństwo promptów

Każde wywołanie LLM dostaje:

- segment i etap misji
- zatwierdzone fakty (nie hipotezy, chyba że oznaczone)
- bibliotekę ofert i obiekcji
- listę zakazanych obietnic
- instrukcję: „odpowiadaj tylko na podstawie dostarczonego kontekstu”

Wyjście JSON walidowane schematem (Zod). Jeśli model zwróci wariant spoza biblioteki albo obietnicę z blacklisty — odrzucamy output i pokazujemy błąd, nie treść.

## Przygotowanie do rozmowy (`/api/call-prep`, `src/lib/call-prep.ts`)

- Przeglądarka składa kontekst: karta partnera (bez telefonów i maili), historia kontaktu, luki w misji (`discoveryGaps`) i warunki do 5 podobnych partnerów, którzy już się zgodzili (`similarDeals` — do modelu bez nazw).
- Krok 1 — research: Claude z narzędziami serwerowymi `web_search_20250305` (do 4 wyszukań) i `web_fetch_20250910` (strona z karty, do 12 tys. tokenów). Obsługa `pause_turn`; gdy organizacja nie ma web fetch / web search (Claude Console → Settings → Capabilities), kolejno prostszy zestaw, a na końcu przygotowanie tylko z CRM z informacją dla handlowca.
- Krok 2 — przygotowanie w stałym formacie (`PREP_SCHEMA`, płaski, ze ścieżką zapasową JSON w poleceniu).
- `normalizePrep`: fakt zostaje tylko ze źródłem, które naprawdę padło (adres z wyników / strony partnera albo „karta partnera”), oferta przycięta do poprawnych wartości (dla społeczności i firm bez liczb), filtr obietnic z listy „Czego nie obiecywać”.
- Wynik w `mission.details.callPrep` (bez migracji). „Wstaw propozycję jako szkic warunków” wypełnia tylko puste pola zniżki.
- Limit: wspólny z odczytem rozmów (`extract`, 30/h). Koszt: ok. 1–4 centy za wyszukiwania + tokeny strony i odpowiedzi.
