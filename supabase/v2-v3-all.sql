-- Lutra v2 + v3 w jednym Run. Kopiuj CALY ten plik (Ctrl+A) do SQL Editora.
-- Bezpieczne do ponownego odpalenia.

-- Lutra v2: partnerzy, misje, nagrania, transkrypty + RLS.
-- Wklej w SQL Editor i Run. Bezpieczne do ponownego odpalenia.

create extension if not exists pgcrypto;

do $$ begin create type partner_segment as enum ('venue', 'company', 'community'); exception when duplicate_object then null; end $$;
do $$ begin create type mission_stage as enum ('research', 'contact', 'discovery', 'needs', 'offer', 'negotiation', 'contract', 'activation', 'care'); exception when duplicate_object then null; end $$;
do $$ begin create type mission_status as enum ('active', 'won', 'lost', 'nurture', 'no_fit', 'paused'); exception when duplicate_object then null; end $$;
do $$ begin create type need_category as enum ('acquisition', 'attendance', 'off_peak', 'margin', 'operations', 'marketing', 'wellbeing', 'integration', 'budget', 'risk'); exception when duplicate_object then null; end $$;
do $$ begin create type need_status as enum ('fact', 'observation', 'ai_hypothesis'); exception when duplicate_object then null; end $$;
do $$ begin create type channel as enum ('phone', 'email', 'linkedin', 'in_person', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type consent_status as enum ('granted', 'denied', 'unknown', 'withdrawn'); exception when duplicate_object then null; end $$;
do $$ begin create type offer_variant as enum ('A', 'B', 'C'); exception when duplicate_object then null; end $$;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  full_name text not null,
  role text not null default 'seller' check (role in ('admin', 'seller')),
  is_active boolean not null default true
);

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null,
  segment partner_segment not null default 'venue',
  city text,
  address text,
  category text,
  subcategory text,
  owner_user_id uuid references profiles (id),
  source text,
  dnc_status text not null default 'ok' check (dnc_status in ('ok', 'do_not_contact')),
  hours text,
  notes text,
  data_freshness_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists partner_contacts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners (id) on delete cascade,
  name text not null,
  role text,
  is_decision_maker boolean not null default false,
  phone text,
  email text,
  linkedin text
);

create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners (id) on delete cascade,
  contact_id uuid references partner_contacts (id) on delete set null,
  channel channel not null,
  purpose text not null check (purpose in ('contact', 'recording', 'ai_analysis', 'marketing')),
  status consent_status not null default 'unknown',
  source text,
  granted_at timestamptz,
  expires_at timestamptz
);

create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  partner_id uuid not null references partners (id) on delete cascade,
  owner_user_id uuid references profiles (id),
  status mission_status not null default 'active',
  current_stage mission_stage not null default 'research',
  next_step_label text,
  next_step_at date,
  outcome text,
  loss_reason text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table partners add column if not exists subcategory text;
alter table missions add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  contact_id uuid references partner_contacts (id),
  channel channel not null default 'phone',
  recording_consent text not null default 'pending',
  disclosure_shown_at timestamptz,
  summary_human text,
  started_at timestamptz not null default now()
);

create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  storage_path text not null,
  duration_sec int,
  mime_type text,
  consent_snapshot jsonb,
  retention_until date,
  deleted_at timestamptz
);

alter table recordings add column if not exists mime_type text;

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid references recordings (id) on delete set null,
  conversation_id uuid not null references conversations (id) on delete cascade,
  provider text,
  language text,
  full_text text,
  segments jsonb,
  status text not null default 'processing'
);

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from profiles where id = auth.uid()
$$;

create or replace function public.ensure_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id uuid;
  display_name text;
begin
  select workspace_id into ws_id from profiles where id = auth.uid();
  if found then
    return ws_id;
  end if;

  display_name := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    split_part(coalesce(auth.jwt() ->> 'email', 'handlowiec'), '@', 1),
    'Handlowiec'
  );

  insert into workspaces (name) values ('Lutra') returning id into ws_id;
  insert into profiles (id, workspace_id, full_name, role)
  values (auth.uid(), ws_id, display_name, 'seller');
  return ws_id;
end;
$$;

grant execute on function public.current_workspace_id() to authenticated;
grant execute on function public.ensure_workspace() to authenticated;

