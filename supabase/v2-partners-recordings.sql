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
alter table partners add column if not exists website text;
alter table partners add column if not exists priority text;
alter table partners add column if not exists priority_reason text;
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
