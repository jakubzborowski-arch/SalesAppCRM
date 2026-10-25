// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-supabase";

const WS = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "22222222-2222-4222-8222-000000000001";
const M1 = "33333333-3333-4333-8333-000000000001";
const C1 = "44444444-4444-4444-8444-000000000001";

const session = { user: { id: A, email: "kuba@lutra.pl", user_metadata: { full_name: "Kuba" } }, access_token: "t" };
type Client = FakeDb & { auth: unknown };
const holder: { client: Client } = { client: null as unknown as Client };

function makeClient(stage: string, segment = "venue") {
  const db = new FakeDb();
  db.rpcHandlers.ensure_workspace = () => WS;
  db.rpcHandlers.workspace_members = () => [{ id: A, full_name: "Kuba", role: "admin", email: "kuba@lutra.pl", is_me: true }];
  db.rows("workspaces").push({ id: WS, name: "Zespół" });
  db.rows("profiles").push({ id: A, workspace_id: WS, full_name: "Kuba", role: "admin" });
  db.rows("partners").push({
    id: P1, workspace_id: WS, name: "Kawiarnia Nova", segment, dnc_status: "ok", city: "Kraków", created_at: "2026-01-01",
  });
  db.rows("partner_contacts").push({
    id: C1, partner_id: P1, name: "Marek Lis", contact_person: "Marek Lis", role: "barista",
    is_decision_maker: false, phone: "500100200",
  });
  db.rows("missions").push({
    id: M1, workspace_id: WS, partner_id: P1, owner_user_id: A, status: "active", current_stage: stage,
    next_step_label: "Wizyta", next_step_at: "2026-10-24", outcome: null, loss_reason: null,
    details: { completedStages: ["research"] }, started_at: "2026-10-01T10:00:00Z",
    closed_at: null, updated_at: "2025-12-31T00:00:00.000Z",
  });
  const client = Object.assign(db, {
    auth: {
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session.user } }),
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        setTimeout(() => cb("INITIAL_SESSION", session), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: async () => ({ error: null }),
    },
  });
  return client as Client;
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => holder.client,
  isSupabaseConfigured: () => true,
  isMissingCrmTable: (error: { code?: string } | null) => Boolean(error && (error.code === "PGRST205" || error.code === "42P01")),
}));

const { StoreProvider, useStore } = await import("@/lib/store");
const { clearMissionVersions } = await import("@/lib/db");
const { agreementFormOf, emptyDiscount, emptyTerms, periodEndIso } = await import("@/lib/terms");
const { addDaysIso, toIsoDate } = await import("@/lib/dates");
const { QUICK_VISIT_SUBJECT } = await import("@/lib/quick-visit");
type StoreApi = ReturnType<typeof useStore>;
type QuickVisitInput = Parameters<StoreApi["quickVisit"]>[1];

function Grab({ onStore }: { onStore: (store: StoreApi) => void }) {
  onStore(useStore());
  return null;
}

async function mount() {
  const out: { store: StoreApi | null } = { store: null };
  render(
    <StoreProvider>
      <Grab onStore={(store) => { out.store = store; }} />
    </StoreProvider>,
  );
  await waitFor(() => expect(out.store?.dbStatus).toBe("ok"));
  await waitFor(() => expect(out.store?.state.missions.length).toBe(1));
  return out;
}

const mission = (out: { store: StoreApi | null }) => out.store!.state.missions.find((m) => m.id === M1)!;
const partner = (out: { store: StoreApi | null }) => out.store!.state.partners.find((p) => p.id === P1)!;

function input(over: Partial<QuickVisitInput> = {}): QuickVisitInput {
  const startAt = addDaysIso(1);
  return {
    visitDate: toIsoDate(new Date()),
    problem: "Między 16 a 19 sala stoi pusta.",
    category: "off_peak",
    quote: "Po 16 mamy pustki.",
    makerId: "",
    makerName: "Anna Kowalska",
    makerRole: "właścicielka",
    discount: { ...emptyDiscount(), percent: 15, days: ["wed"], hoursFrom: "16:00", hoursTo: "19:00", redemption: "qr" },
    space: emptyTerms().space,
    startAt,
    endAt: periodEndIso(startAt, 3),
    brandConsent: true,
    note: "Pokazałem aplikację na telefonie.",
    ...over,
  };
}

