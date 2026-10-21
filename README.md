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
4. `.env.local` z URL i anon key.
5. W CRM: **Dodaj partnera**, potem **Zajmuję się partnerem**.

Obie migracje można odpalać ponownie. Jeśli baza ma już v2+v3, wystarczy v4 — CRM pokaże baner z przyciskiem „Kopiuj SQL v4”.
Po każdym ponownym odpaleniu `v2-v3-all.sql` odpal też `v4-team-timeline.sql` (v2-v3 przywraca starsze polityki dostępu).

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
