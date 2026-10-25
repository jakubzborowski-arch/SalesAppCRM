-- v8: jakość danych z AI, opieka nad partnerem, wynik dopasowania, limity AI w bazie.
-- Można odpalać wielokrotnie. Wymaga v4–v7.
-- ---------------------------------------------------------------------------
-- 1. Podpowiedzi AI: co zaproponowało, co handlowiec przyjął (jakość per pole, koszt)

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  mission_id uuid references public.missions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  outcome text not null check (outcome in ('applied', 'discarded')),
  engine text not null check (engine in ('claude', 'zen', 'mac', 'manual')),
  model text,
  prompt_version text not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  speakers_known boolean,
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array' and pg_column_size(rows) < 200000)
);

create index if not exists ai_suggestions_workspace_idx on public.ai_suggestions (workspace_id, created_at desc);

alter table public.ai_suggestions enable row level security;
revoke all on public.ai_suggestions from anon, authenticated;
grant select, insert on public.ai_suggestions to authenticated;

drop policy if exists "ai_suggestions_select" on public.ai_suggestions;
create policy "ai_suggestions_select" on public.ai_suggestions for select
  using (workspace_id = public.current_workspace_id());
drop policy if exists "ai_suggestions_insert" on public.ai_suggestions;
create policy "ai_suggestions_insert" on public.ai_suggestions for insert
  with check (
    workspace_id = public.current_workspace_id()
    and user_id = auth.uid()
    and (mission_id is null or mission_id in (select id from public.missions where workspace_id = public.current_workspace_id()))
  );

-- ---------------------------------------------------------------------------
-- 2. Miesięczne metryki partnera: wydarzenia, uczestnicy, realizacje zniżki (opieka po aktywacji)

create table if not exists public.partner_metrics (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  events integer check (events is null or events >= 0),
  attendees integer check (attendees is null or attendees >= 0),
  redemptions integer check (redemptions is null or redemptions >= 0),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (partner_id, month)
);

create index if not exists partner_metrics_partner_idx on public.partner_metrics (partner_id, month desc);

alter table public.partner_metrics enable row level security;
revoke all on public.partner_metrics from anon, authenticated;
grant select, insert, update, delete on public.partner_metrics to authenticated;

drop policy if exists "partner_metrics_select" on public.partner_metrics;
create policy "partner_metrics_select" on public.partner_metrics for select
  using (partner_id in (select id from public.partners where workspace_id = public.current_workspace_id()));
drop policy if exists "partner_metrics_insert" on public.partner_metrics;
create policy "partner_metrics_insert" on public.partner_metrics for insert
  with check (public.can_edit_partner(partner_id));
drop policy if exists "partner_metrics_update" on public.partner_metrics;
create policy "partner_metrics_update" on public.partner_metrics for update
  using (public.can_edit_partner(partner_id))
  with check (public.can_edit_partner(partner_id));
drop policy if exists "partner_metrics_delete" on public.partner_metrics;
create policy "partner_metrics_delete" on public.partner_metrics for delete
  using (public.can_edit_partner(partner_id));

-- ---------------------------------------------------------------------------
-- 3. Wynik dopasowania lokalu (0–6): martwe godziny, pojemność dla grup, dzielnica — każde 0–2

alter table public.partners add column if not exists fit_dead_hours smallint;
alter table public.partners add column if not exists fit_capacity smallint;
alter table public.partners add column if not exists fit_area smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partners_fit_range') then
    alter table public.partners
      add constraint partners_fit_range check (
        (fit_dead_hours is null or fit_dead_hours between 0 and 2)
        and (fit_capacity is null or fit_capacity between 0 and 2)
        and (fit_area is null or fit_area between 0 and 2)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Limity AI w bazie: wspólne dla wszystkich instancji serwera (Vercel), nie zerują się przy restarcie

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('extract', 'draft')),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_kind_idx on public.ai_usage (user_id, kind, created_at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Jedno wywołanie = sprawdzenie i zapis próby (atomowo, z blokadą na użytkownika).
create or replace function public.take_ai_quota(p_kind text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    return false;
  end if;
  if p_kind not in ('extract', 'draft') or p_limit < 1 or p_limit > 1000 or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'Nieprawidłowy limit AI.';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_quota:' || uid::text || ':' || p_kind));
  delete from ai_usage where user_id = uid and created_at < now() - interval '2 days';
  select count(*) into used from ai_usage
    where user_id = uid and kind = p_kind and created_at > now() - make_interval(secs => p_window_seconds);
  if used >= p_limit then
    return false;
  end if;
  insert into ai_usage (user_id, kind) values (uid, p_kind);
  return true;
end $$;

revoke all on function public.take_ai_quota(text, integer, integer) from public, anon;
grant execute on function public.take_ai_quota(text, integer, integer) to authenticated;

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
