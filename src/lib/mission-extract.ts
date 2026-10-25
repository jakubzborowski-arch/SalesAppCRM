import { isIsoDate } from "./dates";
import {
  buildProposal,
  dateLabel,
  inWindow,
  nameInSource,
  NOT_IN_TALK,
  planFromProposal,
  quoteFound,
  relatesTo,
  same,
  type ApplyPlan,
  type DiscoveryExtraction,
  type ObjectionKey,
  type Proposal,
  type ProposalRow,
} from "./discovery-extract";
import { applyEvidence } from "./evidence";
import { OBJECTION_KEYS } from "./playbook";
import { cycleSummary, discountSummary, periodText, pilotSummary, redemptionLabel, termsChecks } from "./terms";
import type {
  ActivationRecord,
  ContractRecord,
  CycleTerms,
  DiscountTerms,
  Mission,
  MissionTerms,
  Partner,
  PilotTerms,
  SpaceTerms,
} from "./types";

/**
 * Rozmowa → cała misja: poza Discovery także warunki oferty, obiekcje z rozmowy oraz dane do porozumienia
 * i aktywacji. Ten sam podgląd z checkboxami — nic nie zapisuje się bez zaznaczenia.
 */

export const GROUPS = {
  talk: "Rozmowa i potrzeby",
  offer: "Oferta i warunki",
  negotiation: "Negocjacje — obiekcje z rozmowy",
  deal: "Porozumienie, umowa i aktywacja",
  note: "Notatka",
} as const;

export type MissionPlan = ApplyPlan & {
  terms: {
    discount?: Partial<DiscountTerms>;
    space?: Partial<SpaceTerms>;
    cycle?: Partial<CycleTerms>;
    pilot?: Partial<PilotTerms>;
  };
  contract: Partial<ContractRecord>;
  activation: Partial<ActivationRecord>;
  partner: Partial<Pick<Partner, "hours">>;
  checklist: Record<string, boolean>;
  objections: Array<{ key: ObjectionKey; worked: boolean }>;
};

const CONSENTS = [
  { key: "contract:brand_app", field: "consentLogo", label: "Zgoda na nazwę i logo w aplikacji" },
  { key: "contract:brand_photos", field: "consentPhotos", label: "Zgoda na zdjęcia" },
  { key: "contract:brand_social", field: "consentSocial", label: "Zgoda na posty w social mediach Lutry" },
] as const;

/** Okres współpracy bywa dłuższy niż rok — inne okno niż dla terminów decyzji. */
function periodOk(iso: string, fromDate: string, callDate: string) {
  if (!isIsoDate(iso)) return false;
  return inWindow(iso, fromDate, callDate) || (iso > callDate && iso <= `${Number(callDate.slice(0, 4)) + 3}${callDate.slice(4)}`);
}

