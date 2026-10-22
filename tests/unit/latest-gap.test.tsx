// @vitest-environment jsdom
// Repro: refreshData's updater moves savedMissions to the freshly loaded objects immediately,
// but latest.current is only updated in a passive effect. A flush that runs in between
// (here: a second refresh() fired by a 0 ms timer, in the app: the 500 ms debounce timer)
// sees every pre-refresh mission as "changed" and writes the stale local copies back.
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-supabase";

const WS = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "22222222-2222-4222-8222-000000000001";
const P2 = "22222222-2222-4222-8222-000000000002";
const M1 = "33333333-3333-4333-8333-000000000001";
const M2 = "33333333-3333-4333-8333-000000000002";
const session = { user: { id: A, email: "kuba@lutra.pl", user_metadata: { full_name: "Kuba" } }, access_token: "t" };

type Client = FakeDb & { auth: unknown };
const holder = { client: null as unknown as Client, armed: false, refresh: null as null | (() => Promise<void>) };
const missionWrites: Array<{ id: unknown; label: unknown }> = [];

function makeClient() {
  const db = new FakeDb();
  db.rpcHandlers.ensure_workspace = () => WS;
  db.rpcHandlers.workspace_members = () => [{ id: A, full_name: "Kuba", role: "admin", email: "kuba@lutra.pl", is_me: true }];
  db.rows("workspaces").push({ id: WS, name: "Zespół" });
  db.rows("profiles").push({ id: A, workspace_id: WS, full_name: "Kuba", role: "admin" });
  for (const [pid, mid] of [[P1, M1], [P2, M2]]) {
    db.rows("partners").push({ id: pid, workspace_id: WS, name: pid, segment: "venue", dnc_status: "ok", city: "X", created_at: "2026-01-01" });
    db.rows("missions").push({
      id: mid, workspace_id: WS, partner_id: pid, owner_user_id: A, status: "active", current_stage: "contact",
      next_step_label: "Zadzwonić", next_step_at: "2026-10-22", outcome: null, loss_reason: null,
      details: { completedStages: ["research"] }, started_at: "2026-10-01T10:00:00Z", closed_at: null,
    });
  }
  const origFrom = db.from.bind(db);
  (db as unknown as { from: (t: string) => unknown }).from = (table: string) => {
    const q = origFrom(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
    if (table === "missions") {
      const origUpsert = q.upsert.bind(q);
      q.upsert = (payload: unknown, opts?: unknown) => {
        const p = payload as Record<string, unknown>;
        missionWrites.push({ id: p.id, label: p.next_step_label });
        return origUpsert(payload, opts);
      };
      const origUpdate = q.update.bind(q);
      q.update = (payload: unknown) => {
        const p = payload as Record<string, unknown>;
        if ("next_step_label" in p) missionWrites.push({ id: "update", label: p.next_step_label });
        return origUpdate(payload);
      };
    }
    // Last read of loadCrm (loadMissionCore tasks .in()). When it resolves during the armed refresh,
    // queue another refresh on a 0 ms timer — stands in for the debounce timer firing at that moment.
    if (table === "tasks" && holder.armed) {
      const origIn = q.in.bind(q);
      q.in = (...args: unknown[]) => {
        holder.armed = false;
        setTimeout(() => void holder.refresh?.(), 0);
        return origIn(...args);
      };
    }
    return q;
  };
  return Object.assign(db, {
    auth: {
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session.user } }),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        setTimeout(() => cb("INITIAL_SESSION", session), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: async () => ({ error: null }),
    },
  }) as Client;
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => holder.client,
  isSupabaseConfigured: () => true,
  isMissingCrmTable: (e: { code?: string } | null) => Boolean(e && (e.code === "PGRST205" || e.code === "42P01")),
}));

const { StoreProvider, useStore } = await import("@/lib/store");
type StoreApi = ReturnType<typeof useStore>;
/** Wyciąga sklep z kontekstu do testu (callback zamiast mutacji propsów). */
function Grab({ onStore }: { onStore: (store: StoreApi) => void }) {
  onStore(useStore());
  return null;
}

describe("latest.current lags savedMissions", () => {
  it("flush between refresh setState and the effect re-saves untouched missions from stale copies", async () => {
    holder.client = makeClient();
    const out: { store: StoreApi | null } = { store: null };
    render(<StoreProvider><Grab onStore={(store) => { out.store = store; }} /></StoreProvider>);
    await waitFor(() => expect(out.store?.state.missions.length).toBe(2));
    await new Promise((r) => setTimeout(r, 700));
    holder.refresh = out.store!.refresh;
    missionWrites.length = 0;

    // Teammate changes both missions; this client never touches them.
    for (const m of holder.client.rows("missions")) m.next_step_label = "Kolega: nowy krok";

    holder.armed = true;
    await out.store!.refresh();
    await new Promise((r) => setTimeout(r, 1200));

    console.log("mission upserts by this client:", JSON.stringify(missionWrites));
    console.log("UI labels:", out.store!.state.missions.map((m) => m.nextStepLabel));
    expect(missionWrites.some((w) => w.label === "Zadzwonić")).toBe(false); // po poprawce: brak zapisu starej kopii
  });
});
