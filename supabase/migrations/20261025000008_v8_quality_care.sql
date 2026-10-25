-- v8: jakość danych z AI, opieka nad partnerem, wynik dopasowania, limity AI w bazie, zapis misji w jednej transakcji.
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
-- Limity są stałe w bazie (30 odczytów rozmów i 60 szkiców na godzinę) — parametry od klienta są ignorowane,
-- żeby nikt nie podbił sobie limitu ani nie zapchał tabeli.
create or replace function public.take_ai_quota(p_kind text, p_limit integer default null, p_window_seconds integer default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  max_calls integer := case p_kind when 'extract' then 30 when 'draft' then 60 end;
  used integer;
begin
  if uid is null then
    return false;
  end if;
  if max_calls is null then
    raise exception 'Nieprawidłowy limit AI.';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_quota:' || uid::text || ':' || p_kind));
  delete from ai_usage where user_id = uid and created_at < now() - interval '2 days';
  select count(*) into used from ai_usage
    where user_id = uid and kind = p_kind and created_at > now() - interval '1 hour';
  if used >= max_calls then
    return false;
  end if;
  insert into ai_usage (user_id, kind) values (uid, p_kind);
  return true;
end $$;

revoke all on function public.take_ai_quota(text, integer, integer) from public, anon;
grant execute on function public.take_ai_quota(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Zapis misji w jednej transakcji: wiersz misji (ze sprawdzeniem wersji) i tabele misji
--    razem albo wcale. Bez tej funkcji CRM zapisuje po staremu, tabela po tabeli.
--
-- p_expected_version: wersja misji (updated_at), na której opiera się zapis; null = nowa misja.
--   Inna wersja w bazie, brak prawa edycji albo istniejąca misja przy null → błąd 'mission_conflict'.
-- p_mission: kolumny misji (bez id i updated_at).
-- p_ops: lista operacji po kolei, tylko na tabelach misji:
--   {"table": "...", "op": "upsert" | "insert" | "update" | "delete",
--    "rows": [...]            (upsert/insert; każdy wiersz z mission_id tej misji, zadania także z jej workspace_id)
--    "set": {...}, "ids": [...] (update — tylko wiersze tej misji; delete — tylko "ids")
--    "refs": {"offer_id": "offers"}  (kolumna = id oferty/umowy tej misji, odczytane w trakcie zapisu)
--    "optional": ["test_notes"]      (kolumny, których może nie być w starszej bazie — wtedy pomijane)
--    "key": "next_step", "single": true}  (zwróć zapisane wiersze pod tym kluczem; single = dokładnie jeden)
-- Zwraca {"version": nowa wersja misji, "returned": {klucz: [wiersze]}}.
-- security invoker: obowiązują te same polityki RLS co przy zapisie wprost.

create or replace function public.save_mission_bundle(
  p_mission_id uuid,
  p_expected_version timestamptz,
  p_mission jsonb,
  p_ops jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ws uuid;
  v_version timestamptz;
  v_op jsonb;
  v_table text;
  v_kind text;
  v_key text;
  v_rows jsonb;
  v_set jsonb;
  v_ids uuid[];
  v_all text[];
  v_cols text[];
  v_optional text[];
  v_unknown text;
  v_conflict text[];
  v_update text;
  v_where text;
  v_ref record;
  v_ref_id uuid;
  v_out jsonb;
  v_count bigint;
  v_returned jsonb := '{}'::jsonb;
begin
  if p_mission_id is null or jsonb_typeof(p_mission) is distinct from 'object'
     or jsonb_typeof(coalesce(p_ops, '[]'::jsonb)) <> 'array' then
    raise exception 'Nieprawidłowe dane zapisu misji.' using errcode = '22023';
  end if;

  -- (a) Wiersz misji. Warunek wersji w tym samym zapisie co reszta: nikt nie wejdzie w połowę.
  v_all := array(
    select attname::text from pg_attribute
    where attrelid = 'public.missions'::regclass and attnum > 0 and not attisdropped
  );
  v_cols := array(select k from jsonb_object_keys(p_mission) k where k not in ('id', 'updated_at') order by k);
  select c into v_unknown from unnest(v_cols) c where c <> all (v_all) limit 1;
  if v_unknown is not null then
    raise exception 'column "%" of relation "missions" does not exist', v_unknown using errcode = '42703';
  end if;
  if cardinality(v_cols) = 0 then
    raise exception 'Nieprawidłowe dane zapisu misji.' using errcode = '22023';
  end if;

  if p_expected_version is not null then
    execute format(
      'update public.missions m set %s from jsonb_populate_record(null::public.missions, $1) r
       where m.id = $2 and m.updated_at = $3 returning m.workspace_id',
      (select string_agg(format('%I = r.%I', c, c), ', ') from unnest(v_cols) c)
    ) into v_ws using p_mission, p_mission_id, p_expected_version;
  else
    -- Nieznana wersja = misja, której jeszcze nie ma. Istniejącej nie nadpisujemy w ciemno.
    execute format(
      'insert into public.missions (id, %1$s) select $2, %2$s from jsonb_populate_record(null::public.missions, $1) r
       on conflict (id) do nothing returning workspace_id',
      (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
      (select string_agg(format('r.%I', c), ', ') from unnest(v_cols) c)
    ) into v_ws using p_mission, p_mission_id;
  end if;
  if v_ws is null then
    raise exception using errcode = 'P0001', message = 'mission_conflict';
  end if;

  -- (b) Tabele misji, po kolei. Każdy błąd przerywa całość (także zmianę wiersza misji).
  for v_op in select value from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    v_table := v_op ->> 'table';
    v_kind := v_op ->> 'op';
    v_key := v_op ->> 'key';
    v_conflict := case v_table
      when 'decision_context' then array['mission_id']
      when 'needs' then array['id']
      when 'mission_checklist_items' then array['mission_id', 'stage', 'item_key']
      when 'mission_objections' then array['mission_id', 'library_key']
      when 'offers' then array['mission_id']
      when 'contracts' then array['mission_id']
      when 'activations' then array['mission_id']
      when 'tasks' then array['id']
    end;
    if v_conflict is null then
      raise exception 'Tabela % nie należy do zapisu misji.', coalesce(v_table, '?') using errcode = '42501';
    end if;
    v_all := array(
      select attname::text from pg_attribute
      where attrelid = format('public.%I', v_table)::regclass and attnum > 0 and not attisdropped
    );
    v_optional := array(select jsonb_array_elements_text(coalesce(v_op -> 'optional', '[]'::jsonb)));
    -- Zadania: tylko w zespole misji.
    v_where := format('t.mission_id = %L', p_mission_id)
      || case when v_table = 'tasks' then format(' and t.workspace_id = %L', v_ws) else '' end;

    if v_kind in ('upsert', 'insert') then
      v_rows := v_op -> 'rows';
      if jsonb_typeof(v_rows) is distinct from 'array' then
        raise exception 'Nieprawidłowe wiersze dla %.', v_table using errcode = '22023';
      end if;
      continue when jsonb_array_length(v_rows) = 0;
      for v_ref in select key, value #>> '{}' as tab from jsonb_each(coalesce(v_op -> 'refs', '{}'::jsonb)) loop
        if v_ref.tab is null or v_ref.tab not in ('offers', 'contracts') then
          raise exception 'Nieprawidłowe odwołanie w zapisie misji.' using errcode = '22023';
        end if;
        execute format('select id from public.%I where mission_id = $1', v_ref.tab) into v_ref_id using p_mission_id;
        v_rows := (select jsonb_agg(r || jsonb_build_object(v_ref.key, v_ref_id)) from jsonb_array_elements(v_rows) r);
      end loop;
      if exists (
        select 1 from jsonb_array_elements(v_rows) r
        where jsonb_typeof(r) <> 'object'
          or (r ->> 'mission_id')::uuid is distinct from p_mission_id
          or (v_table = 'tasks' and (r ->> 'workspace_id')::uuid is distinct from v_ws)
      ) then
        raise exception 'Wiersz % nie należy do tej misji.', v_table using errcode = '42501';
      end if;
      v_cols := array(
        select distinct k from jsonb_array_elements(v_rows) r, jsonb_object_keys(r) k order by k
      );
      select c into v_unknown from unnest(v_cols) c where c <> all (v_all) and c <> all (v_optional) limit 1;
      if v_unknown is not null then
        raise exception 'column "%" of relation "%" does not exist', v_unknown, v_table using errcode = '42703';
      end if;
      v_cols := array(select c from unnest(v_cols) c where c = any (v_all));
      if v_kind = 'upsert' and not (v_conflict <@ v_cols) then
        raise exception 'Brak klucza wiersza dla %.', v_table using errcode = '22023';
      end if;
      v_update := (
        select string_agg(format('%I = excluded.%I', c, c), ', ')
        from unnest(v_cols) c where c <> all (v_conflict) and c <> 'id'
      );
      execute format(
        'with w as (insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) %3$s returning t.*)
         select coalesce(jsonb_agg(to_jsonb(w)), ''[]''::jsonb), count(*) from w',
        v_table,
        (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
        case when v_kind = 'upsert' then
          format(
            'on conflict (%s) do update set %s where %s',
            (select string_agg(format('%I', c), ', ') from unnest(v_conflict) c),
            coalesce(v_update, 'mission_id = excluded.mission_id'),
            v_where
          )
        else '' end
      ) into v_out, v_count using v_rows;
      -- Wiersz o tym kluczu istnieje, ale w innej misji: nie przepinamy go po cichu.
      if v_count <> jsonb_array_length(v_rows) then
        raise exception 'Wiersz % należy do innej misji.', v_table using errcode = '42501';
      end if;

    elsif v_kind in ('update', 'delete') then
      if not ('id' = any (v_all)) or jsonb_typeof(v_op -> 'ids') is distinct from 'array' then
        raise exception 'Nieprawidłowa operacja % na %.', v_kind, v_table using errcode = '22023';
      end if;
      v_ids := array(select jsonb_array_elements_text(v_op -> 'ids'))::uuid[];
      continue when cardinality(v_ids) = 0;
      if v_kind = 'update' then
        v_set := v_op -> 'set';
        if jsonb_typeof(v_set) is distinct from 'object' or v_set ?| array['id', 'mission_id', 'workspace_id'] then
          raise exception 'Nieprawidłowa zmiana dla %.', v_table using errcode = '22023';
        end if;
        v_cols := array(select k from jsonb_object_keys(v_set) k order by k);
        select c into v_unknown from unnest(v_cols) c where c <> all (v_all) and c <> all (v_optional) limit 1;
        if v_unknown is not null then
          raise exception 'column "%" of relation "%" does not exist', v_unknown, v_table using errcode = '42703';
        end if;
        v_cols := array(select c from unnest(v_cols) c where c = any (v_all));
        continue when cardinality(v_cols) = 0;
        execute format(
          'with w as (update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r
             where t.id = any ($2) and %s returning t.*)
           select coalesce(jsonb_agg(to_jsonb(w)), ''[]''::jsonb), count(*) from w',
          v_table,
          (select string_agg(format('%I = r.%I', c, c), ', ') from unnest(v_cols) c),
          v_table,
          v_where
        ) into v_out, v_count using v_set, v_ids;
      else
        execute format(
          'with w as (delete from public.%I t where t.id = any ($1) and %s returning t.*)
           select coalesce(jsonb_agg(to_jsonb(w)), ''[]''::jsonb), count(*) from w',
          v_table,
          v_where
        ) into v_out, v_count using v_ids;
      end if;
    else
      raise exception 'Nieznana operacja zapisu misji: %.', coalesce(v_kind, '?') using errcode = '22023';
    end if;

    if coalesce((v_op ->> 'single')::boolean, false) and v_count <> 1 then
      raise exception 'Oczekiwano jednego wiersza % (jest %).', v_table, v_count using errcode = 'P0002';
    end if;
    if v_key is not null then
      v_returned := v_returned || jsonb_build_object(v_key, coalesce(v_returned -> v_key, '[]'::jsonb) || v_out);
    end if;
  end loop;

  -- (c) Wersja po zapisie (trigger misji ustawił updated_at).
  select updated_at into v_version from public.missions where id = p_mission_id;
  return jsonb_build_object('version', v_version, 'returned', v_returned);
end $$;

revoke all on function public.save_mission_bundle(uuid, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.save_mission_bundle(uuid, timestamptz, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rejestracja tylko z zaproszenia (Supabase Auth Hook „Before User Created”)
-- Włącz w Supabase: Authentication → Hooks → Before User Created → Postgres → public.crm_before_user_created.
-- Przechodzi: pierwsze konto w pustym projekcie (administrator) albo konto z ważnym linkiem zaproszenia
-- (CRM wysyła kod w user_metadata.invite_token; e-mail musi się zgadzać, jeśli zaproszenie ma adres).

create or replace function public.crm_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  token text := trim(coalesce(event -> 'user' -> 'user_metadata' ->> 'invite_token', ''));
  mail text := lower(trim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if not exists (select 1 from public.profiles) then
    return '{}'::jsonb;
  end if;
  if token <> '' and exists (
    select 1 from public.workspace_invites i
    where i.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
      and i.revoked_at is null
      and i.accepted_at is null
      and i.expires_at > now()
      and (i.email is null or lower(i.email) = mail)
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error',
    jsonb_build_object('http_code', 403, 'message', 'Konto w tym CRM zakłada się z linku zaproszenia do zespołu.')
  );
end $$;

revoke all on function public.crm_before_user_created(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.crm_before_user_created(jsonb) to supabase_auth_admin';
  end if;
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
insert into public.crm_migrations (version, applied_at) values ('v8', clock_timestamp())
  on conflict (version) do update set applied_at = excluded.applied_at;

notify pgrst, 'reload schema';
