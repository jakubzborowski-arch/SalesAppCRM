import { describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-supabase";

const fake = { db: new FakeDb() };
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => fake.db,
  isSupabaseConfigured: () => true,
  isMissingCrmTable: (e: { code?: string } | null) => Boolean(e && (e.code === "PGRST205" || e.code === "42P01")),
}));

const { agenda, agendaCount } = await import("@/lib/agenda");
const { findDuplicates, nameKey } = await import("@/lib/duplicates");
const { canEditMission, canEditPartner } = await import("@/lib/permissions");
const { contractStatus } = await import("@/lib/mission-core");
const { contractBlockers } = await import("@/lib/gates");
const db = await import("@/lib/db");
const { emptyCompany } = await import("@/lib/company");
const { emptyMission, seedState } = await import("@/lib/seed");
import type { AppState, Mission, Partner } from "@/lib/types";

const ME = "11111111-1111-4111-8111-111111111111";
const OLA = "22222222-2222-4222-8222-222222222222";

function partner(over: Partial<Partner> = {}): Partner {
  return { ...seedState.partners[0], id: crypto.randomUUID(), contacts: [], consents: [], company: emptyCompany(), ...over };
}
function mission(p: Partner, over: Partial<Mission> = {}): Mission {
  return { ...emptyMission(p.id, crypto.randomUUID()), ...over };
}
function state(over: Partial<AppState>): AppState {
  return {
    ...seedState,
    user: { name: "Ja", initials: "J", role: "Handlowiec", id: ME, isAdmin: false },
    team: [
      { id: ME, fullName: "Ja", role: "seller", email: "ja@x.pl", isMe: true },
      { id: OLA, fullName: "Ola", role: "seller", email: "ola@x.pl", isMe: false },
    ],
    tasks: [],
    ...over,
  };
}

describe("uprawnienia", () => {
  const p = partner({ ownerUserId: OLA });
  const mOla = mission(p, { ownerUserId: OLA });
  const s = state({ partners: [p], missions: [mOla] });
  it("cudza misja i partner — tylko podgląd (z v6)", () => {
    expect(canEditMission(s, mOla, true)).toBe(false);
    expect(canEditPartner(s, p, true)).toBe(false);
  });
  it("bez v6 albo w demo nie blokujemy", () => {
    expect(canEditMission(s, mOla, false)).toBe(true);
    expect(canEditPartner(s, p, false)).toBe(true);
  });
  it("admin, brak właściciela, właściciel spoza zespołu, prowadzący misję na partnerze", () => {
    expect(canEditMission({ ...s, user: { ...s.user, isAdmin: true } }, mOla, true)).toBe(true);
    expect(canEditMission(s, { ownerUserId: undefined }, true)).toBe(true);
    expect(canEditMission(s, { ownerUserId: "33333333-3333-4333-8333-333333333333" }, true)).toBe(true);
    const mine = mission(p, { ownerUserId: ME });
    expect(canEditPartner({ ...s, missions: [mOla, mine] }, p, true)).toBe(true);
  });
});

describe("duplikaty", () => {
  const nova = partner({
    name: "Kawiarnia Nova",
    city: "Kraków",
    company: { ...emptyCompany(), nip: "5250007738" },
    contacts: [{ id: "c1", name: "Anna", role: "", isDecisionMaker: true, phone: "+48 600 000 001", email: "Anna@Nova.pl" }],
  });
  it("nazwa bez słów ogólnych, polskie znaki", () => {
    expect(nameKey("Kawiarnia Nova")).toBe("nova");
    expect(nameKey("Nova Cafe")).toBe("nova");
    expect(nameKey("Łódzka Piekarnia")).toBe("lodzka");
  });
  it("rozpoznaje po nazwie w mieście, NIP, telefonie i e-mailu", () => {
    expect(findDuplicates({ name: "Nova Cafe", city: "krakow" }, [nova])[0].reasons).toEqual(["ta sama nazwa w tym mieście"]);
    expect(findDuplicates({ name: "Nova", city: "Gdańsk" }, [nova])).toHaveLength(0);
    expect(findDuplicates({ name: "Inna", nip: "525-000-77-38" }, [nova])[0].reasons).toEqual(["ten sam NIP"]);
    expect(findDuplicates({ name: "Inna", phones: ["600000001"] }, [nova])[0].reasons).toEqual(["ten sam telefon"]);
    expect(findDuplicates({ name: "Inna", emails: ["anna@nova.pl"] }, [nova])[0].reasons).toEqual(["ten sam e-mail"]);
    expect(findDuplicates({ name: "Inna", nip: "5250007737" }, [nova])).toHaveLength(0);
  });
});

