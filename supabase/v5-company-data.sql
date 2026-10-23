-- Lutra CRM v5: dane firmy na karcie partnera.
-- Uruchom po v2-v3-all.sql i v4-team-timeline.sql. Skrypt można odpalać wielokrotnie.

alter table public.partners add column if not exists legal_name text;
alter table public.partners add column if not exists nip text;
alter table public.partners add column if not exists regon text;
alter table public.partners add column if not exists legal_address text;
alter table public.partners add column if not exists mailing_address text;
alter table public.partners add column if not exists billing_email text;

-- Baza mogła mieć już kolumnę nip/regon z innej aplikacji, np. jako liczbę. Ujednolicamy na tekst.
do $$
declare
  col text;
begin
  foreach col in array array['nip', 'regon'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'partners' and column_name = col and data_type <> 'text'
    ) then
      execute format('alter table public.partners alter column %I type text using %I::text', col, col);
    end if;
  end loop;
end $$;

-- NIP i REGON trzymamy jako same cyfry. Wartość, która po oczyszczeniu nie ma właściwej długości,
-- przenosimy do notatki (nic nie ginie), a pole zostaje puste — inaczej każda edycja partnera by padała.
update public.partners
set notes = concat_ws(E'\n', nullif(notes, ''), 'NIP do sprawdzenia: ' || nip),
    nip = null
where nip is not null and regexp_replace(nip, '\D', '', 'g') !~ '^[0-9]{10}$';

update public.partners
set nip = regexp_replace(nip, '\D', '', 'g')
where nip is not null and nip !~ '^[0-9]{10}$';

update public.partners
set notes = concat_ws(E'\n', nullif(notes, ''), 'REGON do sprawdzenia: ' || regon),
    regon = null
where regon is not null and regexp_replace(regon, '\D', '', 'g') !~ '^([0-9]{9}|[0-9]{14})$';

update public.partners
set regon = regexp_replace(regon, '\D', '', 'g')
where regon is not null and regon !~ '^([0-9]{9}|[0-9]{14})$';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partners_nip_format') then
    alter table public.partners
      add constraint partners_nip_format check (nip is null or nip ~ '^[0-9]{10}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partners_regon_format') then
    alter table public.partners
      add constraint partners_regon_format check (regon is null or regon ~ '^([0-9]{9}|[0-9]{14})$') not valid;
  end if;
end $$;

-- Dane są już oczyszczone, więc sprawdzamy też istniejące wiersze.
alter table public.partners validate constraint partners_nip_format;
alter table public.partners validate constraint partners_regon_format;

-- Wyszukiwanie partnera po NIP (kilka lokali jednej spółki może mieć ten sam NIP).
create index if not exists partners_workspace_nip_idx on public.partners (workspace_id, nip) where nip is not null;

notify pgrst, 'reload schema';
