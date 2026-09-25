-- Dopisz workspace_id do starych tabel.
-- CREATE TABLE IF NOT EXISTS nie zmienia istniejącej tabeli.
-- Po Success odpal znowu cały supabase/v2-v3-all.sql.

create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into workspaces (name)
select 'Lutra'
where not exists (select 1 from workspaces);

do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade';
    execute 'alter table public.profiles add column if not exists full_name text';
    execute 'alter table public.profiles add column if not exists role text';
    execute 'alter table public.profiles add column if not exists is_active boolean default true';
  end if;

  if to_regclass('public.partners') is not null then
    execute 'alter table public.partners add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade';
  end if;

  if to_regclass('public.missions') is not null then
    execute 'alter table public.missions add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade';
  end if;

  if to_regclass('public.tasks') is not null then
    execute 'alter table public.tasks add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade';
  end if;
end $$;

do $$
declare
  ws uuid;
begin
  select id into ws from public.workspaces order by created_at limit 1;

  if to_regclass('public.profiles') is not null then
    execute 'update public.profiles set workspace_id = $1 where workspace_id is null' using ws;
    execute 'update public.profiles set full_name = coalesce(nullif(full_name, ''''), ''Handlowiec'') where full_name is null or full_name = ''''' ;
    execute 'update public.profiles set role = coalesce(nullif(role, ''''), ''seller'') where role is null or role = ''''' ;
  end if;

  if to_regclass('public.partners') is not null then
    execute 'update public.partners set workspace_id = $1 where workspace_id is null' using ws;
  end if;

  if to_regclass('public.missions') is not null then
    execute 'update public.missions set workspace_id = $1 where workspace_id is null' using ws;
  end if;

  if to_regclass('public.tasks') is not null then
    execute 'update public.tasks set workspace_id = $1 where workspace_id is null' using ws;
  end if;
end $$;
