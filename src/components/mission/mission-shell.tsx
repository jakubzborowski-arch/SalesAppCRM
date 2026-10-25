"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityLog } from "@/components/mission/activity-log";
import { CarePanel } from "@/components/mission/care-panel";
import { CloseMissionPanel } from "@/components/mission/close-mission";
import { FollowUpBar } from "@/components/mission/follow-up-bar";
import { MissionPanel } from "@/components/mission/mission-panel";
import { TransferMission } from "@/components/mission/transfer-mission";
import { DraftBubble } from "@/components/mission/draft-bubble";
import { TalkBubble } from "@/components/mission/talk-bubble";
import { MissionStepper } from "@/components/mission/stepper";
import { ActivationStep } from "@/components/mission/steps/activation-step";
import { ContactStep } from "@/components/mission/steps/contact-step";
import { ContractStep } from "@/components/mission/steps/contract-step";
import { DiscoveryStep } from "@/components/mission/steps/discovery-step";
import { NeedsStep } from "@/components/mission/steps/needs-step";
import { NegotiationStep } from "@/components/mission/steps/negotiation-step";
import { OfferStep } from "@/components/mission/steps/offer-step";
import { SkillSmokeBar } from "@/components/mission/skill-smoke-bar";
import { ResearchStep } from "@/components/mission/steps/research-step";
import { STAGES, type Mission, type Partner, type StageId } from "@/lib/types";
import { MISSION_STATUS_LABEL, segmentLabel, STAGE_BADGE, STAGE_CTA, stageLabel } from "@/lib/playbook";
import { canEnterStage, nextStage } from "@/lib/gates";
import { careMissionOf } from "@/lib/care";
import { useStore } from "@/lib/store";

function formatDate(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("pl-PL");
}

