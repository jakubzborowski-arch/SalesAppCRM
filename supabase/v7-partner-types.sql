-- Lutra CRM v7: typ partnera (miejsce / społeczność / firma), pojemność miejsca,
-- szablon porozumienia mailowego. Uruchom po v6. Można odpalać wielokrotnie.

-- ---------------------------------------------------------------------------
-- 1. Typ partnera

do $$
begin
  if not exists (select 1 from pg_type where typname = 'partner_segment') then
    create type public.partner_segment as enum ('venue', 'company', 'community');
  end if;
end $$;

alter table public.partners add column if not exists segment public.partner_segment not null default 'venue';

-- ---------------------------------------------------------------------------
-- 2. Pojemność miejsca (osób) — sprawdzana przed publikacją lokalu

alter table public.partners add column if not exists capacity integer;

-- Kolumna z innej aplikacji mogła być liczbą z ułamkiem (40.00) albo tekstem („ok. 40 osób”, „20-30”).
-- Liczba: zaokrąglamy. Tekst: bierzemy pierwszą liczbę z napisu (nie sklejamy wszystkich cyfr).
do $$
declare
  kind text;
begin
  select data_type into kind
  from information_schema.columns
  where table_schema = 'public' and table_name = 'partners' and column_name = 'capacity';
  if kind in ('numeric', 'real', 'double precision') then
    alter table public.partners
      alter column capacity type integer
      using case when capacity >= 1 and capacity <= 100000 then round(capacity)::integer end;
  elsif kind is not null and kind not in ('integer', 'bigint', 'smallint') then
    alter table public.partners
      alter column capacity type integer
      using nullif(left(substring(capacity::text from '[0-9]+'), 9), '')::integer;
  end if;
end $$;

update public.partners set capacity = null where capacity is not null and (capacity < 1 or capacity > 100000);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partners_capacity_range') then
    alter table public.partners
      add constraint partners_capacity_range check (capacity is null or capacity between 1 and 100000) not valid;
  end if;
end $$;

alter table public.partners validate constraint partners_capacity_range;

-- ---------------------------------------------------------------------------
-- 3. Szablon porozumienia mailowego (krótka współpraca do 3 miesięcy). Zmienia administrator.

alter table public.workspaces add column if not exists agreement_template text;

create or replace function public.set_agreement_template(p_template text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin() then
    raise exception 'Szablon porozumienia zmienia administrator zespołu.' using errcode = '42501';
  end if;
  if length(coalesce(p_template, '')) > 50000 then
    raise exception 'Szablon jest za długi (maks. 50 000 znaków).' using errcode = '22001';
  end if;
  update workspaces set agreement_template = nullif(btrim(p_template), '')
  where id = public.current_workspace_id();
end;
$$;

grant execute on function public.set_agreement_template(text) to authenticated;

notify pgrst, 'reload schema';
