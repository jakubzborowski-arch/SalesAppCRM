import { describe, expect, it } from "vitest";
import { canEnterStage, contractChecks, offerBlockers, offerChecks } from "@/lib/gates";
import { advanceGate } from "@/lib/mission-ops";
import {
  appendVisitNote,
  applyQuickVisit,
  constraintFromDiscount,
  defaultQuickPeriod,
  partnerAfterVisit,
  quickVisitAvailable,
  quickVisitErrors,
  type QuickVisitInput,
} from "@/lib/quick-visit";
import { emptyMission, nova } from "@/lib/seed";
import { agreementFormOf, emptyDiscount, emptyTerms } from "@/lib/terms";
import type { Mission, Partner, PartnerSegment } from "@/lib/types";

function partnerOf(segment: PartnerSegment, over: Partial<Partner> = {}): Partner {
  return { ...nova, segment, ...over };
}

/** Misja z kompletem pól wspólnych dla wszystkich typów — bez rezultatu, terminu i wcześniejszych prób. */
function discoveryMission(): Mission {
  const m = emptyMission("partner-nova", "m-1");
  m.currentStage = "discovery";
  m.completedStages = ["research", "contact"];
  m.decision = {
    ...m.decision,
    problem: "Puste popołudnia w tygodniu",
    constraintSummary: "bez weekendów",
    decisionMakerId: "contact-anna",
    nextStep: "Recap",
  };
  m.needs = [
    { id: "n1", category: "off_peak", title: "Puste popołudnia", description: "Puste popołudnia", priority: 4, status: "fact", confirmed: true },
  ];
  return m;
}

function visitInput(over: Partial<QuickVisitInput> = {}): QuickVisitInput {
  return {
    visitDate: "2026-10-25",
    problem: "Między 16 a 19 sala stoi pusta.",
    category: "off_peak",
    quote: "Po 16 mamy pustki.",
    makerId: "contact-anna",
    makerName: "",
    makerRole: "",
    discount: { ...emptyDiscount(), percent: 15, days: ["wed", "thu"], hoursFrom: "16:00", hoursTo: "19:00", redemption: "qr" },
    space: emptyTerms().space,
    startAt: "2026-10-26",
    endAt: "2027-01-25",
    brandConsent: true,
    note: "Pokazałem aplikację na telefonie.",
    ...over,
  };
}

const today = new Date(2026, 9, 25); // niedziela

describe("bramka oferty zależnie od typu partnera", () => {
  it("lokal: rezultat, termin decyzji i wcześniejsze próby są opcjonalne", () => {
    const m = discoveryMission();
    const keys = offerChecks(m, { segment: "venue" }).map((check) => check.key);
    expect(keys).not.toContain("result");
    expect(keys).not.toContain("deadline");
    expect(keys).not.toContain("attempts");
    expect(offerBlockers(m, { segment: "venue" })).toEqual([]);
    expect(canEnterStage("needs", m, partnerOf("venue")).ok).toBe(true);
    expect(advanceGate(m, partnerOf("venue")).ok).toBe(true);
  });

  it("lokal: wpisany termin musi być datą", () => {
    const m = discoveryMission();
    m.decision.decisionDeadline = "jak szef wróci";
    expect(offerBlockers(m, { segment: "venue" })).toEqual(["termin decyzji jako data"]);
    m.decision.decisionDeadline = "2026-11-02";
    expect(offerBlockers(m, { segment: "venue" })).toEqual([]);
  });

  it("lokal: problem, ograniczenie, decydent, następny krok i fakt dalej wymagane", () => {
    const m = emptyMission("partner-nova", "m-2");
    expect(offerBlockers(m, { segment: "venue" })).toEqual([
      "problem",
      "ograniczenie",
      "decydent",
      "następny krok",
      "potwierdzona potrzeba (fakt)",
    ]);
  });

  it.each(["community", "company"] as const)("%s: rezultat, termin i wcześniejsze próby nadal wymagane", (segment) => {
    const m = discoveryMission();
    const missing = offerBlockers(m, { segment });
    expect(missing).toEqual(["oczekiwany rezultat", "termin decyzji", "wcześniejsze próby"]);
    const partner = partnerOf(segment);
    const gate = advanceGate(m, partner);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe("Brakuje: oczekiwany rezultat, termin decyzji, wcześniejsze próby.");
    m.decision = { ...m.decision, expectedResult: "Grupa w środę", decisionDeadline: "2026-11-02", previousAttempts: "Ulotki" };
    expect(offerBlockers(m, { segment })).toEqual([]);
    expect(advanceGate(m, partner).ok).toBe(true);
  });

  it("bez typu partnera bramka liczy jak dla lokalu (domyślny typ)", () => {
    expect(offerBlockers(discoveryMission())).toEqual([]);
  });
});