function termsRows(
  ext: DiscoveryExtraction,
  mission: Mission,
  partner: Partner,
  check: (value: string) => string | undefined,
  dates: { fromDate: string; callDate: string },
) {
  const rows: ProposalRow[] = [];
  const t = ext.terms;
  const terms: MissionPlan["terms"] = {};
  const group = GROUPS.offer;
  const current = mission.terms;
  const add = (row: Omit<ProposalRow, "checked" | "group"> & { checked?: boolean }) =>
    rows.push({ ...row, group, checked: row.checked ?? (!row.warning && !row.current.trim()) });

  if (partner.segment === "venue") {
    const d = current.discount;
    const valueSet = d.kind === "percent" ? Boolean(d.percent) : Boolean(d.freebie.trim());
    if (t.discountPercent || t.freebie) {
      const patch: Partial<DiscountTerms> = t.discountPercent
        ? { kind: "percent", percent: t.discountPercent }
        : { kind: "freebie", freebie: t.freebie };
      const proposed = discountSummary({ ...d, days: [], hoursFrom: "", hoursTo: "", minGroup: null, exclusions: "", redemption: null, ...patch });
      const now = valueSet ? discountSummary({ ...d, days: [], hoursFrom: "", hoursTo: "", minGroup: null, exclusions: "", redemption: null }) : "";
      if (proposed !== now) {
        terms.discount = { ...terms.discount, ...patch };
        add({
          key: "terms:value",
          label: "Zniżka",
          value: proposed,
          current: now,
          warning: check(t.discountPercent ? `${t.discountPercent}` : t.freebie),
          hint: "Wpisz tylko to, na co partner się zgodził.",
        });
      }
    }
    if (t.days.length || t.hoursFrom || t.hoursTo) {
      const proposed = discountSummary({ ...d, percent: null, freebie: "", kind: "percent", minGroup: null, exclusions: "", redemption: null, days: t.days, hoursFrom: t.hoursFrom, hoursTo: t.hoursTo });
      const now = discountSummary({ ...d, percent: null, freebie: "", kind: "percent", minGroup: null, exclusions: "", redemption: null });
      if (proposed && proposed !== now) {
        terms.discount = { ...terms.discount, days: t.days, hoursFrom: t.hoursFrom, hoursTo: t.hoursTo };
        add({ key: "terms:when", label: "Kiedy obowiązuje zniżka", value: proposed, current: now });
      }
    }
    if (t.minGroup > 1 && t.minGroup !== d.minGroup) {
      terms.discount = { ...terms.discount, minGroup: t.minGroup };
      add({
        key: "terms:group",
        label: "Minimalna grupa",
        value: `od ${t.minGroup} osób`,
        current: d.minGroup ? `od ${d.minGroup} osób` : "",
      });
    }
    if (t.exclusions && !same(t.exclusions, d.exclusions)) {
      terms.discount = { ...terms.discount, exclusions: t.exclusions };
      add({ key: "terms:exclusions", label: "Wyłączenia", value: t.exclusions, current: d.exclusions, warning: check(t.exclusions) });
    }
    if (t.redemption && t.redemption !== d.redemption) {
      terms.discount = { ...terms.discount, redemption: t.redemption };
      add({
        key: "terms:redemption",
        label: "Realizacja zniżki",
        value: redemptionLabel(t.redemption),
        current: d.redemption ? redemptionLabel(d.redemption) : "",
        hint: t.redemption === "password" ? "Hasło dla obsługi wpiszesz w kroku Oferta." : undefined,
      });
    }
    if (t.space && !same(t.space, current.space.notes)) {
      terms.space = { offered: true, notes: t.space };
      add({
        key: "terms:space",
        label: "Miejsce na wydarzenia",
        value: t.space,
        current: current.space.offered ? current.space.notes || "tak" : "",
        warning: check(t.space),
      });
    }
  }

  if (partner.segment === "community" && (t.cycleEvents || t.cycleFrequency || t.cycleFirst)) {
    const first = t.cycleFirst && inWindow(t.cycleFirst, dates.fromDate, dates.callDate) ? t.cycleFirst : "";
    const patch: Partial<CycleTerms> = {
      ...(t.cycleEvents ? { events: t.cycleEvents } : {}),
      ...(t.cycleFrequency ? { frequency: t.cycleFrequency } : {}),
      ...(first ? { firstEventAt: first } : {}),
    };
    const proposed = cycleSummary({ ...current.cycle, ...patch });
    const now = cycleSummary(current.cycle);
    if (Object.keys(patch).length && proposed !== now) {
      terms.cycle = patch;
      add({ key: "terms:cycle", label: "Cykl wydarzeń", value: proposed, current: now });
    }
  }

  if (partner.segment === "company" && (t.pilotTeam || t.pilotPeople || t.pilotFeedback)) {
    const feedback = t.pilotFeedback && inWindow(t.pilotFeedback, dates.fromDate, dates.callDate) ? t.pilotFeedback : "";
    const patch: Partial<PilotTerms> = {
      ...(t.pilotTeam ? { team: t.pilotTeam } : {}),
      ...(t.pilotPeople ? { people: t.pilotPeople } : {}),
      ...(feedback ? { feedbackAt: feedback } : {}),
    };
    const proposed = pilotSummary({ ...current.pilot, ...patch });
    const now = pilotSummary(current.pilot);
    if (Object.keys(patch).length && proposed !== now) {
      terms.pilot = patch;
      add({ key: "terms:pilot", label: "Pilotaż", value: proposed, current: now, warning: t.pilotTeam ? check(t.pilotTeam) : undefined });
    }
  }

  let period: Pick<ContractRecord, "startAt" | "endAt"> | null = null;
  if (
    periodOk(t.periodFrom, dates.fromDate, dates.callDate) &&
    periodOk(t.periodTo, dates.fromDate, dates.callDate) &&
    t.periodTo > t.periodFrom
  ) {
    const proposed = periodText({ startAt: t.periodFrom, endAt: t.periodTo });
    const now = periodText(mission.contract);
    if (proposed !== now) {
      period = { startAt: t.periodFrom, endAt: t.periodTo };
      add({
        key: "terms:period",
        label: "Okres współpracy",
        value: `${dateLabel(t.periodFrom)} – ${dateLabel(t.periodTo)}`,
        current: now,
        hint: "Do 3 miesięcy wystarczy porozumienie mailowe, dłużej — umowa.",
      });
    }
  }
  return { rows, terms, period };
}

