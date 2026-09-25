-- Dokończenie po udanym v2/v3: brakujące kolumny, bucketu, odświeżenie API.
-- Table Editor już widzi tabele; PostgREST czasem trzyma stary cache.

alter table public.partners add column if not exists subcategory text;
alter table public.needs add column if not exists title text;
alter table public.activations add column if not exists test_notes text;
alter table public.missions add column if not exists details jsonb default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('recordings', 'recordings', false, 52428800, array['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/mpeg']),
  ('contracts', 'contracts', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
