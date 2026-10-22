import { describe, expect, it } from "vitest";
import { agenda } from "@/lib/agenda";
import { emptyCompany } from "@/lib/company";
import {
  DEFAULT_AGREEMENT_TEMPLATE,
  fillTemplate,
  missingFields,
  splitEmail,
  templateValues,
} from "@/lib/contract-template";
import { pendingFollowUps } from "@/lib/followups";
import { activationChecks, contractBlockers, contractChecks, missingOf } from "@/lib/gates";
import { contractStatus } from "@/lib/mission-core";
import { firstSteps } from "@/lib/onboarding";
import { parseCapacity, parseSegment, rowToPartnerInput, suggestMapping } from "@/lib/partner-import";
import { canDeletePartner } from "@/lib/permissions";
import { offerName, suggestVariant } from "@/lib/playbook";
import { emptyMission, seedState } from "@/lib/seed";
import {
  addMonthsIso,
  agreementFormOf,
  changeRulesFor,
  discountSummary,
  isDefaultChangeRules,
  isShortTerm,
  LEGACY_CHANGE_RULES,
  termsChecks,
  termsLines,
  termsWarnings,
} from "@/lib/terms";
import { careMissionOf } from "@/lib/care";
import { periodEnd, suggestedReviewDate } from "@/components/mission/terms-editor";
import type { Activity, AppState, Mission, Partner, PartnerSegment } from "@/lib/types";

const ME = "11111111-1111-4111-8111-111111111111";
const OLA = "22222222-2222-4222-8222-222222222222";

function partner(over: Partial<Partner> = {}): Partner {
  return { ...seedState.partners[0], id: crypto.randomUUID(), company: emptyCompany(), consents: [], ...over };
}

function mission(p: Partner, over: Partial<Mission> = {}): Mission {
  return { ...emptyMission(p.id, crypto.randomUUID()), ownerUserId: ME, ...over };
}

function state(over: Partial<AppState>): AppState {
  return {
    ...seedState,
    user: { name: "Ja", initials: "J", role: "Handlowiec", id: ME, isAdmin: false },
    team: [
      { id: ME, fullName: "Ja", role: "seller", email: "ja@x.pl", isMe: true },
      { id: OLA, fullName: "Ola", role: "admin", email: "ola@x.pl", isMe: false },
    ],
    tasks: [],
    ...over,
  };
}

function activity(over: Partial<Activity>): Activity {
  return {
    id: crypto.randomUUID(),
    missionId: "m",
    channel: "phone",
    direction: "outbound",
    outcome: "connected",
    subject: "",
    summary: "",
    contactId: null,
    occurredAt: "2026-10-20T10:00:00.000Z",
    durationMin: null,
    createdBy: ME,
    hasRecording: false,
    hasTranscript: false,
    ...over,
  };
}

/** Misja lokalu z kompletem warunków i porozumieniem. */
function venueReady(p: Partner, form: "email" | "contract" = "email") {
  const m = mission(p, { offerApproved: true, selectedVariant: "A", agreementForm: form });
  m.terms.discount = { ...m.terms.discount, percent: 15, redemption: "qr", days: ["wed"], hoursFrom: "16:00", hoursTo: "19:00" };
  m.contract = {
    ...m.contract,
    companyName: "Nova sp. z o.o.",
    nip: "5250007738",
    startAt: "2026-11-01",
    endAt: form === "email" ? "2027-01-31" : "2027-10-31",
    changeRules: changeRulesFor(form === "email"),
  };
  m.checklist["contract:brand_app"] = true;
  return m;
}

