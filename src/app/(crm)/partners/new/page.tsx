"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PriorityChecks } from "@/components/partners/priority-checks";
import { Field, inputClass, NumberInput, Pills } from "@/components/ui";
import Link from "next/link";
import { isValidNip } from "@/lib/company";
import { findDuplicates } from "@/lib/duplicates";
import { CATEGORIES_BY_SEGMENT, lowerFirst, SEGMENTS } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import type { ConsentStatus, PartnerSegment } from "@/lib/types";

const NAME_LABEL: Record<PartnerSegment, { label: string; placeholder: string }> = {
  venue: { label: "Nazwa lokalu", placeholder: "np. Kawiarnia Nova" },
  community: { label: "Nazwa społeczności", placeholder: "np. Klub Planszówkowy Pionek" },
  company: { label: "Nazwa firmy", placeholder: "np. Softwarehouse X" },
};
const CONTACT_ROLE: Record<PartnerSegment, string> = {
  venue: "właściciel / menedżer",
  community: "organizator",
  company: "HR / lider zespołu",
};

export default function NewPartnerPage() {
  const router = useRouter();
  const { addPartner, state, schemaV7 } = useStore();
  const [segment, setSegment] = useState<PartnerSegment>("venue");
  const [capacity, setCapacity] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    city: "",
    address: "",
    category: "kawiarnia",
    subcategory: "",
    website: "",
    instagram: "",
    facebook: "",
    socialOther: "",
    priority: "",
    priorityReason: "",
    source: "ręczne dodanie",
    hours: "",
    notes: "",
    legalName: "",
    nip: "",
    contactName: "",
    contactRole: "właściciel / menedżer",
    contactPhone: "",
    contactEmail: "",
    phoneConsent: "unknown" as ConsentStatus,
    emailConsent: "unknown" as ConsentStatus,
  });

  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const set = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setConfirmDuplicate(false);
  };
  const changeSegment = (next: PartnerSegment) => {
    setSegment(next);
    setForm((prev) => ({
      ...prev,
      category: CATEGORIES_BY_SEGMENT[next][0],
      // Domyślną rolę kontaktu podmieniamy tylko, jeśli nikt jej nie zmieniał.
      contactRole: Object.values(CONTACT_ROLE).includes(prev.contactRole) ? CONTACT_ROLE[next] : prev.contactRole,
    }));
  };
  const segmentInfo = SEGMENTS.find((item) => item.id === segment);

  const duplicates = useMemo(
    () =>
      form.name.trim().length >= 2
        ? findDuplicates(
            {
              name: form.name,
              city: form.city,
              nip: form.nip,
              phones: [form.contactPhone],
              emails: [form.contactEmail],
            },
            state.partners,
          )
        : [],
    [form.name, form.city, form.nip, form.contactPhone, form.contactEmail, state.partners],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Wystarczy nazwa — resztę uzupełnisz na karcie i w researchu.");
      return;
    }
    if (form.nip.trim() && !isValidNip(form.nip)) {
      setError("NIP jest niepoprawny — popraw albo zostaw puste i uzupełnij na karcie partnera.");
      return;
    }
    if (duplicates.length && !confirmDuplicate) {
      setConfirmDuplicate(true);
      setError("Ten partner chyba już jest w CRM. Sprawdź listę powyżej albo kliknij „Dodaj mimo to”.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await addPartner({ ...form, segment, capacity: segment === "venue" ? capacity : null });
    setPending(false);
    if (!result.ok || !result.id) {
      setError(result.error ?? "Nie udało się zapisać partnera.");
      return;
    }
    router.push(`/partners/${result.id}`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end px-4 py-4 text-sm text-muted sm:px-6 lg:px-8 lg:py-6">
        CRM / Partnerzy / Nowy · {state.user.initials}
      </div>
      <form onSubmit={submit} className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
              Nowy partner
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dodaj partnera</h1>
            <p className="mt-2 text-sm text-muted">
              Wybierz typ partnera i wpisz nazwę — to wystarczy na start. Miasto i kategoria pomagają na liście.
              Kontakt, godziny i zgody uzupełnisz przy researchu — nie zgaduj zgody przy dodawaniu.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/partners")}
              className="rounded-full px-5 py-2.5 text-sm text-muted"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Zapisuję…" : confirmDuplicate ? "Dodaj mimo to" : "Zapisz partnera"}
            </button>
          </div>
        </div>
        {duplicates.length ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            <p className="font-semibold">Podobny partner już jest w CRM:</p>
            <ul className="mt-2 space-y-1">
              {duplicates.map(({ partner, reasons }) => (
                <li key={partner.id}>
                  <Link href={`/partners/${partner.id}`} className="font-semibold text-lutra">
                    {partner.name}
                  </Link>
                  {partner.city ? ` · ${partner.city}` : ""} — {reasons.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[28px] border border-line bg-white p-4 sm:p-6">
            <h2 className="font-semibold">Partner</h2>
            <p className="mt-1 text-xs text-muted">To, czego potrzebujesz, żeby karta w ogóle powstała.</p>
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">Typ partnera</p>
              <Pills
                value={segment}
                onChange={changeSegment}
                options={SEGMENTS.map((item) => ({ id: item.id, label: item.label, hint: item.who }))}
              />
              {segmentInfo ? (
                <p className="mt-2 text-xs leading-5 text-muted">
                  {segmentInfo.who}. Oczekujemy: {lowerFirst(segmentInfo.expects)}.
                </p>
              ) : null}
              {schemaV7 === false && segment !== "venue" ? (
                <p className="mt-1 text-xs text-amber-700">
                  Typ zapisze się w bazie po migracji v7 (pasek u góry strony). Bez niej partner trafi jako miejsce.
                </p>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={NAME_LABEL[segment].label}>
                  <input
                    className={inputClass}
                    autoFocus
                    required
                    placeholder={NAME_LABEL[segment].placeholder}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Miasto" optional>
                <input
                  className={inputClass}
                  placeholder="np. Kraków"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
              <Field label="Kategoria" optional>
                <select
                  className={inputClass}
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                >
                  {CATEGORIES_BY_SEGMENT[segment].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Adres" optional>
                  <input
                    className={inputClass}
                    placeholder="ulica, numer — jeśli już znasz"
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                </Field>
              </div>
              {segment === "venue" ? (
                <Field label="Pojemność" optional>
                  <NumberInput
                    value={capacity}
                    min={1}
                    max={100000}
                    suffix="osób"
                    placeholder="ile osób zmieści"
                    onChange={(next) => setCapacity(next === null ? null : Math.max(1, Math.round(next)))}
                  />
                </Field>
              ) : null}
              <div className="sm:col-span-2">
                <Field label="Priorytet" optional>
                  <PriorityChecks value={form.priority} onChange={(next) => set("priority", next)} />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-line bg-white p-4 sm:p-6">
            <h2 className="font-semibold">Kontakt</h2>
            <p className="mt-1 text-xs text-muted">
              Nie blokuje zapisu. Zgody zostają „nieznane”, aż potwierdzisz je na karcie partnera.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Imię i nazwisko" optional>
                <input
                  className={inputClass}
                  placeholder={CONTACT_ROLE[segment]}
                  value={form.contactName}
                  onChange={(e) => set("contactName", e.target.value)}
                />
              </Field>
              <Field label="Telefon" optional>
                <input
                  className={inputClass}
                  inputMode="tel"
                  placeholder="+48 …"
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="E-mail" optional>
                  <input
                    className={inputClass}
                    type="email"
                    placeholder="jeśli jest publiczny"
                    value={form.contactEmail}
                    onChange={(e) => set("contactEmail", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-[28px] border border-line bg-white p-4 sm:p-6">
          <h2 className="font-semibold">Social media</h2>
          <p className="mt-1 text-xs text-muted">
            Opcjonalne. Handle albo link — nie zgoda na kontakt. LinkedIn i reszta idą do „Inne”.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Instagram" optional>
              <input
                className={inputClass}
                placeholder="@kawiarnianova"
                value={form.instagram}
                onChange={(e) => set("instagram", e.target.value)}
              />
            </Field>
            <Field label="Facebook" optional>
              <input
                className={inputClass}
                placeholder="facebook.com/…"
                value={form.facebook}
                onChange={(e) => set("facebook", e.target.value)}
              />
            </Field>
            <Field label="Inne" optional>
              <input
                className={inputClass}
                placeholder="LinkedIn, TikTok, mapa…"
                value={form.socialOther}
                onChange={(e) => set("socialOther", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <details className="mt-5 rounded-[28px] border border-line bg-white p-4 sm:p-6 open:pb-6">
          <summary className="cursor-pointer list-none font-semibold outline-none">
            Więcej szczegółów
            <span className="ml-2 text-xs font-normal text-muted">
              www, godziny, dane firmy, notatka — research, nie warunek zapisu
            </span>
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Strona www" optional>
              <input
                className={inputClass}
                placeholder="lutra-app.com"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
              />
            </Field>
            <Field label="Subkategoria" optional>
              <input
                className={inputClass}
                placeholder="np. specialty coffee"
                value={form.subcategory}
                onChange={(e) => set("subcategory", e.target.value)}
              />
            </Field>
            <Field label="Nazwa firmy (z rejestru)" optional>
              <input
                className={inputClass}
                placeholder="np. Nova Kawiarnie sp. z o.o."
                value={form.legalName}
                onChange={(e) => set("legalName", e.target.value)}
              />
            </Field>
            <Field label="NIP" optional>
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="123-456-78-90"
                value={form.nip}
                onChange={(e) => set("nip", e.target.value)}
              />
              {form.nip.trim() && !isValidNip(form.nip) ? (
                <span className="mt-1 block text-xs text-amber-700">Sprawdź cyfry NIP.</span>
              ) : null}
            </Field>
            <Field label="Godziny" optional>
              <input
                className={inputClass}
                placeholder="np. Pn–Sb do 21:00"
                value={form.hours}
                onChange={(e) => set("hours", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Uzasadnienie priorytetu" optional>
                <textarea
                  className={inputClass}
                  rows={2}
                  placeholder="Dlaczego ten lokal teraz — nie ocena AI"
                  value={form.priorityReason}
                  onChange={(e) => set("priorityReason", e.target.value)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notatka z researchu" optional>
                <textarea
                  className={inputClass}
                  rows={2}
                  placeholder="Obserwacja publiczna, nie potwierdzona potrzeba"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </details>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      </form>
    </div>
  );
}
