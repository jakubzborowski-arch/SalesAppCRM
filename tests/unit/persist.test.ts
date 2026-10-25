import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-supabase";

const fake = { db: new FakeDb() };

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => fake.db,
  isSupabaseConfigured: () => true,
  isMissingCrmTable: (error: { code?: string; message?: string } | null) =>
    Boolean(error && (error.code === "PGRST205" || error.code === "42P01")),
}));

const {
  persistMission,
  loadCrm,
  insertActivity,
  V4_MISSING,
  MissionConflictError,
  clearMissionVersions,
  replaceMissionVersions,
} = await import("@/lib/db");
const { emptyMission } = await import("@/lib/seed");
import type { Mission } from "@/lib/types";

const WS = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P = "22222222-2222-4222-8222-222222222222";

function mission(patch: Partial<Mission> = {}): Mission {
  return { ...emptyMission(P, "33333333-3333-4333-8333-333333333333"), ownerUserId: A, ...patch };
}

const at = (iso: string) => vi.setSystemTime(new Date(iso));

// Te same scenariusze dla zapisu w jednej transakcji (v8) i po staremu (baza bez save_mission_bundle).
describe.each([
  { mode: "jedna transakcja", rpc: true },
  { mode: "po staremu, bez funkcji w bazie", rpc: false },
])("persistMission ($mode)", ({ rpc }) => {
  beforeEach(() => {
    fake.db = new FakeDb();
    if (!rpc) delete fake.db.rpcHandlers.save_mission_bundle;
    clearMissionVersions();
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-01T10:00:00Z");
  });

  it("kolega zapisał misję po naszym odczycie: zapis odrzucony, jego zmiana zostaje", async () => {
    const m = mission({ nextStepLabel: "Zadzwonić", nextStepAt: "2026-10-02" });
    await persistMission(m, WS, A);
    // Kolega zapisuje tę samą misję (trigger zmienia updated_at)
    await fake.db.from("missions").update({ next_step_label: "Kolega: recap" }).eq("id", m.id);
    await expect(persistMission({ ...m, nextStepLabel: "Moja zmiana" }, WS, A)).rejects.toBeInstanceOf(
      MissionConflictError,
    );
    expect(fake.db.rows("missions")[0].next_step_label).toBe("Kolega: recap");
  });

  it("wersja z loadCrm pozwala zapisać bez konfliktu", async () => {
    fake.db.rows("partners").push({ id: P, workspace_id: WS, name: "Nova", segment: "venue", dnc_status: "ok" });
    fake.db.rows("missions").push({
      id: "33333333-3333-4333-8333-333333333333", workspace_id: WS, partner_id: P, owner_user_id: A, status: "active",
      current_stage: "contact", details: {}, started_at: "2026-09-01", updated_at: "2026-09-02T10:00:00.000Z",
    });
    const { missions, versions } = await loadCrm(WS);
    replaceMissionVersions(versions);
    await persistMission({ ...missions[0], nextStepLabel: "Nowy krok" }, WS, A);
    expect(fake.db.rows("missions")[0].next_step_label).toBe("Nowy krok");
    const updates = fake.db.calls.filter((c) => c.table === "missions" && c.op === "update");
    expect(updates.length).toBeGreaterThan(0);
  });

  it("nowa misja: właściciel, decision_context, zadanie następnego kroku", async () => {
    const m = mission({ nextStepLabel: "Umów discovery", nextStepAt: "2026-10-02" });
    const { nextStepTask } = await persistMission(m, WS, A);
    const row = fake.db.rows("missions")[0];
    expect(row.owner_user_id).toBe(A);
    expect(row.closed_at).toBeNull();
    expect(fake.db.rows("decision_context")).toHaveLength(1);
    expect(nextStepTask?.title).toBe("Umów discovery");
    expect(fake.db.rows("tasks")).toHaveLength(1);
    expect(fake.db.rows("tasks")[0].owner_user_id).toBe(A);
  });

  it("zapis przez kolegę nie zmienia właściciela misji ani zadania", async () => {
    await persistMission(mission({ nextStepLabel: "Krok", nextStepAt: "2026-10-02" }), WS, B);
    expect(fake.db.rows("missions")[0].owner_user_id).toBe(A);
    expect(fake.db.rows("tasks")[0].owner_user_id).toBe(A);
  });

  it("data potwierdzenia faktu i odhaczenia checklisty nie przeskakuje przy kolejnych zapisach", async () => {
    const needId = crypto.randomUUID();
    const m = mission({
      checklist: { "research:profile": true },
      needs: [
        { id: needId, category: "off_peak", title: "Puste środy", description: "x", priority: 4, status: "fact", confirmed: true },
      ],
    });
    await persistMission(m, WS, A);
    const firstNeed = fake.db.rows("needs")[0];
    const firstCheck = fake.db.rows("mission_checklist_items")[0];
    expect(firstNeed.confirmed_at).toBe("2026-10-01T10:00:00.000Z");
    expect(firstNeed.confirmed_by).toBe(A);

    at("2026-10-05T12:00:00Z");
    await persistMission({ ...m, conversationNote: "inna notatka" }, WS, B);
    const need = fake.db.rows("needs")[0];
    expect(need.confirmed_at).toBe("2026-10-01T10:00:00.000Z");
    expect(need.confirmed_by).toBe(A);
    expect(fake.db.rows("mission_checklist_items")[0].done_at).toBe(firstCheck.done_at);

    // Odznaczenie i ponowne potwierdzenie = nowa data
    await persistMission({ ...m, needs: [{ ...m.needs[0], confirmed: false, status: "observation" }] }, WS, B);
    expect(fake.db.rows("needs")[0].confirmed_at).toBeNull();
    at("2026-10-06T09:00:00Z");
    await persistMission(m, WS, B);
    expect(fake.db.rows("needs")[0].confirmed_at).toBe("2026-10-06T09:00:00.000Z");
    expect(fake.db.rows("needs")[0].confirmed_by).toBe(B);
  });

  it("zatwierdzenie oferty zachowuje datę; zmiana wariantu = nowe zatwierdzenie", async () => {
    const m = mission({ selectedVariant: "A", offerApproved: true });
    await persistMission(m, WS, A);
    expect(fake.db.rows("offers")[0].approved_at).toBe("2026-10-01T10:00:00.000Z");
    at("2026-10-03T10:00:00Z");
    await persistMission({ ...m, conversationNote: "x" }, WS, B);
    expect(fake.db.rows("offers")[0].approved_at).toBe("2026-10-01T10:00:00.000Z");
    expect(fake.db.rows("offers")[0].approved_by).toBe(A);
    await persistMission({ ...m, selectedVariant: "B" }, WS, B);
    expect(fake.db.rows("offers")[0].approved_at).toBe("2026-10-03T10:00:00.000Z");
    expect(fake.db.rows("offers")[0].approved_by).toBe(B);
  });

  it("odhaczony krok zostaje w historii, nowy krok to nowe zadanie", async () => {
    const m = mission({ nextStepLabel: "Zadzwonić", nextStepAt: "2026-10-02" });
    await persistMission(m, WS, A);
    fake.db.rows("tasks")[0].done_at = "2026-10-02T08:00:00Z";
    // Ten sam krok po odhaczeniu nie wraca jako nowe zadanie
    await persistMission({ ...m, conversationNote: "x" }, WS, A);
    expect(fake.db.rows("tasks")).toHaveLength(1);
    // Nowy krok
    const { nextStepTask } = await persistMission({ ...m, nextStepLabel: "Wysłać recap", nextStepAt: "2026-10-04" }, WS, A);
    const tasks = fake.db.rows("tasks");
    expect(tasks).toHaveLength(2);
    expect(tasks.find((t) => t.title === "Zadzwonić")?.done_at).toBeTruthy();
    expect(nextStepTask?.title).toBe("Wysłać recap");
    // Zmiana otwartego kroku = aktualizacja, nie kolejne zadanie
    await persistMission({ ...m, nextStepLabel: "Wysłać recap i cennik", nextStepAt: "2026-10-04" }, WS, A);
    expect(fake.db.rows("tasks")).toHaveLength(2);
    expect(fake.db.rows("tasks").some((t) => t.title === "Wysłać recap i cennik" && !t.done_at)).toBe(true);
  });

  it("przegrana zamyka otwarte kroki; data zamknięcia stała", async () => {
    const m = mission({ nextStepLabel: "Zadzwonić", nextStepAt: "2026-10-02" });
    await persistMission(m, WS, A);
    const lost = { ...m, status: "lost" as const, outcome: "lost" as const, lossReason: "Decydent odmówił", closedAt: "2026-10-01T11:00:00.000Z", nextStepLabel: "" };
    await persistMission(lost, WS, A);
    expect(fake.db.rows("tasks")[0].done_at).toBeTruthy();
    expect(fake.db.rows("missions")[0].closed_at).toBe("2026-10-01T11:00:00.000Z");
    expect(fake.db.rows("missions")[0].loss_reason).toBe("Decydent odmówił");
    at("2026-10-09T10:00:00Z");
    await persistMission({ ...lost, closeNote: "dopisek" }, WS, A);
    expect(fake.db.rows("missions")[0].closed_at).toBe("2026-10-01T11:00:00.000Z");
    // Wznowienie czyści closed_at
    await persistMission({ ...lost, status: "active", outcome: null, closedAt: undefined, nextStepLabel: "Wznów", nextStepAt: "2026-10-10" }, WS, A);
    expect(fake.db.rows("missions")[0].closed_at).toBeNull();
    expect(fake.db.rows("tasks").filter((t) => !t.done_at)).toHaveLength(1);
  });

  it("wrócić później przestawia otwarty krok na datę powrotu", async () => {
    const m = mission({ nextStepLabel: "Zadzwonić", nextStepAt: "2026-10-02" });
    await persistMission(m, WS, A);
    await persistMission({ ...m, status: "nurture", outcome: "nurture", closedAt: "2026-10-01T12:00:00Z", nextStepLabel: "Wróć do partnera", nextStepAt: "2026-11-01" }, WS, A);
    const open = fake.db.rows("tasks").filter((t) => !t.done_at);
    expect(open).toHaveLength(1);
    expect(open[0].title).toBe("Wróć do partnera");
    expect(open[0].due_at).toBe("2026-11-01");
  });

  it("szczupłe details: pełny JSON tylko przy pierwszym zapisie", async () => {
    const m = mission({ closeNote: "nota" });
    const writes = () =>
      fake.db.calls.filter((c) => c.table === "missions" && (c.op === "update" || c.op === "upsert")).length;
    await persistMission(m, WS, A);
    const afterFirst = writes();
    await persistMission({ ...m, conversationNote: "x" }, WS, A);
    // Po staremu: warunkowy zapis misji + domknięcie wersji po tabelach misji.
    // W jednej transakcji: jeden zapis misji (wersja sprawdzana w tej samej transakcji).
    expect(writes() - afterFirst).toBe(rpc ? 1 : 2);
    const details = fake.db.rows("missions")[0].details as Record<string, unknown>;
    expect(details.needs).toBeUndefined();
    expect(details.closeNote).toBe("nota");
  });

  it("umowa i aktywacja z tego samego zapisu wskazują nową ofertę i umowę", async () => {
    const base = mission();
    await persistMission(
      {
        ...base,
        selectedVariant: "A",
        contract: { ...base.contract, companyName: "Nova sp. z o.o.", documentPath: `${A}/m/umowa.pdf` },
        activation: { ...base.activation, partnerCode: "LUTRA-NOVA", testNotes: "ok" },
      },
      WS,
      A,
    );
    const offer = fake.db.rows("offers")[0];
    const contract = fake.db.rows("contracts")[0];
    expect(offer.id).toBeTruthy();
    expect(contract.offer_id).toBe(offer.id);
    expect(contract.status).toBe("ready");
    expect(fake.db.rows("activations")[0].contract_id).toBe(contract.id);
    expect(fake.db.rows("activations")[0].test_notes).toBe("ok");
  });

  it("baza bez kolumny test_notes: aktywacja zapisuje się bez niej", async () => {
    fake.db.missingColumns.activations = ["test_notes"];
    const base = mission();
    await persistMission({ ...base, activation: { ...base.activation, partnerCode: "LUTRA-X", testNotes: "notatka" } }, WS, A);
    const row = fake.db.rows("activations")[0];
    expect(row.partner_code).toBe("LUTRA-X");
    expect("test_notes" in row).toBe(false);
  });

  // Storage nie wchodzi do transakcji. W jednej transakcji stary plik kasujemy po udanym zapisie;
  // po staremu umowa wskazuje nowy plik od razu po swoim zapisie, więc stary znika wtedy (jak dotąd).
  it("zastąpiony plik umowy znika ze Storage, gdy umowa już wskazuje nowy", async () => {
    const base = mission();
    const withPdf = (path: string): Mission => ({
      ...base,
      contract: { ...base.contract, companyName: "Nova", documentPath: path },
      activation: { ...base.activation, partnerCode: "LUTRA-X" },
    });
    await persistMission(withPdf(`${A}/m/stara.pdf`), WS, A);
    fake.db.failNext = { table: "activations", op: "upsert", error: { message: "fetch failed" } };
    await expect(persistMission(withPdf(`${A}/m/nowa.pdf`), WS, A)).rejects.toMatchObject({ message: "fetch failed" });
    expect(fake.db.rows("contracts")[0].document_path).toBe(rpc ? `${A}/m/stara.pdf` : `${A}/m/nowa.pdf`);
    expect(fake.db.removedFiles).toEqual(rpc ? [] : [`contracts/${A}/m/stara.pdf`]);
    await persistMission(withPdf(`${A}/m/nowa.pdf`), WS, A);
    expect(fake.db.rows("contracts")[0].document_path).toBe(`${A}/m/nowa.pdf`);
    expect(fake.db.removedFiles).toEqual([`contracts/${A}/m/stara.pdf`]);
  });
});

