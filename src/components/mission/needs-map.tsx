"use client";

import { useState } from "react";
import { categoryLabel, NEED_CATEGORIES, offerName, PRIORITIES, suggestVariant } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { Mission, Need, NeedCategory, NeedStatus, Partner } from "@/lib/types";
import { inputClass, Pills, Section } from "@/components/ui";

export const NEED_STATUSES: { id: NeedStatus; label: string; hint: string }[] = [
  { id: "fact", label: "Fakt", hint: "Partner to powiedział — najlepiej z cytatem." },
  { id: "observation", label: "Obserwacja", hint: "Twoje spostrzeżenie z researchu albo wizyty." },
  { id: "ai_hypothesis", label: "Hipoteza", hint: "Przypuszczenie do sprawdzenia w rozmowie." },
];

const smallInput =
  "w-full rounded-xl border border-chip-mid bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-blue";

function NeedRow({ mission, need }: { mission: Mission; need: Need }) {
  const { upsertNeed, removeNeed } = useStore();
  const [open, setOpen] = useState(false);
  const save = (patch: Partial<Need>) => upsertNeed(mission.id, { ...need, ...patch });
  const setStatus = (status: NeedStatus) => save({ status, confirmed: status === "fact" });

  return (
    <li
      className={cn(
        "rounded-2xl border px-4 py-3",
        need.status === "fact" && need.confirmed ? "border-emerald-100 bg-emerald-50/50" : "border-line bg-white",
      )}
    >
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px_160px]">
        <input
          className={smallInput}
          value={need.title}
          placeholder="Krótko: czego partner potrzebuje"
          onChange={(e) => save({ title: e.target.value })}
          aria-label="Potrzeba"
        />
        <select
          className={smallInput}
          value={need.category}
          onChange={(e) => save({ category: e.target.value as NeedCategory })}
          aria-label="Kategoria"
        >
          {NEED_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <select
          className={smallInput}
          value={need.priority ?? ""}
          onChange={(e) => save({ priority: e.target.value ? Number(e.target.value) : null })}
          aria-label="Priorytet"
        >
          <option value="">Priorytet —</option>
          {PRIORITIES.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Pills
          size="sm"
          value={need.status}
          onChange={setStatus}
          options={NEED_STATUSES.map((status) => ({ id: status.id, label: status.label, hint: status.hint }))}
        />
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-lutra">
            {open ? "Zwiń" : need.quote ? "Cytat i szczegóły" : "Dodaj cytat"}
          </button>
          <button
            type="button"
            onClick={() => removeNeed(mission.id, need.id)}
            className="text-xs font-semibold text-muted hover:text-rose-700"
          >
            Usuń
          </button>
        </div>
      </div>
      {open ? (
        <div className="mt-3 grid gap-2">
          <textarea
            className={`${smallInput} min-h-[60px]`}
            placeholder="Cytat partnera (słowo w słowo)"
            value={need.quote ?? ""}
            onChange={(e) => save({ quote: e.target.value || undefined })}
          />
          <input
            className={smallInput}
            placeholder="Oczekiwany rezultat dla tej potrzeby"
            value={need.expectedResult ?? ""}
            onChange={(e) => save({ expectedResult: e.target.value || undefined })}
          />
          <input
            className={smallInput}
            placeholder="Ograniczenia (np. bez weekendów)"
            value={need.constraints ?? ""}
            onChange={(e) => save({ constraints: e.target.value || undefined })}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Mapa potrzeb: kilka potrzeb z kategorią, priorytetem i statusem (fakt / obserwacja / hipoteza).
 * Rekomendacja wariantu liczy się z potwierdzonych faktów.
 */
export function NeedsMap({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { upsertNeed } = useStore();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<NeedCategory | "">("");
  const [status, setStatus] = useState<NeedStatus>("observation");
  const [error, setError] = useState<string | null>(null);
  const facts = mission.needs.filter((need) => need.status === "fact" && need.confirmed);
  const recommended = suggestVariant(
    facts.map((need) => need.category),
    partner.segment,
  );
  const sorted = [...mission.needs].sort(
    (a, b) =>
      Number(b.status === "fact" && b.confirmed) - Number(a.status === "fact" && a.confirmed) ||
      (b.priority ?? 0) - (a.priority ?? 0),
  );

  const add = () => {
    if (!title.trim()) {
      setError("Wpisz, czego partner potrzebuje.");
      return;
    }
    if (!category) {
      setError("Wybierz kategorię.");
      return;
    }
    upsertNeed(mission.id, {
      id: crypto.randomUUID(),
      category,
      title: title.trim(),
      description: title.trim(),
      priority: null,
      status,
      confirmed: status === "fact",
    });
    setTitle("");
    setCategory("");
    setStatus("observation");
    setError(null);
  };

  return (
    <Section
      title="Mapa potrzeb"
      hint="Fakt — partner to powiedział. Obserwacja — Twoje spostrzeżenie. Hipoteza — do sprawdzenia. Oferta wymaga co najmniej jednego faktu."
      aside={
        facts.length ? (
          <span className="rounded-full bg-lutra-soft px-3 py-1 text-[11px] font-semibold text-lutra">
            Rekomendacja: {recommended} · {offerName(recommended, partner.segment)}
          </span>
        ) : null
      }
    >
      {sorted.length ? (
        <ul className="space-y-2">
          {sorted.map((need) => (
            <NeedRow key={need.id} mission={mission} need={need} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted">
          Jeszcze pusto. Zapisz fakt z rozmowy przyciskiem „Potwierdź jako fakt” albo dodaj potrzebę poniżej.
        </p>
      )}

      <div className="mt-3 rounded-2xl border border-dashed border-chip-strong px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">Dodaj potrzebę</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr]">
          <input
            className={inputClass}
            placeholder="np. pusto we wtorki po 17:00"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <select
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as NeedCategory | "")}
            aria-label="Kategoria nowej potrzeby"
          >
            <option value="">Kategoria…</option>
            {NEED_CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Pills
            size="sm"
            value={status}
            onChange={setStatus}
            options={NEED_STATUSES.map((item) => ({ id: item.id, label: item.label, hint: item.hint }))}
          />
          <button type="button" onClick={add} className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white">
            Dodaj
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      </div>
      {facts.length ? (
        <p className="mt-2 text-xs text-muted">
          Fakty: {facts.map((need) => categoryLabel(need.category)).join(", ")}.
        </p>
      ) : null}
    </Section>
  );
}
