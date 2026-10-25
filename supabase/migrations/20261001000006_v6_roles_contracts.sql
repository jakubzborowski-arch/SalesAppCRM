-- Lutra CRM v6: kto co edytuje, przekazywanie misji, obieg podpisu umowy, szablon umowy.
-- Uruchom po v2-v3-all.sql, v4-team-timeline.sql i v5-company-data.sql. Można odpalać wielokrotnie.
--
-- Zasada: cały zespół widzi wszystko (tablica, raporty, karty). Misję edytuje jej właściciel
-- albo administrator. Misja bez właściciela albo właściciela spoza zespołu — każdy z zespołu.
-- Partnera edytuje jego właściciel, właściciel którejś z jego misji albo administrator.

-- ---------------------------------------------------------------------------
-- 0. Kolumny, na których opierają się uprawnienia. Baza mogła mieć te tabele już wcześniej
--    (z innej aplikacji) bez nich — „create table if not exists” z v2 ich wtedy nie dodał.

alter table public.partners add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.missions add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.tasks add column if not exists owner_user_id uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists is_active boolean not null default true;

-- Opiekun partnera bez wpisu: ten, kto założył na nim pierwszą misję (inaczej pole zostaje puste,
-- a pusty opiekun = każdy z zespołu może edytować).
update public.partners pa
set owner_user_id = first_owner.owner_user_id
from (
  select distinct on (m.partner_id) m.partner_id, m.owner_user_id
  from public.missions m
  join public.profiles p on p.id = m.owner_user_id
  where m.owner_user_id is not null
  order by m.partner_id, m.started_at
) first_owner
where pa.id = first_owner.partner_id
  and pa.owner_user_id is null
  and exists (select 1 from public.profiles p where p.id = first_owner.owner_user_id and p.workspace_id = pa.workspace_id);

-- ---------------------------------------------------------------------------
-- 1. Funkcje pomocnicze (security definer — bez pętli RLS)

create or replace function public.can_edit_mission(p_mission uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from missions m
    where m.id = p_mission
      and m.workspace_id = public.current_workspace_id()
      and (
        m.owner_user_id is null
        or m.owner_user_id = auth.uid()
        or public.is_workspace_admin()
        or not exists (
          select 1 from profiles p
          where p.id = m.owner_user_id and p.workspace_id = m.workspace_id and p.is_active
        )
      )
  )
$$;

create or replace function public.can_edit_partner(p_partner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from partners pa
    where pa.id = p_partner
      and pa.workspace_id = public.current_workspace_id()
      and (
        pa.owner_user_id is null
        or pa.owner_user_id = auth.uid()
        or public.is_workspace_admin()
        or not exists (
          select 1 from profiles p
          where p.id = pa.owner_user_id and p.workspace_id = pa.workspace_id and p.is_active
        )
        or exists (select 1 from missions m where m.partner_id = pa.id and m.owner_user_id = auth.uid())
      )
  )
$$;

grant execute on function public.can_edit_mission(uuid) to authenticated;
grant execute on function public.can_edit_partner(uuid) to authenticated;

-- Właścicielem misji albo partnera może być tylko osoba z tego samego zespołu.
create or replace function public.guard_owner_in_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is not null
     and (tg_op = 'INSERT' or new.owner_user_id is distinct from old.owner_user_id)
     and not exists (
       select 1 from profiles p
       where p.id = new.owner_user_id and p.workspace_id = new.workspace_id and p.is_active
     ) then
    raise exception 'Właściciel musi być członkiem zespołu.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists missions_owner_guard on missions;
create trigger missions_owner_guard
  before insert or update of owner_user_id on missions
  for each row execute function public.guard_owner_in_workspace();

drop trigger if exists partners_owner_guard on partners;
create trigger partners_owner_guard
  before insert or update of owner_user_id on partners
  for each row execute function public.guard_owner_in_workspace();

-- ---------------------------------------------------------------------------
-- 2. Misje i partnerzy

drop policy if exists "missions_all" on missions;
drop policy if exists "missions_select" on missions;
drop policy if exists "missions_insert" on missions;
drop policy if exists "missions_update" on missions;
drop policy if exists "missions_delete" on missions;
create policy "missions_select" on missions for select
  using (workspace_id = public.current_workspace_id());
create policy "missions_insert" on missions for insert
  with check (
    workspace_id = public.current_workspace_id()
    and (owner_user_id = auth.uid() or public.is_workspace_admin())
  );
create policy "missions_update" on missions for update
  using (public.can_edit_mission(id))
  with check (workspace_id = public.current_workspace_id());
create policy "missions_delete" on missions for delete
  using (public.can_edit_mission(id));

drop policy if exists "partners_all" on partners;
drop policy if exists "partners_select" on partners;
drop policy if exists "partners_insert" on partners;
drop policy if exists "partners_update" on partners;
drop policy if exists "partners_delete" on partners;
create policy "partners_select" on partners for select
  using (workspace_id = public.current_workspace_id());
create policy "partners_insert" on partners for insert
  with check (workspace_id = public.current_workspace_id());