describe("szybka wizyta w sklepie", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    clearMissionVersions();
  });

  it("z Kontaktu do Umowy: warunki, fakt, decydent, zatwierdzona oferta, wizyta w dzienniku, porozumienie mailowe", async () => {
    holder.client = makeClient("contact");
    const out = await mount();
    let result: { ok: boolean; reason?: string } = { ok: false };
    await act(async () => {
      result = await out.store!.quickVisit(M1, input());
    });
    expect(result).toEqual({ ok: true });

    const m = mission(out);
    expect(m.currentStage).toBe("contract");
    expect(m.completedStages).toEqual(expect.arrayContaining(["contact", "discovery", "needs", "offer", "negotiation"]));
    expect(m.terms.discount).toMatchObject({ percent: 15, redemption: "qr", days: ["wed"], hoursFrom: "16:00" });
    const fact = m.needs.find((n) => n.status === "fact" && n.confirmed);
    expect(fact).toMatchObject({ category: "off_peak", description: "Między 16 a 19 sala stoi pusta." });

    const maker = partner(out).contacts.find((c) => c.name === "Anna Kowalska");
    expect(maker?.isDecisionMaker).toBe(true);
    expect(m.decision.decisionMakerId).toBe(maker!.id);
    expect(m.selectedVariant).toBe("A");
    expect(m.offerApproved).toBe(true);
    expect(m.agreementForm).toBe("email");
    expect(agreementFormOf(m)).toBe("email");
    expect(m.checklist["contract:brand_app"]).toBe(true);
    expect(m.conversationNote).toMatch(/^Wizyta \d{2}\.\d{2}\.\d{4}: Pokazałem aplikację na telefonie\.$/);
    expect(partner(out).consents).toEqual(
      expect.arrayContaining([{ channel: "in_person", purpose: "contact", status: "granted" }]),
    );

    expect(m.activities[0]).toMatchObject({
      channel: "in_person",
      outcome: "connected",
      subject: QUICK_VISIT_SUBJECT,
      contactId: maker!.id,
    });
    const row = holder.client.rows("conversations").find((r) => r.mission_id === M1);
    expect(row).toMatchObject({ channel: "in_person", outcome: "connected", subject: QUICK_VISIT_SUBJECT });
    expect(holder.client.rows("partner_contacts").find((r) => r.name === "Anna Kowalska")).toBeTruthy();

    // Zapis do bazy idzie zwykłą drogą (misja, decyzja, potrzeby, oferta).
    await waitFor(
      () => expect(holder.client.rows("missions").find((r) => r.id === M1)?.current_stage).toBe("contract"),
      { timeout: 2500 },
    );
    await waitFor(
      () =>
        expect(holder.client.rows("decision_context").find((r) => r.mission_id === M1)).toMatchObject({
          decision_maker_contact_id: maker!.id,
        }),
      { timeout: 2500 },
    );
    await waitFor(
      () => expect(holder.client.rows("needs").find((r) => r.mission_id === M1)).toMatchObject({ category: "off_peak", status: "fact" }),
      { timeout: 2500 },
    );
  });

  it("istniejąca osoba z karty zostaje decydentem; błędny formularz niczego nie zapisuje", async () => {
    holder.client = makeClient("discovery");
    const out = await mount();
    let result: { ok: boolean; reason?: string; errors?: Record<string, string> } = { ok: false };
    await act(async () => {
      result = await out.store!.quickVisit(M1, input({ category: "", makerId: C1, makerName: "" }));
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual({ category: "Wybierz kategorię — potwierdzony fakt musi ją mieć." });
    expect(holder.client.rows("conversations")).toHaveLength(0);
    expect(mission(out).currentStage).toBe("discovery");

    await act(async () => {
      result = await out.store!.quickVisit(M1, input({ makerId: C1, makerName: "", category: "margin" }));
    });
    expect(result).toEqual({ ok: true });
    expect(mission(out).currentStage).toBe("contract");
    expect(mission(out).decision.decisionMakerId).toBe(C1);
    expect(mission(out).selectedVariant).toBe("B");
    expect(partner(out).contacts.find((c) => c.id === C1)?.isDecisionMaker).toBe(true);
  });

  it("nie dla społeczności — zostaje zwykła ścieżka", async () => {
    holder.client = makeClient("contact", "community");
    const out = await mount();
    let result: { ok: boolean; reason?: string } = { ok: true };
    await act(async () => {
      result = await out.store!.quickVisit(M1, input());
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/dla lokalu/);
    expect(holder.client.rows("conversations")).toHaveLength(0);
  });
});
