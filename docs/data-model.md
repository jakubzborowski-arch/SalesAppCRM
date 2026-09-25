# Lutra CRM — model danych (Supabase / Postgres)

Zasady:

- enumeracje zamiast wolnego tekstu tam, gdzie da się listę
- każde pole AI ma `status` (fakt / obserwacja / hipoteza) i `confirmed_by`
- nagranie i transkrypt są surowym źródłem; do modelu idą tylko zatwierdzone wiersze
- RLS: handlowiec widzi swoje rekordy; admin widzi workspace

---

## Enums

```sql
partner_segment: venue | company | community
mission_stage: research | contact | discovery | needs | offer | negotiation | contract | activation | care
mission_status: active | won | lost | nurture | no_fit | paused
need_category: acquisition | attendance | off_peak | margin | operations | marketing | wellbeing | integration | budget | risk
need_status: fact | observation | ai_hypothesis
priority: 1..5
channel: phone | email | linkedin | in_person | other
consent_status: granted | denied | unknown | withdrawn
dnc_status: ok | do_not_contact
offer_variant: A | B | C
outcome: won | lost | nurture | no_fit
decision_stage: unaware | interested | evaluating | verbal_yes | contracted | activated
ai_output_type: brief | transcript_extract | summary | needs_map | recap_email | offer_variants | objection_reply | next_step
ai_output_status: draft | approved | edited | rejected
recording_consent: pending | granted | denied
```

---

## Tabele rdzenia

### workspaces
Jeden tenant (firma handlowa Lutry).

- id, name, created_at

### profiles
Powiązanie `auth.users` z workspace.

- id (fk auth.users)
- workspace_id
- full_name, role (`admin` | `seller`)
- is_active

### partners
Firma / lokal / społeczność.

- id, workspace_id
- name, segment
- city, address, category, subcategory
- owner_user_id (handlowiec)
- source (skąd rekord)
- dnc_status
- data_freshness_at
- notes

### partner_contacts
Osoby po stronie partnera.

- id, partner_id
- name, role, is_decision_maker
- phone, email, linkedin
- preferred_channel

### consents
Zgoda per kanał i per cel.

- id, partner_id, contact_id nullable
- channel, purpose (`contact` | `recording` | `ai_analysis` | `marketing`)
- status, source, granted_at, expires_at
- notes

---

## Misja sprzedaży

### missions
Jedna aktywna misja pozyskania na partnera (w pilocie).

- id, workspace_id, partner_id
- owner_user_id
- status, current_stage
- next_step_label, next_step_at
- outcome, loss_reason
- started_at, closed_at

### mission_checklist_items
Stan checklisty per krok (research, umowa, aktywacja, obiekcje).

- id, mission_id
- stage, item_key, label
- is_done, done_at, done_by

### decision_context
Bramka oferty — jedno na misję.

- mission_id unique
- problem
- expected_result
- constraint_summary
- decision_maker_contact_id
- decision_deadline
- previous_attempts
- next_step
- completeness computed (wszystkie pola not null)

Oferta jest zablokowana, dopóki `completeness = false`.

---

## Potrzeby i fakty

### needs
Mapa potrzeb.

- id, mission_id
- category, description, priority
- expected_result, constraints
- quote_id nullable
- status (`fact` | `observation` | `ai_hypothesis`)
- confirmed_by, confirmed_at
- source (`manual` | `transcript` | `public_research`)

### facts
Luźne potwierdzone fakty poza potrzebą (godziny, social, promocje).

- id, partner_id, mission_id nullable
- key, value, source
- status, confirmed_by, updated_at

---

## Rozmowy, głos, transkrypt

### conversations
Każdy kontakt: rozmowa, mail, LinkedIn.

- id, mission_id, contact_id
- channel, direction (`outbound` | `inbound`)
- started_at, ended_at
- recording_consent
- disclosure_shown_at
- summary_human (po korekcie)
- outcome_notes

### recordings
Plik w Supabase Storage.

- id, conversation_id
- storage_path, duration_sec, mime_type
- consent_snapshot jsonb (co zostało powiedziane / zaakceptowane)
- retention_until
- deleted_at

### transcripts
Wynik STT. Surowy, nie idzie do treningu.

- id, recording_id, conversation_id
- provider (`web-speech` | `manual` | opcjonalnie później `whisper` | `deepgram`)
- language, full_text
- segments jsonb (`[{start, end, speaker, text}]`)
- status (`processing` | `ready` | `failed`)

### transcript_quotes
Cytaty wycięte przez AI lub handlowca.

- id, transcript_id, need_id nullable
- text, started_at_ms, ended_at_ms
- confirmed_by nullable

---

## Oferty, obiekcje, umowa, aktywacja

### offer_library
Zatwierdzona biblioteka wariantów. AI wybiera tylko stąd.

- id, segment, variant (`A` | `B` | `C`)
- name, description, default_terms jsonb
- is_active

### offers
Konkretna propozycja w misji.

- id, mission_id, library_id
- variant, custom_terms jsonb
- language, recommended_by (`ai` | `human`)
- approved_by, approved_at
- sent_at, selected_at
- status (`draft` | `approved` | `sent` | `accepted` | `rejected`)

### objection_library
- id, key, label, response, follow_up_question
- is_active

### mission_objections
Obiekcje, które faktycznie padły.

- id, mission_id, conversation_id nullable
- library_id, argument_worked boolean
- notes

### contracts
- id, mission_id, offer_id
- company_data jsonb
- start_at, end_at
- change_rules, signed_by_human
- document_path, signed_at
- status

### activations
- id, mission_id, contract_id
- partner_code
- hours_confirmed, ops_contact_id
- test_passed, check_in_at
- activated_at

### care_reviews
Kwartalne potwierdzenie warunków.

- id, partner_id, mission_id
- reviewed_at, terms_still_valid
- notes, next_review_at

---

## AI i uczenie

### ai_outputs
Każda propozycja modelu, zanim stanie się faktem.

- id, mission_id, conversation_id nullable
- type, status
- input_snapshot jsonb
- output jsonb
- model, prompt_version
- edited_output jsonb
- reviewed_by, reviewed_at

### training_examples
Jedyny zbiór do RAG / przyszłego fine-tuningu.

Wstawiane dopiero po zatwierdzeniu przez handlowca.

- id, mission_id, conversation_id
- segment
- needs_snapshot jsonb
- constraints_snapshot jsonb
- selected_variant
- outcome, loss_reason
- seller_corrections jsonb
- activation_happened boolean
- renewed boolean
- approved_by, approved_at
- excluded boolean

Surowe `transcripts.full_text` i pliki nagrań **nie** są kopiowane tutaj.

### tasks
Następny krok i follow-upy.

- id, workspace_id, mission_id, owner_user_id
- title, due_at, done_at
- source (`human` | `ai_draft`)

### audit_log
- id, workspace_id, actor_id
- entity_type, entity_id
- action, before jsonb, after jsonb
- created_at

---

## Bramki w aplikacji (nie tylko w UI)

1. Kontakt: `dnc_status = ok` oraz consent kanału `granted`
2. Nagranie: `recording_consent = granted` i `disclosure_shown_at` not null
3. Oferta: `decision_context` kompletny oraz min. 1 need ze statusem `fact`
4. Wysyłka oferty / recap / umowy: `ai_outputs.status = approved` i `offers.approved_by` not null
5. Training example: ręczny approve; nigdy automatycznie z raw transcript
