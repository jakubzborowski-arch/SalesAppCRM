"use client";

import Link from "next/link";
import { STAGES } from "@/lib/types";
import { useStore } from "@/lib/store";

function Topbar() {
  const { state } = useStore();
  return (
    <div className="flex items-center justify-end gap-3 px-8 py-6 text-sm text-muted">
      <span>CRM / Pulpit</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-xs font-semibold text-navy">
        {state.user.initials}
      </span>
    </div>
  );
}

export default function PulpitPage() {
  const { urgentMission, state } = useStore();
  const urgent = urgentMission();
  const active = state.missions.filter((m) => m.status === "active").length;
  const won = state.missions.filter((m) => m.status === "won").length;

  return (
    <div>
      <Topbar />
      <div className="px-8 pb-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
          Pulpit handlowca
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Jedna najpilniejsza misja</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          CRM nie rozprasza listą 40 leadów. Prowadź bieżący krok, domknij bramki, dopiero potem bierz kolejnego partnera.
        </p>

        <div className="mt-6 grid max-w-3xl grid-cols-3 gap-3">
          <div className="rounded-2xl border border-line bg-white px-4 py-4">
            <p className="text-xs text-muted">Aktywne misje</p>
            <p className="mt-1 text-2xl font-semibold">{active}</p>
          </div>
          <div className="rounded-2xl border border-line bg-white px-4 py-4">
            <p className="text-xs text-muted">Aktywacje</p>
            <p className="mt-1 text-2xl font-semibold">{won}</p>
          </div>
          <div className="rounded-2xl border border-line bg-white px-4 py-4">
            <p className="text-xs text-muted">Partnerzy</p>
            <p className="mt-1 text-2xl font-semibold">{state.partners.length}</p>
          </div>
        </div>

        {urgent ? (
          <Link
            href={`/partners/${urgent.partner.id}/mission`}
            className="mt-6 block max-w-3xl rounded-[28px] border border-line bg-white p-6 shadow-[0_8px_40px_rgba(9,12,155,0.06)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy">
              Teraz
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{urgent.partner.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {urgent.partner.city} · etap{" "}
              {STAGES.find((s) => s.id === urgent.mission.currentStage)?.label}
            </p>
            <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm text-foreground">
              Następny krok: {urgent.mission.nextStepLabel}
              <span className="ml-2 text-muted">· {urgent.mission.nextStepAt}</span>
            </p>
            <span className="mt-4 inline-flex rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white">
              Otwórz misję
            </span>
          </Link>
        ) : (
          <Link
            href="/partners"
            className="mt-6 inline-flex rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white"
          >
            Wybierz partnera
          </Link>
        )}
      </div>
    </div>
  );
}
