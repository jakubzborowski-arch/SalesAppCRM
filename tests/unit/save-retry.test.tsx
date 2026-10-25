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

describe("zapis: ponawianie po błędzie i ostrzeżenie przed zamknięciem karty", () => {
  beforeEach(() => {
    holder.client = makeClient();
    clearMissionVersions();
    window.localStorage.clear();
  });

  it("nieudany zapis wraca sam po chwili; do tego czasu karta ostrzega przed zamknięciem", async () => {
    const out = await mount();
    holder.client.failNext = { table: "missions", op: "update", error: { message: "fetch failed" } };
    act(() => out.store!.setNextStepAt(M1, "2026-11-05"));
    await waitFor(() => expect(out.store!.saveState).toBe("error"), { timeout: 3000 });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    // Ponowienie po ~2 s bez kolejnej edycji.
    await waitFor(() => expect(out.store!.saveState).toBe("saved"), { timeout: 5000 });
    expect(holder.client.rows("missions").find((m) => m.id === M1)!.next_step_at).toBe("2026-11-05");
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  }, 15000);

  it("błąd w środku zapisu w jednej transakcji: baza bez zmian, zapis wraca sam i przechodzi w całości", async () => {
    const out = await mount();
    const dbState = () => JSON.stringify([...holder.client.tables].filter(([, rows]) => rows.length));
    const before = dbState();
    // Misja i decyzja zapisują się pierwsze — zadanie następnego kroku na końcu nie przechodzi.
    holder.client.failNext = { table: "tasks", op: "insert", error: { message: "fetch failed" } };
    act(() => out.store!.setNextStepAt(M1, "2026-11-05"));
    await waitFor(() => expect(out.store!.saveState).toBe("error"), { timeout: 3000 });
    expect(holder.client.calls.some((c) => c.table === "missions" && c.op === "update")).toBe(true);
    expect(dbState()).toBe(before);
    await waitFor(() => expect(out.store!.saveState).toBe("saved"), { timeout: 5000 });
    const row = holder.client.rows("missions").find((m) => m.id === M1)!;
    expect(row.next_step_at).toBe("2026-11-05");
    expect(row.updated_at).not.toBe("2025-12-31T00:00:00.000Z");
    expect(holder.client.rows("tasks")).toMatchObject([{ mission_id: M1, title: "Recap", due_at: "2026-11-05", source: "next_step" }]);
    expect(out.store!.notice).toBeNull();
  }, 15000);
});