describe("persistMission: jedna transakcja", () => {
  beforeEach(() => {
    fake.db = new FakeDb();
    clearMissionVersions();
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-01T10:00:00Z");
  });

  const state = () => JSON.stringify([...fake.db.tables].filter(([, rows]) => rows.length));

  it("błąd w środku zapisu: baza bez zmian (także misja i jej wersja), kolejny zapis przechodzi", async () => {
    const needId = crypto.randomUUID();
    const m = mission({ nextStepLabel: "Zadzwonić", nextStepAt: "2026-10-02", checklist: { "research:profile": true } });
    await persistMission(m, WS, A);
    const before = state();
    const changed = {
      ...m,
      nextStepLabel: "Wysłać ofertę",
      conversationNote: "po rozmowie",
      needs: [{ id: needId, category: "off_peak" as const, title: "Puste środy", description: "", priority: 3, status: "fact" as const, confirmed: true }],
    };
    fake.db.failNext = { table: "needs", op: "upsert", error: { code: "22P02", message: "invalid input value for enum need_category" } };
    await expect(persistMission(changed, WS, A)).rejects.toMatchObject({ code: "22P02" });
    expect(state()).toBe(before);
    // Wersja w widoku i w bazie wciąż ta sama: ponowienie przechodzi bez konfliktu.
    const { nextStepTask } = await persistMission(changed, WS, A);
    expect(nextStepTask?.title).toBe("Wysłać ofertę");
    expect(fake.db.rows("needs")).toHaveLength(1);
    expect(fake.db.rows("missions")[0].next_step_label).toBe("Wysłać ofertę");
    expect(fake.db.rows("tasks")).toHaveLength(1);
  });

  it("nieznana wersja przy istniejącej misji = konflikt zamiast nadpisania w ciemno", async () => {
    const m = mission({ nextStepLabel: "Moje" });
    fake.db.rows("missions").push({
      id: m.id, workspace_id: WS, partner_id: P, owner_user_id: B, status: "active", current_stage: "contact",
      next_step_label: "Kolegi", details: {}, started_at: "2026-09-01", updated_at: "2026-09-02T10:00:00.000Z",
    });
    await expect(persistMission(m, WS, A)).rejects.toBeInstanceOf(MissionConflictError);
    expect(fake.db.rows("missions")[0].next_step_label).toBe("Kolegi");
    expect(fake.db.rows("decision_context")).toHaveLength(0);
  });

  it("baza bez v6 odrzuca nowy status umowy: zapis jeszcze raz w starym formacie", async () => {
    const original = fake.db.rpcHandlers.save_mission_bundle;
    const seen: unknown[] = [];
    fake.db.rpcHandlers.save_mission_bundle = (args) => {
      const contract = (args.p_ops as Array<{ table: string; rows?: Array<Record<string, unknown>> }>).find((op) => op.table === "contracts");
      seen.push(contract?.rows?.[0]?.status);
      if (contract?.rows?.[0]?.status === "sent") {
        throw Object.assign(new Error('new row for relation "contracts" violates check constraint "contracts_status_check"'), { code: "23514" });
      }
      return original(args);
    };
    const base = mission();
    await persistMission({ ...base, contract: { ...base.contract, documentPath: `${A}/m/u.pdf`, sentAt: "2026-10-01T09:00:00Z" } }, WS, A);
    expect(seen).toEqual(["sent", "ready"]);
    expect(fake.db.rows("contracts")[0]).toMatchObject({ status: "ready", document_path: `${A}/m/u.pdf` });
    expect("sent_at" in fake.db.rows("contracts")[0]).toBe(false);
  });

  it("baza bez funkcji: zapis po staremu i bez ponownego pytania o funkcję", async () => {
    delete fake.db.rpcHandlers.save_mission_bundle;
    const rpc = vi.spyOn(fake.db, "rpc");
    const m = mission({ nextStepLabel: "Zadzwonić", nextStepAt: "2026-10-02" });
    const { nextStepTask } = await persistMission(m, WS, A);
    expect(nextStepTask?.title).toBe("Zadzwonić");
    await persistMission({ ...m, conversationNote: "x" }, WS, A);
    expect(rpc.mock.calls.filter(([name]) => name === "save_mission_bundle")).toHaveLength(1);
    expect(fake.db.rows("missions")[0].details).toMatchObject({ conversationNote: "x" });
    // Po ponownym logowaniu sprawdzamy jeszcze raz (np. po wgraniu v8).
    clearMissionVersions();
    await persistMission({ ...m, conversationNote: "y" }, WS, A);
    expect(rpc.mock.calls.filter(([name]) => name === "save_mission_bundle")).toHaveLength(2);
  });
});

