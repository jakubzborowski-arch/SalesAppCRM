import { describe, expect, it } from "vitest";
import { agenda } from "@/lib/agenda";
import { emptyCompany } from "@/lib/company";
import { fitLabel, fitScore, pickUrgentMission, sortPartners, suggestFitCapacity } from "@/lib/fit";
import { healthFor, metricsHistory, partnerHealth, shiftMonth } from "@/lib/health";
import { mailtoHref, partnerReportEmail, reportRecipient } from "@/lib/partner-report";
import { emptyMission, seedState } from "@/lib/seed";
import { plural } from "@/lib/text";
import type { AppState, Mission, Partner, PartnerMetrics } from "@/lib/types";

const ME = "11111111-1111-4111-8111-111111111111";
// 25 października 2026: poprzedni pełny miesiąc to wrzesień.
const today = new Date(2026, 9, 25, 12);

function partner(over: Partial<Partner> = {}): Partner {
  return { ...seedState.partners[0], id: crypto.randomUUID(), company: emptyCompany(), consents: [], ...over };
}

function won(p: Partner, activatedAt = "2026-06-10T10:00:00Z", over: Partial<Mission> = {}): Mission {
  const m: Mission = { ...emptyMission(p.id, crypto.randomUUID()), ownerUserId: ME, status: "won", closedAt: activatedAt, startedAt: "2026-05-01T10:00:00Z", ...over };
  m.activation = { ...m.activation, activatedAt, checkInAt: "" };
  return m;
}

function metric(p: Partner, month: string, values: Partial<PartnerMetrics> = {}): PartnerMetrics {
  return { id: crypto.randomUUID(), partnerId: p.id, month, events: 2, attendees: 20, redemptions: 10, notes: "", ...values };
}

function state(over: Partial<AppState>): AppState {
  return { ...seedState, user: { name: "Ja", initials: "J", role: "Handlowiec", id: ME }, tasks: [], ...over };
}

