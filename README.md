# Lutra CRM

System sprzedaży partnerskiej: misja od researchu do aktywacji lokalu.

## Lokalnie

```bash
npm install
npm run dev
```

Otwórz [http://localhost:3001](http://localhost:3001) (albo 3000). Zaloguj się na `/login`.

## Supabase

1. Authentication → Providers: wyłącz **Confirm email**.
2. SQL Editor: wklej `supabase/v2-v3-all.sql` i Run.
3. SQL Editor: wklej `supabase/v4-team-timeline.sql` i Run (zespół, dziennik kontaktów, historia etapów).
4. SQL Editor: wklej `supabase/v5-company-data.sql` i Run (dane firmy partnera: nazwa, NIP, REGON, adresy).
5. SQL Editor: wklej `supabase/v6-roles-contracts.sql` i Run (kto co edytuje, przekazywanie misji, obieg podpisu, szablon umowy).
6. `.env.local` z URL i anon key.
7. W CRM: **Dodaj partnera**, potem **Zajmuję się partnerem**.

Migracje można odpalać ponownie. Brakującą migrację CRM pokazuje na pasku u góry z przyciskiem „Kopiuj SQL”.
Po każdym ponownym odpaleniu `v2-v3-all.sql` odpal też `v4-team-timeline.sql` (v2-v3 przywraca starsze polityki dostępu).

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
- **Na dziś** na pulpicie i licznik przy Zadaniach: zaległe zadania i kroki, terminy decyzji, umowy czekające na podpis (5 dni po wysyłce), umowy kończące się w ciągu 30 dni. Powiadomienia systemowe włączasz w Ustawieniach (działają, gdy CRM jest otwarty).
- Link „Otwórz SQL Editor” prowadzi do projektu z `NEXT_PUBLIC_SUPABASE_URL`.

## Testy

- `npm test` — testy jednostkowe (zapis, konflikty, NIP, terminy, raporty, umowy, uprawnienia, duplikaty).
- `npm run test:sql` — migracje v2–v6 i RLS na PGlite (bez prawdziwego Supabase).
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

## Flagi

- `NEXT_PUBLIC_SKILL_SMOKE=1` — włącza smoke test skilla dla partnera o nazwie „Test” (dopisuje przykładowe dane). Domyślnie wyłączony.

Partnerzy, misje, rozmowy, nagrania i transkrypty idą do osobnych tabel. Wizard misji trzyma szczegóły UI w `missions.details`.
