"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { ConsentStatus } from "@/lib/types";

export default function NewPartnerPage() {
  const router = useRouter();
  const { addPartner, state } = useStore();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    city: "",
    address: "",
    category: "kawiarnia",
    subcategory: "",
    website: "",
    priority: "",
    priorityReason: "",
    source: "ręczne dodanie",
    hours: "",
    notes: "",
    contactName: "",
    contactRole: "właściciel / menedżer",
    contactPhone: "",
    contactEmail: "",
    phoneConsent: "unknown" as ConsentStatus,
    emailConsent: "unknown" as ConsentStatus,
  });

  const set = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Nazwa lokalu jest wymagana.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await addPartner(form);
    setPending(false);
    if (!result.ok || !result.id) {
      setError(result.error ?? "Nie udało się zapisać partnera.");
      return;
    }
    router.push(`/partners/${result.id}`);
  };

  return (
    <div>
      <div className="flex items-center justify-end px-8 py-6 text-sm text-muted">
        CRM / Partnerzy / Nowy · {state.user.initials}
      </div>
      <form onSubmit={submit} className="max-w-3xl px-8 pb-12">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
          Nowy lokal
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dodaj partnera</h1>
        <p className="mt-2 text-sm text-muted">
          Zapisze się w Supabase. Publiczne fakty to obserwacje, nie potwierdzone potrzeby.
        </p>

        <div className="mt-6 space-y-4 rounded-[28px] border border-line bg-white p-6">
          <Field label="Nazwa">
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Miasto">
              <input className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Adres">
              <input className={inputClass} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Kategoria">
              <input className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value)} />
            </Field>
            <Field label="Subkategoria">
              <input className={inputClass} value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} />
            </Field>
            <Field label="Strona www">
              <input className={inputClass} value={form.website} onChange={(e) => set("website", e.target.value)} />
            </Field>
            <Field label="Priorytet">
              <input className={inputClass} value={form.priority} onChange={(e) => set("priority", e.target.value)} />
            </Field>
          </div>
          <Field label="Uzasadnienie priorytetu">
            <textarea
              className={inputClass}
              rows={2}
              value={form.priorityReason}
              onChange={(e) => set("priorityReason", e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Źródło danych">
              <input className={inputClass} value={form.source} onChange={(e) => set("source", e.target.value)} />
            </Field>
            <Field label="Godziny">
              <input className={inputClass} value={form.hours} onChange={(e) => set("hours", e.target.value)} />
            </Field>
          </div>
          <Field label="Notatka (obserwacja)">
            <textarea
              className={inputClass}
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 space-y-4 rounded-[28px] border border-line bg-white p-6">
          <h2 className="font-semibold">Osoba kontaktowa</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Imię i nazwisko">
              <input
                className={inputClass}
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
            </Field>
            <Field label="Rola">
              <input
                className={inputClass}
                value={form.contactRole}
                onChange={(e) => set("contactRole", e.target.value)}
              />
            </Field>
            <Field label="Telefon">
              <input
                className={inputClass}
                value={form.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </Field>
            <Field label="E-mail">
              <input
                className={inputClass}
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </Field>
            <Field label="Zgoda na telefon">
              <select
                className={inputClass}
                value={form.phoneConsent}
                onChange={(e) => set("phoneConsent", e.target.value)}
              >
                <option value="unknown">nieznana</option>
                <option value="granted">zgoda</option>
                <option value="denied">brak zgody</option>
              </select>
            </Field>
            <Field label="Zgoda na e-mail">
              <select
                className={inputClass}
                value={form.emailConsent}
                onChange={(e) => set("emailConsent", e.target.value)}
              >
                <option value="unknown">nieznana</option>
                <option value="granted">zgoda</option>
                <option value="denied">brak zgody</option>
              </select>
            </Field>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Zapisuję…" : "Zapisz partnera"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/partners")}
            className="rounded-full px-5 py-2.5 text-sm text-muted"
          >
            Anuluj
          </button>
        </div>
      </form>
    </div>
  );
}