describe("warunki: okres i forma porozumienia", () => {
  it("do 3 miesięcy włącznie to krótka współpraca", () => {
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(isShortTerm("2026-11-01", "2027-01-31")).toBe(true);
    expect(isShortTerm("2026-11-01", "2027-02-01")).toBe(true);
    expect(isShortTerm("2026-11-01", "2027-02-02")).toBe(false);
    expect(isShortTerm("2026-11-01", "")).toBeNull();
    expect(isShortTerm("2026-11-01", "2026-10-01")).toBeNull();
    expect(periodEnd("2026-11-01", 3)).toBe("2027-01-31");
  });
  it("dłuższy okres zawsze wymaga umowy; krótki — domyślnie mail, można wybrać umowę", () => {
    const p = partner();
    const m = mission(p);
    m.contract = { ...m.contract, startAt: "2026-11-01", endAt: "2027-06-30" };
    expect(agreementFormOf({ ...m, agreementForm: "email" })).toBe("contract");
    m.contract.endAt = "2027-01-15";
    expect(agreementFormOf(m)).toBe("email");
    expect(agreementFormOf({ ...m, agreementForm: "contract" })).toBe("contract");
    // Bez dat — umowa, chyba że handlowiec wybrał mail.
    expect(agreementFormOf({ ...m, contract: { ...m.contract, startAt: "", endAt: "" } })).toBe("contract");
  });
  it("zasady 7 dni zależą od okresu i typu partnera", () => {
    expect(changeRulesFor(true)).toMatch(/w każdej chwili.*najdłużej 7 dni/);
    expect(changeRulesFor(false)).toMatch(/7-dniowym wyprzedzeniem/);
    expect(changeRulesFor(true, "community")).not.toMatch(/zniżk/);
    expect(changeRulesFor(false, "company")).not.toMatch(/zniżk/);
    expect(isDefaultChangeRules(changeRulesFor(true, "company"))).toBe(true);
    expect(isDefaultChangeRules(LEGACY_CHANGE_RULES)).toBe(true);
    expect(isDefaultChangeRules("Ustaliliśmy 14 dni.")).toBe(false);
  });
  it("starsza misja z PDF bez wybranej formy zostaje przy umowie", () => {
    const m = mission(partner());
    m.contract = { ...m.contract, startAt: "2026-11-01", endAt: "2027-01-31", documentPath: "u/m/umowa.pdf" };
    expect(agreementFormOf(m)).toBe("contract");
    expect(agreementFormOf({ ...m, agreementForm: "email" })).toBe("email");
  });
});

describe("warunki: wymagania per typ partnera", () => {
  it("lokal: zniżka, realizacja, hasło przy wariancie bez wdrożenia, okres", () => {
    const m = mission(partner());
    const missing = () => missingOf(termsChecks(m, "venue"));
    expect(missing()).toEqual(["zniżka: wysokość albo gratis", "sposób realizacji zniżki (QR / kod / hasło)", "okres współpracy (od–do)"]);
    m.terms.discount = { ...m.terms.discount, kind: "freebie", freebie: "kawa do deseru", redemption: "password" };
    expect(missing()).toContain("hasło dla obsługi");
    m.terms.discount.password = "LUTRA";
    m.contract = { ...m.contract, startAt: "2026-11-01", endAt: "2026-12-31" };
    expect(missing()).toEqual([]);
    expect(discountSummary(m.terms.discount)).toBe("gratis: kawa do deseru · realizacja: Hasło (bez wdrożenia) „LUTRA”");
  });
  it("pilotaż bez podwójnego „pilotaż:”", () => {
    const m = mission(partner());
    m.terms.pilot = { team: "backend", people: 10, feedbackAt: "2026-12-15" };
    expect(termsLines(m, "company")[0]).toBe("Pilotaż: zespół backend · 10 os. · feedback 15.12.2026");
  });
  it("społeczność: cykl wydarzeń; firma: pilotaż", () => {
    const m = mission(partner());
    expect(missingOf(termsChecks(m, "community"))).toEqual([
      "liczba wydarzeń w cyklu",
      "częstotliwość wydarzeń",
      "termin pierwszego wydarzenia",
      "okres współpracy (od–do)",
    ]);
    expect(missingOf(termsChecks(m, "company"))).toEqual([
      "zespół pilotażowy",
      "liczba osób w pilotażu",
      "termin feedbacku",
      "okres współpracy (od–do)",
    ]);
    m.terms.cycle = { events: 1, frequency: "weekly", firstEventAt: "2026-11-05" };
    expect(termsWarnings(m, "community")[0]).toMatch(/test, nie cykl/);
  });
  it("ostrzeżenie przy zniżce spoza 10–15%", () => {
    const m = mission(partner());
    m.terms.discount.percent = 30;
    expect(termsWarnings(m, "venue")[0]).toMatch(/10–15%/);
    m.terms.discount.percent = 12;
    expect(termsWarnings(m, "venue")).toEqual([]);
  });
  it("punkty warunków do maila i umowy", () => {
    const p = partner();
    const m = venueReady(p);
    m.terms.space = { offered: true, days: ["fri"], hoursFrom: "18:00", hoursTo: "", seats: 12, notes: "" };
    expect(termsLines(m, "venue")).toEqual([
      "Zniżka dla ludzi z Lutry: 15% rabatu · śr 16:00–19:00 · realizacja: QR",
      "Miejsce: miejsce na wydarzenia · pt od 18:00 · do 12 osób",
      "Okres: 01.11.2026 – 31.01.2027",
    ]);
  });
});