describe("loadCrm i dziennik", () => {
  beforeEach(() => {
    fake.db = new FakeDb();
    clearMissionVersions();
  });

  it("wczytuje ponad 1000 partnerów i kontakty z wielu paczek", async () => {
    for (let i = 0; i < 1203; i++) {
      const id = `p-${String(i).padStart(5, "0")}`;
      fake.db.rows("partners").push({ id, workspace_id: WS, name: `Lokal ${i}`, segment: "venue", dnc_status: "ok", created_at: "2026-01-01" });
      fake.db.rows("partner_contacts").push({ id: `c-${i}`, partner_id: id, name: `Osoba ${i}` });
    }
    const { partners } = await loadCrm(WS);
    expect(partners).toHaveLength(1203);
    expect(partners.every((p) => p.contacts.length === 1)).toBe(true);
    // Projekt z limitem „Max rows” = 500: dalej wszystko
    fake.db.maxRows = 500;
    const capped = await loadCrm(WS);
    expect(capped.partners).toHaveLength(1203);
  });

  it("buduje wpisy dziennika i historię z bazy", async () => {
    const M = "44444444-4444-4444-8444-444444444444";
    fake.db.rows("partners").push({ id: P, workspace_id: WS, name: "Nova", segment: "venue", dnc_status: "ok", created_at: "2026-01-01" });
    fake.db.rows("missions").push({
      id: M, workspace_id: WS, partner_id: P, owner_user_id: A, status: "lost", current_stage: "contact",
      next_step_label: "", next_step_at: null, outcome: "lost", loss_reason: "Decydent odmówił",
      details: { closeNote: "Nie teraz" }, started_at: "2026-09-01T10:00:00Z", closed_at: "2026-09-10T10:00:00Z",
    });
    fake.db.rows("conversations").push(
      { id: "c1", mission_id: M, channel: "phone", direction: "outbound", outcome: "no_answer", summary_human: null, started_at: "2026-09-02T10:00:00Z", created_by: A, recording_consent: "pending" },
      { id: "c2", mission_id: M, channel: "email", direction: "inbound", outcome: "replied", subject: "Re", summary_human: "ok", started_at: "2026-09-03T10:00:00Z", created_by: B, recording_consent: "pending" },
      { id: "c3", mission_id: M, channel: "phone", summary_human: "stara notatka", started_at: "2026-08-30T10:00:00Z", recording_consent: "pending" },
    );
    fake.db.rows("transcripts").push({ id: "t1", conversation_id: "c3", status: "ready", full_text: "tekst" });
    fake.db.rows("mission_events").push(
      { id: "e1", mission_id: M, kind: "created", to_value: "research", created_at: "2026-09-01T10:00:00Z", actor_id: A },
      { id: "e2", mission_id: M, kind: "status", from_value: "active", to_value: "lost", note: "Decydent odmówił", created_at: "2026-09-10T10:00:00Z", actor_id: A },
    );

    const { missions } = await loadCrm(WS);
    const m = missions[0];
    expect(m.closedAt).toBe("2026-09-10T10:00:00Z");
    expect(m.closeNote).toBe("Nie teraz");
    expect(m.ownerUserId).toBe(A);
    expect(m.activities.map((a) => a.id)).toEqual(["c2", "c1", "c3"]);
    expect(m.activities[0]).toMatchObject({ channel: "email", direction: "inbound", outcome: "replied", subject: "Re", createdBy: B });
    expect(m.activities[2]).toMatchObject({ outcome: null, direction: "outbound", hasTranscript: true });
    expect(m.events.map((e) => e.kind)).toEqual(["created", "status"]);
    expect(m.calls).toHaveLength(3);
  });

  it("bez tabeli mission_events misje wczytują się bez historii", async () => {
    fake.db.rows("partners").push({ id: P, workspace_id: WS, name: "Nova", segment: "venue", dnc_status: "ok" });
    fake.db.rows("missions").push({ id: "m1", workspace_id: WS, partner_id: P, status: "active", current_stage: "research", details: {}, started_at: "2026-09-01" });
    fake.db.failNext = { table: "mission_events", op: "select", error: { code: "PGRST205", message: "missing" } };
    const { missions } = await loadCrm(WS);
    expect(missions[0].events).toEqual([]);
  });

  it("insertActivity: brak kolumn v4 daje czytelny komunikat", async () => {
    fake.db.failNext = {
      table: "conversations",
      op: "insert",
      error: { code: "PGRST204", message: "Could not find the 'direction' column of 'conversations' in the schema cache" },
    };
    await expect(
      insertActivity({
        missionId: "m1", channel: "phone", direction: "outbound", outcome: "connected", subject: "", summary: "x",
        contactId: "", occurredAt: "2026-10-01T10:00", durationMin: 5,
      }),
    ).rejects.toThrow(V4_MISSING);
  });

  it("insertActivity zapisuje pola dziennika", async () => {
    const activity = await insertActivity({
      missionId: "m1", channel: "email", direction: "inbound", outcome: "replied", subject: " Re: oferta ", summary: " Pasuje czwartek ",
      contactId: "nie-uuid", occurredAt: "2026-10-01T10:00", durationMin: null,
    });
    const row = fake.db.rows("conversations")[0];
    expect(row).toMatchObject({ channel: "email", direction: "inbound", outcome: "replied", subject: "Re: oferta", summary_human: "Pasuje czwartek", contact_id: null });
    expect(activity.subject).toBe("Re: oferta");
  });
});

