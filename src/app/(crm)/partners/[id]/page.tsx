"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PriorityChecks } from "@/components/partners/priority-checks";
import { CONTACT_CHANNELS } from "@/lib/playbook";
import { socialUrl, type SocialKind } from "@/lib/social";
import { useStore } from "@/lib/store";

function SocialLink({ kind, value }: { kind: SocialKind; value: string }) {
  const href = socialUrl(kind, value);
  if (!value.trim()) return "—";
  if (!href.startsWith("http")) return <span>{value}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-lutra">
      {value}
    </a>
  );
}

export default function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { partnerById, missionByPartner, startMission, updatePartner, setConsent, state, deletePartner } =
    useStore();
  const partner = partnerById(id);
  const mission = missionByPartner(id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!partner) {
    return <div className="p-10 text-sm text-muted">Nie znaleziono partnera.</div>;
  }

  const owner = partner.contacts.find((c) => c.isDecisionMaker);

  return (
    <div>
      <div className="flex items-center justify-end gap-3 px-8 py-6 text-sm text-muted">
        <span>CRM / Partnerzy / {partner.name}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-xs font-semibold text-navy">
          {state.user.initials}
        </span>
      </div>
      <div className="px-8 pb-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
          Karta partnera
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{partner.name}</h1>
            <p className="mt-2 text-sm text-muted">
              Lokal · {partner.city} · {partner.address} · źródło: {partner.source}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (mission) {
                router.push(`/partners/${partner.id}/mission`);
                return;
              }
              const created = startMission(partner.id);
              if (created) router.push(`/partners/${partner.id}/mission`);
            }}
            disabled={partner.dnc && !mission}
            className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-chip-strong disabled:text-white"
          >
            {mission ? "Otwórz misję" : "Zajmuję się partnerem"}
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  const result = await deletePartner(partner.id);
                  setDeleting(false);
                  if (!result.ok) {
                    setDeleteError(result.error ?? "Nie udało się usunąć.");
                    return;
                  }
                  router.push("/partners");
                }}
                className="rounded-full bg-rose-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Usuwam…" : "Usuń na pewno"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm text-muted">
                Anuluj
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-full border border-rose-200 px-4 py-2.5 text-sm font-medium text-rose-700"
            >
              Usuń
            </button>
          )}
          </div>
        </div>
        {deleteError ? <p className="mt-3 text-sm text-rose-600">{deleteError}</p> : null}

        <div className="mt-6 grid max-w-5xl gap-4 lg:grid-cols-2">
          <section className="rounded-[28px] border border-line bg-white p-6">
            <h2 className="font-semibold">Znane fakty</h2>
            <p className="mt-1 text-xs text-muted">Obserwacje publiczne, nie potrzeby.</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted">Godziny</dt>
                <dd>{partner.hours ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Kategoria</dt>
                <dd>{partner.category || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Subkategoria</dt>
                <dd>{partner.subcategory || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Strona www</dt>
                <dd>
                  {partner.website ? (
                    <a
                      href={/^https?:\/\//i.test(partner.website) ? partner.website : `https://${partner.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-lutra"
                    >
                      {partner.website}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Instagram</dt>
                <dd>
                  <SocialLink kind="instagram" value={partner.instagram} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Facebook</dt>
                <dd>
                  <SocialLink kind="facebook" value={partner.facebook} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Inne social</dt>
                <dd>
                  <SocialLink kind="other" value={partner.socialOther} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Priorytet</dt>
                <dd className="mt-2">
                  <PriorityChecks
                    value={partner.priority}
                    onChange={(next) => updatePartner(partner.id, { priority: next })}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Uzasadnienie priorytetu</dt>
                <dd>{partner.priorityReason || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Notatka</dt>
                <dd>{partner.notes ?? "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[28px] border border-line bg-white p-6">
            <h2 className="font-semibold">Kontakty</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {partner.contacts.map((c) => (
                <li key={c.id}>
                  <p className="font-medium">
                    {c.name} · {c.role}
                    {c.isDecisionMaker ? " · decydent" : ""}
                  </p>
                  <p className="text-muted">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "brak danych"}
                  </p>
                </li>
              ))}
            </ul>
            {owner ? (
              <p className="mt-4 text-xs text-muted">Główny decydent: {owner.name}</p>
            ) : (
              <p className="mt-4 text-xs text-amber-700">Brak oznaczonego decydenta.</p>
            )}
          </section>

          <section className="rounded-[28px] border border-line bg-white p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Zgody i DNC</h2>
                <p className="mt-1 text-xs text-muted">
                  Przed kontaktem CRM sprawdza źródło, zgodę kanału i status „nie kontaktować”.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={partner.dnc}
                  onChange={(e) => updatePartner(partner.id, { dnc: e.target.checked })}
                />
                Nie kontaktować
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CONTACT_CHANNELS.map((channel) => {
                const consent = partner.consents.find(
                  (c) => c.channel === channel.id && c.purpose === "contact",
                );
                return (
                  <label key={channel.id} className="rounded-2xl bg-surface px-4 py-3 text-sm">
                    <span className="block font-medium">{channel.label}</span>
                    <select
                      className="mt-2 w-full rounded-xl border border-chip-mid bg-white px-2 py-1.5 text-xs"
                      value={consent?.status ?? "unknown"}
                      onChange={(e) =>
                        setConsent(
                          partner.id,
                          channel.id,
                          e.target.value as "granted" | "denied" | "unknown",
                        )
                      }
                    >
                      <option value="unknown">nieznana</option>
                      <option value="granted">zgoda</option>
                      <option value="denied">brak zgody</option>
                    </select>
                  </label>
                );
              })}
            </div>
            {partner.dnc ? (
              <p className="mt-4 text-sm text-rose-600">
                Misji nie da się zacząć, dopóki status DNC jest aktywny.
              </p>
            ) : null}
          </section>
        </div>

        {mission ? (
          <p className="mt-6 text-sm">
            <Link href={`/partners/${partner.id}/mission`} className="font-semibold text-lutra">
              Kontynuuj misję →
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