create policy "partners_update" on partners for update
  using (public.can_edit_partner(id))
  with check (workspace_id = public.current_workspace_id());
-- Usunięcie partnera kasuje kaskadowo jego misje — także cudze. Dlatego tylko opiekun albo admin
-- i tylko, gdy nie ma na nim misji, których usuwający nie może edytować.
create policy "partners_delete" on partners for delete
  using (
    workspace_id = public.current_workspace_id()
    and (owner_user_id is null or owner_user_id = auth.uid() or public.is_workspace_admin())
    and not exists (
      select 1 from missions m where m.partner_id = partners.id and not public.can_edit_mission(m.id)
    )
  );

-- Kontakty i zgody idą za partnerem.
drop policy if exists "contacts_all" on partner_contacts;
drop policy if exists "contacts_select" on partner_contacts;
drop policy if exists "contacts_write" on partner_contacts;
create policy "contacts_select" on partner_contacts for select
  using (partner_id in (select id from partners where workspace_id = public.current_workspace_id()));
create policy "contacts_write" on partner_contacts for all
  using (public.can_edit_partner(partner_id))
  with check (public.can_edit_partner(partner_id));

drop policy if exists "consents_all" on consents;
drop policy if exists "consents_select" on consents;
drop policy if exists "consents_write" on consents;
create policy "consents_select" on consents for select
  using (partner_id in (select id from partners where workspace_id = public.current_workspace_id()));
create policy "consents_write" on consents for all
  using (public.can_edit_partner(partner_id))
  with check (public.can_edit_partner(partner_id));

-- ---------------------------------------------------------------------------
-- 3. Tabele misji: czyta zespół, pisze ten, kto może edytować misję

do $$
declare
  t text;
begin
  foreach t in array array[
    'mission_checklist_items', 'decision_context', 'needs', 'offers',
    'mission_objections', 'contracts', 'activations'
  ] loop
    execute format('drop policy if exists %I on %I', replace(t, 'mission_', '') || '_all', t);
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format(
      'create policy %I on %I for select using (mission_id in (select id from missions where workspace_id = public.current_workspace_id()))',
      t || '_select', t
    );
    execute format(
      'create policy %I on %I for all using (public.can_edit_mission(mission_id)) with check (public.can_edit_mission(mission_id))',
      t || '_write', t
    );
  end loop;
end $$;
-- Stare nazwy polityk z v3 (checklist_all, decision_all, mission_objections_all).
drop policy if exists "checklist_all" on mission_checklist_items;
drop policy if exists "decision_all" on decision_context;
drop policy if exists "mission_objections_all" on mission_objections;

drop policy if exists "tasks_all" on tasks;
drop policy if exists "tasks_select" on tasks;
drop policy if exists "tasks_write" on tasks;
create policy "tasks_select" on tasks for select
  using (workspace_id = public.current_workspace_id());
create policy "tasks_write" on tasks for all
  using (
    workspace_id = public.current_workspace_id()
    and (mission_id is null or public.can_edit_mission(mission_id))
  )
  with check (
    workspace_id = public.current_workspace_id()
    and (mission_id is null or public.can_edit_mission(mission_id))
  );

-- Dziennik kontaktów: wpis dodaje ten, kto prowadzi misję (albo admin).
drop policy if exists "conversations_insert" on conversations;
create policy "conversations_insert" on conversations for insert
  with check (public.can_edit_mission(mission_id) and created_by = auth.uid());

drop policy if exists "recordings_all" on recordings;
drop policy if exists "recordings_select" on recordings;
drop policy if exists "recordings_write" on recordings;
create policy "recordings_select" on recordings for select
  using (conversation_id in (
    select c.id from conversations c join missions m on m.id = c.mission_id
    where m.workspace_id = public.current_workspace_id()
  ));
create policy "recordings_write" on recordings for all
  using (conversation_id in (select c.id from conversations c where public.can_edit_mission(c.mission_id)))
  with check (conversation_id in (select c.id from conversations c where public.can_edit_mission(c.mission_id)));

drop policy if exists "transcripts_all" on transcripts;
drop policy if exists "transcripts_select" on transcripts;
drop policy if exists "transcripts_write" on transcripts;
create policy "transcripts_select" on transcripts for select
  using (conversation_id in (
    select c.id from conversations c join missions m on m.id = c.mission_id
    where m.workspace_id = public.current_workspace_id()
  ));
create policy "transcripts_write" on transcripts for all
  using (conversation_id in (select c.id from conversations c where public.can_edit_mission(c.mission_id)))
  with check (conversation_id in (select c.id from conversations c where public.can_edit_mission(c.mission_id)));

-- ---------------------------------------------------------------------------
-- 4. Przekazanie misji innej osobie z zespołu

