# Lutra CRM — plan budowy krok po kroku

Stack: **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase**.
Głos: nagranie **obu stron** (telefon na głośniku + mikrofon CRM; później mostek Twilio) → Storage → transkrypcja → szkice AI → zatwierdzenie → fakty i training examples.

Budujemy w pionowych plasterkach, które da się kliknąć. Nie robimy najpierw „całego backendu”.

Pilot Etapu 1 = **tylko segment lokale**. Firmy i społeczności dostają pola w modelu, ale nie UI.

---

## Zasada pracy

Każdy krok kończy się działającym ekranem albo twardą bramką, nie dokumentem.
Po każdym kroku: seed „Kawiarnia Nova”, żeby flow było widać jak na mockach.

Nie ruszamy Etapu 3 (live copilot), dopóki Etap 2 nie zapisuje zatwierdzonych przykładów.

---

## Faza 0 — fundament (szkielet aplikacji)

**Cel:** puste app + logowanie + layout z mocków.

1. Next.js + Tailwind + shadcn, App Router, TypeScript.
2. Supabase: projekt, Auth (email), tabele `workspaces` + `profiles`, RLS.
3. Layout: sidebar (Pulpit, Partnerzy, Zadania, Oferty, Ustawienia), top bar, karta misji, panel Copilot (na razie statyczny).
4. Seed workspace + użytkownik + partner Kawiarnia Nova.

**Gotowe, gdy:** logowanie działa, widać szkielet CRM, partner istnieje w bazie.

---

## Faza 1 — partnerzy i misja

**Cel:** „Zajmuję się partnerem” otwiera misję ze stepperem.

1. Lista partnerów (segment, miasto, właściciel, etap).
2. Szczegół partnera: fakty, kontakty, zgody, DNC.
3. Przycisk tworzy `missions` ze `current_stage = research`.
4. Stepper 8 kroków; klikanie nie pomija bramek (na razie tylko nawigacja + zapis etapu).
5. Jeden następny krok z datą na misji (`next_step_label`, `next_step_at`).
6. Tryb: handlowiec ma jedną aktywną najpilniejszą misję na pulpicie.

**Gotowe, gdy:** z listy partnera wchodzimy w misję Nova i widzimy 8 kroków.

---

## Faza 2 — Research + zgody (Etap 1 playbook)

**Cel:** krok 1 jak na mockupie + twarda zgoda przed kontaktem.

1. Checklista research (5 punktów), zapis `mission_checklist_items`.
2. Fakty publiczne (`facts`) ze statusem obserwacja — nie jako potrzeba.
3. Hipoteza AI na tym etapie może być ręczna / placeholder.
4. Moduł zgód: źródło danych, zgoda per kanał, DNC.
5. CTA „Dalej: Pierwszy kontakt” zablokowane, jeśli DNC albo brak zgody na choć jeden kanał.

**Gotowe, gdy:** nie da się przejść do kontaktu przy „nie kontaktować”.

---

## Faza 3 — Pierwszy kontakt

**Cel:** wybór kanału, szablon wiadomości, start rozmowy.

1. Karty kanałów: telefon, e-mail, LinkedIn, pokrewne.
2. Szablony wiadomości (jeszcze bez LLM).
3. Utworzenie `conversations`.
4. Disclosure nagrywania (tekst prawny) + zapis zgody / odmowy.
5. Zadania follow-up.

**Gotowe, gdy:** rozmowa istnieje w bazie ze statusem zgody na nagranie.

---

## Faza 4 — Discovery + mapa potrzeb + bramka oferty

**Cel:** serce CRM. Tu siada jakość danych.

1. Formularz discovery: kategoria, priorytet, opis, cytat, decydent, termin, ograniczenia (tagi).
2. Tabela `needs` ze statusem fakt / obserwacja / hipoteza AI.
3. Potwierdzenie handlowca zmienia status na fakt.
4. Mapa potrzeb jako karty z priorytetem.
5. `decision_context` — 7 obowiązkowych pól.
6. Status diagnostyczny: „Fakty potwierdzone” vs „Brakuje pól”.
7. CTA do oferty **disabled**, dopóki bramka nie przejdzie.

**Gotowe, gdy:** bez problemu, rezultatu, ograniczenia, decydenta, terminu, wcześniejszych prób i next step nie ma oferty.

---

## Faza 5 — Biblioteka ofert A/B/C (lokale) + zatwierdzanie

**Cel:** trzy warianty z biblioteki, zero wolnej inwencji.

