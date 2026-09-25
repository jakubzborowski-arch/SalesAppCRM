-- Wklej w Supabase → SQL Editor → Run.
-- To odblokowuje zapis misji w chmurze (jeden wiersz JSON na handlowca).

create table if not exists public.crm_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.crm_state enable row level security;

drop policy if exists "crm_state_select_own" on public.crm_state;
drop policy if exists "crm_state_insert_own" on public.crm_state;
drop policy if exists "crm_state_update_own" on public.crm_state;
drop policy if exists "crm_state_delete_own" on public.crm_state;

create policy "crm_state_select_own"
  on public.crm_state for select
  using (auth.uid() = user_id);

create policy "crm_state_insert_own"
  on public.crm_state for insert
  with check (auth.uid() = user_id);

create policy "crm_state_update_own"
  on public.crm_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "crm_state_delete_own"
  on public.crm_state for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.crm_state to authenticated;
