import { describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-supabase";

const fake = { db: new FakeDb() };
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => fake.db,
  isSupabaseConfigured: () => true,
  isMissingCrmTable: (e: { code?: string } | null) => Boolean(e && (e.code === "PGRST205" || e.code === "42P01")),
}));

const { cleanCompany, companyErrors, companyMissing, contractFromCompany, emptyCompany, formatNip, isValidNip, isValidRegon } =
  await import("@/lib/company");
const { parseDeadline, daysUntil, relativeDeadline, isIsoDate } = await import("@/lib/dates");
const { offerBlockers, contractBlockers } = await import("@/lib/gates");
const { funnel, outcomes, lossReasons, contactStats, stageReached, selectMissions, attention } = await import("@/lib/reports");
const db = await import("@/lib/db");
const { emptyMission, seedState } = await import("@/lib/seed");
import type { Activity, Mission, Partner } from "@/lib/types";

describe("NIP / REGON", () => {
  it("sprawdza cyfrę kontrolną NIP", () => {
    expect(isValidNip("5250007738")).toBe(true);
    expect(isValidNip("525-000-77-38")).toBe(true);
    expect(isValidNip("PL 525 000 77 38")).toBe(true);
    expect(isValidNip("5250007737")).toBe(false);
    expect(isValidNip("525000773")).toBe(false);
    expect(isValidNip("")).toBe(false);
    expect(formatNip("5250007738")).toBe("525-000-77-38");
  });
  it("sprawdza REGON 9 i 14 cyfr", () => {
    expect(isValidRegon("123456785")).toBe(true);
    expect(isValidRegon("123456786")).toBe(false);
    expect(isValidRegon("12345678512347")).toBe(true);
    expect(isValidRegon("12345678512348")).toBe(false);
  });
  it("błędy formatu tylko dla wypełnionych pól, braki do umowy osobno", () => {
    const c = { ...emptyCompany(), nip: "123", billingEmail: "zly" };
    expect(Object.keys(companyErrors(c)).sort()).toEqual(["billingEmail", "nip"]);
    expect(companyErrors(emptyCompany())).toEqual({});
    expect(companyMissing(emptyCompany())).toEqual(["nazwa firmy", "NIP", "adres siedziby"]);
    expect(cleanCompany({ ...emptyCompany(), nip: "525-000-77-38", legalName: "  X sp. z o.o. " })).toMatchObject({
      nip: "5250007738",
      legalName: "X sp. z o.o.",
    });
  });
  it("umowa bierze dane z karty tylko w puste pola", () => {
    const partner = {
      name: "Nova",
      address: "ul. Lokalowa 1",
      company: { ...emptyCompany(), legalName: "Nova sp. z o.o.", nip: "5250007738", legalAddress: "ul. Siedziby 2" },
    };
    expect(contractFromCompany({ companyName: "", nip: "", address: "" }, partner)).toEqual({
      companyName: "Nova sp. z o.o.",
      nip: "525-000-77-38",
      address: "ul. Siedziby 2",
    });
    expect(contractFromCompany({ companyName: "Wpisane", nip: "", address: "Inny" }, partner)).toMatchObject({
      companyName: "Wpisane",
      address: "Inny",
    });
    expect(contractFromCompany({ companyName: "", nip: "", address: "" }, { ...partner, company: emptyCompany() })).toEqual({
      companyName: "Nova",
      nip: "",
      address: "ul. Lokalowa 1",
    });
  });
});

