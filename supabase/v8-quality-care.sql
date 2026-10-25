-- v8: jakość danych z AI, opieka nad partnerem, wynik dopasowania, limity AI w bazie.
-- Można odpalać wielokrotnie. Wymaga v4–v7.
-- Znacznik wersji: CRM wykrywa, gdy starsza migracja została odpalona po nowszej (trzeba wtedy powtórzyć kolejne).
create table if not exists public.crm_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.crm_migrations enable row level security;
drop policy if exists "crm_migrations_select" on public.crm_migrations;
create policy "crm_migrations_select" on public.crm_migrations for select to authenticated using (true);
grant select on public.crm_migrations to authenticated;
insert into public.crm_migrations (version, applied_at) values ('v8', clock_timestamp())
  on conflict (version) do update set applied_at = excluded.applied_at;

notify pgrst, 'reload schema';
