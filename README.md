# Lutra CRM

System sprzedaży partnerskiej: misja od researchu do aktywnego partnera (miejsce, społeczność albo firma) i opieka po aktywacji.

## Lokalnie

```bash
npm install
npm run dev
```

Otwórz [http://localhost:3001](http://localhost:3001) (albo 3000). Zaloguj się na `/login`.

## Supabase

1. Authentication → Sign In / Providers → Email: włącz **Confirm email** (AI działa tylko dla potwierdzonych adresów).
2. Authentication → URL Configuration: **Site URL** = adres CRM (lokalnie `http://localhost:3001`, na produkcji adres z Vercela) — tam prowadzi link z maila.
3. SQL Editor: wklej `supabase/migrations/20261001000003_v2_v3_all.sql` i Run.
4. SQL Editor: wklej po kolei i Run kolejne pliki z `supabase/migrations/`: v4 (zespół, dziennik kontaktów, historia etapów), v5 (dane firmy), v6 (kto co edytuje, obieg podpisu), v7 (typ partnera, porozumienie mailowe), v8 (jakość AI, metryki i zdrowie partnera, wynik dopasowania, limity AI, zapis misji w jednej transakcji). Najprościej: w CRM przycisk „Kopiuj SQL” na żółtym pasku daje wszystkie brakujące naraz. Albo Supabase CLI — niżej.
5. `.env.local` z URL i anon key.
6. Pierwsze konto: lokalnie (`npm run dev`) rejestracja jest otwarta. Na produkcji konta zakłada się z linku zaproszenia (Ustawienia → Zespół); pierwsze konto administratora — jednorazowo `NEXT_PUBLIC_OPEN_SIGNUP=1`, potem usuń tę zmienną.
7. W CRM: **Dodaj partnera**, potem **Zajmuję się partnerem**. Przy pierwszym wejściu CRM pokazuje krótkie wprowadzenie; pełny opis jest w menu → **Pomoc** albo w bąbelku „Wprowadzenie”.

**Zasada migracji:** każdą można odpalać wielokrotnie, ale po ponownym odpaleniu starszej (np. v2–v3) trzeba odpalić jeszcze raz wszystkie nowsze, po kolei (v4–v8). Starsza migracja potrafi przywrócić stare polityki dostępu albo funkcje. CRM pilnuje tego sam: każda migracja zapisuje znacznik w `crm_migrations`, a gdy starsza poszła po nowszej, żółty pasek każe powtórzyć kolejne i daje gotowy SQL.

### Supabase CLI (zamiast wklejania)

Migracje są w `supabase/migrations/` w formacie Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <ref>   # ref = część adresu https://<ref>.supabase.co
npm run db:push                          # = npx supabase db push
```

Na bazie, w której migracje odpalałeś ręcznie, pierwszy `db push` odpali wszystkie pliki jeszcze raz, po kolei — to bezpieczne (każda jest powtarzalna, a kolejność przywraca aktualne uprawnienia). Kopia zapasowa: Supabase → Database → Backups (na planie Pro włącz Point in Time Recovery przed wdrożeniem dla zespołu).

### Przed wdrożeniem na Vercel (koszty AI)

- Vercel → Environment Variables: `AI_ALLOWED_EMAILS` (adresy albo domeny handlowców). Bez tej listy AI na produkcji jest wyłączone.
- Claude Console → Settings → Limits: miesięczny limit wydatków dla organizacji albo workspace’u z kluczem CRM.
- OpenCode Zen (jeśli używasz `HOSTED_LLM_API_KEY`): limit salda w panelu Zen.
- Supabase → Authentication → Hooks → **Before User Created** → Postgres → `public.crm_before_user_created` (z v8). Od tej chwili konto założy tylko osoba z linkiem zaproszenia (pierwsze konto w pustym projekcie przechodzi zawsze). Bez hooka ukryty przycisk rejestracji nie wystarcza — API Supabase przyjmie rejestrację.
- Supabase: włączone **Confirm email** (punkt 1). Bez tego lista z domeną (`@lutra.pl`) nie chroni AI: ktoś założy konto `x@lutra.pl` bez dostępu do tej skrzynki.

## Dane firmy, terminy, raporty

- Karta partnera → **Dane firmy**: nazwa z rejestru, NIP (sprawdzana cyfra kontrolna), REGON, adres siedziby i do korespondencji, e-mail do faktur. Krok Umowa wpisuje je jednym kliknięciem; dane wpisane w umowie można zapisać z powrotem na kartę.
- Termin decyzji partnera to data (szybkie wybory: koniec tygodnia, za tydzień…). Stare wpisy tekstowe („Czwartek”) CRM pokazuje do zamiany. Termin widać na tablicy, w zadaniach i w panelu misji; minięty jest na czerwono.
- **Raporty**: lejek etapów (ile misji doszło do etapu i ile przeszło dalej), wygrane/przegrane, skuteczność, powody przegranych z etapem, kontakty per kanał, lista „do zrobienia teraz”. Filtr okresu i handlowca.
- Karta partnera zapisuje tylko zmienione pola — dwie osoby edytujące różne pola nie nadpisują sobie pracy.

## Uprawnienia, umowy, przypomnienia (v6)

- Cały zespół widzi wszystko. Misję edytuje jej właściciel albo administrator — u innych to podgląd. Misję można **przekazać** innej osobie (przycisk w nagłówku misji); otwarte zadania przechodzą razem z nią. Kartę partnera edytuje jego opiekun, prowadzący którąś z jego misji albo administrator. Baza pilnuje tego sama (RLS), nie tylko widok.
- Karta partnera: edycja podstawowych danych i osób kontaktowych (z LinkedIn). Gdy dwie osoby zmienią ten sam kontakt, druga dostaje wersję pierwszej i komunikat zamiast cichego nadpisania.
- Dodawanie i import partnerów ostrzegają o duplikatach (ta sama nazwa w mieście, NIP, telefon, e-mail).
- Umowa: PDF generowany z szablonu zespołu (Ustawienia → Szablon umowy, edytuje administrator; pola `{{firma}}`, `{{nip}}`, `{{wariant}}`…). Obieg podpisu: wysłana → podpis partnera (skan PDF/JPG/PNG albo „podpisał”) → podpis Lutry. Aktywacja wymaga obu podpisów. Nowa wersja dokumentu zaczyna obieg od nowa; zastąpione pliki są kasowane ze Storage.
- **Na dziś** na pulpicie i licznik przy Zadaniach: zaległe zadania i kroki, terminy decyzji, maile po kontakcie, umowy i porozumienia czekające na partnera (5 dni po wysyłce), opieka nad aktywnymi partnerami, współprace kończące się w ciągu 30 dni. Powiadomienia systemowe włączasz w Ustawieniach (działają, gdy CRM jest otwarty).
- Link „Otwórz SQL Editor” prowadzi do projektu z `NEXT_PUBLIC_SUPABASE_URL`.

## Warunki, porozumienie, publikacja, opieka (v7)

- **Typ partnera**: miejsce, społeczność albo firma — przy dodawaniu, na karcie, w imporcie (kolumna „Typ partnera”), w filtrach listy i raportów. Od typu zależą research, warianty A/B/C, wymagane warunki i kroki aktywacji.
- **Mapa potrzeb** w kroku Rozmowa: kilka potrzeb z kategorią, priorytetem i statusem (fakt / obserwacja / hipoteza). Fakt wymaga wybranej kategorii — z niej liczy się rekomendacja wariantu.
- **Oferta = konkretne warunki**: zniżka (rabat % albo gratis, dni i godziny, grupa 3+, wyłączenia), sposób realizacji (QR, kod numeryczny, hasło bez wdrożenia), miejsce na wydarzenia; dla społeczności cykl wydarzeń, dla firmy pilotaż; okres od–do. Wariantu nie da się zatwierdzić bez kompletu.
- **Porozumienie albo umowa**: do 3 miesięcy mail z warunkami z szablonu (wysyłasz sam, zaznaczasz wysyłkę i potwierdzenie partnera, zatwierdzasz), dłużej umowa w PDF z dwoma podpisami. Zasady 7 dni wpisują się same z okresu i typu partnera. Zgoda na nazwę i logo jest wymagana dla miejsc i społeczności. Oba szablony edytuje administrator w Ustawieniach.
- **Weryfikacja przed publikacją**: działalność, adres, pojemność, godziny, kontakt awaryjny, zniżka, kod partnera, widoczność w aplikacji, naklejka, testowa realizacja, data przeglądu.
- **Opieka**: panel na stronie aktywnego partnera — przegląd po pierwszym cyklu (frekwencja, zgłoszenia, decyzja), kwartalne potwierdzenie warunków, comiesięczna informacja o realizacjach (miejsca), koniec okresu. Przypomnienia trafiają do „Na dziś”, także w trakcie odnowienia.
- **Maile po kontakcie**: po telefonie follow-up, po spotkaniu mail z ustaleniami tego samego dnia — przypomnienie w misji i w „Na dziś” z przyciskiem „Mail wysłany”.

## Testy

- `npm test` — testy jednostkowe (zapis, konflikty, NIP, terminy, raporty, umowy, uprawnienia, duplikaty, warunki, porozumienie mailowe, opieka, maile po kontakcie, import typów).
- `npm run test:sql` — migracje v2–v8, ponowne odpalanie starszych migracji i RLS na PGlite (bez prawdziwego Supabase).
- GitHub Actions (`.github/workflows/ci.yml`) uruchamia lint, typecheck, oba zestawy testów i build przy każdym pushu.

## Zespół

- Pierwsza osoba w workspace jest administratorem.
- Ustawienia → Zespół → **Utwórz link**: jednorazowy link zaproszenia na 14 dni. Wyślij go sam.
- Nowa osoba otwiera link i zakłada konto. CRM pokazuje, do jakiego zespołu dołącza i co stanie się z jej danymi — dołączenie wymaga kliknięcia „Dołącz do zespołu”.
- Kto już ma konto, wkleja link w Ustawieniach. Jeśli był sam w swoim workspace, jego partnerzy i misje przechodzą do zespołu.
- Administrator może odebrać dostęp. Dane tej osoby zostają w zespole, a ona traci dostęp do umów i nagrań zespołu.
- Gdy odchodzi ostatni administrator, rolę przejmuje najdłużej obecna osoba.
- Dwie osoby w tej samej misji: zapis sprawdza wersję misji (`missions.updated_at`). Kto zapisze drugi, dostaje komunikat i wersję kolegi zamiast cichego nadpisania. Partnerzy (karta partnera) nadal zapisują się „kto ostatni, ten lepszy”.

## Dziennik kontaktów i historia misji

- Każdy telefon, mail, wiadomość LinkedIn i spotkanie to osobny wpis (`conversations`): kanał, kierunek, wynik, osoba, czas, notatka.
- Wpis może od razu ustawić następny krok z datą — trafia do Zadań.
- Zmiany etapu i statusu misji zapisuje trigger w bazie (`mission_events`).
- Wpis w dzienniku usuwa jego autor albo administrator (pilnuje tego baza, nie tylko ekran).
- Misję zamykasz jako przegraną, „wrócić później”, brak dopasowania albo pauzę — z powodem z listy. Można ją wznowić.
- Klik w poprzedni krok steppera tylko pokazuje krok. Etap misji cofa jawny przycisk „Cofnij misję do tego kroku”.

## Rozmowa ze Spinach → Discovery

- W misji (od kroku Kontakt) w prawym dolnym rogu jest bąbelek **Notatka z rozmowy**: notatka z kroku Kontakt, transkrypty rozmów i przycisk **Wypełnij pola z rozmowy**.
- Transkrypt wklejasz albo wczytujesz z pliku (.txt, .md, .vtt, .srt). Zapisuje się w `conversations` + `transcripts` — jako nowy wpis w dzienniku albo dopięty do istniejącej rozmowy.
- Z kluczem `ANTHROPIC_API_KEY` w `.env.local` (albo w Vercel → Environment Variables) CRM pyta Claude API (structured output, domyślnie `claude-sonnet-5-5`). Telefony, maile i NIP-y są wycinane przed wysyłką. Bez klucza: „Przez Claude” — kopiujesz polecenie do claude.ai / Cowork i wklejasz odpowiedź (JSON).
- Analiza obejmuje całą misję: rozmowę i potrzeby, ustalone warunki (zniżka, dni i godziny, grupa, realizacja, miejsce, cykl, pilotaż, okres), obiekcje z rozmowy (tylko zaznaczenie, bez gotowych odpowiedzi), nazwę firmy, kontakt awaryjny, godziny otwarcia i zgody na markę (zgody zawsze zaznacza handlowiec). Po zapisaniu transkryptu rusza sama, gdy AI jest podłączone; w krokach Oferta–Aktywacja jest skrót „Uzupełnij z rozmowy”.
- Wynik to podgląd z checkboxami: puste pola są zaznaczone, wypełnione — nie (nadpisujesz świadomie). Cytat, którego nie ma dosłownie w transkrypcie, jest oznaczony. Potrzeby trafiają na mapę jako **hipotezy**, fakt potwierdza handlowiec.
- Lokalny Qwen (Ollama) albo OpenCode Zen też działają jako silnik, jeśli są skonfigurowane, a klucza Claude nie ma.
- Potrzebny jest zwykły klucz API z Claude Console (`sk-ant-api…`). Token z `claude setup-token` (`sk-ant-oat…`) to dostęp do Claude Code w ramach subskrypcji — CRM go nie użyje i pokaże to wprost. Plany Max i Team dostają miesięczne kredyty API (claude.ai → Ustawienia → Billing → API credits → połączenie z organizacją w Console). Klucz bez przypisanego workspace'u wymaga `ANTHROPIC_WORKSPACE_ID`.
- Klucz chroni logowanie do CRM, opcjonalna lista `AI_ALLOWED_EMAILS` i limit 30 odczytów na godzinę na osobę. Bardzo długie rozmowy idą do AI jako początek i koniec (limit 150 tys. znaków), co podgląd wyraźnie zaznacza.

## Flagi

- `NEXT_PUBLIC_SKILL_SMOKE=1` — włącza smoke test skilla dla partnera o nazwie „Test” (dopisuje przykładowe dane). Domyślnie wyłączony.

Partnerzy, misje, rozmowy, nagrania i transkrypty idą do osobnych tabel. Wizard misji trzyma szczegóły UI w `missions.details`.
