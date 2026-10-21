"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityLog } from "@/components/mission/activity-log";
import { CompanyCard } from "@/components/partners/company-card";
import { MissionDossier } from "@/components/partners/mission-dossier";
import { ContactForm, PartnerBasicsForm } from "@/components/partners/partner-edit";
import { PriorityChecks } from "@/components/partners/priority-checks";
import { CONTACT_CHANNELS } from "@/lib/playbook";
import { socialUrl, type SocialKind } from "@/lib/social";
import { useStore } from "@/lib/store";

function SocialLink({ kind, value }: { kind: SocialKind; value: string }) {
  const href = socialUrl(kind, value);
  if (!value.trim()) return <span className="font-semibold text-foreground">—</span>;
  if (!href.startsWith("http")) return <span className="font-semibold text-foreground">{value}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-lutra">
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
  const {
    partnerById,
    missionByPartner,
    latestMissionByPartner,
    missionsOfPartner,
    startMission,
    updatePartner,
    setConsent,
    state,
    deletePartner,
    canEditPartner,
    canEditMission,
    memberName,
  } = useStore();
  const partner = partnerById(id);
  const mission = missionByPartner(id);
  const latest = latestMissionByPartner(id);
  const missions = missionsOfPartner(id);
  const [logOpen, setLogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingBasics, setEditingBasics] = useState(false);
  const [editingContact, setEditingContact] = useState<string | "new" | null>(null);

  if (!partner) {
    return <div className="p-10 text-sm text-muted">Nie znaleziono partnera.</div>;
  }

  const owner = partner.contacts.find((c) => c.isDecisionMaker);
  const editable = canEditPartner(partner);

  return (
    <div>
      <div className="flex items-center justify-end gap-3 px-8 py-6 text-sm text-muted">
        <span>CRM / Partnerzy / {partner.name}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-xs font-semibold text-navy">
          {state.user.initials}
        </span>
      </div>
      <div className="px-8 pb-10">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-navy">
              Karta partnera
            </p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight text-navy">{partner.name}</h1>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {[partner.category, partner.city, partner.address, partner.source ? `źródło: ${partner.source}` : ""]
                .filter(Boolean)
                .join(" · ") || "Lokal"}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-navy">
              Partner
              <select
                className="mt-1 block rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground"
                value={partner.id}
                onChange={(event) => router.push(`/partners/${event.target.value}`)}
              >
                {[...state.partners]
                  .sort((a, b) => a.name.localeCompare(b.name, "pl"))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.category ? ` · ${item.category}` : ""}
                    </option>
                  ))}
              </select>
            </label>
          <button
            type="button"
            onClick={() => {
              if (mission || latest) {
                router.push(`/partners/${partner.id}/mission`);
                return;
              }
              const created = startMission(partner.id);
              if (created) router.push(`/partners/${partner.id}/mission`);
            }}
            disabled={partner.dnc && !mission && !latest}
            className="rounded-full bg-lutra px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-chip-strong disabled:text-white"
          >
            {mission ? "Otwórz misję" : latest ? "Ostatnia misja" : "Zajmuję się partnerem"}
          </button>
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              {missions.length ? (
                <span className="text-xs text-rose-700">
                  Usunie też {missions.length === 1 ? "misję" : `${missions.length} misje`}, dziennik kontaktów i
                  dane umowy.
                </span>
              ) : null}
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
                className="rounded-full bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
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
              className="rounded-full border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700"
            >
              Usuń
            </button>
          )}
          </div>
        </div>
        {deleteError ? <p className="mt-3 text-sm text-rose-600">{deleteError}</p> : null}
        {editable ? null : (
          <p className="mt-3 rounded-2xl bg-chip px-4 py-2 text-sm text-navy">
            Tylko podgląd — kartę edytuje {memberName(partner.ownerUserId) || "opiekun partnera"} albo administrator.
          </p>
        )}

        <div className="mt-6 grid items-start gap-4 lg:grid-cols-12">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(9,12,155,0.05)] lg:col-span-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy">Znane fakty</h2>
                <p className="mt-1 text-xs font-medium text-muted">Obserwacje publiczne, nie potrzeby.</p>
              </div>
              {editable && !editingBasics ? (
                <button
                  type="button"
                  onClick={() => setEditingBasics(true)}
                  className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-lutra"
                >
                  Edytuj
                </button>
              ) : null}
            </div>
            {editingBasics ? (
              <PartnerBasicsForm partner={partner} onDone={() => setEditingBasics(false)} />
            ) : (
            <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Godziny</dt>
                <dd className="mt-0.5 font-semibold text-foreground">{partner.hours ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Kategoria</dt>
                <dd className="mt-0.5 font-semibold text-foreground">{partner.category || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Subkategoria</dt>
                <dd className="mt-0.5 font-semibold text-foreground">{partner.subcategory || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Strona www</dt>
                <dd>
                  {partner.website ? (
                    <a
                      href={/^https?:\/\//i.test(partner.website) ? partner.website : `https://${partner.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-lutra"
                    >
                      {partner.website}
                    </a>
                  ) : (
                    <span className="font-semibold text-foreground">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Instagram</dt>
                <dd>
                  <SocialLink kind="instagram" value={partner.instagram} />
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Facebook</dt>
                <dd>
                  <SocialLink kind="facebook" value={partner.facebook} />
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Inne social</dt>
                <dd>
                  <SocialLink kind="other" value={partner.socialOther} />
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Priorytet</dt>
                <dd className="mt-2">
                  <fieldset disabled={!editable}>
                    <PriorityChecks
                      value={partner.priority}
                      onChange={(next) => updatePartner(partner.id, { priority: next })}
                    />
                  </fieldset>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Uzasadnienie priorytetu</dt>
                <dd className="mt-0.5 font-semibold text-foreground">{partner.priorityReason || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Notatka</dt>
                <dd className="mt-0.5 font-semibold text-foreground">{partner.notes || "—"}</dd>
              </div>
            </dl>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(9,12,155,0.05)] lg:col-span-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-navy">Kontakty</h2>
              {editable && editingContact === null ? (
                <button
                  type="button"
                  onClick={() => setEditingContact("new")}
                  className="text-xs font-semibold text-lutra"
                >
                  + Dodaj osobę
                </button>
              ) : null}
            </div>
            {editingContact === "new" ? (
              <ContactForm partner={partner} onDone={() => setEditingContact(null)} />
            ) : null}
            <ul className="mt-4 space-y-3 text-sm">
              {partner.contacts.map((c) =>
                editingContact === c.id ? (
                  <li key={c.id}>
                    <ContactForm partner={partner} contact={c} onDone={() => setEditingContact(null)} />
                  </li>
                ) : (
                  <li key={c.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-foreground">
                        {c.name}
                        {c.role ? ` · ${c.role}` : ""}
                        {c.isDecisionMaker ? " · decydent" : ""}
                      </p>
                      <p className="font-medium text-muted">
                        {[c.phone, c.email, c.linkedin].filter(Boolean).join(" · ") || "brak danych"}
                      </p>
                    </div>
                    {editable && editingContact === null ? (
                      <button
                        type="button"
                        onClick={() => setEditingContact(c.id)}
                        className="shrink-0 text-xs font-semibold text-lutra"
                      >
                        Edytuj
                      </button>
                    ) : null}
                  </li>
                ),
              )}
            </ul>
            {owner ? (
              <p className="mt-4 text-xs text-muted">Główny decydent: {owner.name}</p>
            ) : (
              <p className="mt-4 text-xs text-amber-700">Brak oznaczonego decydenta.</p>
            )}
          </section>

          <CompanyCard key={partner.id} partner={partner} />

          <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(9,12,155,0.05)] lg:col-span-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy">Zgody i DNC</h2>
                <p className="mt-1 text-xs text-muted">
                  Przed kontaktem CRM sprawdza źródło, zgodę kanału i status „nie kontaktować”.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={partner.dnc}
                  onChange={(e) => updatePartner(partner.id, { dnc: e.target.checked })}
                />
                Nie kontaktować
              </label>
            </div>
            <fieldset disabled={!editable} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            </fieldset>
            {partner.dnc ? (
              <p className="mt-4 text-sm text-rose-600">
                Misji nie da się zacząć, dopóki status DNC jest aktywny.
              </p>
            ) : null}
          </section>
        </div>

        {missions.length ? (
          <div className="mt-6">
            <ActivityLog
              partner={partner}
              missions={missions}
              activeMission={mission && canEditMission(mission) ? mission : undefined}
              formOpen={logOpen}
              onFormOpenChange={setLogOpen}
              title="Historia kontaktów"
            />
          </div>
        ) : null}

        <MissionDossier partner={partner} mission={mission ?? latest} />
      </div>
    </div>
  );
}
