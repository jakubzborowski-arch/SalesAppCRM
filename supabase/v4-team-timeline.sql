-- Lutra v4: wspólny zespół, dziennik kontaktów, historia etapów misji.
-- Odpal PO supabase/v2-v3-all.sql. Kopiuj CAŁY plik do SQL Editora i Run.
-- Bezpieczne do ponownego odpalenia.
--
-- Co dodaje:
-- 1. Zespół: zaproszenia do workspace (link z jednorazowym kodem), lista członków,
--    administrator workspace. Nowa osoba dołącza do Twojego workspace zamiast
--    dostawać własny, pusty.
-- 2. Dziennik kontaktów: każda rozmowa, mail, wiadomość i spotkanie jako osobny wpis
--    (kierunek, wynik, temat, czas trwania, kto zapisał).
-- 3. Historia misji: każda zmiana etapu i statusu zapisuje się sama (trigger).
-- 4. Pliki umów i nagrań widzi cały zespół misji. Kto odszedł z zespołu, traci do nich dostęp.
-- 5. Wersja misji (updated_at): dwie osoby nie nadpiszą sobie po cichu tej samej misji.

-- ---------------------------------------------------------------------------
-- 1. Zespół
-- ---------------------------------------------------------------------------

-- Pierwsza osoba w każdym workspace zostaje administratorem (jeśli żadnego nie ma).
update profiles p
set role = 'admin'
where p.id in (
  select distinct on (pr.workspace_id) pr.id
  from profiles pr
  left join auth.users u on u.id = pr.id
  order by pr.workspace_id, u.created_at nulls last, pr.id
)
and not exists (
  select 1 from profiles o where o.workspace_id = p.workspace_id and o.role = 'admin'
);

-- Kto zakłada nowy workspace, jest jego administratorem.
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
  if auth.uid() is null then
    raise exception 'Zaloguj się.' using errcode = '42501';
  end if;

  select workspace_id into ws_id from profiles where id = auth.uid();
  if found then
    return ws_id;
  end if;

  display_name := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    split_part(coalesce(auth.jwt() ->> 'email', 'handlowiec'), '@', 1),
    'Handlowiec'
  );

  insert into workspaces (name) values ('Lutra') returning id into ws_id;
  insert into profiles (id, workspace_id, full_name, role)
  values (auth.uid(), ws_id, display_name, 'admin');
  return ws_id;
end;
$$;

grant execute on function public.ensure_workspace() to authenticated;

-- Członkowie widzą swoje profile nawzajem (imię i rola przy wpisach).
drop policy if exists "profiles_select_workspace" on profiles;
create policy "profiles_select_workspace" on profiles for select
  using (workspace_id = public.current_workspace_id());

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  email text,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

-- Tabela zaproszeń jest prywatna. Czytanie i zapis tylko przez funkcje poniżej.
alter table workspace_invites enable row level security;
revoke all on workspace_invites from anon, authenticated;

create or replace function public.is_workspace_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and is_active
  )
$$;

create or replace function public.create_workspace_invite(p_email text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.current_workspace_id();
  clean_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  token text;
begin
  if auth.uid() is null or ws is null then
    raise exception 'Brak workspace dla tego konta.' using errcode = '42501';
  end if;
  if not public.is_workspace_admin() then
    raise exception 'Zaproszenia wysyła administrator workspace.' using errcode = '42501';
  end if;
  if clean_email is not null and clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Niepoprawny adres e-mail.' using errcode = '22023';
  end if;

  -- 2 x UUIDv4 z pg_strong_random = 244 bity losowości. W bazie tylko skrót.
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into workspace_invites (workspace_id, email, token_hash, created_by)
  values (ws, clean_email, encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid());
  return token;
end;
$$;

create or replace function public.accept_workspace_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv workspace_invites%rowtype;
  me uuid := auth.uid();
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  old_ws uuid;
  my_role text;
  others int;
  display_name text;
begin
  if me is null then
    raise exception 'Zaloguj się, żeby dołączyć do zespołu.' using errcode = '42501';
  end if;

  select * into inv
  from workspace_invites
  where token_hash = encode(sha256(convert_to(trim(coalesce(p_token, '')), 'UTF8')), 'hex')
  for update;

  if not found then
    raise exception 'Zaproszenie nie istnieje. Sprawdź, czy link jest cały.' using errcode = 'P0002';
  end if;
  if inv.revoked_at is not null then
    raise exception 'Zaproszenie zostało cofnięte.' using errcode = '22023';
  end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = me then
      return inv.workspace_id;
    end if;
    raise exception 'Zaproszenie zostało już użyte.' using errcode = '22023';
  end if;
  if inv.expires_at < now() then
    raise exception 'Zaproszenie wygasło. Poproś o nowe.' using errcode = '22023';
  end if;
  if inv.email is not null and inv.email <> my_email then
    raise exception 'To zaproszenie jest na inny adres e-mail.' using errcode = '42501';
  end if;

  select workspace_id, role into old_ws, my_role from profiles where id = me for update;
  if found then
    if old_ws is distinct from inv.workspace_id then
      select count(*) into others from profiles where workspace_id = old_ws and id <> me;
      update profiles set workspace_id = inv.workspace_id, role = 'seller' where id = me;
      -- Zaproszenia, które ta osoba wysłała do starego workspace, przestają działać.
      update workspace_invites
      set revoked_at = now()
      where workspace_id = old_ws and created_by = me and accepted_at is null and revoked_at is null;
      if old_ws is not null and others = 0 then
        -- Byłeś sam w starym workspace: Twoje dane idą z Tobą do zespołu.
        update partners set workspace_id = inv.workspace_id where workspace_id = old_ws;
        update missions set workspace_id = inv.workspace_id where workspace_id = old_ws;
        update tasks set workspace_id = inv.workspace_id where workspace_id = old_ws;
      elsif my_role = 'admin'
        and not exists (select 1 from profiles where workspace_id = old_ws and role = 'admin') then
        -- Odchodzi ostatni administrator: rolę przejmuje najdłużej obecna osoba.
        update profiles
        set role = 'admin'
        where id = (
          select p.id
          from profiles p
          left join auth.users u on u.id = p.id
          where p.workspace_id = old_ws
          order by u.created_at nulls last, p.id
          limit 1
        );
      end if;
    end if;
  else
    display_name := coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
      nullif(split_part(my_email, '@', 1), ''),
      'Handlowiec'
    );
    insert into profiles (id, workspace_id, full_name, role)
    values (me, inv.workspace_id, display_name, 'seller');
  end if;

  update workspace_invites set accepted_by = me, accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end;
