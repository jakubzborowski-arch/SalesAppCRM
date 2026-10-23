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

function makeClient() {
  const db = new FakeDb();
  db.rpcHandlers.ensure_workspace = () => WS;
  db.rpcHandlers.workspace_members = () => [{ id: A, full_name: "Kuba", role: "admin", email: "kuba@lutra.pl", is_me: true }];
  db.rows("workspaces").push({ id: WS, name: "Zespół" });
  db.rows("profiles").push({ id: A, workspace_id: WS, full_name: "Kuba", role: "admin" });
  db.rows("partners").push({
    id: P1, workspace_id: WS, name: "Kawiarnia Nova", segment: "venue", dnc_status: "ok", city: "Kraków", created_at: "2026-01-01",
  });
  db.rows("partner_contacts").push({
    id: C1, partner_id: P1, name: "Anna Kowalska", contact_person: "Anna Kowalska", role: "właścicielka",
    is_decision_maker: true, phone: "500100200", email: "anna@nova.pl",
  });
  db.rows("consents").push({ id: "c-1", partner_id: P1, channel: "phone", purpose: "contact", status: "granted" });
  db.rows("missions").push({
    id: M1, workspace_id: WS, partner_id: P1, owner_user_id: A, status: "active", current_stage: "offer",
    next_step_label: "Recap", next_step_at: "2026-10-24", outcome: null, loss_reason: null,
    details: { completedStages: ["research", "contact", "discovery", "needs"] }, started_at: "2026-10-01T10:00:00Z",
    closed_at: null, updated_at: "2025-12-31T00:00:00.000Z",
  });
  db.rows("decision_context").push({
    mission_id: M1, problem: "Puste środy", expected_result: "Grupa w środę", constraint_summary: "bez weekendów",
    decision_maker_contact_id: C1, decision_deadline: "2026-10-30", previous_attempts: "Ulotki", next_step: "Recap",
  });
  db.rows("needs").push({
    id: "55555555-5555-4555-8555-000000000001", mission_id: M1, category: "off_peak", title: "Puste środy",
    description: "Puste środy", status: "fact", confirmed_at: "2026-10-10T10:00:00Z",
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
const { changeRulesFor, agreementFormOf } = await import("@/lib/terms");
const { pendingFollowUps } = await import("@/lib/followups");
type StoreApi = ReturnType<typeof useStore>;

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
const savedDetails = () => holder.client.rows("missions").find((m) => m.id === M1)!.details as Record<string, unknown>;

describe("etap 4 w sklepie: warunki, porozumienie, opieka, maile", () => {
  beforeEach(() => {
    holder.client = makeClient();
    clearMissionVersions();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("wariantu nie da się zatwierdzić bez warunków; warunki zapisują się w bazie", async () => {
    const out = await mount();
    act(() => out.store!.selectVariant(M1, "A"));
    let gate: { ok: boolean; reason?: string } = { ok: true };
    act(() => {
      gate = out.store!.approveOffer(M1);
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/zniżka: wysokość albo gratis/);
    act(() => {
      out.store!.updateTerms(M1, "discount", { percent: 15, redemption: "code", days: ["wed"] });
      out.store!.updateContract(M1, { startAt: "2026-11-01", endAt: "2027-01-31" });
    });
    act(() => {
      gate = out.store!.approveOffer(M1);
    });
    expect(gate.ok).toBe(true);
    expect(mission(out).offerApproved).toBe(true);
    await waitFor(() => expect((savedDetails().terms as { discount: { percent: number } } | undefined)?.discount.percent).toBe(15), {
      timeout: 2500,
    });
    const offer = await waitFor(() => {
      const row = holder.client.rows("offers").find((o) => o.mission_id === M1);
      expect(row).toBeTruthy();
      return row!;
    });
    expect((offer.custom_terms as { agreementForm: string }).agreementForm).toBe("email");
  });

  it("daty okresu wpisują zasady 7 dni; własnych zasad nie nadpisują", async () => {
    const out = await mount();
    act(() => out.store!.updateContract(M1, { startAt: "2026-11-01", endAt: "2027-01-31" }));
    expect(mission(out).contract.changeRules).toBe(changeRulesFor(true));
    act(() => out.store!.updateContract(M1, { endAt: "2027-10-31" }));
    expect(mission(out).contract.changeRules).toBe(changeRulesFor(false));
    expect(agreementFormOf(mission(out))).toBe("contract");
    act(() => out.store!.updateContract(M1, { changeRules: "Ustaliliśmy 14 dni." }));
    act(() => out.store!.updateContract(M1, { endAt: "2027-01-15" }));
    expect(mission(out).contract.changeRules).toBe("Ustaliliśmy 14 dni.");
  });

  it("porozumienie mailowe: zatwierdzenie Lutry bez PDF; umowa — tylko z dokumentem", async () => {
    const out = await mount();
    act(() => {
      out.store!.updateContract(M1, { startAt: "2026-11-01", endAt: "2027-01-31" });
      out.store!.setAgreementForm(M1, "email");
    });
    act(() => out.store!.updateContract(M1, { sentAt: "2026-10-22T10:00:00Z" }));
    expect(mission(out).contract.status).toBe("sent");
    act(() => out.store!.updateContract(M1, { partnerSignedAt: "2026-10-23T10:00:00Z" }));
    act(() => out.store!.updateContract(M1, { signedByHuman: true }));
    expect(mission(out).contract.signedByHuman).toBe(true);
    expect(mission(out).contract.status).toBe("signed");

    act(() => {
      out.store!.updateContract(M1, { signedByHuman: false });
      out.store!.setAgreementForm(M1, "contract");
    });
    act(() => out.store!.updateContract(M1, { signedByHuman: true }));
    expect(mission(out).contract.signedByHuman).toBe(false);
  });

  it("mail po telefonie: przypomnienie znika po „Mail wysłany”", async () => {
    const out = await mount();
    await act(async () => {
      await out.store!.logActivity({
        missionId: M1, channel: "phone", direction: "outbound", outcome: "connected", subject: "", summary: "",
        contactId: C1, occurredAt: new Date().toISOString(), durationMin: 5,
      });
    });
    const call = mission(out).activities[0];
    expect(pendingFollowUps(mission(out)).map((f) => f.kind)).toEqual(["phone"]);
    let result: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      result = await out.store!.logFollowUpMail(M1, call.id);
    });
    expect(result.ok).toBe(true);
    const mail = holder.client.rows("conversations").find((row) => row.channel === "email");
    expect(mail?.direction).toBe("outbound");
    expect(pendingFollowUps(mission(out))).toEqual([]);
  });

  it("opieka: przegląd wymaga treści, potwierdzenie warunków, raport miesięczny bez duplikatów", async () => {
    const out = await mount();
    let gate: { ok: boolean; reason?: string } = { ok: true };
    act(() => {
      gate = out.store!.addCareReview(M1, { attendance: " ", feedback: "", decision: "continue", note: "" });
    });
    expect(gate.ok).toBe(false);
    act(() => {
      gate = out.store!.addCareReview(M1, { attendance: "4 wydarzenia", feedback: "Goście zadowoleni", decision: "continue", note: "" });
    });
    expect(gate.ok).toBe(true);
    act(() => out.store!.confirmTerms(M1));
    act(() => out.store!.reportRedemptions(M1, "2026-09", 12));
    act(() => out.store!.reportRedemptions(M1, "2026-09", 14));
    const care = mission(out).care;
    expect(care.reviews).toHaveLength(1);
    expect(care.reviews[0].by).toBe(A);
    expect(care.termsConfirmedAt).toBeTruthy();
    expect(care.reports).toEqual([expect.objectContaining({ month: "2026-09", count: 14 })]);
    await waitFor(() => expect((savedDetails().care as { reports: unknown[] } | undefined)?.reports).toHaveLength(1), {
      timeout: 2500,
    });
  });

  it("zgody na markę zapisują się jako checklista umowy", async () => {
    const out = await mount();
    act(() => out.store!.setChecklistItem(M1, "contract:brand_app", true));
    expect(mission(out).checklist["contract:brand_app"]).toBe(true);
    await waitFor(
      () =>
        expect(
          holder.client.rows("mission_checklist_items").find((row) => row.mission_id === M1 && row.item_key === "brand_app"),
        ).toMatchObject({ stage: "contract", is_done: true }),
      { timeout: 2500 },
    );
  });
});
