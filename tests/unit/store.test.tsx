// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-supabase";

const WS = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "22222222-2222-4222-8222-000000000001";
const P2 = "22222222-2222-4222-8222-000000000002";
const M1 = "33333333-3333-4333-8333-000000000001";
const M2 = "33333333-3333-4333-8333-000000000002";

const session = { user: { id: A, email: "kuba@lutra.pl", user_metadata: { full_name: "Kuba" } }, access_token: "t" };

type Client = FakeDb & { auth: unknown };
const holder: { client: Client; slowTable: string | null; onRead: ((table: string) => void) | null } = {
  client: null as unknown as Client,
  slowTable: null,
  onRead: null,
};

function makeClient() {
  const db = new FakeDb();
  db.rpcHandlers.ensure_workspace = () => WS;
  db.rpcHandlers.workspace_members = () => [
    { id: A, full_name: "Kuba", role: "admin", email: "kuba@lutra.pl", is_me: true },
  ];
  db.rows("workspaces").push({ id: WS, name: "Zespół" });
  db.rows("profiles").push({ id: A, workspace_id: WS, full_name: "Kuba", role: "admin" });
  for (const [pid, name] of [
    [P1, "Kawiarnia Nova"],
    [P2, "Bistro Zielone"],
  ]) {
    db.rows("partners").push({ id: pid, workspace_id: WS, name, segment: "venue", dnc_status: "ok", city: "Kraków", created_at: "2026-01-01" });
    db.rows("consents").push({ id: `c-${pid}`, partner_id: pid, channel: "phone", purpose: "contact", status: "granted" });
  }
  for (const [mid, pid] of [
    [M1, P1],
    [M2, P2],
  ]) {
    db.rows("missions").push({
      id: mid, workspace_id: WS, partner_id: pid, owner_user_id: A, status: "active", current_stage: "contact",
      next_step_label: "Zadzwonić", next_step_at: "2026-10-22", outcome: null, loss_reason: null,
      details: { completedStages: ["research"] }, started_at: "2026-10-01T10:00:00Z", closed_at: null,
      updated_at: "2025-12-31T00:00:00.000Z",
    });
    db.rows("tasks").push({ id: `t-${mid}`, workspace_id: WS, mission_id: mid, title: "Zadzwonić", due_at: "2026-10-22", done_at: null, source: "next_step" });
  }
  // Wolny odczyt wybranej tabeli (duży workspace / słaba sieć) i podgląd odczytów.
  const origFrom = db.from.bind(db);
  (db as unknown as { from: (t: string) => unknown }).from = (table: string) => {
    const q = origFrom(table) as unknown as { then: (a?: unknown, b?: unknown) => unknown };
    const origThen = q.then.bind(q);
    q.then = (a?: unknown, b?: unknown) => {
      holder.onRead?.(table);
      if (holder.slowTable === table) {
        return new Promise((r) => setTimeout(r, 1200)).then(() => origThen(a, b));
      }
      return origThen(a, b);
    };
    return q;
  };
  const client = Object.assign(db, {
    auth: {
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session.user } }),
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        setTimeout(() => cb("INITIAL_SESSION", session), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ data: { session }, error: null }),
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

/** Wyciąga sklep z kontekstu do testu (callback zamiast mutacji propsów). */
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
  await waitFor(() => expect(out.store?.state.missions.length).toBe(2));
  return out;
}

const missionUpserts = (id: string) =>
  holder.client.calls.filter(
    (c) => c.table === "missions" && (c.op === "upsert" || c.op === "update") && c.ids?.includes(id),
  ).length;