describe("warianty i rekomendacja per typ", () => {
  it("firmy i społeczności zaczynają od pilotażu, lokal według faktów", () => {
    expect(suggestVariant(["margin"], "venue")).toBe("B");
    expect(suggestVariant(["risk"], "venue")).toBe("C");
    expect(suggestVariant(["margin"], "company")).toBe("A");
    expect(offerName("A", "company")).toBe("Pilot dla wybranej grupy");
    expect(offerName("C", "community")).toBe("Partnerstwo cykliczne");
    expect(offerName("B")).toBe("Oferta grupowa");
  });
});

describe("bramka umowy: porozumienie mailowe albo umowa", () => {
  it("porozumienie mailowe: mail, potwierdzenie partnera i Lutry — bez PDF", () => {
    const p = partner();
    const m = venueReady(p, "email");
    expect(contractBlockers(m, p)).toEqual(["mail z warunkami wysłany", "potwierdzenie partnera mailem", "zatwierdzenie Lutry"]);
    m.contract = { ...m.contract, sentAt: "2026-10-21T10:00:00Z", partnerSignedAt: "2026-10-22T10:00:00Z", signedByHuman: true };
    expect(contractBlockers(m, p)).toEqual([]);
    expect(contractStatus(m.contract, "email")).toBe("signed");
    expect(contractStatus({ ...m.contract, sentAt: undefined, partnerSignedAt: undefined, signedByHuman: false, documentPath: "x.pdf" }, "email")).toBe("draft");
  });
  it("umowa: dokument i dwa podpisy; brak zgody na logo i warunków blokuje", () => {
    const p = partner();
    const m = venueReady(p, "contract");
    expect(contractBlockers(m, p)).toEqual(["dokument umowy", "podpis partnera", "podpis Lutry"]);
    m.checklist["contract:brand_app"] = false;
    m.terms.discount.redemption = null;
    const missing = contractBlockers(m, p);
    expect(missing).toContain("zgoda na nazwę i logo w aplikacji");
    expect(missing).toContain("sposób realizacji zniżki (QR / kod / hasło)");
  });
  it("stary domyślny tekst zasad nie wystarcza; społeczność bez NIP, firma bez zgody na logo", () => {
    const venue = partner();
    const m = venueReady(venue, "contract");
    m.contract.changeRules = "Zmiany warunków tylko pisemnie. Potwierdzenie kwartalne.";
    expect(contractBlockers(m, venue)).toContain("zasady zmian i wycofania (7 dni)");
    const keys = (segment: PartnerSegment) => contractChecks(m, { segment }).map((check) => check.key);
    expect(keys("community")).not.toContain("nip");
    expect(keys("company")).not.toContain("brand_app");
    expect(keys("venue")).toEqual(expect.arrayContaining(["nip", "brand_app"]));
  });
});