function objectionRows(ext: DiscoveryExtraction, mission: Mission, source: string) {
  const rows: ProposalRow[] = [];
  const objections: MissionPlan["objections"] = [];
  for (const item of ext.objections) {
    const state = mission.objections.find((o) => o.key === item.key);
    const needsCheck = !state?.checked;
    const needsWorked = item.worked && !state?.argumentWorked;
    if (!needsCheck && !needsWorked) continue;
    const label = OBJECTION_KEYS.find((o) => o.key === item.key)?.label ?? item.key;
    const quoteOk = !item.quote || !source.trim() || quoteFound(item.quote, source);
    objections.push({ key: item.key, worked: item.worked });
    rows.push({
      key: `objection:${item.key}`,
      group: GROUPS.negotiation,
      label: "Obiekcja z rozmowy",
      value: `${label}${item.worked ? " · argument zadziałał" : ""}`,
      current: state?.checked ? `zaznaczona${state.argumentWorked ? ", argument zadziałał" : ""}` : "",
      hint: item.quote && quoteOk ? `„${item.quote}”` : undefined,
      warning: !item.quote
        ? "Brak cytatu partnera — zaznacz tylko, jeśli ta obiekcja naprawdę padła."
        : quoteOk
          ? undefined
          : "Nie znalazłem tego zdania w transkrypcie — sprawdź, czy padło.",
      // Bez dosłownego zdania partnera obiekcja (i „argument zadziałał”) nie wchodzi sama.
      checked: Boolean(item.quote) && quoteOk,
    });
  }
  return { rows, objections };
}

function dealRows(
  ext: DiscoveryExtraction,
  mission: Mission,
  partner: Partner,
  check: (value: string) => string | undefined,
  source: string,
) {
  const rows: ProposalRow[] = [];
  const contract: Partial<ContractRecord> = {};
  const activation: Partial<ActivationRecord> = {};
  const partnerPatch: MissionPlan["partner"] = {};
  const checklist: Record<string, boolean> = {};
  const group = GROUPS.deal;
  const add = (row: Omit<ProposalRow, "checked" | "group"> & { checked?: boolean }) =>
    rows.push({ ...row, group, checked: row.checked ?? (!row.warning && !row.current.trim()) });
  const d = ext.deal;

  const currentCompany = mission.contract.companyName || partner.company.legalName;
  if (d.companyName && !same(d.companyName, currentCompany)) {
    contract.companyName = d.companyName;
    add({ key: "deal:company", label: "Nazwa firmy do porozumienia / umowy", value: d.companyName, current: currentCompany, warning: check(d.companyName) });
  }
  if (d.opsContact && !same(d.opsContact, mission.activation.opsContactName)) {
    activation.opsContactName = d.opsContact;
    add({
      key: "deal:ops",
      label: "Kontakt awaryjny",
      value: d.opsContact,
      current: mission.activation.opsContactName,
      hint: "Telefon dopisz ręcznie — numery nie idą do AI.",
      warning: source.trim() && !nameInSource(d.opsContact, source) ? NOT_IN_TALK : undefined,
    });
  }
  if (partner.segment === "venue" && d.openingHours && !same(d.openingHours, partner.hours ?? "")) {
    partnerPatch.hours = d.openingHours;
    add({ key: "deal:hours", label: "Godziny otwarcia (karta partnera)", value: d.openingHours, current: partner.hours ?? "", warning: check(d.openingHours) });
  }
  for (const consent of CONSENTS) {
    if (!d[consent.field] || mission.checklist[consent.key]) continue;
    if (consent.key === "contract:brand_app" && partner.segment === "company") continue;
    checklist[consent.key] = true;
    add({
      key: `deal:${consent.key}`,
      label: consent.label,
      value: "partner się zgodził",
      current: "",
      // Zgoda to decyzja partnera — zaznaczasz sam, gdy padła wprost.
      checked: false,
      hint: "Zaznacz tylko, jeśli partner wyraźnie się zgodził. Formalnie potwierdza ją porozumienie albo umowa.",
    });
  }
  return { rows, contract, activation, partner: partnerPatch, checklist };
}

export type MissionProposal = Proposal & {
  mission: {
    terms: MissionPlan["terms"];
    period: Pick<ContractRecord, "startAt" | "endAt"> | null;
    objections: MissionPlan["objections"];
    contract: Partial<ContractRecord>;
    activation: Partial<ActivationRecord>;
    partner: MissionPlan["partner"];
    checklist: Record<string, boolean>;
  };
};

