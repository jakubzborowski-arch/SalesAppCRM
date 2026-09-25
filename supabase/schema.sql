-- Lutra CRM schema for Supabase SQL Editor
-- Run this in the cloud project. App still uses localStorage in this phase;
-- tables are ready for the next persistence switch.

create extension if not exists pgcrypto;

do $$ begin
  create type partner_segment as enum ('venue', 'company', 'community');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type mission_stage as enum (
    'research', 'contact', 'discovery', 'needs', 'offer',
    'negotiation', 'contract', 'activation', 'care'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type mission_status as enum ('active', 'won', 'lost', 'nurture', 'no_fit', 'paused');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type need_category as enum (
    'acquisition', 'attendance', 'off_peak', 'margin', 'operations',
    'marketing', 'wellbeing', 'integration', 'budget', 'risk'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type need_status as enum ('fact', 'observation', 'ai_hypothesis');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type channel as enum ('phone', 'email', 'linkedin', 'in_person', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type consent_status as enum ('granted', 'denied', 'unknown', 'withdrawn');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type offer_variant as enum ('A', 'B', 'C');
exception when duplicate_object then null;
end $$;

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

alter table partners add column if not exists subcategory text;

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
  started_at timestamptz not null default now(),
  closed_at timestamptz
);

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
  description text,
  priority int check (priority between 1 and 5),
  expected_result text,
  constraints text,
  quote text,
  status need_status not null default 'observation',
  confirmed_by uuid references profiles (id),
  confirmed_at timestamptz,
  source text not null default 'manual'
);

create table if not exists offer_library (
  id uuid primary key default gen_random_uuid(),
  segment partner_segment not null,
  variant offer_variant not null,
  name text not null,
  description text not null,
  default_terms jsonb not null default '{}'::jsonb,
  is_active boolean not null default true
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
  status text not null default 'draft'
);

create table if not exists objection_library (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  response text not null,
  follow_up_question text not null,
  is_active boolean not null default true
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  contact_id uuid references partner_contacts (id),
  channel channel not null,
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
  consent_snapshot jsonb,
  retention_until date,
  deleted_at timestamptz
);

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

create table if not exists ai_outputs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  conversation_id uuid references conversations (id) on delete set null,
  type text not null,
  status text not null default 'draft',
  input_snapshot jsonb,
  output jsonb,
  edited_output jsonb,
  model text,
  prompt_version text,
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz
);

create table if not exists training_examples (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references missions (id) on delete set null,
  segment partner_segment not null,
  needs_snapshot jsonb not null,
  constraints_snapshot jsonb,
  selected_variant offer_variant,
  outcome text,
  loss_reason text,
  seller_corrections jsonb,
  activation_happened boolean,
  renewed boolean,
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  excluded boolean not null default false
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces (id) on delete cascade,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table workspaces enable row level security;
alter table profiles enable row level security;
alter table partners enable row level security;
alter table partner_contacts enable row level security;
alter table consents enable row level security;
alter table missions enable row level security;
alter table mission_checklist_items enable row level security;
alter table decision_context enable row level security;
alter table needs enable row level security;
alter table offer_library enable row level security;
alter table offers enable row level security;
alter table objection_library enable row level security;
alter table conversations enable row level security;
alter table recordings enable row level security;
alter table transcripts enable row level security;
alter table ai_outputs enable row level security;
alter table training_examples enable row level security;
alter table audit_log enable row level security;

insert into offer_library (segment, variant, name, description)
values
  ('venue', 'A', 'Ruch poza szczytem', 'Konkretne dni i godziny, np. środa 16:00–19:00.'),
  ('venue', 'B', 'Oferta grupowa', 'Minimalna liczba osób albo rachunek chroniący marżę.'),
  ('venue', 'C', 'Kontrolowany pilotaż', 'Ograniczony czas, limit użyć albo limit dzienny.');

insert into objection_library (key, label, response, follow_up_question)
values
  ('other_apps', 'Mam inne aplikacje ze zniżkami.', 'Lutra jest dla grup, które już planują wyjście; zniżka pomaga wybrać Państwa miejsce.', 'Ilu klientów przychodzi z obecnych programów i ilu z nich tworzy grupy?'),
  ('how_many', 'Ile osób mi przyprowadzicie?', 'Nie obiecujemy liczby, której nie możemy potwierdzić. Możemy zacząć od warunków kontrolowanych przez partnera.', 'Co w trzy miesiące uznaliby Państwo za sensowny wynik?'),
  ('margin', 'Zniżka mi się nie opłaca.', 'Ustalmy okno godzinowe, minimalną grupę, limit dzienny lub wyłączenia produktów.', 'Które godziny chcecie dociążyć bez obniżki w szczycie?'),
  ('no_time', 'Nie mam czasu tego pilnować.', 'Warunki ustalamy raz; wracamy przy zmianie lub okresowym potwierdzeniu.', 'Kto będzie kontaktem do aktualizacji?'),
  ('ask_owner', 'Muszę zapytać właściciela.', 'Przygotujemy krótkie podsumowanie i umówimy rozmowę z decydentem.', 'Co będzie dla właściciela najważniejsze?'),
  ('come_back', 'Wróćcie, jak będzie więcej użytkowników.', 'Możemy wrócić w ustalonym terminie albo przygotować ograniczony, bezpłatny pilot bez wyłączności.', 'Jaki sygnał skłoni Państwa do powrotu?')
on conflict (key) do nothing;

-- Snapshot CRM (używany w tej fazie zamiast pełnej normalizacji).
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