describe("weryfikacja przed publikacją", () => {
  it("lokal: działalność, adres, pojemność, godziny, kontakt awaryjny, zniżka, naklejka, test, przegląd", () => {
    const p = partner({ address: "", capacity: null, hours: "" });
    const m = mission(p);
    const labels = missingOf(activationChecks(m, p));
    expect(labels).toEqual(
      expect.arrayContaining([
        "działalność sprawdzona",
        "adres lokalu",
        "pojemność miejsca",
        "godziny potwierdzone",
        "kontakt awaryjny",
        "zniżka: wysokość albo gratis",
        "kod partnera",
        "lokal widoczny w aplikacji",
        "naklejka Lutry w lokalu",
        "testowa realizacja zniżki",
        "data przeglądu po pierwszym cyklu",
      ]),
    );
    expect(labels).not.toContain("okres współpracy (od–do)");
  });
  it("społeczność i firma mają krótszą listę", () => {
    const m = mission(partner());
    expect(missingOf(activationChecks(m, { segment: "community", address: "", capacity: null, hours: "" }))).toEqual([
      "organizator (kontakt)",
      "pierwsze wydarzenie cyklu w Lutrze",
      "data przeglądu po pierwszym cyklu",
    ]);
    expect(missingOf(activationChecks(m, { segment: "company", address: "", capacity: null, hours: "" }))).toEqual([
      "kontakt w firmie",
      "zespół pilotażowy ma dostęp",
      "termin feedbacku z pilotażu",
    ]);
  });
  it("proponowana data przeglądu", () => {
    const m = mission(partner());
    m.terms.cycle = { events: 3, frequency: "biweekly", firstEventAt: "2026-11-05" };
    expect(suggestedReviewDate(m, "community")).toBe("2026-12-04");
    m.terms.pilot.feedbackAt = "2026-12-15";
    expect(suggestedReviewDate(m, "company")).toBe("2026-12-15");
    expect(suggestedReviewDate(m, "venue", new Date(2026, 9, 22))).toBe("2026-11-21");
  });
});

describe("maile po kontakcie", () => {
  const today = new Date(2026, 9, 22, 12);
  it("telefon z rozmową → follow-up, mail później go zamyka", () => {
    const call = activity({ occurredAt: "2026-10-21T09:00:00.000Z" });
    const m = { activities: [call] };
    expect(pendingFollowUps(m, today).map((f) => f.kind)).toEqual(["phone"]);
    const mail = activity({ channel: "email", outcome: "sent", occurredAt: "2026-10-21T15:00:00.000Z" });
    expect(pendingFollowUps({ activities: [mail, call] }, today)).toEqual([]);
  });
  it("nieodebrany telefon nie wymaga maila; spotkanie tak (tego samego dnia)", () => {
    const missed = activity({ outcome: "no_answer" });
    const meeting = activity({ channel: "in_person", outcome: "other", occurredAt: "2026-10-22T08:00:00.000Z" });
    const items = pendingFollowUps({ activities: [missed, meeting] }, today);
    expect(items.map((f) => [f.kind, f.due])).toEqual([["meeting", "2026-10-22"]]);
    expect(items[0].title).toMatch(/tego samego dnia/);
  });
  it("starsze niż 14 dni nie wiszą, kilka telefonów → jedno przypomnienie", () => {
    const old = activity({ occurredAt: "2026-09-01T09:00:00.000Z" });
    const first = activity({ occurredAt: "2026-10-19T09:00:00.000Z" });
    const second = activity({ outcome: "callback", occurredAt: "2026-10-20T09:00:00.000Z" });
    const items = pendingFollowUps({ activities: [second, first, old] }, today);
    expect(items).toHaveLength(1);
    expect(items[0].activity.id).toBe(second.id);
  });
});

