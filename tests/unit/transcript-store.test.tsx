// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-supabase";

const WS = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "22222222-2222-4222-8222-000000000001";
const M1 = "33333333-3333-4333-8333-000000000001";
const MEETING = "66666666-6666-4666-8666-000000000001";
const RECORDED = "66666666-6666-4666-8666-000000000002";

const TEXT = "Anna Kowalska: Środy po 16 jest pusto. Od sześciu osób zaczyna się to liczyć.";

const session = { user: { id: A, email: "kuba@lutra.pl", user_metadata: { full_name: "Kuba" } }, access_token: "t" };
type Client = FakeDb & { auth: unknown };
const holder: { client: Client } = { client: null as unknown as Client };

function makeClient() {
  const db = new FakeDb();
  db.rpcHandlers.ensure_workspace = () => WS;
  db.rpcHandlers.workspace_members = () => [{ id: A, full_name: "Kuba", role: "admin", email: "kuba@lutra.pl", is_me: true }];
  db.rows("workspaces").push({ id: WS, name: "Zespół" });
  db.rows("profiles").push({ id: A, workspace_id: WS, full_name: "Kuba", role: "admin" });
  db.rows("partners").push({ id: P1, workspace_id: WS, name: "Kawiarnia Nova", segment: "venue", dnc_status: "ok", created_at: "2026-01-01" });
  db.rows("missions").push({
    id: M1, workspace_id: WS, partner_id: P1, owner_user_id: A, status: "active", current_stage: "discovery",
    next_step_label: "Discovery", next_step_at: "2026-10-24", outcome: null, loss_reason: null,
    details: { completedStages: ["research", "contact"] }, started_at: "2026-10-01T10:00:00Z", closed_at: null,
    updated_at: "2025-12-31T00:00:00.000Z",
  });
  const recent = new Date(Date.now() - 3600_000).toISOString();
  db.rows("conversations").push(
    {
      id: MEETING, mission_id: M1, channel: "in_person", direction: "outbound", outcome: "connected",
      subject: "Discovery w lokalu", summary_human: "Rozmowa z Anną", started_at: recent, created_by: A,
    },
    {
      id: RECORDED, mission_id: M1, channel: "phone", direction: "outbound", outcome: "connected",
      subject: null, summary_human: "Nagranie", started_at: recent, created_by: A, recording_consent: "granted",
    },
  );
  db.rows("recordings").push({ id: "rec-1", conversation_id: RECORDED, storage_path: `${A}/${RECORDED}.webm`, duration_sec: 60 });
  db.rows("transcripts").push({ id: "tr-1", conversation_id: RECORDED, recording_id: "rec-1", status: "ready", full_text: "", provider: "web-speech" });
  return Object.assign(db, {
    auth: {
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session.user } }),
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
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

describe("transkrypt rozmowy w misji (Spinach → CRM)", () => {
  beforeEach(() => {
    holder.client = makeClient();
    clearMissionVersions();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("nowy transkrypt = wpis w dzienniku (spotkanie, odbyło się) + tekst w transcripts", async () => {
    const out = await mount();
    let result: { ok: boolean; id?: string; error?: string } = { ok: false };
    await act(async () => {
      result = await out.store!.addTranscript(M1, { text: TEXT, channel: "in_person", occurredAt: "2026-10-21T10:00:00.000Z" });
    });
    expect(result.ok).toBe(true);
    const row = holder.client.rows("conversations").find((c) => c.id === result.id)!;
    expect(row).toMatchObject({
      mission_id: M1,
      channel: "in_person",
      direction: "outbound",
      outcome: "connected",
      subject: "Rozmowa — transkrypt",
      started_at: "2026-10-21T10:00:00.000Z",
      recording_consent: "denied",
    });
    const transcript = holder.client.rows("transcripts").find((t) => t.conversation_id === result.id)!;
    expect(transcript).toMatchObject({ full_text: TEXT, status: "ready", provider: "manual" });
    expect(mission(out).calls.find((c) => c.id === result.id)).toMatchObject({ transcriptText: TEXT, transcriptStatus: "ready" });
    expect(mission(out).activities.find((a) => a.id === result.id)).toMatchObject({ hasTranscript: true, channel: "in_person" });
  });

  it("do istniejącego spotkania z dziennika: bez drugiego wpisu, transkrypt dopięty", async () => {
    const out = await mount();
    const before = holder.client.rows("conversations").length;
    let result: { ok: boolean; id?: string } = { ok: false };
    await act(async () => {
      result = await out.store!.addTranscript(M1, { text: TEXT, channel: "phone", occurredAt: "", attachTo: MEETING });
    });
    expect(result).toMatchObject({ ok: true, id: MEETING });
    expect(holder.client.rows("conversations")).toHaveLength(before);
    expect(holder.client.rows("transcripts").filter((t) => t.conversation_id === MEETING)).toHaveLength(1);
    expect(mission(out).activities.find((a) => a.id === MEETING)!.hasTranscript).toBe(true);
    expect(mission(out).calls.find((c) => c.id === MEETING)).toMatchObject({ channel: "in_person", transcriptText: TEXT });
  });

  it("nagranie z pustym transkryptem: tekst trafia do tego samego wiersza", async () => {
    const out = await mount();
    await act(async () => {
      await out.store!.addTranscript(M1, { text: TEXT, channel: "phone", occurredAt: "", attachTo: RECORDED });
    });
    const rows = holder.client.rows("transcripts").filter((t) => t.conversation_id === RECORDED);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ full_text: TEXT, provider: "manual" });
    expect(mission(out).calls.find((c) => c.id === RECORDED)).toMatchObject({ storagePath: `${A}/${RECORDED}.webm`, transcriptText: TEXT });
  });

  it("usunięcie: znika tekst, wpis w dzienniku zostaje i da się go potem usunąć", async () => {
    const out = await mount();
    let id = "";
    await act(async () => {
      id = (await out.store!.addTranscript(M1, { text: TEXT, channel: "in_person", occurredAt: new Date().toISOString() })).id!;
    });
    let removed: { ok: boolean } = { ok: false };
    await act(async () => {
      removed = await out.store!.removeTranscript(M1, id);
    });
    expect(removed.ok).toBe(true);
    expect(holder.client.rows("transcripts").some((t) => t.conversation_id === id)).toBe(false);
    expect(mission(out).calls.find((c) => c.id === id)).toMatchObject({ transcriptStatus: "idle", transcriptText: undefined });
    expect(mission(out).activities.find((a) => a.id === id)!.hasTranscript).toBe(false);
    let gone: { ok: boolean } = { ok: false };
    await act(async () => {
      gone = await out.store!.removeActivity(M1, id);
    });
    expect(gone.ok).toBe(true);
  });

  it("baza sprzed v4 (bez kolumn dziennika): zapis bez nich; za krótki tekst — błąd", async () => {
    const out = await mount();
    holder.client.failNext = {
      table: "conversations",
      op: "insert",
      error: { code: "PGRST204", message: "Could not find the 'direction' column of 'conversations' in the schema cache" },
    };
    let result: { ok: boolean; id?: string } = { ok: false };
    await act(async () => {
      result = await out.store!.addTranscript(M1, { text: TEXT, channel: "phone", occurredAt: "2026-10-21T10:00:00.000Z" });
    });
    expect(result.ok).toBe(true);
    const row = holder.client.rows("conversations").find((c) => c.id === result.id)!;
    expect(row.direction).toBeUndefined();
    expect(row.started_at).toBe("2026-10-21T10:00:00.000Z");

    let short: { ok: boolean; error?: string } = { ok: true };
    await act(async () => {
      short = await out.store!.addTranscript(M1, { text: "za mało", channel: "phone", occurredAt: "" });
    });
    expect(short.ok).toBe(false);
    expect(short.error).toMatch(/za krótki/);
  });

  it("drugi transkrypt do tej samej rozmowy — odmowa; poprawka bez wiersza w bazie — błąd, nie „zapisano”", async () => {
    const out = await mount();
    await act(async () => {
      await out.store!.addTranscript(M1, { text: TEXT, channel: "phone", occurredAt: "", attachTo: MEETING });
    });
    let again: { ok: boolean; error?: string } = { ok: true };
    await act(async () => {
      again = await out.store!.addTranscript(M1, { text: TEXT, channel: "phone", occurredAt: "", attachTo: MEETING });
    });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/ma już transkrypt/);
    expect(holder.client.rows("transcripts").filter((t) => t.conversation_id === MEETING)).toHaveLength(1);

    // RLS bez błędu, ale bez zmienionych wierszy (np. cudza misja) → komunikat zamiast cichego sukcesu.
    holder.client.tables.set("transcripts", holder.client.rows("transcripts").filter((t) => t.conversation_id !== MEETING));
    let saved: { ok: boolean; error?: string } = { ok: true };
    await act(async () => {
      saved = await out.store!.saveTranscript(MEETING, `${TEXT} Poprawka.`);
    });
    expect(saved.ok).toBe(false);
    expect(saved.error).toMatch(/Nie zapisano/);
  });

  it("poprawka transkryptu zapisuje się i oznacza wpis w dzienniku", async () => {
    const out = await mount();
    let id = "";
    await act(async () => {
      id = (await out.store!.addTranscript(M1, { text: TEXT, channel: "in_person", occurredAt: new Date().toISOString() })).id!;
    });
    await act(async () => {
      await out.store!.saveTranscript(id, `${TEXT}\nKuba: Dziękuję.`);
    });
    expect(holder.client.rows("transcripts").find((t) => t.conversation_id === id)!.full_text).toMatch(/Dziękuję/);
    expect(mission(out).calls.find((c) => c.id === id)!.transcriptText).toMatch(/Dziękuję/);
  });
});