describe("partnerHealth", () => {
  const p = partner();
  it("bez wygranej współpracy albo świeżo po aktywacji bez metryk — nie wiadomo", () => {
    expect(partnerHealth({ partner: p, mission: undefined, metrics: [], today }).level).toBe("unknown");
    const lost = { ...won(p), status: "lost" as const };
    expect(partnerHealth({ partner: p, mission: lost, metrics: [], today }).level).toBe("unknown");
    const fresh = partnerHealth({ partner: p, mission: won(p, "2026-10-05T10:00:00Z"), metrics: [], today });
    expect(fresh.level).toBe("unknown");
    expect(fresh.reason).toMatch(/20 dni/);
  });
  it("decyzja „kończymy” po przeglądzie — czerwony", () => {
    const m = won(p);
    m.care = { ...m.care, reviews: [{ id: "r", at: "2026-09-01", attendance: "", feedback: "", decision: "end", note: "" }] };
    const h = partnerHealth({ partner: p, mission: m, metrics: [metric(p, "2026-09")], today });
    expect(h).toEqual({ level: "red", reason: expect.stringMatching(/kończymy/) });
  });
  it("brak metryk za 2 ostatnie pełne miesiące po aktywacji — czerwony", () => {
    const h = partnerHealth({ partner: p, mission: won(p), metrics: [metric(p, "2026-07")], today });
    expect(h.level).toBe("red");
    expect(h.reason).toBe("Brak metryk za sierpień 2026 i wrzesień 2026.");
  });
  it("0 realizacji przez 2 miesiące — czerwony; w społeczności liczą się uczestnicy", () => {
    const zero = [metric(p, "2026-08", { redemptions: 0 }), metric(p, "2026-09", { redemptions: 0 })];
    expect(partnerHealth({ partner: p, mission: won(p), metrics: zero, today }).reason).toMatch(/^0 realizacji przez 2 miesiące/);
    const club = partner({ segment: "community" });
    const clubZero = [metric(club, "2026-08", { attendees: 0, redemptions: null }), metric(club, "2026-09", { attendees: 0, redemptions: null })];
    expect(partnerHealth({ partner: club, mission: won(club), metrics: clubZero, today }).reason).toMatch(/^0 uczestników/);
  });
  it("brak wpisu za poprzedni miesiąc — żółty", () => {
    const h = partnerHealth({ partner: p, mission: won(p), metrics: [metric(p, "2026-08")], today });
    expect(h).toEqual({ level: "yellow", reason: "Brak metryk za wrzesień 2026." });
  });
  it("spadek o co najmniej 50% — żółty; mniejszy spadek — zielony", () => {
    const drop = [metric(p, "2026-08", { redemptions: 20 }), metric(p, "2026-09", { redemptions: 10 })];
    expect(partnerHealth({ partner: p, mission: won(p), metrics: drop, today })).toEqual({
      level: "yellow",
      reason: "Spadek o 50% (20 → 10 realizacji, wrzesień 2026).",
    });
    const fine = [metric(p, "2026-08", { redemptions: 20 }), metric(p, "2026-09", { redemptions: 11 })];
    expect(partnerHealth({ partner: p, mission: won(p), metrics: fine, today })).toEqual({
      level: "green",
      reason: "wrzesień 2026: 11 realizacji.",
    });
  });
  it("aktywacja we wrześniu: liczy się tylko wrzesień, sierpnia nie wymagamy", () => {
    const m = won(p, "2026-09-10T10:00:00Z");
    expect(partnerHealth({ partner: p, mission: m, metrics: [], today })).toEqual({ level: "yellow", reason: "Brak metryk za wrzesień 2026." });
    expect(partnerHealth({ partner: p, mission: m, metrics: [metric(p, "2026-09", { redemptions: 4 })], today }).level).toBe("green");
  });
  it("dawne wpisy o realizacjach (care.reports) liczą się jak metryki", () => {
    const m = won(p);
    m.care = {
      ...m.care,
      reports: [
        { month: "2026-08", count: 12, sentAt: "2026-09-02T10:00:00Z" },
        { month: "2026-09", count: 13, sentAt: "2026-10-02T10:00:00Z" },
      ],
    };
    const history = metricsHistory(p.id, [metric(p, "2026-09", { redemptions: 3 })], m);
    expect(history.map((x) => [x.month, x.redemptions])).toEqual([["2026-09", 3], ["2026-08", 12]]);
    expect(healthFor(state({ partners: [p], missions: [m], metrics: [] }), p, today).level).toBe("green");
  });
  it("odmiana po liczbie", () => {
    expect([0, 1, 2, 4, 5, 12, 14, 22, 25, 102].map((n) => plural(n, "realizacja", "realizacje", "realizacji"))).toEqual([
      "realizacji", "realizacja", "realizacje", "realizacje", "realizacji", "realizacji", "realizacji", "realizacje", "realizacji", "realizacje",
    ]);
    const m = won(p);
    const two = [metric(p, "2026-08", { redemptions: 3 }), metric(p, "2026-09", { redemptions: 2 })];
    expect(partnerHealth({ partner: p, mission: m, metrics: two, today }).reason).toBe("wrzesień 2026: 2 realizacje.");
  });
  it("shiftMonth przechodzi przez rok", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("informacja o realizacjach w „Na dziś” a metryki", () => {
  it("metryki za poprzedni miesiąc odhaczają przypomnienie", () => {
    const p = partner();
    const m = won(p, "2026-07-01T10:00:00Z");
    m.care = { ...m.care, termsConfirmedAt: "2026-10-01T10:00:00Z" };
    const before = agenda(state({ partners: [p], missions: [m] }), true, today).map((i) => i.kind);
    expect(before).toContain("report");
    const after = agenda(state({ partners: [p], missions: [m], metrics: [metric(p, "2026-09")] }), true, today).map((i) => i.kind);
    expect(after).not.toContain("report");
    // Metryki innego miesiąca albo innego partnera nie wystarczą.
    const other = agenda(state({ partners: [p], missions: [m], metrics: [metric(p, "2026-08"), metric(partner(), "2026-09")] }), true, today);
    expect(other.map((i) => i.kind)).toContain("report");
  });
});

describe("mail z podsumowaniem dla partnera", () => {
  const p = partner({ name: "Kawiarnia Nova" });
  it("temat, liczby, zmiana względem poprzedniego miesiąca, bez obietnic", () => {
    const mail = partnerReportEmail({
      partner: p,
      month: "2026-09",
      metric: { events: 4, attendees: 32, redemptions: 18, notes: "tylko dla nas" },
      previous: metric(p, "2026-08", { events: 4, attendees: 40, redemptions: 12 }),
      senderName: "Anna Krajewska",
    });
    expect(mail.subject).toBe("Lutra × Kawiarnia Nova: podsumowanie za wrzesień 2026");
    expect(mail.to).toBe("anna@kawiarnianova.pl");
    expect(mail.body).toContain("- Wydarzenia z Lutrą: 4 (sierpień 2026: 4, bez zmian)");
    expect(mail.body).toContain("- Uczestnicy: 32 (sierpień 2026: 40, -8)");
    expect(mail.body).toContain("- Realizacje zniżki: 18 (sierpień 2026: 12, +6)");
    expect(mail.body).toContain("Anna Krajewska");
    expect(mail.body).not.toContain("tylko dla nas");
    expect(mail.body).not.toMatch(/gwarant|zapewniamy|będzie więcej|obiecuj/i);
  });
  it("społeczność bez realizacji; brak maila kontaktu = pusty odbiorca", () => {
    const club = partner({ segment: "community", contacts: [{ id: "c", name: "Ola", role: "", isDecisionMaker: true }] });
    const mail = partnerReportEmail({ partner: club, month: "2026-09", metric: { events: 2, attendees: 15, redemptions: 9, notes: "" } });
    expect(mail.body).not.toContain("Realizacje");
    expect(mail.to).toBe("");
    expect(reportRecipient(club)).toBe("");
    expect(mailtoHref(mail).startsWith("mailto:?subject=")).toBe(true);
  });
  it("mailto koduje temat i treść, adres zostaje czytelny", () => {
    const href = mailtoHref({ to: "anna@nova.pl", subject: "Lutra × Nova: podsumowanie", body: "a\nb & c" });
    expect(href).toBe("mailto:anna@nova.pl?subject=Lutra%20%C3%97%20Nova%3A%20podsumowanie&body=a%0D%0Ab%20%26%20c");
  });
});

describe("wynik dopasowania lokalu", () => {
  it("suma 0–6, podpis i podpowiedź pojemności", () => {
    expect(fitScore(partner()).score).toBeNull();
    expect(fitScore(partner({ fit: { deadHours: 2, capacity: 1, area: 2 } }))).toEqual({ score: 5, rated: 3 });
    expect(fitLabel(partner({ fit: { deadHours: 2, capacity: 1, area: 2 } }))).toBe("Dopasowanie 5/6");
    expect(fitLabel(partner({ fit: { deadHours: 2, capacity: null, area: null } }))).toBe("Dopasowanie 2/6 (1 z 3)");
    expect([null, 0, 5, 6, 15, 16, 80].map(suggestFitCapacity)).toEqual([null, null, 0, 1, 1, 2, 2]);
  });
  it("sortowanie „dopasowanie”: wyższy wynik pierwszy, nieocenione i nie-lokale na końcu", () => {
    const a = partner({ name: "A", fit: { deadHours: 1, capacity: 1, area: 0 } });
    const b = partner({ name: "B", fit: { deadHours: 2, capacity: 2, area: 2 } });
    const c = partner({ name: "C" });
    const d = partner({ name: "D", segment: "company", fit: { deadHours: 2, capacity: 2, area: 2 } });
    expect(sortPartners([c, d, a, b], "fit").map((x) => x.name)).toEqual(["B", "A", "C", "D"]);
    expect(sortPartners([c, d, a, b], "added").map((x) => x.name)).toEqual(["C", "D", "A", "B"]);
    expect(sortPartners([c, d, b, a], "name").map((x) => x.name)).toEqual(["A", "B", "C", "D"]);
  });
  it("najpilniejsza misja: najpierw data następnego kroku, przy remisie wyższe dopasowanie", () => {
    const low = partner({ name: "Niski", fit: { deadHours: 0, capacity: 1, area: 0 } });
    const high = partner({ name: "Wysoki", fit: { deadHours: 2, capacity: 2, area: 1 } });
    const later = partner({ name: "Później", fit: { deadHours: 2, capacity: 2, area: 2 } });
    const m = (p: Partner, at: string) => ({ ...emptyMission(p.id, crypto.randomUUID()), nextStepAt: at });
    const s = { partners: [low, high, later], missions: [m(low, "2026-10-26"), m(later, "2026-10-27"), m(high, "2026-10-26")] };
    expect(pickUrgentMission(s)?.partner.name).toBe("Wysoki");
    // Wcześniejsza data wygrywa z wyższym dopasowaniem.
    s.missions[1].nextStepAt = "2026-10-25";
    expect(pickUrgentMission(s)?.partner.name).toBe("Później");
    // Zamknięte misje i misje bez partnera się nie liczą.
    expect(pickUrgentMission({ partners: [], missions: s.missions })).toBeUndefined();
  });
});