1. Seed biblioteki lokalowej: A ruch poza szczytem, B grupowa, C pilotaż.
2. Ekran 3 kart + „rekomendacja” na razie regułowa (najwyższy priorytet potrzeby → wariant).
3. Warunki oferty kopiują ograniczenia z discovery (godziny, min. grupa, limity).
4. Handlowiec zatwierdza wariant, język, warunki.
5. Wysyłka oznaczana w CRM (na start: status `sent`, bez prawdziwego maila albo prosty Resend).

**Gotowe, gdy:** oferty nie da się zapisać spoza biblioteki ani bez approve.

---

## Faza 6 — Obiekcje, umowa, aktywacja, opieka

**Cel:** domknięcie misji pilota.

1. Checklista obiekcji z biblioteki; oznaczenie „argument zadziałał”.
2. Umowa: kompletność danych, upload PDF do Storage, podpis = człowiek.
3. Aktywacja: kod partnera, test, kontakt operacyjny, check-in.
4. Wynik misji: wygrana / przegrana / nurture / brak dopasowania + powód.
5. Opieka: `care_reviews` i data kolejnego potwierdzenia warunków.
6. Pulpit KPI: kompletność discovery, lejek, czas do oferty (proste county).

**Gotowe, gdy:** da się przejść Nova od researchu do aktywacji na danych testowych.

---

## Faza 7 — Głos i transkrypcja

**Cel:** rozmowa staje się tekstem w bazie.

1. Recorder w kroku kontaktu / discovery (start/stop, timer, upload).
2. Bucket Storage + tabela `recordings` (retencja, consent snapshot).
3. Darmowy transkrypt: Web Speech API w Chrome/Edge w trakcie nagrania, albo ręczny tekst. Bez OpenAI.
4. Podgląd i korekta transkryptu przy rozmowie.
5. Ręczne wstawienie cytatu do discovery.

**Gotowe, gdy:** po nagraniu testowym widać tekst i timestampy, a przy braku zgody recorder się nie włącza.

---

## Faza 8 — AI po rozmowie (produktowy Etap 2)

**Cel:** Copilot wypełnia szkice, człowiek zatwierdza.

1. Structured extraction: potrzeby, obiekcje, braki, recap, A/B/C, next step.
2. Wszystko jako `ai_outputs` w statusie draft.
3. Ekran recenzji: popraw, potwierdź, odrzuć.
4. Hipotezy nie nadpisują faktów.
5. Rekomendacja oferty wyłącznie z biblioteki + filtr zakazanych obietnic.
6. Po approve: upsert `needs`, `mission_objections`, `offers`, `tasks`.
7. Zapis `training_examples` z korekty (nie z raw transcript).

**Gotowe, gdy:** po transkrypcie handlowiec klika „zatwierdź” i mapa potrzeb się zapełnia, a odrzucenie nic nie wstawia jako fakt.

---

## Faza 9 — Brief przed rozmową + jakość modelu

**Cel:** Copilot na research/kontakt z prawdziwym kontekstem.

1. Brief z faktów + braków + pytań discovery + zakazanych obietnic.
2. Few-shot / RAG z `training_examples` tego segmentu.
3. Metryka korekt AI (draft vs edited).
4. Kwartalne „czy dane aktualne” na partnerze.

**Gotowe, gdy:** przed telefonem widać brief i listę rzeczy, których nie wolno powiedzieć.

---

## Faza 10 — Live copilot (produktowy Etap 3)

**Cel:** 1–2 pytania i odpowiedź z biblioteki w trakcie rozmowy.

1. Streaming STT.
2. Krótki kontekst okna (ostatnie N zdań).
3. Match obiekcji + pytanie pogłębiające.
4. Zero wysyłki, zero rabatów, zero ocen emocji.

Świadomie na końcu. Wymaga stabilnego Etapu 2.

---

## Świadomie poza v1

- Fine-tuning modelu (najpierw zbieramy przykłady)
- Segment firmy i społeczności w UI
- Prawdziwa integracja z produktem Lutra (kody, ruch grup)
- Multi-handlowiec advanced routing
- Aplikacja mobilna
- Automatyczna wysyłka umów z podpisem elektronicznym

---

## Kolejność, w której startujemy w kodzie

Najbliższe sesje:

1. **Faza 0** — repo, Next.js, Supabase, layout
2. **Faza 1** — partnerzy + misja + stepper
3. **Faza 2–4** — research, kontakt, discovery, bramka
4. **Faza 5–6** — oferta, obiekcje, umowa, aktywacja
5. **Faza 7–8** — głos + AI po rozmowie
6. **Faza 9–10** — brief i live, gdy dane uczące już płyną

To jest kolejność „co next”. Nie skaczemy do Whisper, dopóki bramka oferty i mapa potrzeb nie stoją na twardych polach.
