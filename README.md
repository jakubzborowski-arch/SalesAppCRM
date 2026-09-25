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
2. SQL Editor: wklej `supabase/v2-partners-recordings.sql` i Run.
3. `.env.local` z URL i anon key.
4. W CRM: **Dodaj partnera**, potem nagranie w kroku Kontakt (Chrome/Edge = darmowy transkrypt z mikrofonu).

Partnerzy, misje, rozmowy, nagrania i transkrypty idą do osobnych tabel. Wizard misji trzyma szczegóły w `missions.details`.