describe("termin decyzji", () => {
  // Środa 21.10.2026
  const today = new Date(2026, 9, 21);
  it("rozumie daty i zwroty", () => {
    expect(parseDeadline("2026-11-12", today)).toBe("2026-11-12");
    expect(parseDeadline("12.11.2026", today)).toBe("2026-11-12");
    expect(parseDeadline("12.11", today)).toBe("2026-11-12");
    expect(parseDeadline("1.10", today)).toBe("2027-10-01");
    expect(parseDeadline("jutro", today)).toBe("2026-10-22");
    expect(parseDeadline("Czwartek", today)).toBe("2026-10-22");
    expect(parseDeadline("w środę", today)).toBe("2026-10-28");
    expect(parseDeadline("w przyszły wtorek", today)).toBe("2026-10-27");
    expect(parseDeadline("przyszły czwartek", new Date(2026, 9, 23))).toBe("2026-10-29");
    expect(parseDeadline("przyszła niedziela", today)).toBe("2026-11-01");
    expect(parseDeadline("czwartek 12.11", new Date(2026, 9, 19))).toBe("2026-11-12");
    expect(parseDeadline("czwartek jak szef wróci", today)).toBeNull();
    expect(parseDeadline("we wtorek", today)).toBe("2026-10-27");
    expect(parseDeadline("do końca tygodnia", today)).toBe("2026-10-23");
    expect(parseDeadline("koniec miesiąca", today)).toBe("2026-10-31");
    expect(parseDeadline("za tydzień", today)).toBe("2026-10-28");
    expect(parseDeadline("za 2 tygodnie", today)).toBe("2026-11-04");
    expect(parseDeadline("za 3 dni", today)).toBe("2026-10-24");
    expect(parseDeadline("przyszłego tygodnia", today)).toBe("2026-10-26");
    expect(parseDeadline("31.02.2026", today)).toBeNull();
    expect(parseDeadline("jak szef wróci", today)).toBeNull();
    expect(parseDeadline("", today)).toBeNull();
  });
  it("w weekend koniec tygodnia = najbliższy piątek", () => {
    expect(parseDeadline("koniec tygodnia", new Date(2026, 9, 24))).toBe("2026-10-30");
    expect(parseDeadline("koniec tygodnia", new Date(2026, 9, 23))).toBe("2026-10-23");
  });
  it("liczy dni do terminu", () => {
    expect(daysUntil("2026-10-24", today)).toBe(3);
    expect(daysUntil("2026-10-19", today)).toBe(-2);
    expect(daysUntil("Czwartek", today)).toBeNull();
    expect(relativeDeadline("2026-10-22", today)).toBe("jutro");
    expect(relativeDeadline("2026-10-19", today)).toBe("2 dni temu");
    expect(isIsoDate("2026-02-30")).toBe(false);
  });
  it("bramka oferty wymaga daty, nie tekstu", () => {
    const m = emptyMission("p", "m");
    m.decision.decisionDeadline = "Czwartek";
    expect(offerBlockers(m)).toContain("termin decyzji jako data");
    m.decision.decisionDeadline = "2026-11-12";
    expect(offerBlockers(m)).not.toContain("termin decyzji jako data");
    expect(offerBlockers(m)).not.toContain("termin decyzji");
  });
  it("bramka umowy: poprawny NIP i koniec po starcie", () => {
    const m = emptyMission("p", "m");
    m.contract = { ...m.contract, nip: "5250007737", startAt: "2026-11-01", endAt: "2026-10-01" };
    const missing = contractBlockers(m);
    expect(missing).toContain("poprawny NIP");
    expect(missing).toContain("koniec okresu po starcie");
  });
});

function act(missionId: string, over: Partial<Activity>): Activity {
  return {
    id: crypto.randomUUID(),
    missionId,
    channel: "phone",
    direction: "outbound",
    outcome: "connected",
    subject: "",
    summary: "",
    contactId: null,
    occurredAt: new Date().toISOString(),
    durationMin: null,
    createdBy: "u1",
    hasRecording: false,
    hasTranscript: false,
    ...over,
  };
}

function mission(over: Partial<Mission>): Mission {
  const id = crypto.randomUUID();
  return { ...emptyMission("p1", id), startedAt: new Date().toISOString(), ownerUserId: "u1", ...over, id };
}

