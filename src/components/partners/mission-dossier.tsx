import type { ReactNode } from "react";
import Link from "next/link";
import {
  CONTACT_CHANNELS,
  MISSION_STATUS_LABEL as MISSION_STATUS,
  NEED_CATEGORIES,
  OBJECTION_KEYS,
  OFFER_VARIANTS,
  RESEARCH_ITEMS,
} from "@/lib/playbook";
import { STAGES, type Mission, type Partner } from "@/lib/types";

const NEED_STATUS: Record<Mission["needs"][number]["status"], string> = {
  fact: "fakt",
  observation: "obserwacja",
  ai_hypothesis: "hipoteza",
};

const CONSENT: Record<string, string> = {
  granted: "zgoda",
  denied: "brak zgody",
  unknown: "nieznana",
  withdrawn: "wycofana",
  pending: "czeka",
};

function text(value?: string | null) {
  const clean = value?.trim();
  return clean ? clean : "—";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-line bg-white p-6">
      <h2 className="font-semibold">{title}</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function MissionDossier({ partner, mission }: { partner: Partner; mission: Mission | undefined }) {
  const stage = STAGES.find((item) => item.id === mission?.currentStage);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Wszystkie dane</h2>
          <p className="mt-1 text-xs text-muted">Etap, oferta, umowa i aktywacja. Cytat i braki do oferty są w rozmowie.</p>
        </div>
        {mission ? (
          <Link href={`/partners/${partner.id}/mission`} className="text-sm font-semibold text-lutra">
            Otwórz misję
          </Link>
        ) : null}
      </div>

      {!mission ? (
        <section className="rounded-[28px] border border-line bg-white p-6 text-sm text-muted">
          Ten partner nie ma jeszcze misji. Dane z rozmowy pojawią się tutaj po „Zajmuję się partnerem”.
        </section>
      ) : (
        <>
          <Block title="Misja">
            <Row label="Etap" value={stage?.label ?? mission.currentStage} />
            <Row label="Status" value={MISSION_STATUS[mission.status] ?? mission.status} />
            <Row
              label="Ukończone kroki"
              value={
                mission.completedStages.length
                  ? mission.completedStages
                      .map((id) => STAGES.find((item) => item.id === id)?.label ?? id)
                      .join(", ")
                  : "—"
              }
            />
            <Row label="Następny krok" value={text(mission.nextStepLabel)} />
            <Row label="Data następnego kroku" value={text(mission.nextStepAt)} />
            <Row
              label="Kanał"
              value={CONTACT_CHANNELS.find((item) => item.id === mission.selectedChannel)?.label ?? "—"}
            />
            <Row label="Notatka z kontaktu" value={text(mission.conversationNote)} />
            <Row label="Zgoda na nagranie" value={CONSENT[mission.recordingConsent] ?? mission.recordingConsent} />
            <div className="sm:col-span-2">
              <dt className="text-muted">Research</dt>
              <dd className="mt-1">
                {RESEARCH_ITEMS.map(
                  (item) => `${item.label}: ${mission.checklist[`research:${item.key}`] ? "tak" : "nie"}`,
                ).join(" · ")}
              </dd>
            </div>
          </Block>

          <section className="rounded-[28px] border border-line bg-white p-6">
            <h2 className="font-semibold">Potrzeby</h2>
            {mission.needs.length ? (
              <ul className="mt-4 space-y-3 text-sm">
                {mission.needs.map((need) => (
                  <li key={need.id}>
                    <p className="font-medium">
                      {need.title || NEED_CATEGORIES.find((item) => item.id === need.category)?.label || "Potrzeba"}
                      {" · "}
                      {NEED_STATUS[need.status]}
                      {need.confirmed ? " · potwierdzone" : ""}
                    </p>
                    <p className="text-muted">{text(need.description)}</p>
                    {need.quote ? <p>Cytat: {need.quote}</p> : null}
                    {need.expectedResult ? <p>Rezultat: {need.expectedResult}</p> : null}
                    {need.constraints ? <p>Ograniczenie: {need.constraints}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Brak potrzeb.</p>
            )}
          </section>

          <Block title="Oferta i decyzja">
            <Row
              label="Wariant"
              value={
                mission.selectedVariant
                  ? `${mission.selectedVariant}. ${OFFER_VARIANTS.find((item) => item.variant === mission.selectedVariant)?.name ?? ""}`
                  : "—"
              }
            />
            <Row label="Oferta zatwierdzona" value={mission.offerApproved ? "tak" : "nie"} />
            <Row label="Wynik" value={mission.outcome ? (MISSION_STATUS[mission.outcome] ?? mission.outcome) : "—"} />
            <Row label="Powód zamknięcia" value={text(mission.lossReason)} />
            {mission.closeNote ? <Row label="Notatka do zamknięcia" value={mission.closeNote} /> : null}
            {mission.closedAt ? (
              <Row label="Zamknięta" value={new Date(mission.closedAt).toLocaleDateString("pl-PL")} />
            ) : null}
          </Block>

          <Block title="Obiekcje">
            <div className="sm:col-span-2">
              <dd>
                {mission.objections.filter((item) => item.checked).length
                  ? mission.objections
                      .filter((item) => item.checked)
                      .map((item) => {
                        const label = OBJECTION_KEYS.find((entry) => entry.key === item.key)?.label ?? item.key;
                        return `${label}${item.argumentWorked ? " · argument zadziałał" : ""}`;
                      })
                      .join(" · ")
                  : "Żadna nie zaznaczona."}
              </dd>
            </div>
          </Block>

          <Block title="Umowa">
            <Row label="Firma" value={text(mission.contract?.companyName)} />
            <Row label="NIP" value={text(mission.contract?.nip)} />
            <Row label="Adres" value={text(mission.contract?.address)} />
            <Row label="Start" value={text(mission.contract?.startAt)} />
            <Row label="Koniec" value={text(mission.contract?.endAt)} />
            <Row label="Zasady zmian" value={text(mission.contract?.changeRules)} />
            <Row label="Plik PDF" value={text(mission.contract?.documentPath?.split("/").pop())} />
            <Row label="Podpis handlowca" value={mission.contract?.signedByHuman ? "tak" : "nie"} />
            <Row
              label="Status"
              value={
                mission.contract?.status === "signed"
                  ? "podpisana"
                  : mission.contract?.status === "ready"
                    ? "gotowa"
                    : mission.contract?.status === "draft"
                      ? "szkic"
                      : "—"
              }
            />
          </Block>

          <Block title="Aktywacja">
            <Row label="Kod partnera" value={text(mission.activation?.partnerCode)} />
            <Row label="Godziny potwierdzone" value={mission.activation?.hoursConfirmed ? "tak" : "nie"} />
            <Row label="Kontakt operacyjny" value={text(mission.activation?.opsContactName)} />
            <Row label="Telefon operacyjny" value={text(mission.activation?.opsContactPhone)} />
            <Row label="Test oferty" value={mission.activation?.testPassed ? "tak" : "nie"} />
            <Row label="Opis testu" value={text(mission.activation?.testNotes)} />
            <Row label="Check-in" value={text(mission.activation?.checkInAt)} />
          </Block>

          {mission.calls.some((call) => call.transcriptText?.trim()) ? (
            <section className="rounded-[28px] border border-line bg-white p-6">
              <h2 className="font-semibold">Transkrypty</h2>
              <ul className="mt-4 space-y-3 text-sm">
                {mission.calls
                  .filter((call) => call.transcriptText?.trim())
                  .map((call) => (
                    <li key={call.id}>
                      <p className="text-muted">
                        {CONTACT_CHANNELS.find((item) => item.id === call.channel)?.label ?? call.channel}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{call.transcriptText}</p>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