describe("szybka wizyta: formularz", () => {
  it("proponuje okres od najbliższego poniedziałku na 3 miesiące (porozumienie mailowe)", () => {
    const period = defaultQuickPeriod(today);
    expect(period).toEqual({ startAt: "2026-10-26", endAt: "2027-01-25" });
    expect(defaultQuickPeriod(new Date(2026, 9, 26)).startAt).toBe("2026-11-02");
  });

  it("waliduje pola po polsku", () => {
    expect(quickVisitErrors(visitInput(), today)).toEqual({});
    const errors = quickVisitErrors(
      visitInput({
        problem: " ",
        category: "",
        makerId: "",
        makerName: "",
        visitDate: "2026-10-30",
        discount: { ...emptyDiscount(), percent: null, hoursFrom: "19:00", hoursTo: "16:00", redemption: "password" },
        startAt: "2026-11-10",
        endAt: "2026-11-01",
      }),
      today,
    );
    expect(errors).toEqual({
      visitDate: "Wizyta nie może być w przyszłości.",
      problem: "Wpisz jednym zdaniem, co partnerowi nie działa.",
      category: "Wybierz kategorię — potwierdzony fakt musi ją mieć.",
      maker: "Wybierz decydenta albo wpisz imię i nazwisko.",
      discount: "Podaj rabat od 1 do 100%.",
      hours: "Godzina „do” musi być po „od”.",
      password: "Wpisz hasło dla obsługi.",
      period: "Koniec okresu musi być po początku.",
    });
    expect(quickVisitErrors(visitInput({ discount: { ...emptyDiscount(), kind: "freebie" } }), today)).toEqual({
      discount: "Wpisz, co gość dostaje gratis.",
      redemption: "Wybierz, jak gość realizuje zniżkę.",
    });
  });

  it("przycisk tylko dla lokalu w toku, od Kontaktu do Negocjacji", () => {
    const m = emptyMission("partner-nova", "m-3");
    expect(quickVisitAvailable({ ...m, currentStage: "research" }, nova)).toBe(false);
    expect(quickVisitAvailable({ ...m, currentStage: "contact" }, nova)).toBe(true);
    expect(quickVisitAvailable({ ...m, currentStage: "negotiation" }, nova)).toBe(true);
    expect(quickVisitAvailable({ ...m, currentStage: "contract" }, nova)).toBe(false);
    expect(quickVisitAvailable({ ...m, currentStage: "contact", status: "paused" }, nova)).toBe(false);
    expect(quickVisitAvailable({ ...m, currentStage: "contact" }, partnerOf("community"))).toBe(false);
    expect(quickVisitAvailable({ ...m, currentStage: "contact" }, { ...nova, dnc: true })).toBe(false);
  });

  it("ograniczenie z warunków i notatka dopisana pod spodem", () => {
    expect(constraintFromDiscount(visitInput().discount)).toBe("Zniżka: śr, czw 16:00–19:00");
    expect(constraintFromDiscount(emptyDiscount())).toBe("Zniżka bez dodatkowych ograniczeń");
    expect(appendVisitNote("Stara notatka", "2026-10-25", "Nowe ustalenia")).toBe(
      "Stara notatka\n\nWizyta 25.10.2026: Nowe ustalenia",
    );
    expect(appendVisitNote("Stara", "2026-10-25", "  ")).toBe("Stara");
  });
});