describe("opieka w „Na dziś”", () => {
  const today = new Date(2026, 9, 22, 12);
  function won(p: Partner, over: Partial<Mission> = {}) {
    const m = mission(p, { status: "won", closedAt: "2026-07-01T10:00:00Z", startedAt: "2026-06-01T10:00:00Z", ...over });
    m.activation = { ...m.activation, activatedAt: "2026-07-01T10:00:00Z", checkInAt: "2026-08-01" };
    m.contract = { ...m.contract, endAt: "2027-06-30" };
    return m;
  }
  it("przegląd, kwartalne potwierdzenie i informacja o realizacjach dla lokalu", () => {
    const p = partner({ name: "Nova" });
    const s = state({ partners: [p], missions: [won(p)] });
    const kinds = agenda(s, true, today).map((item) => item.kind).sort();
    expect(kinds).toEqual(["report", "review", "terms"]);
    const report = agenda(s, true, today).find((item) => item.kind === "report");
    expect(report?.title).toBe("Wyślij partnerowi liczbę realizacji za wrzesień 2026");
  });
  it("po przeglądzie, potwierdzeniu i raporcie lista jest pusta; społeczność bez raportu", () => {
    const p = partner();
    const m = won(p);
    m.care = {
      reviews: [{ id: "r", at: "2026-08-02T10:00:00Z", attendance: "4 wydarzenia", feedback: "", decision: "continue", note: "" }],
      termsConfirmedAt: "2026-10-01T10:00:00Z",
      reports: [{ month: "2026-09", count: 12, sentAt: "2026-10-02T10:00:00Z" }],
    };
    expect(agenda(state({ partners: [p], missions: [m] }), true, today)).toEqual([]);
    const c = partner({ segment: "community" });
    const kinds = agenda(state({ partners: [c], missions: [won(c)] }), true, today).map((item) => item.kind);
    expect(kinds).not.toContain("report");
  });
  it("decyzja „kończymy” i odnowienie wyłączają przypomnienia starej misji", () => {
    const p = partner();
    const ended = won(p);
    ended.care = { reviews: [{ id: "r", at: "2026-08-02T10:00:00Z", attendance: "1", feedback: "", decision: "end", note: "" }], reports: [] };
    expect(agenda(state({ partners: [p], missions: [ended] }), true, today)).toEqual([]);
    const old = won(p);
    const renewed = won(p, { startedAt: "2026-10-01T10:00:00Z" });
    renewed.activation.checkInAt = "";
    renewed.care.termsConfirmedAt = "2026-10-15T10:00:00Z";
    renewed.care.reports = [{ month: "2026-09", count: 3, sentAt: "2026-10-02T10:00:00Z" }];
    const items = agenda(state({ partners: [p], missions: [old, renewed] }), true, today);
    expect(items.filter((item) => item.missionId === old.id)).toEqual([]);
  });
  it("odnowienie w toku: opieka nad obecną współpracą trwa, bez przypomnienia o końcu umowy", () => {
    const p = partner();
    const current = won(p);
    current.contract.endAt = "2026-11-10";
    const renewal = mission(p, { startedAt: "2026-10-15T10:00:00Z" });
    const s = state({ partners: [p], missions: [current, renewal] });
    expect(careMissionOf(s.missions, p.id)?.id).toBe(current.id);
    const kinds = agenda(s, true, today)
      .filter((item) => item.missionId === current.id)
      .map((item) => item.kind)
      .sort();
    expect(kinds).toEqual(["report", "review", "terms"]);
    const alone = agenda(state({ partners: [p], missions: [current] }), true, today).map((item) => item.kind);
    expect(alone).toContain("contract_end");
  });
  it("porozumienie mailowe czeka na potwierdzenie, a nie na podpis", () => {
    const p = partner();
    const m = mission(p, { agreementForm: "email" });
    m.contract = { ...m.contract, startAt: "2026-11-01", endAt: "2027-01-31", sentAt: "2026-10-10T10:00:00Z" };
    const item = agenda(state({ partners: [p], missions: [m] }), true, today).find((i) => i.kind === "signature");
    expect(item?.title).toBe("Porozumienie czeka na potwierdzenie partnera");
  });
  it("misja odłożona („wrócić później”) dalej przypomina o mailu po telefonie", () => {
    const p = partner();
    const m = mission(p, { status: "nurture" });
    m.activities = [activity({ missionId: m.id, occurredAt: "2026-10-22T08:00:00.000Z" })];
    expect(agenda(state({ partners: [p], missions: [m] }), true, today).map((i) => i.kind)).toContain("follow_up");
  });
  it("mail po kontakcie trafia do „Na dziś” z wpisem dziennika", () => {
    const p = partner();
    const m = mission(p);
    const call = activity({ missionId: m.id, occurredAt: "2026-10-22T08:00:00.000Z" });
    m.activities = [call];
    const item = agenda(state({ partners: [p], missions: [m] }), true, today).find((i) => i.kind === "follow_up");
    expect(item?.activityId).toBe(call.id);
  });
});