drop function if exists public.transfer_mission(uuid, uuid);
-- Zwraca nową wersję misji (updated_at), żeby widok nie wziął własnego zapisu za cudzy.
create or replace function public.transfer_mission(p_mission uuid, p_user uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_version timestamptz;
begin
  if not public.can_edit_mission(p_mission) then
    raise exception 'Tę misję może przekazać jej właściciel albo administrator.' using errcode = '42501';
  end if;
  select workspace_id into v_ws from missions where id = p_mission;
  if not exists (select 1 from profiles where id = p_user and workspace_id = v_ws and is_active) then
    raise exception 'Ta osoba nie jest w zespole.' using errcode = '23514';
  end if;
  update missions set owner_user_id = p_user where id = p_mission returning updated_at into v_version;
  update tasks set owner_user_id = p_user where mission_id = p_mission and done_at is null;
  return v_version;
end;
$$;

grant execute on function public.transfer_mission(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Obieg podpisu umowy

alter table public.contracts add column if not exists sent_at timestamptz;
alter table public.contracts add column if not exists partner_signed_at timestamptz;
alter table public.contracts add column if not exists signed_document_path text;

alter table public.contracts drop constraint if exists contracts_status_check;
alter table public.contracts add constraint contracts_status_check
  check (status in ('draft', 'ready', 'sent', 'partner_signed', 'signed'));

-- Podpisany egzemplarz może być skanem albo zdjęciem.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'contracts';

-- Plik umowy należy do zespołu misji także jako podpisany skan.
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
    where p_bucket = 'contracts' and (c.document_path = p_name or c.signed_document_path = p_name)
    union all
    select m.workspace_id
    from recordings r
    join conversations cv on cv.id = r.conversation_id
    join missions m on m.id = cv.mission_id
    where p_bucket = 'recordings' and r.storage_path = p_name
  ) found
  limit 1
$$;

-- Misja, do której należy plik (umowa albo nagranie). Plik niepodpięty: misja z nazwy folderu
-- („<user>/<misja>/<plik>”), jeśli to misja z tego zespołu.
create or replace function public.storage_object_mission(p_bucket text, p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select c.mission_id from contracts c
      where p_bucket = 'contracts' and (c.document_path = p_name or c.signed_document_path = p_name)
      limit 1
    ),
    (
      select cv.mission_id from recordings r join conversations cv on cv.id = r.conversation_id
      where p_bucket = 'recordings' and r.storage_path = p_name
      limit 1
    ),
    (
      select m.id from missions m
      where m.id::text = split_part(p_name, '/', 2)
        and m.workspace_id = public.current_workspace_id()
    )
  )
$$;

revoke all on function public.storage_object_mission(text, text) from public, anon;
grant execute on function public.storage_object_mission(text, text) to authenticated;

-- Pliki kasuje ten, kto może edytować misję (podmiana PDF, sprzątanie, usunięcie partnera).
drop policy if exists "contracts_delete_workspace" on storage.objects;
drop policy if exists "recordings_delete_workspace" on storage.objects;
drop policy if exists "contracts_delete_editor" on storage.objects;
drop policy if exists "recordings_delete_editor" on storage.objects;
-- Usuwanie wymaga też widoczności wiersza: prowadzący widzi pliki swojej misji, także niepodpięte.
drop policy if exists "contracts_select_editor" on storage.objects;
drop policy if exists "recordings_select_editor" on storage.objects;
create policy "contracts_select_editor" on storage.objects for select to authenticated
  using (bucket_id = 'contracts' and public.can_edit_mission(public.storage_object_mission(bucket_id, name)));
create policy "recordings_select_editor" on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and public.can_edit_mission(public.storage_object_mission(bucket_id, name)));
create policy "contracts_delete_editor" on storage.objects for delete to authenticated
  using (bucket_id = 'contracts' and public.can_edit_mission(public.storage_object_mission(bucket_id, name)));
create policy "recordings_delete_editor" on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and public.can_edit_mission(public.storage_object_mission(bucket_id, name)));

-- Umowy podpisane przed v6 miały tylko podpis handlowca — traktujemy je jako podpisane przez obie strony.
update public.contracts
set partner_signed_at = coalesce(signed_at, now())
where status = 'signed' and partner_signed_at is null;

-- ---------------------------------------------------------------------------
-- 6. Szablon umowy zespołu (edytuje administrator)

alter table public.workspaces add column if not exists contract_template text;

create or replace function public.set_contract_template(p_template text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin() then
    raise exception 'Szablon umowy zmienia administrator zespołu.' using errcode = '42501';
  end if;
  if length(coalesce(p_template, '')) > 50000 then
    raise exception 'Szablon jest za długi (maks. 50 000 znaków).' using errcode = '22001';
  end if;
  update workspaces set contract_template = nullif(btrim(p_template), '')
  where id = public.current_workspace_id();
end;
$$;

grant execute on function public.set_contract_template(text) to authenticated;

-- Znacznik wersji: CRM wykrywa, gdy starsza migracja została odpalona po nowszej (trzeba wtedy powtórzyć kolejne).
create table if not exists public.crm_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.crm_migrations enable row level security;
drop policy if exists "crm_migrations_select" on public.crm_migrations;
create policy "crm_migrations_select" on public.crm_migrations for select to authenticated using (true);
grant select on public.crm_migrations to authenticated;
insert into public.crm_migrations (version, applied_at) values ('v6', clock_timestamp())
  on conflict (version) do update set applied_at = excluded.applied_at;

notify pgrst, 'reload schema';