describe("zapis w jednej transakcji: zgubiona odpowiedź serwera", () => {
  beforeEach(() => {
    fake.db = new FakeDb();
    clearMissionVersions();
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-01T10:00:00Z");
  });

  it("baza przyjęła zapis, odpowiedź zginęła: ponowienie i kolejna zmiana przechodzą bez fałszywego konfliktu", async () => {
    const m = mission({ nextStepLabel: "Zadzwonić", nextStepAt: "2026-10-02" });
    await persistMission(m, WS, A);
    const realRpc = fake.db.rpc.bind(fake.db);
    let lose = true;
    fake.db.rpc = (async (name: string, args: Record<string, unknown> = {}) => {
      const result = await realRpc(name, args);
      if (name === "save_mission_bundle" && lose) {
        lose = false;
        return { data: null, error: { message: "TypeError: fetch failed" } };
      }
      return result;
    }) as typeof fake.db.rpc;
    at("2026-10-01T10:05:00Z");
    const first = { ...m, nextStepLabel: "Wysłać recap" };
    await expect(persistMission(first, WS, A)).rejects.toMatchObject({ message: expect.stringMatching(/fetch failed/) });
    expect(fake.db.rows("missions")[0].next_step_label).toBe("Wysłać recap");
    // Ponowienie tego samego zapisu (stara wersja w pamięci) — rozpoznany własny zapis, bez konfliktu.
    await expect(persistMission(first, WS, A)).resolves.toBeTruthy();
    // Zgubiona odpowiedź, a w międzyczasie kolejna zmiana — też przechodzi.
    lose = true;
    at("2026-10-01T10:06:00Z");
    await expect(persistMission({ ...m, nextStepLabel: "Krok 3" }, WS, A)).rejects.toBeTruthy();
    at("2026-10-01T10:07:00Z");
    await persistMission({ ...m, nextStepLabel: "Krok 4" }, WS, A);
    expect(fake.db.rows("missions")[0].next_step_label).toBe("Krok 4");
    // Prawdziwy konflikt (kolega) nadal jest konfliktem.
    await fake.db.from("missions").update({ next_step_label: "Kolega" }).eq("id", m.id);
    await expect(persistMission({ ...m, nextStepLabel: "Krok 5" }, WS, A)).rejects.toBeInstanceOf(MissionConflictError);
  });
});