describe("porozumienie mailowe z szablonu", () => {
  it("temat, punkty warunków, zasady, zgody i kolejne kroki", () => {
    const p = partner({
      name: "Kawiarnia Nova",
      contacts: [{ id: "c1", name: "Anna Kowalska", role: "właścicielka", isDecisionMaker: true, email: "anna@nova.pl" }],
    });
    const m = venueReady(p, "email");
    m.decision.decisionMakerId = "c1";
    m.decision.constraintSummary = "bez weekendów";
    const values = templateValues(p, m, "Kuba", new Date(2026, 9, 22));
    const { subject, body } = splitEmail(fillTemplate(DEFAULT_AGREEMENT_TEMPLATE, values));
    expect(subject).toBe("Lutra × Kawiarnia Nova — potwierdzenie warunków współpracy");
    expect(body.startsWith("Dzień dobry,")).toBe(true);
    expect(body).toContain("- Raz w miesiącu prześlemy informację o liczbie realizacji zniżki.");
    expect(body).toContain("- Zniżka dla ludzi z Lutry: 15% rabatu · śr 16:00–19:00 · realizacja: QR");
    expect(body).toContain("- Okres: 01.11.2026 – 31.01.2027");
    expect(body).toContain("honoruje ją dla wydarzeń już utworzonych w aplikacji, najdłużej 7 dni");
    expect(body).toContain("bez opłat w obie strony");
    expect(body).toContain("Zgoda Partnera na użycie: nazwy i logo w aplikacji Lutra.");
    expect(body).toContain("przekażemy naklejkę");
    expect(missingFields(DEFAULT_AGREEMENT_TEMPLATE, values)).toEqual([]);
  });
  it("społeczność: realizacja przez aplikację, bez naklejki", () => {
    const p = partner({ segment: "community", name: "Klub Pionek" });
    const m = mission(p);
    m.terms.cycle = { events: 3, frequency: "weekly", firstEventAt: "2026-11-05" };
    const values = templateValues(p, m, "Kuba");
    expect(values.realizacja).toMatch(/organizator tworzy w aplikacji/);
    expect(values.kolejne_kroki).toMatch(/pierwsze wydarzenie cyklu/);
    expect(values.raporty_mail).toMatch(/podsumowanie frekwencji/);
    expect(values.zasady_zmian).toBe("");
    expect(values.zakazy).not.toMatch(/Opłaty|Dane uczestników/);
    expect(values.warunki_wspolpracy).toBe("- Wydarzenia w Lutrze: cykl 3 wydarzeń · co tydzień · pierwsze 05.11.2026");
  });
  it("bez linii tematu cały tekst jest treścią", () => {
    expect(splitEmail("Dzień dobry\n\nTreść")).toEqual({ subject: "", body: "Dzień dobry\n\nTreść" });
    expect(splitEmail("\nTEMAT:  Hej \nTreść")).toEqual({ subject: "Hej", body: "Treść" });
  });
});

