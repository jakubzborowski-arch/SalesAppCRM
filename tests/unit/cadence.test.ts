import { describe, expect, it } from "vitest";
import { agenda } from "@/lib/agenda";
import { emptyCompany } from "@/lib/company";
import { retryCadence } from "@/lib/followups";
import { emptyMission, seedState } from "@/lib/seed";
import type { Activity, AppState, Mission, Partner } from "@/lib/types";

const ME = "11111111-1111-4111-8111-111111111111";
const p: Partner = { ...seedState.partners[0], id: "p-c", company: emptyCompany(), consents: [] };

const act = (day: string, over: Partial<Activity> = {}): Activity => ({
  id: crypto.randomUUID(), missionId: "m-c", channel: "phone", direction: "outbound", outcome: "no_answer", subject: "",
  summary: "", contactId: null, occurredAt: `${day}T10:00:00.000Z`, durationMin: null, createdBy: ME, hasRecording: false,
  hasTranscript: false, ...over,
});

const mission = (activities: Activity[], over: Partial<Mission> = {}): Mission => ({
  ...emptyMission(p.id, "m-c"), ownerUserId: ME, status: "active", activities, nextStepAt: "", nextStepLabel: "", startedAt: "2026-10-01T09:00:00Z", ...over,
});

const state = (m: Mission): AppState => ({
  ...seedState,
  user: { name: "Ja", initials: "J", role: "Handlowiec", id: ME, isAdmin: false },
  partners: [p],
  missions: [m],
  tasks: [],
});

describe("rytm ponowień", () => {
  it("1. próba bez odpowiedzi → ponów po 2 dniach, 2. → po 5, 3. → po 10 (od pierwszej)", () => {
    expect(retryCadence(mission([act("2026-10-01")]))).toMatchObject({ kind: "retry", attempt: 2, due: "2026-10-03" });
    expect(retryCadence(mission([act("2026-10-01"), act("2026-10-03")]))).toMatchObject({ attempt: 3, due: "2026-10-06" });
    const third = retryCadence(mission([act("2026-10-01"), act("2026-10-03"), act("2026-10-06", { channel: "email", outcome: "sent" })]));
    expect(third).toMatchObject({ attempt: 4, due: "2026-10-11" });
  });

  it("same telefony — podpowiedź zmiany kanału; po 4 próbach — decyzja o zamknięciu", () => {
    expect(retryCadence(mission([act("2026-10-01")]))?.title).toMatch(/mail albo SMS/);
    const four = retryCadence(mission([act("2026-10-01"), act("2026-10-03"), act("2026-10-06"), act("2026-10-11")]));
    expect(four).toMatchObject({ kind: "no_response", attempts: 4, due: "2026-10-11" });
  });

  it("odpowiedź partnera zeruje rytm; odmowa nie jest próbą; zamknięta misja bez rytmu", () => {
    expect(retryCadence(mission([act("2026-10-01"), act("2026-10-02", { outcome: "connected" })]))).toBeNull();
    expect(retryCadence(mission([act("2026-10-01"), act("2026-10-02", { direction: "inbound", channel: "email", outcome: "replied" }), act("2026-10-05")])))
      .toMatchObject({ attempt: 2, due: "2026-10-07" });
    expect(retryCadence(mission([act("2026-10-01")], { status: "lost" }))).toBeNull();
  });
});

describe("Na dziś: ponowienia i stygnące misje", () => {
  it("ponowienie pojawia się w dniu terminu, nie wcześniej", () => {
    const s = state(mission([act("2026-10-01")]));
    expect(agenda(s, true, new Date(2026, 9, 2)).some((i) => i.kind === "retry")).toBe(false);
    expect(agenda(s, true, new Date(2026, 9, 3)).find((i) => i.kind === "retry")?.title).toMatch(/próba 2 z 4/);
  });

  it("zaplanowany krok w przyszłości wycisza rytm i „stygnie”", () => {
    const planned = state(mission([act("2026-10-01")], { nextStepAt: "2026-10-20", nextStepLabel: "Wizyta" }));
    const items = agenda(planned, true, new Date(2026, 9, 12));
    expect(items.some((i) => i.kind === "retry" || i.kind === "stale")).toBe(false);
  });

  it("brak kontaktu 7+ dni po rozmowie → misja stygnie; 4 próby → propozycja zamknięcia", () => {
    const quiet = state(mission([act("2026-10-01", { outcome: "connected" })]));
    expect(agenda(quiet, true, new Date(2026, 9, 7)).some((i) => i.kind === "stale")).toBe(false);
    expect(agenda(quiet, true, new Date(2026, 9, 9)).find((i) => i.kind === "stale")?.title).toMatch(/od 8 dni/);
    const dead = state(mission([act("2026-10-01"), act("2026-10-03"), act("2026-10-06"), act("2026-10-11")]));
    expect(agenda(dead, true, new Date(2026, 9, 12)).some((i) => i.kind === "no_response")).toBe(true);
  });
});