/** Partner bez misji w toku: ostatnia zamknięta misja z opcją wznowienia albo start nowej. */
function NoActiveMission({ partner, latest }: { partner: Partner; latest?: Mission }) {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const missions = store.missionsOfPartner(partner.id);
  // Aktywny partner (najnowsza wygrana misja) — opieka i dziennik kontaktów dalej działają,
  // także gdy późniejsza próba odnowienia skończyła się bez porozumienia.
  const won = careMissionOf(store.state.missions, partner.id);
  const canLog = Boolean(won && store.canEditMission(won));
  const closedAfterCare = latest && won && latest.id !== won.id ? latest : undefined;

  const start = () => {
    const id = store.startMission(partner.id);
    if (!id) setError("Nie można otworzyć misji — sprawdź status „nie kontaktować”.");
  };

  return (
    <div className="px-4 py-6 sm:p-6 lg:p-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
        {won ? "Partner aktywny" : "Misja pozyskania partnera"}
      </p>
      <h1 className="mt-1 break-words text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px] sm:leading-none">{partner.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {segmentLabel(partner.segment)}
        {partner.city ? ` · ${partner.city}` : ""}
      </p>

      {won ? <CarePanel mission={won} partner={partner} /> : null}

      {won ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={start}
            disabled={partner.dnc}
            className="rounded-full border border-lutra px-5 py-2.5 text-sm font-medium text-lutra disabled:opacity-40"
          >
            Nowa misja (odnowienie, nowa oferta)
          </button>
          <span className="text-xs text-muted">Nowa misja przy zmianie warunków albo po końcu okresu.</span>
          {closedAfterCare ? (
            <span className="w-full text-xs text-muted">
              Ostatnia próba odnowienia: {MISSION_STATUS_LABEL[closedAfterCare.status].toLowerCase()}
              {closedAfterCare.lossReason ? ` (${closedAfterCare.lossReason})` : ""}
              {closedAfterCare.closedAt ? ` · ${formatDate(closedAfterCare.closedAt)}` : ""}.
            </span>
          ) : null}
        </div>
      ) : latest ? (
        <section className="mt-6 max-w-3xl rounded-[28px] border border-line bg-white p-4 sm:p-6">
          <p className="text-sm font-semibold text-foreground">
            Ostatnia misja: {MISSION_STATUS_LABEL[latest.status]}
            {latest.closedAt ? ` · zamknięta ${formatDate(latest.closedAt)}` : ""}
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Etap, na którym stanęła</dt>
              <dd>{stageLabel(latest.currentStage)}</dd>
            </div>
            <div>
              <dt className="text-muted">Powód</dt>
              <dd>{latest.lossReason || "—"}</dd>
            </div>
            {latest.closeNote ? (
              <div className="sm:col-span-2">
                <dt className="text-muted">Notatka</dt>
                <dd className="whitespace-pre-wrap">{latest.closeNote}</dd>
              </div>
            ) : null}
            {latest.nextStepAt && (latest.status === "nurture" || latest.status === "paused") ? (
              <div>
                <dt className="text-muted">Wracamy</dt>
                <dd>{formatDate(latest.nextStepAt)}</dd>
              </div>
            ) : null}
          </dl>
          <FollowUpBar mission={latest} />
          <div className="mt-5 flex flex-wrap gap-2">
            {latest.status !== "won" ? (
              <button
                type="button"
                onClick={() => {
                  const result = store.reopenMission(latest.id);
                  setError(result.ok ? null : (result.reason ?? "Nie udało się wznowić."));
                }}
                className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white"
              >
                Wznów tę misję
              </button>
            ) : null}
            <button
              type="button"
              onClick={start}
              disabled={partner.dnc}
              className="rounded-full border border-lutra px-5 py-2.5 text-sm font-medium text-lutra disabled:opacity-40"
            >
              {latest.status === "won" ? "Nowa misja (odnowienie, nowa oferta)" : "Zacznij od nowa"}
            </button>
          </div>
        </section>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-muted">Ten partner nie ma jeszcze misji.</p>
          <button
            type="button"
            onClick={start}
            className="mt-4 rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white"
          >
            Zajmuję się partnerem
          </button>
        </div>
      )}
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      {missions.length ? (
        <div className="mt-6 max-w-5xl">
          <ActivityLog
            partner={partner}
            missions={missions}
            activeMission={canLog ? won : undefined}
            formOpen={logOpen}
            onFormOpenChange={setLogOpen}
            title={won ? "Dziennik kontaktów" : "Historia kontaktów"}
          />
        </div>
      ) : null}
    </div>
  );
}