describe("raporty", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  const won = mission({ status: "won", currentStage: "activation", startedAt: daysAgo(20), closedAt: daysAgo(6) });
  won.activities = [act(won.id, {}), act(won.id, { outcome: "no_answer" }), act(won.id, { channel: "email", outcome: "replied" })];
  const lostOffer = mission({ status: "lost", currentStage: "offer", lossReason: "Zniżka / marża się nie opłaca", startedAt: daysAgo(10), closedAt: daysAgo(2) });
  // Cofnięta z negocjacji do oferty — liczy się najdalszy etap.
  lostOffer.events = [
    { id: "e1", missionId: lostOffer.id, kind: "stage", fromValue: "offer", toValue: "negotiation", note: null, actorId: null, at: daysAgo(5) },
    { id: "e2", missionId: lostOffer.id, kind: "stage", fromValue: "negotiation", toValue: "offer", note: null, actorId: null, at: daysAgo(3) },
  ];
  const lostContact = mission({ status: "lost", currentStage: "contact", lossReason: "Brak kontaktu — nie odbiera", startedAt: daysAgo(5) });
  const noFit = mission({ status: "no_fit", currentStage: "research", lossReason: "", startedAt: daysAgo(3) });
  const active = mission({ status: "active", currentStage: "discovery", completedStages: ["research", "contact"], startedAt: daysAgo(40), ownerUserId: "u2" });
  active.decision.decisionDeadline = daysAgo(1).slice(0, 10);
  const old = mission({ status: "active", currentStage: "needs", startedAt: daysAgo(400) });
  const all = [won, lostOffer, lostContact, noFit, active, old];

  it("najdalszy etap z historii i wygranej", () => {
    expect(stageReached(won)).toBe(7);
    expect(stageReached(lostOffer)).toBe(5);
    expect(stageReached(active)).toBe(2);
  });
  it("lejek, wyniki i powody", () => {
    const cohort = selectMissions(all, { period: 30, ownerId: null });
    expect(cohort).toHaveLength(4);
    const rows = funnel(cohort);
    expect(rows[0]).toMatchObject({ reached: 4, shareOfStart: 100, fromPrevious: null });
    expect(rows[1]).toMatchObject({ reached: 3, fromPrevious: 75, lostHere: 1 });
    expect(rows[4]).toMatchObject({ stage: "offer", reached: 2, lostHere: 1 });
    expect(rows[5]).toMatchObject({ stage: "negotiation", reached: 2 });
    expect(rows[7]).toMatchObject({ reached: 1 });
    const o = outcomes(cohort);
    expect(o).toMatchObject({ total: 4, won: 1, lost: 2, no_fit: 1, winRate: 25, medianDaysToWin: 14, medianContactsToWin: 3 });
    const reasons = lossReasons(cohort);
    expect(reasons.map((r) => r.reason)).toEqual([
      "Bez podanego powodu",
      "Brak kontaktu — nie odbiera",
      "Zniżka / marża się nie opłaca",
    ]);
    expect(reasons.find((r) => r.reason.startsWith("Zniżka"))?.stages).toEqual({ offer: 1 });
    expect(reasons.reduce((s, r) => s + r.share, 0)).toBeGreaterThanOrEqual(99);
  });
  it("filtr handlowca i pusty zbiór", () => {
    expect(selectMissions(all, { period: "all", ownerId: "u2" })).toEqual([active]);
    expect(outcomes([])).toMatchObject({ total: 0, winRate: null, medianDaysToWin: null });
    expect(funnel([])[0]).toMatchObject({ reached: 0, shareOfStart: 0 });
  });
  it("kontakty per kanał i uwaga", () => {
    const stats = contactStats(all, { period: 30, ownerId: null });
    expect(stats.total).toBe(3);
    expect(stats.rows[0]).toMatchObject({ channel: "phone", total: 2, positive: 1, noAnswer: 1, positiveRate: 50 });
    const now = attention(all, null);
    expect(now.overdue).toEqual([active]);
    expect(now.stale.map((m) => m.id)).toContain(old.id);
  });
});

describe("zapis partnera", () => {
  const WS = "11111111-1111-4111-8111-111111111111";
  const base: Partner = {
    ...seedState.partners[0],
    id: "22222222-2222-4222-8222-222222222222",
    contacts: [],
    consents: [],
  };
  function seedRow() {
    fake.db.tables.clear();
    fake.db.rows("partners").push({
      id: base.id, workspace_id: WS, name: base.name, segment: "venue", city: base.city, address: base.address,
      category: base.category, notes: "stara", dnc_status: "ok", legal_name: null, nip: null,
    });
  }

  it("wysyła tylko zmienione pola — praca kolegi zostaje", async () => {
    seedRow();
    const before = { ...base, notes: "stara" };
    // Kolega w międzyczasie zmienił notatkę w bazie.
    fake.db.rows("partners")[0].notes = "kolegi";
    await db.persistPartner(
      { ...before, company: { ...before.company, legalName: "Nova sp. z o.o.", nip: "525-000-77-38" } },
      before,
    );
    const row = fake.db.rows("partners")[0];
    expect(row.notes).toBe("kolegi");
    expect(row.legal_name).toBe("Nova sp. z o.o.");
    expect(row.nip).toBe("5250007738");
  });

  it("bez zmian nie wysyła nic", async () => {
    seedRow();
    const before = { ...base, notes: "stara" };
    fake.db.calls.length = 0;
    await db.persistPartner({ ...before }, before);
    expect(fake.db.calls.filter((c) => c.table === "partners" && c.op === "update")).toHaveLength(0);
  });

  it("brak kolumn v5 → reszta karty zapisana, dane firmy zgłoszone jako pominięte", async () => {
    seedRow();
    const before = { ...base, notes: "stara" };
    fake.db.failNext = {
      table: "partners",
      op: "update",
      error: { code: "PGRST204", message: "Could not find the 'legal_name' column of 'partners' in the schema cache" },
    };
    const result = await db.persistPartner(
      { ...before, notes: "nowa", company: { ...before.company, legalName: "X" } },
      before,
    );
    expect(result.dropped).toEqual(["company"]);
    const row = fake.db.rows("partners")[0];
    expect(row.notes).toBe("nowa");
    expect(row.legal_name).toBeNull();
  });

  it("inny błąd zapisu nie jest już połykany", async () => {
    seedRow();
    const before = { ...base, notes: "stara" };
    fake.db.failNext = { table: "partners", op: "update", error: { code: "42501", message: "permission denied" } };
    await expect(db.persistPartner({ ...before, notes: "nowa" }, before)).rejects.toMatchObject({ code: "42501" });
  });
});
