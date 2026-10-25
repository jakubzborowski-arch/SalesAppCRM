// Two users = two independent db.ts module instances (own missionVersions) over one fake DB.
// A saves; B loads while A's save is still in flight, then B saves on what it loaded.
// Po staremu (bez save_mission_bundle): A bumps missions.updated_at first, then writes child tables;
// the version is sealed only after the child tables, so B (old child rows) ends in a conflict.
// W jednej transakcji: B sees the state from before A's save (nothing is committed yet), so B's version
// is older and B's save is a conflict as well. Either way A's change stays.
import { describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-supabase";

const fake = { db: new FakeDb() };
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => fake.db,
  isSupabaseConfigured: () => true,
  isMissingCrmTable: (e: { code?: string } | null) => Boolean(e && (e.code === "PGRST205" || e.code === "42P01")),
}));

const dbA = await import("@/lib/db");
vi.resetModules();
const dbB = await import("@/lib/db");
const { emptyMission } = await import("@/lib/seed");

const WS = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P = "22222222-2222-4222-8222-222222222222";
const M = "33333333-3333-4333-8333-333333333333";

describe.each([
  { mode: "po staremu (bez funkcji w bazie)", rpc: false },
  { mode: "w jednej transakcji", rpc: true },
])("wczytanie w trakcie zapisu kolegi: $mode", ({ rpc }) => {
  it("B, who loaded mid-save, gets a conflict instead of writing old child rows back", async () => {
    fake.db = new FakeDb();
    if (!rpc) delete fake.db.rpcHandlers.save_mission_bundle;
    dbA.clearMissionVersions();
    dbB.clearMissionVersions();
    expect(dbA).not.toBe(dbB);
    const gate: { promise: Promise<void> | null; release: () => void } = { promise: null, release: () => {} };
    if (rpc) {
      // Transakcja A „trwa”, dopóki bramka jest zamknięta: atrapa zatwierdza zapis dopiero po jej otwarciu.
      const origRpc = fake.db.rpc.bind(fake.db);
      fake.db.rpc = (name: string, args?: Record<string, unknown>) => {
        const p = gate.promise;
        if (name === "save_mission_bundle" && p) return p.then(() => origRpc(name, args));
        return origRpc(name, args);
      };
    } else {
      const origFrom = fake.db.from.bind(fake.db);
      (fake.db as unknown as { from: (t: string) => unknown }).from = (table: string) => {
        const q = origFrom(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
        if (table === "contracts" && gate.promise) {
          const p = gate.promise;
          const origUpsert = q.upsert.bind(q);
          q.upsert = (...args: unknown[]) => {
            origUpsert(...args);
            const origThen = q.then.bind(q);
            q.then = (a: unknown, b: unknown) => p.then(() => origThen(a, b));
            return q;
          };
        }
        return q;
      };
    }

    fake.db.rows("partners").push({ id: P, workspace_id: WS, name: "Nova", segment: "venue", dnc_status: "ok", created_at: "2026-01-01" });
    fake.db.rows("missions").push({
      id: M, workspace_id: WS, partner_id: P, owner_user_id: A, status: "active", current_stage: "contract",
      next_step_label: "Umowa", next_step_at: "2026-10-30", details: {}, started_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-02T10:00:00.000Z",
    });
    fake.db.rows("contracts").push({
      id: "44444444-4444-4444-8444-444444444444", mission_id: M, company_name: "ACME", nip: "111",
      signed_by_human: false, status: "ready",
    });

    // Warm both instances (coreTablesAvailable = true) with throwaway missions.
    await dbA.persistMission(emptyMission(P, "55555555-5555-4555-8555-000000000001"), WS, A);
    await dbB.persistMission(emptyMission(P, "55555555-5555-4555-8555-000000000002"), WS, B);

    const la = await dbA.loadCrm(WS);
    dbA.replaceMissionVersions(la.versions);
    const mA = la.missions.find((m) => m.id === M)!;

    // A changes the NIP; its save is held back for a moment.
    gate.promise = new Promise<void>((r) => (gate.release = r));
    const savingA = dbA.persistMission({ ...mA, contract: { ...mA.contract, nip: "222" } }, WS, A);
    await new Promise((r) => setTimeout(r, 30));
    gate.promise = null;

    // B loads while A's save is in flight (e.g. tab focus refresh or a conflict reload).
    const lb = await dbB.loadCrm(WS);
    dbB.replaceMissionVersions(lb.versions);
    const mB = lb.missions.find((m) => m.id === M)!;
    // W jednej transakcji B nie widzi nic z niezatwierdzonego zapisu A.
    if (rpc) expect(mB.contract.nip).toBe("111");

    gate.release();
    await savingA;
    const nipAfterA = fake.db.rows("contracts").find((c) => c.mission_id === M)!.nip;

    await expect(
      dbB.persistMission({ ...mB, nextStepLabel: "B: zadzwonić do księgowej" }, WS, B),
    ).rejects.toBeInstanceOf(dbB.MissionConflictError);
    const nipAfterB = fake.db.rows("contracts").find((c) => c.mission_id === M)!.nip;
    expect(nipAfterA).toBe("222");
    expect(nipAfterB).toBe("222"); // zmiana A zostaje
    expect(fake.db.rows("missions").find((m) => m.id === M)!.next_step_label).toBe("Umowa");
  });
});
