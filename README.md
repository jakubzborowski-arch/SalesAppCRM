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

## Zespół

- Pierwsza osoba w workspace jest administratorem.
- Ustawienia → Zespół → **Utwórz link**: jednorazowy link zaproszenia na 14 dni. Wyślij go sam.
- Nowa osoba otwiera link, zakłada konto i od razu widzi wspólnych partnerów, misje i dziennik.
- Kto już ma konto (i jest sam w swoim workspace), wkleja link w Ustawieniach — jego dane przechodzą do zespołu.
- Administrator może odebrać dostęp. Dane tej osoby zostają w zespole.

## Dziennik kontaktów i historia misji

- Każdy telefon, mail, wiadomość LinkedIn i spotkanie to osobny wpis (`conversations`): kanał, kierunek, wynik, osoba, czas, notatka.
- Wpis może od razu ustawić następny krok z datą — trafia do Zadań.
- Zmiany etapu i statusu misji zapisuje trigger w bazie (`mission_events`).
- Misję zamykasz jako przegraną, „wrócić później”, brak dopasowania albo pauzę — z powodem z listy. Można ją wznowić.
- Klik w poprzedni krok steppera tylko pokazuje krok. Etap misji cofa jawny przycisk „Cofnij misję do tego kroku”.

## Flagi

- `NEXT_PUBLIC_SKILL_SMOKE=1` — włącza smoke test skilla dla partnera o nazwie „Test” (dopisuje przykładowe dane). Domyślnie wyłączony.

Partnerzy, misje, rozmowy, nagrania i transkrypty idą do osobnych tabel. Wizard misji trzyma szczegóły UI w `missions.details`.