alter table workspaces enable row level security;
alter table profiles enable row level security;
alter table partners enable row level security;
alter table partner_contacts enable row level security;
alter table consents enable row level security;
alter table missions enable row level security;
alter table conversations enable row level security;
alter table recordings enable row level security;
alter table transcripts enable row level security;

drop policy if exists "workspaces_select" on workspaces;
create policy "workspaces_select" on workspaces for select
  using (id = public.current_workspace_id());

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles for select
  using (id = auth.uid());

drop policy if exists "partners_all" on partners;
create policy "partners_all" on partners for all
  using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());

drop policy if exists "contacts_all" on partner_contacts;
create policy "contacts_all" on partner_contacts for all
  using (partner_id in (select id from partners where workspace_id = public.current_workspace_id()))
  with check (partner_id in (select id from partners where workspace_id = public.current_workspace_id()));

drop policy if exists "consents_all" on consents;
create policy "consents_all" on consents for all
  using (partner_id in (select id from partners where workspace_id = public.current_workspace_id()))
  with check (partner_id in (select id from partners where workspace_id = public.current_workspace_id()));

drop policy if exists "missions_all" on missions;
create policy "missions_all" on missions for all
  using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());

drop policy if exists "conversations_all" on conversations;
create policy "conversations_all" on conversations for all
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()))
  with check (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));

drop policy if exists "recordings_all" on recordings;
create policy "recordings_all" on recordings for all
  using (conversation_id in (
    select c.id from conversations c
    join missions m on m.id = c.mission_id
    where m.workspace_id = public.current_workspace_id()
  ))
  with check (conversation_id in (
    select c.id from conversations c
    join missions m on m.id = c.mission_id
    where m.workspace_id = public.current_workspace_id()
  ));

drop policy if exists "transcripts_all" on transcripts;
create policy "transcripts_all" on transcripts for all
  using (conversation_id in (
    select c.id from conversations c
    join missions m on m.id = c.mission_id
    where m.workspace_id = public.current_workspace_id()
  ))
  with check (conversation_id in (
    select c.id from conversations c
    join missions m on m.id = c.mission_id
    where m.workspace_id = public.current_workspace_id()
  ));

grant usage on schema public to authenticated;
grant select, insert, update, delete on workspaces, profiles, partners, partner_contacts, consents, missions, conversations, recordings, transcripts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 52428800, array['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/mpeg'])
on conflict (id) do nothing;

drop policy if exists "recordings_insert_own" on storage.objects;
create policy "recordings_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "recordings_select_own" on storage.objects;
create policy "recordings_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "recordings_delete_own" on storage.objects;
create policy "recordings_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lutra v3: tabele misji (needs, decision, checklist, oferty, zadania, umowa, aktywacja).
-- Typy z v2 na górze — v3 ich wymaga. Bezpieczne do ponownego odpalenia.

create extension if not exists pgcrypto;

do $$ begin create type partner_segment as enum ('venue', 'company', 'community'); exception when duplicate_object then null; end $$;
do $$ begin create type mission_stage as enum ('research', 'contact', 'discovery', 'needs', 'offer', 'negotiation', 'contract', 'activation', 'care'); exception when duplicate_object then null; end $$;
do $$ begin create type mission_status as enum ('active', 'won', 'lost', 'nurture', 'no_fit', 'paused'); exception when duplicate_object then null; end $$;
do $$ begin create type need_category as enum ('acquisition', 'attendance', 'off_peak', 'margin', 'operations', 'marketing', 'wellbeing', 'integration', 'budget', 'risk'); exception when duplicate_object then null; end $$;
do $$ begin create type need_status as enum ('fact', 'observation', 'ai_hypothesis'); exception when duplicate_object then null; end $$;
do $$ begin create type channel as enum ('phone', 'email', 'linkedin', 'in_person', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type consent_status as enum ('granted', 'denied', 'unknown', 'withdrawn'); exception when duplicate_object then null; end $$;
do $$ begin create type offer_variant as enum ('A', 'B', 'C'); exception when duplicate_object then null; end $$;

create table if not exists mission_checklist_items (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  stage mission_stage not null,
  item_key text not null,
  label text not null,
  is_done boolean not null default false,
  done_at timestamptz,
  unique (mission_id, stage, item_key)
);

create table if not exists decision_context (
  mission_id uuid primary key references missions (id) on delete cascade,
  problem text,
  expected_result text,
  constraint_summary text,
  decision_maker_contact_id uuid references partner_contacts (id),
  decision_deadline text,
  previous_attempts text,
  next_step text
);

create table if not exists needs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  category need_category not null,
  title text,
  description text,
  priority int check (priority is null or priority between 1 and 5),
  expected_result text,
  constraints text,
  quote text,
  status need_status not null default 'observation',
  confirmed_by uuid references profiles (id),
  confirmed_at timestamptz,
  source text not null default 'manual'
);