describe("StoreProvider: zapis tylko zmian", () => {
  beforeEach(() => {
    holder.client = makeClient();
    holder.slowTable = null;
    holder.onRead = null;
    clearMissionVersions();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("po wczytaniu nic nie zapisuje; edycja M1 zapisuje tylko M1", async () => {
    const out = await mount();
    await new Promise((r) => setTimeout(r, 700));
    expect(missionUpserts(M1)).toBe(0);
    expect(missionUpserts(M2)).toBe(0);

    // Kolega zmienia M2 w bazie w tym czasie
    holder.client.rows("missions").find((m) => m.id === M2)!.next_step_label = "Zmiana kolegi";

    act(() => out.store!.updateDecision(M1, { problem: "Puste środy" }));
    await waitFor(() => expect(missionUpserts(M1)).toBeGreaterThan(0), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 700));
    expect(missionUpserts(M2)).toBe(0);
    expect(holder.client.rows("missions").find((m) => m.id === M2)!.next_step_label).toBe("Zmiana kolegi");
    expect(holder.client.rows("decision_context").find((d) => d.mission_id === M1)?.problem).toBe("Puste środy");
    expect(out.store!.saveState).toBe("saved");
    expect(window.localStorage.getItem("lutra-crm-v1")).toBeNull();
  });

  it("wpis w dzienniku nie zapisuje całej misji; z następnym krokiem — zapisuje", async () => {
    const out = await mount();
    let result: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      result = await out.store!.logActivity({
        missionId: M1, channel: "phone", direction: "outbound", outcome: "no_answer", subject: "", summary: "",
        contactId: "", occurredAt: "2026-10-21T09:00", durationMin: null,
      });
    });
    expect(result.ok).toBe(true);
    expect(holder.client.rows("conversations")).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 700));
    expect(missionUpserts(M1)).toBe(0);
    expect(out.store!.state.missions.find((m) => m.id === M1)!.activities).toHaveLength(1);

    await act(async () => {
      result = await out.store!.logActivity({
        missionId: M1, channel: "email", direction: "outbound", outcome: "sent", subject: "Lutra", summary: "Wysłane",
        contactId: "", occurredAt: "2026-10-21T09:05", durationMin: null, nextStep: "Follow-up", nextStepAt: "2026-10-24",
      });
    });
    expect(result.ok).toBe(true);
    await waitFor(() => expect(missionUpserts(M1)).toBeGreaterThan(0), { timeout: 2000 });
    const mission = holder.client.rows("missions").find((m) => m.id === M1)!;
    expect(mission.next_step_label).toBe("Follow-up");
    await waitFor(() => {
      const open = holder.client.rows("tasks").filter((t) => t.mission_id === M1 && !t.done_at);
      expect(open).toHaveLength(1);
      expect(open[0].title).toBe("Follow-up");
    });
    // Lokalna lista zadań dostaje zadanie z bazy, bez duplikatu
    await waitFor(() => {
      const local = out.store!.state.tasks.filter((t) => t.missionId === M1 && t.source === "next_step" && !t.doneAt);
      expect(local.map((t) => t.title)).toEqual(["Follow-up"]);
    });
  });

  it("zamknięcie jako przegrana: status, powód, closed_at, zamknięte kroki; wznowienie", async () => {
    const out = await mount();
    let gate: { ok: boolean; reason?: string } = { ok: false };
    act(() => {
      gate = out.store!.closeMission(M1, { status: "lost", reason: "", note: "", returnAt: "" });
    });
    expect(gate.ok).toBe(false);
    act(() => {
      gate = out.store!.closeMission(M1, { status: "lost", reason: "Decydent odmówił", note: "Nie teraz", returnAt: "" });
    });
    expect(gate.ok).toBe(true);
    await waitFor(() => expect(holder.client.rows("missions").find((m) => m.id === M1)!.status).toBe("lost"), { timeout: 2000 });
    const row = holder.client.rows("missions").find((m) => m.id === M1)!;
    expect(row.loss_reason).toBe("Decydent odmówił");
    expect(row.closed_at).toBeTruthy();
    expect((row.details as Record<string, unknown>).closeNote).toBe("Nie teraz");
    await waitFor(() => expect(holder.client.rows("tasks").find((t) => t.id === `t-${M1}`)!.done_at).toBeTruthy());
    expect(out.store!.missionByPartner(P1)).toBeUndefined();
    expect(out.store!.latestMissionByPartner(P1)?.status).toBe("lost");

    act(() => {
      gate = out.store!.reopenMission(M1);
    });
    expect(gate.ok).toBe(true);
    await waitFor(() => expect(holder.client.rows("missions").find((m) => m.id === M1)!.status).toBe("active"), { timeout: 2000 });
    expect(holder.client.rows("missions").find((m) => m.id === M1)!.closed_at).toBeNull();
    await waitFor(() =>
      expect(holder.client.rows("tasks").filter((t) => t.mission_id === M1 && !t.done_at)).toHaveLength(1),
    );
  });

  it("odświeżenie: nowe dane kolegi przychodzą, niezapisana edycja zostaje", async () => {
    const out = await mount();
    holder.client.rows("partners").push({ id: "p3", workspace_id: WS, name: "Pizzeria Etna", segment: "venue", dnc_status: "ok" });
    holder.client.rows("missions").find((m) => m.id === M2)!.next_step_label = "Kolega: recap";
    await act(async () => {
      await out.store!.refresh();
    });
    expect(out.store!.state.partners.map((p) => p.name)).toContain("Pizzeria Etna");
    expect(out.store!.state.missions.find((m) => m.id === M2)!.nextStepLabel).toBe("Kolega: recap");
  });

  it("zaproszenie z linku czeka na potwierdzenie; dopiero „Dołącz” je przyjmuje", async () => {
    const accepted: unknown[] = [];
    holder.client.rpcHandlers.peek_workspace_invite = () => [
      { status: "ok", workspace_name: "Zespół Lutra", invited_by: "Ola", invite_email: null, alone: true, own_partners: 2, own_missions: 2 },
    ];
    holder.client.rpcHandlers.accept_workspace_invite = (args) => {
      accepted.push(args.p_token);
      return WS;
    };
    window.sessionStorage.setItem("lutra-invite", "ab".repeat(32));
    const out = await mount();
    await waitFor(() => expect(out.store!.invite?.info?.status).toBe("ok"));
    expect(accepted).toEqual([]);
    expect(out.store!.invite?.info?.workspaceName).toBe("Zespół Lutra");
    await act(async () => {
      await out.store!.confirmInvite();
    });
    expect(accepted).toEqual(["ab".repeat(32)]);
    expect(out.store!.notice?.kind).toBe("ok");
    expect(out.store!.invite).toBeNull();
    expect(window.sessionStorage.getItem("lutra-invite")).toBeNull();
    expect(out.store!.state.user.isAdmin).toBe(true);
    expect(out.store!.schemaV4).toBe(true);
  });

  it("odrzucenie zaproszenia czyści link i niczego nie przyjmuje", async () => {
    const accepted: unknown[] = [];
    holder.client.rpcHandlers.peek_workspace_invite = () => [
      { status: "ok", workspace_name: "Obcy", invited_by: "X", invite_email: null, alone: true, own_partners: 2, own_missions: 2 },
    ];
    holder.client.rpcHandlers.accept_workspace_invite = (args) => {
      accepted.push(args.p_token);
      return "obcy";
    };
    window.sessionStorage.setItem("lutra-invite", "cd".repeat(32));
    const out = await mount();
    await waitFor(() => expect(out.store!.invite?.info?.status).toBe("ok"));
    act(() => out.store!.dismissInvite());
    expect(out.store!.invite).toBeNull();
    expect(window.sessionStorage.getItem("lutra-invite")).toBeNull();
    expect(accepted).toEqual([]);
  });

  it("kolega zapisał tę samą misję: konflikt, wczytana jego wersja, komunikat", async () => {
    const out = await mount();
    // Pierwszy zapis M1 — od teraz znamy jego wersję.
    act(() => out.store!.updateDecision(M1, { problem: "Puste środy" }));
    await waitFor(() => expect(missionUpserts(M1)).toBeGreaterThan(0), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 300));
    // Kolega zapisuje M1 (trigger zmienia wersję)
    await holder.client.from("missions").update({ next_step_label: "Kolega: recap" }).eq("id", M1);
    act(() => out.store!.setChannel(M1, "email"));
    await waitFor(() => expect(out.store!.notice?.kind).toBe("error"), { timeout: 3000 });
    expect(out.store!.notice?.text).toMatch(/Kawiarnia Nova/);
    expect(holder.client.rows("missions").find((m) => m.id === M1)!.next_step_label).toBe("Kolega: recap");
    expect(out.store!.state.missions.find((m) => m.id === M1)!.nextStepLabel).toBe("Kolega: recap");
    // Po wczytaniu wersji kolegi kolejna zmiana przechodzi normalnie
    act(() => out.store!.setChannel(M1, "linkedin"));
    await waitFor(() =>
      expect((holder.client.rows("missions").find((m) => m.id === M1)!.details as Record<string, unknown>).selectedChannel).toBe(
        "linkedin",
      ),
    { timeout: 2000 });
  });

  it("zmiana zapisana w trakcie wolnego odświeżenia zostaje w widoku i w bazie", async () => {
    const out = await mount();
    await new Promise((r) => setTimeout(r, 700));
    holder.slowTable = "mission_events";
    let refreshing: Promise<void> = Promise.resolve();
    act(() => {
      refreshing = out.store!.refresh();
    });
    await new Promise((r) => setTimeout(r, 50));
    act(() => out.store!.setRecording(M1, { conversationNote: "Decydent: wraca w piątek" }));
    await waitFor(
      () => {
        const row = holder.client.rows("missions").find((m) => m.id === M1)!;
        expect((row.details as Record<string, unknown>).conversationNote).toBe("Decydent: wraca w piątek");
      },
      { timeout: 2500 },
    );
    await act(async () => {
      await refreshing;
    });
    holder.slowTable = null;
    expect(out.store!.state.missions.find((m) => m.id === M1)!.conversationNote).toBe("Decydent: wraca w piątek");
    act(() => out.store!.setChannel(M1, "email"));
    await new Promise((r) => setTimeout(r, 900));
    const details = holder.client.rows("missions").find((m) => m.id === M1)!.details as Record<string, unknown>;
    expect(details.conversationNote).toBe("Decydent: wraca w piątek");
    expect(details.selectedChannel).toBe("email");
  });

  it("odświeżenie nie zapisuje z powrotem nietkniętych misji (brak luki latest/saved)", async () => {
    const out = await mount();
    await new Promise((r) => setTimeout(r, 700));
    for (const m of holder.client.rows("missions")) m.next_step_label = "Kolega: nowy krok";
    const before = missionUpserts(M1) + missionUpserts(M2);
    let armed = true;
    holder.onRead = (table) => {
      // Ostatni odczyt odświeżenia: w tym momencie odpalamy kolejne odświeżenie (jak timer zapisu).
      if (armed && table === "tasks") {
        armed = false;
        setTimeout(() => void out.store!.refresh(), 0);
      }
    };
    await act(async () => {
      await out.store!.refresh();
    });
    await new Promise((r) => setTimeout(r, 1200));
    expect(missionUpserts(M1) + missionUpserts(M2)).toBe(before);
    expect(out.store!.state.missions.map((m) => m.nextStepLabel)).toEqual(["Kolega: nowy krok", "Kolega: nowy krok"]);
  });

  it("niezapisana edycja w trakcie odświeżenia nie nadpisze zmiany kolegi (konflikt zamiast cichej utraty)", async () => {
    const out = await mount();
    await new Promise((r) => setTimeout(r, 700));
    let armed = true;
    holder.onRead = (table) => {
      // Na starcie odczytu: kolega zapisuje M1 (odświeżenie wczyta jego wersję),
      // a my zaczynamy pisać w M1 na starej wersji (nasz zapis jeszcze nie ruszył).
      if (armed && table === "partners") {
        armed = false;
        void holder.client
          .from("missions")
          .update({ next_step_label: "Kolega: recap" })
          .eq("id", M1)
          .then(() => undefined);
        out.store!.setRecording(M1, { conversationNote: "moja notatka" });
      }
    };
    await act(async () => {
      await out.store!.refresh();
    });
    await waitFor(() => expect(out.store!.notice?.kind).toBe("error"), { timeout: 3000 });
    const row = holder.client.rows("missions").find((m) => m.id === M1)!;
    expect(row.next_step_label).toBe("Kolega: recap");
    expect(out.store!.state.missions.find((m) => m.id === M1)!.nextStepLabel).toBe("Kolega: recap");
  });
});
