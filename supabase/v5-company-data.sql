-- Lutra CRM v5: dane firmy na karcie partnera.
-- Uruchom po v2-v3-all.sql i v4-team-timeline.sql. Skrypt można odpalać wielokrotnie.

alter table public.partners add column if not exists legal_name text;
alter table public.partners add column if not exists nip text;
alter table public.partners add column if not exists regon text;
alter table public.partners add column if not exists legal_address text;
alter table public.partners add column if not exists mailing_address text;
alter table public.partners add column if not exists billing_email text;

-- NIP trzymamy jako 10 cyfr bez kresek. Puste = brak.
update public.partners
set nip = nullif(regexp_replace(nip, '\D', '', 'g'), '')
where nip is not null and nip !~ '^[0-9]{10}$';

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

-- Wyszukiwanie partnera po NIP (kilka lokali jednej spółki może mieć ten sam NIP).
create index if not exists partners_workspace_nip_idx on public.partners (workspace_id, nip) where nip is not null;

notify pgrst, 'reload schema';