alter table needs add column if not exists title text;

create table if not exists offer_library (
  id uuid primary key default gen_random_uuid(),
  segment partner_segment not null,
  variant offer_variant not null,
  name text not null,
  description text not null,
  default_terms jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  unique (segment, variant)
);

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  library_id uuid references offer_library (id),
  variant offer_variant not null,
  custom_terms jsonb not null default '{}'::jsonb,
  recommended_by text not null default 'human',
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  sent_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'accepted', 'rejected')),
  unique (mission_id)
);

create table if not exists objection_library (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  response text not null,
  follow_up_question text not null,
  is_active boolean not null default true
);

create table if not exists mission_objections (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  library_key text not null,
  checked boolean not null default false,
  argument_worked boolean not null default false,
  unique (mission_id, library_key)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  mission_id uuid references missions (id) on delete cascade,
  owner_user_id uuid references profiles (id),
  title text not null,
  due_at date,
  done_at timestamptz,
  source text not null default 'human' check (source in ('human', 'next_step', 'ai_draft'))
);

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique references missions (id) on delete cascade,
  offer_id uuid references offers (id) on delete set null,
  company_name text,
  nip text,
  address text,
  start_at date,
  end_at date,
  change_rules text,
  signed_by_human boolean not null default false,
  document_path text,
  signed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'ready', 'signed'))
);

create table if not exists activations (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique references missions (id) on delete cascade,
  contract_id uuid references contracts (id) on delete set null,
  partner_code text,
  hours_confirmed boolean not null default false,
  ops_contact_name text,
  ops_contact_phone text,
  test_passed boolean not null default false,
  test_notes text,
  check_in_at date,
  activated_at timestamptz
);

insert into offer_library (segment, variant, name, description, default_terms) values
  ('venue', 'A', 'Ruch poza szczytem', 'Konkretne dni i godziny. Zniżka tylko poza szczytem. Bez liczby gości i bez wyłączności.', '{"window":"poza szczytem"}'::jsonb),
  ('venue', 'B', 'Oferta grupowa', 'Minimalna liczba osób albo rachunek chroniący marżę. Warunki z discovery.', '{"min_group":true}'::jsonb),
  ('venue', 'C', 'Kontrolowany pilotaż', 'Ograniczony czas, limit użyć albo limit dzienny — bez wyłączności.', '{"pilot":true}'::jsonb)
on conflict (segment, variant) do nothing;

insert into objection_library (key, label, response, follow_up_question) values
  ('other_apps', '„Mam inne aplikacje ze zniżkami.”', 'Lutra jest dla grup, które już planują wyjście; zniżka pomaga wybrać Państwa miejsce.', 'Ilu klientów przychodzi z obecnych programów i ilu z nich tworzy grupy?'),
  ('how_many', '„Ile osób mi przyprowadzicie?”', 'Nie obiecujemy liczby, której nie możemy potwierdzić. Możemy zacząć od warunków kontrolowanych przez partnera.', 'Co w trzy miesiące uznaliby Państwo za sensowny wynik?'),
  ('margin', '„Zniżka mi się nie opłaca.”', 'Ustalmy okno godzinowe, minimalną grupę, limit dzienny lub wyłączenia produktów.', 'Które godziny chcecie dociążyć bez obniżki w szczycie?'),
  ('no_time', '„Nie mam czasu tego pilnować.”', 'Warunki ustalamy raz; wracamy przy zmianie lub okresowym potwierdzeniu.', 'Kto będzie kontaktem do aktualizacji?'),
  ('ask_owner', '„Muszę zapytać właściciela.”', 'Przygotujemy krótkie podsumowanie i umówimy rozmowę z decydentem.', 'Co będzie dla właściciela najważniejsze?'),
  ('come_back', '„Wróćcie, jak będzie więcej użytkowników.”', 'Możemy wrócić w ustalonym terminie albo przygotować ograniczony, bezpłatny pilot bez wyłączności.', 'Jaki sygnał skłoni Państwa do powrotu?')