describe("umowa: status i bramka", () => {
  const base = emptyMission("p", "m").contract;
  it("status wynika z faktów", () => {
    expect(contractStatus(base)).toBe("draft");
    expect(contractStatus({ ...base, documentPath: "a.pdf" })).toBe("ready");
    expect(contractStatus({ ...base, documentPath: "a.pdf", sentAt: "x" })).toBe("sent");
    expect(contractStatus({ ...base, documentPath: "a.pdf", sentAt: "x", partnerSignedAt: "y" })).toBe("partner_signed");
    expect(contractStatus({ ...base, documentPath: "a.pdf", partnerSignedAt: "y", signedByHuman: true })).toBe("signed");
  });
  it("aktywacja wymaga podpisu partnera i Lutry", () => {
    const m = emptyMission("p", "m");
    m.contract = { ...m.contract, documentPath: "a.pdf", signedByHuman: true };
    expect(contractBlockers(m)).toContain("podpis partnera");
    m.contract.partnerSignedAt = "2026-10-01";
    expect(contractBlockers(m)).not.toContain("podpis partnera");
    expect(contractBlockers(m)).not.toContain("podpis Lutry");
  });
});

describe("na dziś", () => {
  const today = new Date(2026, 9, 21);
  const p = partner({ name: "Nova" });
  const own = mission(p, { ownerUserId: ME, nextStepLabel: "Zadzwonić", nextStepAt: "2026-10-20" });
  own.decision.decisionDeadline = "2026-10-21";
  own.contract = { ...own.contract, documentPath: "a.pdf", sentAt: "2026-10-10T10:00:00Z" };
  const won = mission(p, { ownerUserId: ME, status: "won" });
  won.contract = { ...won.contract, endAt: "2026-11-10" };
  const oldWon = mission(p, { ownerUserId: ME, status: "won" });
  oldWon.contract = { ...oldWon.contract, endAt: "2027-06-01" };
  const olas = mission(p, { ownerUserId: OLA, nextStepLabel: "Ola dzwoni", nextStepAt: "2026-10-19" });
  const s = state({
    partners: [p],
    missions: [own, won, oldWon, olas],
    tasks: [
      { id: "t1", missionId: own.id, title: "Wysłać ofertę", dueAt: "2026-10-21", source: "human" },
      { id: "t2", missionId: own.id, title: "Jutro", dueAt: "2026-10-22", source: "human" },
      { id: "t3", missionId: own.id, title: "Zrobione", dueAt: "2026-10-01", doneAt: "2026-10-02", source: "human" },
    ],
  });
  it("moje: zadania, krok, termin, podpis, koniec umowy — bez przyszłych i zrobionych", () => {
    const items = agenda(s, true, today);
    expect(items.map((i) => i.kind).sort()).toEqual(["contract_end", "deadline", "next_step", "signature", "task"]);
    expect(items.find((i) => i.kind === "next_step")?.days).toBe(-1);
    expect(items.find((i) => i.kind === "contract_end")?.days).toBe(20);
    // Koniec umowy za 20 dni nie wchodzi jeszcze do licznika.
    expect(agendaCount(items)).toBe(4);
  });
  it("cały zespół widzi też misje innych", () => {
    expect(agenda(s, false, today).some((i) => i.title === "Ola dzwoni")).toBe(true);
    expect(agenda(s, true, today).some((i) => i.title === "Ola dzwoni")).toBe(false);
  });
  it("następny krok z otwartym zadaniem w bazie się nie dubluje", () => {
    const withTask = state({
      partners: [p],
      missions: [own],
      tasks: [{ id: "t9", missionId: own.id, title: "Zadzwonić", dueAt: "2026-10-20", source: "next_step" }],
    });
    expect(agenda(withTask, true, today).filter((i) => i.title === "Zadzwonić")).toHaveLength(1);
  });
});

describe("kontakt partnera: konflikt zamiast nadpisania", () => {
  const WS = "44444444-4444-4444-8444-444444444444";
  const PID = "55555555-5555-4555-8555-555555555555";
  const CID = "66666666-6666-4666-8666-666666666666";
  const contact = { id: CID, name: "Anna", role: "właścicielka", isDecisionMaker: true, phone: "500", email: "a@x.pl" };
  const base = partner({ id: PID, contacts: [contact] });
  function seed(phone: string) {
    fake.db.tables.clear();
    fake.db.rows("partners").push({ id: PID, workspace_id: WS, name: base.name, segment: "venue", dnc_status: "ok" });
    fake.db.rows("partner_contacts").push({
      id: CID, partner_id: PID, name: "Anna", contact_person: "Anna", role: "właścicielka", is_decision_maker: true,
      phone, email: "a@x.pl",
    });
  }
  it("nikt nie zmieniał — zapis przechodzi", async () => {
    seed("500");
    await db.persistPartner({ ...base, contacts: [{ ...contact, phone: "600" }] }, base);
    expect(fake.db.rows("partner_contacts")[0].phone).toBe("600");
  });
  it("kolega zmienił ten kontakt — konflikt, jego wersja zostaje", async () => {
    seed("700");
    await expect(db.persistPartner({ ...base, contacts: [{ ...contact, phone: "600" }] }, base)).rejects.toBeInstanceOf(
      db.PartnerConflictError,
    );
    expect(fake.db.rows("partner_contacts")[0].phone).toBe("700");
    const fresh = await db.loadPartner(PID);
    expect(fresh?.contacts[0].phone).toBe("700");
  });
  it("LinkedIn kontaktu trafia do bazy", async () => {
    seed("500");
    await db.persistPartner({ ...base, contacts: [{ ...contact, linkedin: "linkedin.com/in/anna" }] }, base);
    expect(fake.db.rows("partner_contacts")[0].linkedin).toBe("linkedin.com/in/anna");
  });
});