describe("szybka wizyta: misja po zapisie", () => {
  const opts = { makerId: "contact-anna", needId: "need-visit", today: "2026-10-25" };

  it("z Kontaktu prosto do Umowy: fakt, decydent, warunki, wariant, porozumienie mailowe", () => {
    const m = { ...emptyMission("partner-nova", "m-4"), currentStage: "contact" as const, completedStages: ["research" as const] };
    const partner = partnerAfterVisit(nova);
    expect(partner.consents.find((c) => c.channel === "in_person")?.status).toBe("granted");
    const result = applyQuickVisit(m, partner, visitInput(), opts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = result.mission;
    expect(out.currentStage).toBe("contract");
    expect(out.completedStages).toEqual(["research", "contact", "discovery", "needs", "offer", "negotiation"]);
    expect(out.needs).toEqual([
      expect.objectContaining({ id: "need-visit", category: "off_peak", status: "fact", confirmed: true }),
    ]);
    expect(out.decision).toMatchObject({
      problem: "Między 16 a 19 sala stoi pusta.",
      decisionMakerId: "contact-anna",
      constraintSummary: "Zniżka: śr, czw 16:00–19:00",
      nextStep: "Wyślij porozumienie mailowe z warunkami",
      expectedResult: "",
      previousAttempts: "",
    });
    expect(out.selectedChannel).toBe("in_person");
    expect(out.selectedVariant).toBe("A");
    expect(out.offerApproved).toBe(true);
    expect(out.terms.discount).toMatchObject({ percent: 15, redemption: "qr", days: ["wed", "thu"] });
    expect(out.agreementForm).toBe("email");
    expect(agreementFormOf(out)).toBe("email");
    expect(out.contract.changeRules).toMatch(/Krótka zniżka/);
    expect(out.checklist["contract:brand_app"]).toBe(true);
    expect(out.conversationNote).toBe("Wizyta 25.10.2026: Pokazałem aplikację na telefonie.");
    // Krok Umowa: oferta i warunki są odhaczone, zostają dane firmy i potwierdzenia.
    const contract = contractChecks(out, partner);
    expect(contract.find((c) => c.key === "offer")?.done).toBe(true);
    expect(contract.filter((c) => ["discount", "redemption", "brand_app", "start", "end", "short"].includes(c.key)).every((c) => c.done)).toBe(true);
  });

  it("dłuższy okres → umowa; wariant z kategorii marży to B", () => {
    const m = { ...emptyMission("partner-nova", "m-5"), currentStage: "discovery" as const };
    const result = applyQuickVisit(
      m,
      partnerAfterVisit(nova),
      visitInput({ category: "margin", startAt: "2026-11-01", endAt: "2027-10-31", brandConsent: false }),
      opts,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mission.agreementForm).toBe("contract");
    expect(result.mission.selectedVariant).toBe("B");
    expect(result.mission.decision.nextStep).toBe("Przygotuj umowę do podpisu");
    expect(result.mission.checklist["contract:brand_app"]).toBeUndefined();
  });

  it("z Negocjacji: zatwierdzony wariant zostaje, Negocjacje nie blokują", () => {
    const m: Mission = {
      ...discoveryMission(),
      currentStage: "negotiation",
      completedStages: ["research", "contact", "discovery", "needs", "offer"],
      selectedVariant: "C",
      offerApproved: true,
    };
    const result = applyQuickVisit(m, partnerAfterVisit(nova), visitInput({ problem: "Puste popołudnia" }), opts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mission.currentStage).toBe("contract");
    expect(result.mission.selectedVariant).toBe("C");
    // Ten sam opis potrzeby = aktualizacja istniejącej, nie duplikat.
    expect(result.mission.needs.map((n) => n.id)).toEqual(["n1"]);
  });

  it("gdy bramka blokuje, mówi dokładnie co i na którym kroku", () => {
    const denied: Partner = {
      ...nova,
      consents: [
        { channel: "phone", purpose: "contact", status: "denied" },
        { channel: "in_person", purpose: "contact", status: "denied" },
      ],
    };
    const m = { ...emptyMission("partner-nova", "m-6"), currentStage: "contact" as const };
    const result = applyQuickVisit(m, partnerAfterVisit(denied), visitInput(), opts);
    expect(result).toEqual({ ok: false, reason: "Zaznacz zgodę na kanał w kroku Kontakt.", stage: "contact" });
  });
});