/** Podgląd dla całej misji: Discovery (jak dotąd) + oferta, negocjacje, porozumienie i aktywacja. */
export function buildMissionProposal(
  ext: DiscoveryExtraction,
  input: Parameters<typeof buildProposal>[1],
): MissionProposal {
  const base = buildProposal(ext, input);
  const { mission, partner, source, callDate } = input;
  const fromDate = input.fromDate && isIsoDate(input.fromDate) && input.fromDate < callDate ? input.fromDate : callDate;
  const hasSource = source.trim().length > 0;
  const check = (value: string) => (hasSource && value && !relatesTo(value, source) ? NOT_IN_TALK : undefined);

  const talk = base.rows.filter((row) => row.key !== "summary").map((row) => ({ ...row, group: GROUPS.talk }));
  const note = base.rows.filter((row) => row.key === "summary").map((row) => ({ ...row, group: GROUPS.note }));
  const offer = termsRows(ext, mission, partner, check, { fromDate, callDate });
  const objections = objectionRows(ext, mission, input.view?.known ? input.view.partnerText : source);
  const deal = dealRows(ext, mission, partner, check, source);

  // Czego w warunkach nadal brakuje, gdyby wstawić wszystko z podglądu.
  const merged: Pick<Mission, "terms" | "contract"> = {
    terms: {
      discount: { ...mission.terms.discount, ...offer.terms.discount },
      space: { ...mission.terms.space, ...offer.terms.space },
      cycle: { ...mission.terms.cycle, ...offer.terms.cycle },
      pilot: { ...mission.terms.pilot, ...offer.terms.pilot },
    } as MissionTerms,
    contract: { ...mission.contract, ...(offer.period ?? {}) },
  };
  const termsMissing = termsChecks(merged, partner.segment)
    .filter((item) => !item.done)
    .map((item) => `warunki: ${item.label}`);

  const all = [...talk, ...offer.rows, ...objections.rows, ...deal.rows, ...note];
  // Każde pole musi mieć zdanie-dowód w słowach partnera; bez niego wiersz jest odznaczony.
  const rows = input.view
    ? applyEvidence(all, ext.evidence, input.view, quoteFound, {
        discountPercent: ext.terms.discountPercent,
        minGroup: ext.terms.minGroup,
      })
    : all;
  return {
    ...base,
    rows,
    missing: [...base.missing, ...termsMissing],
    mission: {
      terms: offer.terms,
      period: offer.period,
      objections: objections.objections,
      contract: deal.contract,
      activation: deal.activation,
      partner: deal.partner,
      checklist: deal.checklist,
    },
  };
}

/** Zaznaczone wiersze → zmiany w misji (Discovery jak dotąd + reszta kroków). */
export function planMission(proposal: MissionProposal, selected: Set<string>, mission: Mission, today = new Date()): MissionPlan {
  const base = planFromProposal(proposal, selected, mission, today);
  const m = proposal.mission;
  const discount: Partial<DiscountTerms> = {};
  const t = m.terms.discount ?? {};
  if (selected.has("terms:value")) {
    if (t.kind) discount.kind = t.kind;
    if (t.percent !== undefined) discount.percent = t.percent;
    if (t.freebie !== undefined) discount.freebie = t.freebie;
  }
  if (selected.has("terms:when")) {
    if (t.days) discount.days = t.days;
    if (t.hoursFrom !== undefined) discount.hoursFrom = t.hoursFrom;
    if (t.hoursTo !== undefined) discount.hoursTo = t.hoursTo;
  }
  if (selected.has("terms:group") && t.minGroup !== undefined) discount.minGroup = t.minGroup;
  if (selected.has("terms:exclusions") && t.exclusions !== undefined) discount.exclusions = t.exclusions;
  if (selected.has("terms:redemption") && t.redemption !== undefined) discount.redemption = t.redemption;

  const terms: MissionPlan["terms"] = {};
  if (Object.keys(discount).length) terms.discount = discount;
  if (selected.has("terms:space") && m.terms.space) terms.space = m.terms.space;
  if (selected.has("terms:cycle") && m.terms.cycle) terms.cycle = m.terms.cycle;
  if (selected.has("terms:pilot") && m.terms.pilot) terms.pilot = m.terms.pilot;

  const contract: Partial<ContractRecord> = {
    ...(selected.has("terms:period") && m.period ? m.period : {}),
    ...(selected.has("deal:company") && m.contract.companyName ? { companyName: m.contract.companyName } : {}),
  };
  const activation: Partial<ActivationRecord> =
    selected.has("deal:ops") && m.activation.opsContactName ? { opsContactName: m.activation.opsContactName } : {};
  const partner: MissionPlan["partner"] = selected.has("deal:hours") && m.partner.hours ? { hours: m.partner.hours } : {};
  const checklist = Object.fromEntries(
    Object.entries(m.checklist).filter(([key]) => selected.has(`deal:${key}`)),
  );
  const objections = m.objections.filter((item) => selected.has(`objection:${item.key}`));
  return { ...base, terms, contract, activation, partner, checklist, objections };
}
