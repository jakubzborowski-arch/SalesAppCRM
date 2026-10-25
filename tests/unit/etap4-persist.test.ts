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
  persistPartner,
  loadCrm,
  clearMissionVersions,
  replaceMissionVersions,
  preferFilled,
  loadPartnerMetrics,
  savePartnerMetricsRow,
  V8_MISSING,
} = await import("@/lib/db");
const { emptyCompany } = await import("@/lib/company");
const { emptyMission } = await import("@/lib/seed");
const { changeRulesFor } = await import("@/lib/terms");
import type { Mission, Partner } from "@/lib/types";

const WS = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = "22222222-2222-4222-8222-222222222222";
const M = "33333333-3333-4333-8333-333333333333";

function mission(patch: Partial<Mission> = {}): Mission {
  return { ...emptyMission(P, M), ownerUserId: A, ...patch };
}

/** Zapis, potem drugi zapis (już „slim”: kontrakt tylko w tabelach misji) i ponowne wczytanie. */
async function saveAndReload(m: Mission) {
  await persistMission(m, WS, A);
  await persistMission({ ...m, conversationNote: `${m.conversationNote} ` }, WS, A);
  const { missions, versions } = await loadCrm(WS);
  replaceMissionVersions(versions);
  return missions.find((item) => item.id === M)!;
}

describe("umowa i aktywacja po odświeżeniu (tabele misji)", () => {
  beforeEach(() => {
    fake.db = new FakeDb();
    clearMissionVersions();
    fake.db.rows("partners").push({ id: P, workspace_id: WS, name: "Nova", segment: "venue", dnc_status: "ok" });
  });

  it("okres i zasady 7 dni z oferty zostają, choć nie ma jeszcze danych firmy", async () => {
    const base = mission({ selectedVariant: "A", offerApproved: true });
    const rules = changeRulesFor(true);
    const loaded = await saveAndReload({
      ...base,
      contract: { ...base.contract, startAt: "2026-11-01", endAt: "2027-01-31", changeRules: rules },
    });
    expect(loaded.contract.startAt).toBe("2026-11-01");
    expect(loaded.contract.endAt).toBe("2027-01-31");
    expect(loaded.contract.changeRules).toBe(rules);
    // Kolejna edycja (nazwa firmy) nie kasuje okresu w bazie.
    await persistMission({ ...loaded, contract: { ...loaded.contract, companyName: "Nova sp. z o.o." } }, WS, A);
    const row = fake.db.rows("contracts")[0];
    expect(row.start_at).toBe("2026-11-01");
    expect(row.change_rules).toBe(rules);
    const offer = fake.db.rows("offers").find((item) => item.mission_id === M)!;
    expect((offer.custom_terms as { period: { from: string } }).period.from).toBe("2026-11-01");
  });

  it("porozumienie mailowe: wysyłka, potwierdzenie i załącznik partnera zostają", async () => {
    const base = mission({ agreementForm: "email" });
    const loaded = await saveAndReload({
      ...base,
      contract: {
        ...base.contract,
        startAt: "2026-11-01",
        endAt: "2027-01-31",
        sentAt: "2026-10-22T10:00:00.000Z",
        partnerSignedAt: "2026-10-23T10:00:00.000Z",
        signedDocumentPath: `${A}/${M}/odpowiedz.png`,
      },
    });
    expect(loaded.agreementForm).toBe("email");
    expect(loaded.contract.sentAt).toBe("2026-10-22T10:00:00.000Z");
    expect(loaded.contract.partnerSignedAt).toBe("2026-10-23T10:00:00.000Z");
    expect(loaded.contract.signedDocumentPath).toBe(`${A}/${M}/odpowiedz.png`);
  });

  it("aktywacja: data przeglądu i notatka z testu bez kodu partnera zostają", async () => {
    const base = mission();
    const loaded = await saveAndReload({
      ...base,
      activation: { ...base.activation, checkInAt: "2026-11-21", testNotes: "QR działa", opsContactPhone: "500" },
    });
    expect(loaded.activation.checkInAt).toBe("2026-11-21");
    expect(loaded.activation.testNotes).toBe("QR działa");
  });

  it("puste pole w wierszu nie kasuje starszych danych z details", () => {
    const old = emptyMission(P, M).contract;
    const merged = preferFilled(
      { ...old, companyName: "Z details", startAt: "2026-01-01" },
      { ...old, companyName: "", startAt: "2026-02-01", signedByHuman: false, documentPath: undefined },
    );
    expect(merged.companyName).toBe("Z details");
    expect(merged.startAt).toBe("2026-02-01");
  });
});

