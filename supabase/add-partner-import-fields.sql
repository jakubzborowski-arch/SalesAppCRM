  -- Dopisz kolumny do KAŻDEJ tabeli partners (nie tylko public) i odśwież API.

  do $$
  declare r record;
  begin
    for r in
      select n.nspname, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relname = 'partners'
        and c.relkind in ('r', 'p')
        and n.nspname not in ('pg_catalog', 'information_schema')
    loop
      execute format('alter table %I.%I add column if not exists subcategory text', r.nspname, r.relname);
      execute format('alter table %I.%I add column if not exists website text', r.nspname, r.relname);
      execute format('alter table %I.%I add column if not exists instagram text', r.nspname, r.relname);
      execute format('alter table %I.%I add column if not exists facebook text', r.nspname, r.relname);
      execute format('alter table %I.%I add column if not exists social_other text', r.nspname, r.relname);
      execute format('alter table %I.%I add column if not exists priority text', r.nspname, r.relname);
      execute format('alter table %I.%I add column if not exists priority_reason text', r.nspname, r.relname);
    end loop;

    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relname = 'partner_contacts' and n.nspname = 'public'
    ) then
      alter table public.partner_contacts add column if not exists is_decision_maker boolean not null default false;
    end if;
  end $$;

  notify pgrst, 'reload schema';

  select n.nspname as schema, a.attname as column_name
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where c.relname = 'partners'
    and a.attname in ('subcategory', 'website', 'instagram', 'facebook', 'social_other', 'priority', 'priority_reason')
    and not a.attisdropped
  order by 1, 2;