export function MissionShell({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const store = useStore();
  const partner = store.partnerById(partnerId);
  const mission = store.missionByPartner(partnerId);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ missionId: string; stage: StageId } | null>(null);
  const [closing, setClosing] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);

  if (!partner) {
    return <div className="p-10 text-sm text-muted">Nie znaleziono partnera.</div>;
  }

  if (!mission) {
    return <NoActiveMission partner={partner} latest={store.latestMissionByPartner(partner.id)} />;
  }

  const current = mission.currentStage;
  const viewStage = view && view.missionId === mission.id && view.stage !== current ? view.stage : null;
  const stage = viewStage ?? current;
  const viewing = viewStage !== null;
  const stageIndex = STAGES.findIndex((s) => s.id === stage);
  const currentIndex = STAGES.findIndex((s) => s.id === current);
  const owner = partner.contacts.find((c) => c.isDecisionMaker);
  // Kroki oglądamy na kopii misji z podmienionym etapem, żeby podpowiedzi pasowały do kroku.
  const shown: typeof mission = viewing ? { ...mission, currentStage: stage } : mission;
  // Cudza misja (z v6): podgląd bez edycji. Prowadzi właściciel albo administrator.
  const editable = store.canEditMission(mission);
  // Odnowienie: obecna (wygrana) współpraca dalej wymaga opieki.
  const care = careMissionOf(store.state.missions, partner.id);

  const show = (id: StageId) => {
    setError(null);
    setView(id === current ? null : { missionId: mission.id, stage: id });
  };

  const onSelectStage = (id: StageId) => {
    const index = STAGES.findIndex((s) => s.id === id);
    if (id === current) {
      show(id);
      return;
    }
    // Wcześniejsze albo już ukończone kroki tylko podglądamy — postęp misji się nie cofa.
    if (index < currentIndex || mission.completedStages.includes(id)) {
      show(id);
      return;
    }
    if (!editable) {
      setError("Tylko podgląd — dalej misję prowadzi jej właściciel.");
      return;
    }
    if (index === currentIndex + 1) {
      const result = store.advance(mission.id);
      setError(result.ok ? null : (result.reason ?? "Bramka blokuje przejście."));
      if (result.ok) setView(null);
      return;
    }
    setError("Najpierw domknij poprzedni krok.");
  };

  const onBack = () => {
    const prev = STAGES[stageIndex - 1];
    if (!prev) {
      router.push(`/partners/${partner.id}`);
      return;
    }
    show(prev.id);
  };

  const onNext = () => {
    if (viewing) {
      setView(null);
      setError(null);
      return;
    }
    if (stage === "activation") {
      const result = store.completeActivation(mission.id);
      if (!result.ok) {
        setError(result.reason ?? "Nie można zakończyć aktywacji.");
        return;
      }
      router.push("/pulpit");
      return;
    }
    const nxt = nextStage(stage);
    if (!nxt) return;
    const gate = canEnterStage(nxt, mission, partner);
    if (!gate.ok) {
      setError(gate.reason ?? "Bramka blokuje przejście.");
      return;
    }
    const result = store.advance(mission.id);
    setError(result.ok ? null : result.reason ?? null);
  };

  const moveMissionHere = () => {
    if (!viewStage) return;
    const result = store.goToStage(mission.id, viewStage);
    if (!result.ok) {
      setError(result.reason ?? "Nie można przenieść misji na ten krok.");
      return;
    }
    setView(null);
    setError(null);
  };

  const openLog = () => {
    setLogOpen(true);
    window.setTimeout(() => document.getElementById("dziennik")?.scrollIntoView({ behavior: "smooth" }), 0);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-end px-4 pb-2 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <div className="flex min-w-0 items-center gap-3 text-sm text-muted">
          <span className="min-w-0 break-words text-right">CRM / Partnerzy / {partner.name}</span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-xs font-semibold text-navy">
            {store.state.user.initials}
          </span>
        </div>
      </header>

      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
              Misja pozyskania partnera
            </p>
            <h1 className="mt-1 break-words text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px] sm:leading-none">
              {partner.name}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {segmentLabel(partner.segment)} · {partner.city || "—"} · decydent: {owner?.name ?? "—"}
              {mission.ownerUserId && store.state.team.length > 1
                ? ` · prowadzi: ${store.memberName(mission.ownerUserId)}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editable ? <TransferMission mission={mission} /> : null}
            {editable ? (
            <>
            <button
              type="button"
              onClick={openLog}
              className="min-h-10 rounded-full border border-lutra px-4 py-1.5 text-xs font-semibold text-lutra lg:min-h-0"
            >
              + Zapisz kontakt
            </button>
            <button
              type="button"
              onClick={() => setClosing((open) => !open)}
              className="min-h-10 rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-muted hover:border-rose-200 hover:text-rose-700 lg:min-h-0"
            >
              Zamknij misję
            </button>
            </>
            ) : null}
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {STAGE_BADGE[current]}
            </span>
          </div>
        </div>
        {editable ? null : (
          <p className="mt-4 rounded-2xl bg-chip px-4 py-2 text-sm text-navy">
            Tylko podgląd — misję prowadzi {store.memberName(mission.ownerUserId) || "ktoś z zespołu"}. Edytuje
            ona albo administrator; administrator może też przekazać misję.
          </p>
        )}
        {closing && editable ? (
          <CloseMissionPanel mission={mission} onCancel={() => setClosing(false)} onClosed={() => setClosing(false)} />
        ) : null}
        <div className="max-w-3xl">
          <FollowUpBar mission={mission} />
        </div>
        {care ? (
          <div className="mt-4 max-w-4xl rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-emerald-900">
                To odnowienie. Obecna współpraca trwa
                {care.contract.endAt ? ` do ${formatDate(care.contract.endAt)}` : ""} — opieka nad nią dalej obowiązuje.
              </p>
              <button type="button" onClick={() => setCareOpen((open) => !open)} className="text-xs font-semibold text-lutra">
                {careOpen ? "Zwiń opiekę" : "Pokaż opiekę"}
              </button>
            </div>
            {careOpen ? <CarePanel mission={care} partner={partner} /> : null}
          </div>
        ) : null}
        <div className="mt-6 max-w-3xl">
          <MissionStepper
            current={current}
            completed={mission.completedStages}
            onSelect={onSelectStage}
            viewing={viewStage}
          />
        </div>
      </div>

      {/* Poniżej lg panel „Ta misja” ląduje pod treścią kroku. */}
      <div className="mt-6 flex flex-1 flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:px-8">
        <section className="min-w-0 rounded-[28px] border border-line bg-white p-4 sm:p-6 lg:flex-1 shadow-[0_8px_40px_rgba(9,12,155,0.06)]">
          {viewing ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue/30 bg-chip px-4 py-3 text-sm">
              <p className="text-navy">
                Podgląd kroku <strong>{stageLabel(stage)}</strong>. Misja jest na kroku{" "}
                <strong>{stageLabel(current)}</strong> — zmiany tutaj zapisują się, etap zostaje.
              </p>
              {editable ? (
                <button type="button" onClick={moveMissionHere} className="text-xs font-semibold text-lutra">
                  {stageIndex < currentIndex ? "Cofnij misję do tego kroku" : "Przenieś misję na ten krok"}
                </button>
              ) : null}
            </div>
          ) : null}
          <fieldset disabled={!editable} className="min-w-0">
          <SkillSmokeBar partner={partner} mission={shown} />
          {stage === "research" ? <ResearchStep mission={shown} partner={partner} /> : null}
          {stage === "contact" ? <ContactStep mission={shown} partner={partner} /> : null}
          {stage === "discovery" ? <DiscoveryStep mission={shown} partner={partner} /> : null}
          {stage === "needs" ? <NeedsStep mission={shown} partner={partner} /> : null}
          {stage === "offer" ? <OfferStep mission={shown} partner={partner} /> : null}
          {stage === "negotiation" ? <NegotiationStep mission={shown} partner={partner} /> : null}
          {stage === "contract" ? <ContractStep mission={shown} partner={partner} /> : null}
          {stage === "activation" ? (
            <ActivationStep mission={shown} partner={partner} />
          ) : null}
          </fieldset>

          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-muted">
              {viewing ? `Podgląd: krok ${stageIndex + 1} z 8` : `Krok ${stageIndex + 1} z 8`}
            </p>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
              <button type="button" onClick={onBack} className="min-h-10 text-sm text-muted">
                ← Wstecz
              </button>
              {editable || viewing ? (
                <button
                  type="button"
                  onClick={onNext}
                  className="min-h-10 rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white hover:bg-lutra-dark"
                >
                  {viewing ? `Wróć do kroku: ${stageLabel(current)}` : STAGE_CTA[stage]}
                </button>
              ) : (
                <span className="text-sm text-muted">Tylko podgląd</span>
              )}
            </div>
          </div>
        </section>
        {stage === "discovery" || stage === "needs" ? null : (
          <MissionPanel partner={partner} mission={shown} />
        )}
      </div>

      <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <ActivityLog
          partner={partner}
          missions={[mission]}
          activeMission={editable ? mission : undefined}
          formOpen={logOpen}
          onFormOpenChange={setLogOpen}
        />
      </div>
      <DraftBubble partner={partner} mission={shown} stage={stage} />
      <TalkBubble partner={partner} mission={shown} stage={stage} editable={editable} />
    </div>
  );
}