$$;

-- Podgląd zaproszenia przed dołączeniem: dokąd, od kogo i co się stanie z Twoimi danymi.
create or replace function public.peek_workspace_invite(p_token text)
returns table (
  status text,
  workspace_name text,
  invited_by text,
  invite_email text,
  alone boolean,
  own_partners int,
  own_missions int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inv workspace_invites%rowtype;
  me uuid := auth.uid();
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  my_ws uuid;
begin
  if me is null then
    raise exception 'Zaloguj się, żeby zobaczyć zaproszenie.' using errcode = '42501';
  end if;

  select * into inv
  from workspace_invites
  where token_hash = encode(sha256(convert_to(trim(coalesce(p_token, '')), 'UTF8')), 'hex');
  if not found then
    return query select 'missing'::text, null::text, null::text, null::text, false, 0, 0;
    return;
  end if;

  select workspace_id into my_ws from profiles where id = me;

  return query
  select
    case
      when inv.revoked_at is not null then 'revoked'
      when inv.accepted_at is not null and inv.accepted_by = me then 'accepted'
      when inv.accepted_at is not null then 'used'
      when inv.expires_at < now() then 'expired'
      when my_ws = inv.workspace_id then 'same_workspace'
      when inv.email is not null and inv.email <> my_email then 'email_mismatch'
      else 'ok'
    end,
    w.name,
    p.full_name,
    inv.email,
    (my_ws is not null and not exists (select 1 from profiles o where o.workspace_id = my_ws and o.id <> me)),
    (select count(*)::int from partners where workspace_id = my_ws),
    (select count(*)::int from missions where workspace_id = my_ws)
  from workspaces w
  left join profiles p on p.id = inv.created_by
  where w.id = inv.workspace_id;
end;
$$;

create or replace function public.list_workspace_invites()
returns table (id uuid, email text, created_at timestamptz, expires_at timestamptz, created_by_name text)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.email, i.created_at, i.expires_at, p.full_name
  from workspace_invites i
  left join profiles p on p.id = i.created_by
  where i.workspace_id = public.current_workspace_id()
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc
$$;

create or replace function public.revoke_workspace_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin() then
    raise exception 'Zaproszenia cofa administrator workspace.' using errcode = '42501';
  end if;
  update workspace_invites
  set revoked_at = now()
  where id = p_invite
    and workspace_id = public.current_workspace_id()
    and accepted_at is null
    and revoked_at is null;
end;
$$;

create or replace function public.workspace_members()
returns table (id uuid, full_name text, role text, email text, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role, u.email::text, p.id = auth.uid()
  from profiles p
  left join auth.users u on u.id = p.id
  where p.workspace_id = public.current_workspace_id()
  order by p.role, p.full_name
$$;

-- Odebranie dostępu: osoba dostaje nowy, pusty workspace. Jej dane zostają w zespole.
create or replace function public.remove_workspace_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.current_workspace_id();
  fresh uuid;
begin
  if not public.is_workspace_admin() then
    raise exception 'Członków usuwa administrator workspace.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Nie możesz usunąć samego siebie.' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where id = p_user and workspace_id = ws) then
    raise exception 'Tej osoby nie ma w Twoim workspace.' using errcode = 'P0002';
  end if;
  insert into workspaces (name) values ('Lutra') returning id into fresh;
  update profiles set workspace_id = fresh, role = 'admin' where id = p_user;
end;
$$;

create or replace function public.rename_workspace(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := trim(coalesce(p_name, ''));
begin
  if not public.is_workspace_admin() then
    raise exception 'Nazwę zmienia administrator workspace.' using errcode = '42501';
  end if;
  if length(clean) < 2 or length(clean) > 60 then
    raise exception 'Nazwa musi mieć od 2 do 60 znaków.' using errcode = '22023';
  end if;
  update workspaces set name = clean where id = public.current_workspace_id();
end;
$$;

revoke all on function public.is_workspace_admin() from public, anon;
revoke all on function public.create_workspace_invite(text) from public, anon;
revoke all on function public.accept_workspace_invite(text) from public, anon;
revoke all on function public.peek_workspace_invite(text) from public, anon;
revoke all on function public.list_workspace_invites() from public, anon;
revoke all on function public.revoke_workspace_invite(uuid) from public, anon;
revoke all on function public.workspace_members() from public, anon;
revoke all on function public.remove_workspace_member(uuid) from public, anon;
revoke all on function public.rename_workspace(text) from public, anon;
grant execute on function public.is_workspace_admin() to authenticated;
grant execute on function public.create_workspace_invite(text) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.peek_workspace_invite(text) to authenticated;
grant execute on function public.list_workspace_invites() to authenticated;
grant execute on function public.revoke_workspace_invite(uuid) to authenticated;
grant execute on function public.workspace_members() to authenticated;
grant execute on function public.remove_workspace_member(uuid) to authenticated;
grant execute on function public.rename_workspace(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Dziennik kontaktów (tabela conversations = jeden wpis na kontakt)
-- ---------------------------------------------------------------------------

alter table conversations add column if not exists direction text not null default 'outbound';
alter table conversations add column if not exists outcome text;
alter table conversations add column if not exists subject text;
alter table conversations add column if not exists duration_min int;
alter table conversations add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

do $$ begin
  alter table conversations add constraint conversations_direction_check
    check (direction in ('outbound', 'inbound'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table conversations add constraint conversations_outcome_check
    check (outcome is null or outcome in (
      'connected', 'no_answer', 'callback', 'refused', 'sent', 'replied', 'meeting_booked', 'other'
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table conversations add constraint conversations_duration_check
    check (duration_min is null or duration_min between 0 and 600);
exception when duplicate_object then null; end $$;

create index if not exists conversations_mission_started_idx on conversations (mission_id, started_at desc);

-- Dziennik: cały zespół czyta i dopisuje (zawsze jako on sam). Wpisów się nie edytuje.
-- Usuwa autor albo administrator. Stare wpisy bez autora może usunąć każdy z zespołu.
drop policy if exists "conversations_all" on conversations;
drop policy if exists "conversations_select" on conversations;
drop policy if exists "conversations_insert" on conversations;
drop policy if exists "conversations_update" on conversations;
drop policy if exists "conversations_delete" on conversations;
create policy "conversations_select" on conversations for select
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));
create policy "conversations_insert" on conversations for insert
  with check (
    mission_id in (select id from missions where workspace_id = public.current_workspace_id())
    and created_by = auth.uid()
  );
create policy "conversations_delete" on conversations for delete
  using (
    mission_id in (select id from missions where workspace_id = public.current_workspace_id())
    and (created_by is null or created_by = auth.uid() or public.is_workspace_admin())
  );

-- ---------------------------------------------------------------------------
-- 3. Historia misji (zmiany etapu i statusu) i wersja misji
-- ---------------------------------------------------------------------------

-- Każdy zapis misji zmienia updated_at. CRM zapisuje misję tylko wtedy, gdy wersja w bazie
-- jest ta sama, którą wczytał — inaczej pokazuje, że ktoś z zespołu właśnie ją zmienił.
alter table missions add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists missions_touch_updated_at on missions;
create trigger missions_touch_updated_at
  before update on missions
  for each row execute function public.touch_updated_at();

create table if not exists mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  kind text not null check (kind in ('created', 'stage', 'status')),
  from_value text,
  to_value text,
  note text,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mission_events_mission_idx on mission_events (mission_id, created_at);

alter table mission_events enable row level security;
revoke all on mission_events from anon, authenticated;
grant select on mission_events to authenticated;

drop policy if exists "mission_events_select" on mission_events;
create policy "mission_events_select" on mission_events for select
  using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()));

create or replace function public.log_mission_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into mission_events (mission_id, kind, to_value, actor_id)
    values (new.id, 'created', new.current_stage::text, auth.uid());
    return new;
  end if;
  if new.current_stage is distinct from old.current_stage then
    insert into mission_events (mission_id, kind, from_value, to_value, actor_id)
    values (new.id, 'stage', old.current_stage::text, new.current_stage::text, auth.uid());
  end if;
  if new.status is distinct from old.status then
    insert into mission_events (mission_id, kind, from_value, to_value, note, actor_id)
    values (new.id, 'status', old.status::text, new.status::text, nullif(trim(coalesce(new.loss_reason, '')), ''), auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists missions_log_event on missions;
create trigger missions_log_event
  after insert or update of current_stage, status on missions
  for each row execute function public.log_mission_event();

-- Starsze misje dostają wpis startowy, żeby oś czasu nie była pusta.
insert into mission_events (mission_id, kind, to_value, actor_id, created_at)
select m.id, 'created', m.current_stage::text, m.owner_user_id, m.started_at
from missions m
where not exists (select 1 from mission_events e where e.mission_id = m.id);

-- ---------------------------------------------------------------------------
-- 4. Pliki umów i nagrań: dostęp idzie za misją, nie za osobą, która wgrała plik
-- ---------------------------------------------------------------------------

-- Do którego workspace należy plik: przez misję, która go używa (umowa albo nagranie).
-- NULL = plik jeszcze niepodpięty (np. świeżo wgrany). SECURITY DEFINER, bo polityka
-- musi widzieć powiązanie także wtedy, gdy RLS ukrywa misję przed pytającym.
create or replace function public.storage_object_workspace(p_bucket text, p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ws from (
    select m.workspace_id as ws
    from contracts c
    join missions m on m.id = c.mission_id
    where p_bucket = 'contracts' and c.document_path = p_name
    union all
    select m.workspace_id
    from recordings r
    join conversations cv on cv.id = r.conversation_id
    join missions m on m.id = cv.mission_id
    where p_bucket = 'recordings' and r.storage_path = p_name
  ) found
  limit 1
$$;

revoke all on function public.storage_object_workspace(text, text) from public, anon;
grant execute on function public.storage_object_workspace(text, text) to authenticated;

-- Zespół misji czyta jej umowę i nagrania, niezależnie od tego, kto je wgrał.
drop policy if exists "contracts_select_workspace" on storage.objects;
create policy "contracts_select_workspace" on storage.objects for select to authenticated
  using (
    bucket_id = 'contracts'
    and public.storage_object_workspace(bucket_id, name) = public.current_workspace_id()
  );

drop policy if exists "recordings_select_workspace" on storage.objects;
create policy "recordings_select_workspace" on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and public.storage_object_workspace(bucket_id, name) = public.current_workspace_id()
  );

-- Zespół kasuje pliki swoich misji (np. razem z partnerem albo przy podmianie PDF umowy).
drop policy if exists "contracts_delete_workspace" on storage.objects;
create policy "contracts_delete_workspace" on storage.objects for delete to authenticated
  using (
    bucket_id = 'contracts'
    and public.storage_object_workspace(bucket_id, name) = public.current_workspace_id()
  );

drop policy if exists "recordings_delete_workspace" on storage.objects;
create policy "recordings_delete_workspace" on storage.objects for delete to authenticated
  using (
    bucket_id = 'recordings'
    and public.storage_object_workspace(bucket_id, name) = public.current_workspace_id()
  );

-- Własny folder: plik misji z własnego workspace albo świeżo wgrany (zanim misja go zapisze).
-- Stary, niepodpięty plik (np. po usunięciu misji) i pliki misji z innego workspace — nie.
drop policy if exists "contracts_select_own" on storage.objects;
create policy "contracts_select_own" on storage.objects for select to authenticated
  using (
    bucket_id = 'contracts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(
      public.storage_object_workspace(bucket_id, name) = public.current_workspace_id(),
      objects.created_at > now() - interval '1 day'
    )
  );

drop policy if exists "contracts_update_own" on storage.objects;
create policy "contracts_update_own" on storage.objects for update to authenticated
  using (
    bucket_id = 'contracts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(
      public.storage_object_workspace(bucket_id, name) = public.current_workspace_id(),
      objects.created_at > now() - interval '1 day'
    )
  );

drop policy if exists "recordings_select_own" on storage.objects;
create policy "recordings_select_own" on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(
      public.storage_object_workspace(bucket_id, name) = public.current_workspace_id(),
      objects.created_at > now() - interval '1 day'
    )
  );

drop policy if exists "recordings_delete_own" on storage.objects;
create policy "recordings_delete_own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(
      public.storage_object_workspace(bucket_id, name) = public.current_workspace_id(),
      objects.created_at > now() - interval '1 day'
    )
  );

notify pgrst, 'reload schema';