describe("karta partnera na bazie bez pojemności (przed v7)", () => {
  beforeEach(() => {
    fake.db = new FakeDb();
    fake.db.rows("partners").push({ id: P, workspace_id: WS, name: "Nova", segment: "venue", dnc_status: "ok" });
  });

  it("brak kolumny pojemności nie zabiera zmiany typu partnera", async () => {
    const before: Partner = {
      id: P, name: "Nova", segment: "venue", capacity: null, city: "", address: "", category: "", subcategory: "",
      website: "", instagram: "", facebook: "", socialOther: "", priority: "", priorityReason: "", source: "", dnc: false,
      company: emptyCompany(), contacts: [], consents: [],
    };
    fake.db.failNext = { table: "partners", op: "update", error: { code: "PGRST204", message: "Could not find the 'capacity' column of 'partners' in the schema cache" } };
    const result = await persistPartner({ ...before, segment: "community", capacity: 40 }, before);
    expect(result.dropped).toEqual(["v7"]);
    expect(fake.db.rows("partners")[0].segment).toBe("community");
    expect(fake.db.rows("partners")[0].capacity).toBeUndefined();
  });
});

describe("v8: wynik dopasowania i metryki partnera", () => {
  const base: Partner = {
    id: P, name: "Nova", segment: "venue", capacity: 20, city: "", address: "", category: "", subcategory: "",
    website: "", instagram: "", facebook: "", socialOther: "", priority: "", priorityReason: "", source: "", dnc: false,
    company: emptyCompany(), contacts: [], consents: [],
  };
  beforeEach(() => {
    fake.db = new FakeDb();
    clearMissionVersions();
    fake.db.rows("partners").push({ id: P, workspace_id: WS, name: "Nova", segment: "venue", dnc_status: "ok", capacity: 20 });
  });

  it("dopasowanie zapisuje się w kolumnach fit_* i wraca po odświeżeniu", async () => {
    const result = await persistPartner({ ...base, fit: { deadHours: 2, capacity: 1, area: null } }, base);
    expect(result.dropped).toEqual([]);
    expect(fake.db.rows("partners")[0]).toMatchObject({ fit_dead_hours: 2, fit_capacity: 1 });
    expect(fake.db.rows("partners")[0].fit_area).toBeUndefined();
    const { partners } = await loadCrm(WS);
    expect(partners[0].fit).toEqual({ deadHours: 2, capacity: 1, area: null });
  });

  it("bez migracji v8 dopasowanie odpada, reszta karty się zapisuje", async () => {
    fake.db.failNext = { table: "partners", op: "update", error: { code: "PGRST204", message: "Could not find the 'fit_area' column of 'partners' in the schema cache" } };
    const result = await persistPartner({ ...base, city: "Kraków", fit: { deadHours: null, capacity: null, area: 2 } }, base);
    expect(result.dropped).toEqual(["v8"]);
    expect(fake.db.rows("partners")[0].city).toBe("Kraków");
    expect(fake.db.rows("partners")[0].fit_area).toBeUndefined();
  });

  it("metryki: jeden wiersz na partnera i miesiąc, liczby całkowite ≥ 0, notatka przycięta", async () => {
    await savePartnerMetricsRow(P, "2026-09", { events: 3, attendees: 25.4, redemptions: 11, notes: "  remont  " });
    const saved = await savePartnerMetricsRow(P, "2026-09", { events: 4, attendees: 25, redemptions: 12, notes: "x".repeat(1200) });
    expect(fake.db.rows("partner_metrics")).toHaveLength(1);
    expect(saved).toMatchObject({ partnerId: P, month: "2026-09", events: 4, attendees: 25, redemptions: 12 });
    expect(saved.notes).toHaveLength(1000);
    const { metrics, missing } = await loadPartnerMetrics([P]);
    expect(missing).toBe(false);
    expect(metrics).toEqual([expect.objectContaining({ month: "2026-09", redemptions: 12 })]);
    await expect(savePartnerMetricsRow(P, "2026-9", { events: 1, attendees: null, redemptions: null, notes: "" })).rejects.toThrow(/RRRR-MM/);
  });

  it("brak tabeli metryk: odczyt mówi „po migracji v8”, zapis zwraca komunikat", async () => {
    fake.db.failNext = { table: "partner_metrics", op: "select", error: { code: "PGRST205", message: "Could not find the table 'public.partner_metrics'" } };
    expect(await loadPartnerMetrics([P])).toEqual({ metrics: [], missing: true });
    fake.db.failNext = { table: "partner_metrics", op: "upsert", error: { code: "42P01", message: "relation partner_metrics does not exist" } };
    await expect(savePartnerMetricsRow(P, "2026-09", { events: 1, attendees: null, redemptions: null, notes: "" })).rejects.toThrow(V8_MISSING);
  });
});