on conflict (key) do nothing;

alter table mission_checklist_items enable row level security;
alter table decision_context enable row level security;
alter table needs enable row level security;
alter table offer_library enable row level security;
alter table offers enable row level security;
alter table objection_library enable row level security;
alter table mission_objections enable row level security;
alter table tasks enable row level security;
alter table contracts enable row level security;
alter table activations enable row level security;

drop policy if exists "checklist_all" on mission_checklist_items;
create policy "checklist_all" on mission_checklist_items for all
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()))
  with check (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));

drop policy if exists "decision_all" on decision_context;
create policy "decision_all" on decision_context for all
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()))
  with check (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));

drop policy if exists "needs_all" on needs;
create policy "needs_all" on needs for all
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()))
  with check (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));

drop policy if exists "offer_library_select" on offer_library;
create policy "offer_library_select" on offer_library for select to authenticated using (true);

drop policy if exists "objection_library_select" on objection_library;
create policy "objection_library_select" on objection_library for select to authenticated using (true);

drop policy if exists "offers_all" on offers;
create policy "offers_all" on offers for all
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()))
  with check (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));

drop policy if exists "mission_objections_all" on mission_objections;
create policy "mission_objections_all" on mission_objections for all
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()))
  with check (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));

drop policy if exists "tasks_all" on tasks;
create policy "tasks_all" on tasks for all
  using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());

drop policy if exists "contracts_all" on contracts;
create policy "contracts_all" on contracts for all
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()))
  with check (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));

drop policy if exists "activations_all" on activations;
create policy "activations_all" on activations for all
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()))
  with check (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));

grant select, insert, update, delete on mission_checklist_items, decision_context, needs, offers, mission_objections, tasks, contracts, activations to authenticated;
grant select on offer_library, objection_library to authenticated;

alter table activations add column if not exists test_notes text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "contracts_insert_own" on storage.objects;
create policy "contracts_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'contracts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "contracts_select_own" on storage.objects;
create policy "contracts_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'contracts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "contracts_update_own" on storage.objects;
create policy "contracts_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'contracts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Ponowne v2–v3 na bazie z v6: stare polityki „*_all” (każdy w zespole edytuje wszystko) nie wracają.
do $$
declare
  p record;
begin
  if to_regprocedure('public.can_edit_mission(uuid)') is null then
    return;
  end if;
  for p in
    select * from (values
      ('partners_all', 'partners'), ('contacts_all', 'partner_contacts'), ('consents_all', 'consents'),
      ('missions_all', 'missions'), ('conversations_all', 'conversations'), ('recordings_all', 'recordings'),
      ('transcripts_all', 'transcripts'), ('checklist_all', 'mission_checklist_items'),
      ('decision_all', 'decision_context'), ('needs_all', 'needs'), ('offers_all', 'offers'),
      ('mission_objections_all', 'mission_objections'), ('tasks_all', 'tasks'), ('contracts_all', 'contracts'),
      ('activations_all', 'activations')
    ) as legacy (policy, tab)
  loop
    if to_regclass('public.' || p.tab) is not null then
      execute format('drop policy if exists %I on public.%I', p.policy, p.tab);
    end if;
  end loop;
  raise notice 'Baza ma już v6: odpal teraz ponownie v4–v8 („Kopiuj SQL” w CRM), żeby przywrócić aktualne uprawnienia.';
end $$;

-- Znacznik wersji: CRM wykrywa, gdy starsza migracja została odpalona po nowszej (trzeba wtedy powtórzyć kolejne).
create table if not exists public.crm_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.crm_migrations enable row level security;
drop policy if exists "crm_migrations_select" on public.crm_migrations;
create policy "crm_migrations_select" on public.crm_migrations for select to authenticated using (true);
grant select on public.crm_migrations to authenticated;
insert into public.crm_migrations (version, applied_at) values ('v3', clock_timestamp())
  on conflict (version) do update set applied_at = excluded.applied_at;
