-- Subkategoria partnera. Wklej w SQL Editor i Run.
-- Bezpieczne do ponownego odpalenia.

alter table partners
  add column if not exists subcategory text;
