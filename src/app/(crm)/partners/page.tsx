"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { inputClass } from "@/components/ui";
import { PARTNER_PRIORITIES } from "@/lib/partner-priority";
import { useStore } from "@/lib/store";
import { STAGES } from "@/lib/types";

const SEGMENT: Record<string, string> = {
  venue: "Lokal",
  company: "Firma",
  community: "Społeczność",
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export default function PartnersPage() {
  const { state, missionByPartner, deletePartner } = useStore();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [missionFilter, setMissionFilter] = useState<"all" | "open" | "none">("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const priorities = useMemo(() => {
    const extra = state.partners
      .map((p) => p.priority.trim())
      .filter((value) => value && !PARTNER_PRIORITIES.includes(value as (typeof PARTNER_PRIORITIES)[number]));
    return [...PARTNER_PRIORITIES, ...new Set(extra)];
  }, [state.partners]);

  const categories = useMemo(() => {
    const values = [...new Set(state.partners.map((p) => p.category.trim()).filter(Boolean))];
    return values.sort((a, b) => a.localeCompare(b, "pl"));
  }, [state.partners]);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return state.partners.filter((partner) => {
      const mission = missionByPartner(partner.id);
      if (priority !== "all" && fold(partner.priority) !== fold(priority)) return false;
      if (category !== "all" && fold(partner.category) !== fold(category)) return false;
      if (missionFilter === "open" && !mission) return false;
      if (missionFilter === "none" && mission) return false;
      if (!q) return true;
      const hay = [
        partner.name,
        partner.city,
        partner.address,
        partner.category,
        partner.subcategory,
        partner.priority,
        partner.website,
        partner.instagram,
        partner.facebook,
        partner.socialOther,
      ]
        .map(fold)
        .join(" ");
      return hay.includes(q);
    });
  }, [state.partners, query, priority, category, missionFilter, missionByPartner]);

  const remove = async (id: string) => {
    setBusyId(id);
    setError(null);
    const result = await deletePartner(id);
    setBusyId(null);
    setConfirmId(null);
    if (!result.ok) setError(result.error ?? "Nie udało się usunąć.");
  };

  return (
    <div>
      <div className="flex items-center justify-end gap-3 px-8 py-6 text-sm text-muted">
        <span>CRM / Partnerzy</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-xs font-semibold text-navy">
          {state.user.initials}
        </span>
      </div>
      <div className="px-8 pb-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
          Portfolio
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Partnerzy</h1>
            <p className="mt-2 text-sm text-muted">
              {filtered.length === state.partners.length
                ? `${state.partners.length} w workspace`
                : `${filtered.length} z ${state.partners.length}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/partners/import"
              className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-medium text-foreground"
            >
              Import Excel / CSV
            </Link>
            <Link
              href="/partners/new"
              className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white"
            >
              Dodaj partnera
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 rounded-[28px] border border-line bg-white p-4 md:grid-cols-[1fr_160px_160px_160px]">
          <input
            className={inputClass}
            placeholder="Szukaj nazwy, miasta, adresu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="all">Priorytet: wszystkie</option>
            {priorities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Kategoria: wszystkie</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={missionFilter}
            onChange={(e) => setMissionFilter(e.target.value as typeof missionFilter)}
          >
            <option value="all">Misja: wszystkie</option>
            <option value="open">Z misją</option>
            <option value="none">Bez misji</option>
          </select>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-4 overflow-hidden rounded-[28px] border border-line bg-white">
          {state.partners.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted">
              Brak partnerów w workspace. Dodaj pierwszy lokal.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted">Brak partnerów w tym filtrze.</div>
          ) : null}
          {filtered.map((partner) => {
            const mission = missionByPartner(partner.id);
            const stage = STAGES.find((s) => s.id === mission?.currentStage);
            return (
              <div
                key={partner.id}
                className="flex items-center justify-between gap-4 border-b border-line px-6 py-5 last:border-b-0 hover:bg-surface"
              >
                <Link href={`/partners/${partner.id}`} className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{partner.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {SEGMENT[partner.segment]} · {partner.city || partner.address} ·{" "}
                    {[partner.category, partner.subcategory].filter(Boolean).join(" / ")}
                    {partner.priority ? ` · ${partner.priority}` : ""}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  {partner.dnc ? (
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                      Nie kontaktować
                    </span>
                  ) : mission ? (
                    <span className="rounded-full bg-lutra-soft px-3 py-1 text-xs font-medium text-lutra">
                      {stage?.label}
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">
                      Brak misji
                    </span>
                  )}
                  {confirmId === partner.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === partner.id}
                        onClick={() => void remove(partner.id)}
                        className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busyId === partner.id ? "Usuwam…" : "Usuń na pewno"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="text-xs text-muted"
                      >
                        Anuluj
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(partner.id)}
                      className="text-xs font-medium text-rose-700"
                    >
                      Usuń
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
