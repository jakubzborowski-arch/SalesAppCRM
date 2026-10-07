"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopilotPanel } from "@/components/mission/copilot-panel";
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
import { STAGES, type StageId } from "@/lib/types";
import { STAGE_BADGE, STAGE_CTA } from "@/lib/playbook";
import { canEnterStage, nextStage } from "@/lib/gates";
import { useStore } from "@/lib/store";

export function MissionShell({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const store = useStore();
  const partner = store.partnerById(partnerId);
  const mission = store.missionByPartner(partnerId);
  const [error, setError] = useState<string | null>(null);

  if (!partner) {
    return <div className="p-10 text-sm text-muted">Nie znaleziono partnera.</div>;
  }

  if (!mission) {
    return (
      <div className="p-10">
        <h1 className="text-2xl font-semibold">{partner.name}</h1>
        <p className="mt-2 text-sm text-muted">Ta osoba nie ma jeszcze aktywnej misji.</p>
        <button
          type="button"
          onClick={() => {
            const id = store.startMission(partner.id);
            if (!id) setError("Nie można otworzyć misji — sprawdź status „nie kontaktować”.");
          }}
          className="mt-4 rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white"
        >
          Zajmuję się partnerem
        </button>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </div>
    );
  }

  const stage = mission.currentStage;
  const stageIndex = STAGES.findIndex((s) => s.id === stage);
  const owner = partner.contacts.find((c) => c.isDecisionMaker);

  const onSelectStage = (id: StageId) => {
    const result = store.goToStage(mission.id, id);
    setError(result.ok ? null : result.reason ?? "Nie można otworzyć kroku.");
  };

  const onBack = () => {
    const prev = STAGES[stageIndex - 1];
    if (!prev) {
      router.push(`/partners/${partner.id}`);
      return;
    }
    onSelectStage(prev.id);
  };

  const onNext = () => {
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-end px-8 pb-2 pt-6">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>CRM / Partnerzy / {partner.name}</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-xs font-semibold text-navy">
            {store.state.user.initials}
          </span>
        </div>
      </header>

      <div className="px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
              Misja pozyskania partnera
            </p>
            <h1 className="mt-1 text-[32px] font-semibold leading-none tracking-tight">
              {partner.name}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Lokal · {partner.city} · właściciel: {owner?.name ?? "—"}
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {STAGE_BADGE[stage]}
          </span>
        </div>
        <div className="mt-6 max-w-3xl">
          <MissionStepper
            current={stage}
            completed={mission.completedStages}
            onSelect={onSelectStage}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-1 gap-6 px-8 pb-8">
        <section className="min-w-0 flex-1 rounded-[28px] border border-line bg-white p-6 shadow-[0_8px_40px_rgba(9,12,155,0.06)]">
          <SkillSmokeBar partner={partner} mission={mission} />
          {stage === "research" ? <ResearchStep mission={mission} /> : null}
          {stage === "contact" ? <ContactStep mission={mission} partner={partner} /> : null}
          {stage === "discovery" ? <DiscoveryStep mission={mission} partner={partner} /> : null}
          {stage === "needs" ? <NeedsStep mission={mission} partner={partner} /> : null}
          {stage === "offer" ? <OfferStep mission={mission} /> : null}
          {stage === "negotiation" ? <NegotiationStep mission={mission} partner={partner} /> : null}
          {stage === "contract" ? <ContractStep mission={mission} partner={partner} /> : null}
          {stage === "activation" ? (
            <ActivationStep mission={mission} partner={partner} />
          ) : null}

          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

          <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
            <p className="text-xs text-muted">Krok {stageIndex + 1} z 8</p>
            <div className="flex items-center gap-4">
              <button type="button" onClick={onBack} className="text-sm text-muted">
                ← Wstecz
              </button>
              <button
                type="button"
                onClick={onNext}
                className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white hover:bg-lutra-dark"
              >
                {STAGE_CTA[stage]}
              </button>
            </div>
          </div>
        </section>
        <CopilotPanel partner={partner} mission={mission} />
      </div>
    </div>
  );
}