describe("import: typ partnera i pojemność", () => {
  it("rozpoznaje typ z tekstu", () => {
    expect(parseSegment("Społeczność")).toBe("community");
    expect(parseSegment("koło studenckie")).toBe("community");
    expect(parseSegment("Firma IT")).toBe("company");
    expect(parseSegment("lokal")).toBe("venue");
    expect(parseSegment("kolorowe")).toBeNull();
    expect(parseSegment("")).toBeNull();
    expect(parseCapacity("ok. 40 osób")).toBe(40);
    expect(parseCapacity("0")).toBeNull();
    expect(parseCapacity("brak")).toBeNull();
  });
  it("kolumna „Typ partnera” nie myli się z kategorią; puste pole = typ domyślny", () => {
    const headers = ["Nazwa", "Typ partnera", "Typ", "Pojemność"];
    const mapping = suggestMapping(headers);
    expect(mapping.segment).toBe(1);
    expect(mapping.category).toBe(2);
    expect(mapping.capacity).toBe(3);
    const venue = rowToPartnerInput(["Nova", "", "kawiarnia", "40 miejsc"], mapping, "venue");
    expect(venue?.segment).toBe("venue");
    expect(venue?.capacity).toBe(40);
    const club = rowToPartnerInput(["Pionek", "społeczność", "klub", "20"], mapping, "venue");
    expect(club?.segment).toBe("community");
    expect(club?.capacity).toBeNull();
    expect(rowToPartnerInput(["Soft", "", "", ""], mapping, "company")?.segment).toBe("company");
  });
  it("„Telefon właściciela” to telefon, „Właściciel” to osoba, „Typ partnera” nie jest nazwą", () => {
    expect(suggestMapping(["Nazwa", "Telefon właściciela", "E-mail właściciela"])).toMatchObject({
      name: 0,
      contactPhone: 1,
      contactEmail: 2,
    });
    expect(suggestMapping(["Nazwa", "Właściciel", "Telefon właściciela"])).toMatchObject({
      contactName: 1,
      contactPhone: 2,
    });
    const typed = suggestMapping(["Typ partnera", "Nazwa obiektu", "Miasto"]);
    expect(typed.segment).toBe(0);
    expect(typed.name).toBe(1);
    expect(suggestMapping(["Lokal", "Miejsca parkingowe"]).capacity).toBeUndefined();
  });
});

describe("uprawnienia: usuwanie partnera", () => {
  it("cudzą kartę usuwa tylko administrator; partner z cudzą misją — nikt poza adminem", () => {
    const own = partner({ ownerUserId: ME });
    const olas = partner({ ownerUserId: OLA });
    const s = state({ partners: [own, olas], missions: [] });
    expect(canDeletePartner(s, own, true)).toBe(true);
    expect(canDeletePartner(s, olas, true)).toBe(false);
    expect(canDeletePartner(s, olas, false)).toBe(false);
    const withOlaMission = state({ partners: [own], missions: [mission(own, { ownerUserId: OLA })] });
    expect(canDeletePartner(withOlaMission, own, true)).toBe(false);
    const admin = { ...withOlaMission, user: { ...withOlaMission.user, isAdmin: true } };
    expect(canDeletePartner(admin, own, true)).toBe(true);
  });
});

describe("pierwsze kroki", () => {
  it("postęp liczony z danych", () => {
    const empty = firstSteps(state({ partners: [], missions: [] }));
    expect(empty.filter((step) => step.done)).toHaveLength(0);
    expect(empty[0].href).toBe("/partners/new");
    const p = partner();
    const m = mission(p, { activities: [activity({})], offerApproved: true, currentStage: "negotiation" });
    const steps = firstSteps(state({ partners: [p], missions: [m] }));
    expect(steps.filter((step) => step.done).map((step) => step.key)).toEqual(["partner", "mission", "contact", "fact", "offer"]);
    expect(steps.find((step) => !step.done)?.key).toBe("active");
    // Nowa osoba w zespole: cudze misje nie odhaczają jej kroków.
    const olas = mission(p, { ownerUserId: OLA, activities: [activity({})], offerApproved: true });
    const fresh = firstSteps(state({ partners: [p], missions: [olas] }));
    expect(fresh.filter((step) => step.done).map((step) => step.key)).toEqual(["partner"]);
  });
});
