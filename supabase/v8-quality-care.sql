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
