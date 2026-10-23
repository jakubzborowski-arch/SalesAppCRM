import { formatPlDate, isIsoDate } from "./dates";
import type {
  AgreementForm,
  CareState,
  ContractRecord,
  DiscountTerms,
  Mission,
  MissionTerms,
  PartnerSegment,
  RedemptionMethod,
  Weekday,
} from "./types";

/** Jedno wymaganie bramki: co trzeba mieć i czy już jest. */
export type Check = { key: string; label: string; done: boolean; hint?: string };

export const WEEKDAYS: { id: Weekday; short: string; label: string }[] = [
  { id: "mon", short: "pn", label: "poniedziałek" },
  { id: "tue", short: "wt", label: "wtorek" },
  { id: "wed", short: "śr", label: "środa" },
  { id: "thu", short: "czw", label: "czwartek" },
  { id: "fri", short: "pt", label: "piątek" },
  { id: "sat", short: "sob", label: "sobota" },
  { id: "sun", short: "nd", label: "niedziela" },
];

export const REDEMPTION_METHODS: { id: RedemptionMethod; label: string; hint: string }[] = [
  {
    id: "qr",
    label: "QR",
    hint: "Aplikacja generuje kod QR ważny jednorazowo w dniu wydarzenia. Obsługa go skanuje.",
  },
  {
    id: "code",
    label: "Kod numeryczny",
    hint: "Jednorazowy kod z aplikacji. Pracownik wpisuje go w kasie jako rabat.",
  },
  {
    id: "password",
    label: "Hasło (bez wdrożenia)",
    hint: "Gość podaje hasło lokalu i pokazuje wydarzenie w aplikacji. Obsługa nabija rabat ręcznie.",
  },
];

/** Zwykły zakres zniżki dla ludzi z Lutry (Partnerzy → „Po co nam partnerzy”). */
export const DISCOUNT_RANGE = { min: 10, max: 15 } as const;

/** Do tylu miesięcy współpraca jest „krótka”: wystarcza porozumienie mailowe. */
export const SHORT_TERM_MONTHS = 3;

export const CYCLE_FREQUENCIES: { id: Exclude<MissionTerms["cycle"]["frequency"], "">; label: string }[] = [
  { id: "weekly", label: "co tydzień" },
  { id: "biweekly", label: "co dwa tygodnie" },
  { id: "monthly", label: "co miesiąc" },
];

export function emptyDiscount(): DiscountTerms {
  return {
    kind: "percent",
    percent: null,
    freebie: "",
    days: [],
    hoursFrom: "",
    hoursTo: "",
    minGroup: null,
    exclusions: "",
    redemption: null,
    password: "",
  };
}

export function emptyTerms(): MissionTerms {
  return {
    discount: emptyDiscount(),
    space: { offered: false, days: [], hoursFrom: "", hoursTo: "", seats: null, notes: "" },
    cycle: { events: null, frequency: "", firstEventAt: "" },
    pilot: { team: "", people: null, feedbackAt: "" },
  };
}

export function emptyCare(): CareState {
  return { reviews: [], reports: [] };
}

/** Zapis z bazy (albo starszej wersji) uzupełniony o brakujące pola. */
export function mergeTerms(saved: Partial<MissionTerms> | undefined | null): MissionTerms {
  const base = emptyTerms();
  return {
    discount: { ...base.discount, ...(saved?.discount ?? {}) },
    space: { ...base.space, ...(saved?.space ?? {}) },
    cycle: { ...base.cycle, ...(saved?.cycle ?? {}) },
    pilot: { ...base.pilot, ...(saved?.pilot ?? {}) },
  };
}

export function mergeCare(saved: Partial<CareState> | undefined | null): CareState {
  return { ...emptyCare(), ...(saved ?? {}), reviews: saved?.reviews ?? [], reports: saved?.reports ?? [] };
}

export function addMonthsIso(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  // Ostatni dzień miesiąca, jeśli w docelowym nie ma takiego dnia (31.01 + 1 mies. = 28/29.02).
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d, last);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Czy okres współpracy mieści się w 3 miesiącach. `null`, gdy brak dat. */
export function isShortTerm(startAt: string, endAt: string): boolean | null {
  if (!isIsoDate(startAt) || !isIsoDate(endAt) || endAt < startAt) return null;
  return endAt <= addMonthsIso(startAt, SHORT_TERM_MONTHS);
}

/** Forma wynikająca z okresu: krótka → porozumienie mailowe, dłuższa albo bez dat → umowa. */
export function defaultAgreementForm(contract: Pick<ContractRecord, "startAt" | "endAt">): AgreementForm {
  return isShortTerm(contract.startAt, contract.endAt) ? "email" : "contract";
}

/** Forma tej misji. Okres dłuższy niż 3 miesiące zawsze wymaga umowy. */
export function agreementFormOf(mission: Pick<Mission, "agreementForm" | "contract">): AgreementForm {
  const short = isShortTerm(mission.contract.startAt, mission.contract.endAt);
  if (short === false) return "contract";
  if (mission.agreementForm) return mission.agreementForm;
  // Misje sprzed wyboru formy, które mają już PDF umowy, zostają przy umowie (z podpisami).
  if (mission.contract.documentPath) return "contract";
  return defaultAgreementForm(mission.contract);
}

/** Domyślny tekst z wcześniejszych wersji CRM — traktujemy go jak puste pole. */
export const LEGACY_CHANGE_RULES = "Zmiany warunków tylko pisemnie. Potwierdzenie kwartalne.";

const CHANGE_RULES: Record<PartnerSegment, { short: string; long: string }> = {
  venue: {
    short:
      "Krótka zniżka (do 3 miesięcy): partner może ją zakończyć w każdej chwili, ale honoruje ją dla wydarzeń już utworzonych w aplikacji, najdłużej 7 dni. Zmiany warunków potwierdzamy mailem.",
    long: "Zmianę albo wycofanie zniżki partner zgłasza z 7-dniowym wyprzedzeniem. Warunki potwierdzamy co kwartał. Zmiany umowy tylko na piśmie lub mailem obu stron.",
  },
  community: {
    short:
      "Krótka współpraca (do 3 miesięcy): każda strona może ją zakończyć w każdej chwili; wydarzenia już utworzone w aplikacji odbywają się zgodnie z planem, najdłużej 7 dni. Zmiany potwierdzamy mailem.",
    long: "Zmianę albo zakończenie cyklu strony zgłaszają z 7-dniowym wyprzedzeniem. Warunki potwierdzamy co kwartał. Zmiany umowy tylko na piśmie lub mailem obu stron.",
  },
  company: {
    short:
      "Pilotaż (do 3 miesięcy): każda strona może go zakończyć w każdej chwili; spotkania już zaplanowane w aplikacji odbywają się, najdłużej 7 dni. Zmiany potwierdzamy mailem.",
    long: "Zmianę albo zakończenie współpracy strony zgłaszają z 7-dniowym wyprzedzeniem. Warunki potwierdzamy co kwartał. Zmiany umowy tylko na piśmie lub mailem obu stron.",
  },
};

/** Zasady zmian i wycofania zgodne z okresem i typem partnera (Partnerzy → „Czego oczekujemy”). */
export function changeRulesFor(short: boolean, segment: PartnerSegment = "venue") {
  const rules = CHANGE_RULES[segment] ?? CHANGE_RULES.venue;
  return short ? rules.short : rules.long;
}

/** Czy tekst zasad jest pusty albo to jeden z gotowych wzorów (wtedy podmieniamy go przy zmianie okresu). */
export function isDefaultChangeRules(text: string) {
  const value = text.trim();
  if (!value || value === LEGACY_CHANGE_RULES) return true;
  return Object.values(CHANGE_RULES).some((rules) => value === rules.short || value === rules.long);
}

function daysText(days: Weekday[]) {
  if (!days.length || days.length === 7) return "";
  const order = WEEKDAYS.map((w) => w.id);
  const sorted = [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return sorted.map((d) => WEEKDAYS.find((w) => w.id === d)?.short ?? d).join(", ");
}

function hoursText(from: string, to: string) {
  if (from && to) return `${from}–${to}`;
  if (from) return `od ${from}`;
  if (to) return `do ${to}`;
  return "";
}

export function redemptionLabel(method: RedemptionMethod | null) {
  return REDEMPTION_METHODS.find((m) => m.id === method)?.label ?? "";
}

/** „15% rabatu · śr, czw 16:00–19:00 · od 3 osób · bez alkoholu · realizacja: QR” */
export function discountSummary(d: DiscountTerms) {
  const value =
    d.kind === "percent"
      ? d.percent
        ? `${d.percent}% rabatu`
        : ""
      : d.freebie.trim()
        ? `gratis: ${d.freebie.trim()}`
        : "";
  const when = [daysText(d.days), hoursText(d.hoursFrom, d.hoursTo)].filter(Boolean).join(" ");
  return [
    value,
    when,
    d.minGroup && d.minGroup > 1 ? `od ${d.minGroup} osób` : "",
    d.exclusions.trim() ? `wyłączenia: ${d.exclusions.trim()}` : "",
    d.redemption ? `realizacja: ${redemptionLabel(d.redemption)}${d.redemption === "password" && d.password.trim() ? ` „${d.password.trim()}”` : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function spaceSummary(s: MissionTerms["space"]) {
  if (!s.offered) return "";
  const when = [daysText(s.days), hoursText(s.hoursFrom, s.hoursTo)].filter(Boolean).join(" ");
  return [
    "miejsce na wydarzenia",
    when,
    s.seats ? `do ${s.seats} osób` : "",
    s.notes.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function cycleSummary(c: MissionTerms["cycle"]) {
  const freq = CYCLE_FREQUENCIES.find((f) => f.id === c.frequency)?.label ?? "";
  return [
    c.events ? `cykl ${c.events} ${c.events === 1 ? "wydarzenia" : "wydarzeń"}` : "",
    freq,
    isIsoDate(c.firstEventAt) ? `pierwsze ${formatPlDate(c.firstEventAt)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function pilotSummary(p: MissionTerms["pilot"]) {
  return [
    p.team.trim() ? `zespół ${p.team.trim()}` : "",
    p.people ? `${p.people} os.` : "",
    isIsoDate(p.feedbackAt) ? `feedback ${formatPlDate(p.feedbackAt)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function periodText(contract: Pick<ContractRecord, "startAt" | "endAt">) {
  if (!isIsoDate(contract.startAt) || !isIsoDate(contract.endAt)) return "";
  return `${formatPlDate(contract.startAt)} – ${formatPlDate(contract.endAt)}`;
}

/** Warunki jako punkty (do maila, umowy i podsumowań). */
export function termsLines(mission: Pick<Mission, "terms" | "contract">, segment: PartnerSegment) {
  const t = mission.terms;
  const lines: string[] = [];
  if (segment === "venue") {
    const discount = discountSummary(t.discount);
    if (discount) lines.push(`Zniżka dla ludzi z Lutry: ${discount}`);
    const space = spaceSummary(t.space);
    if (space) lines.push(`Miejsce: ${space}`);
  } else if (segment === "community") {
    const cycle = cycleSummary(t.cycle);
    if (cycle) lines.push(`Wydarzenia w Lutrze: ${cycle}`);
  } else {
    const pilot = pilotSummary(t.pilot);
    if (pilot) lines.push(`Pilotaż: ${pilot}`);
  }
  const period = periodText(mission.contract);
  if (period) lines.push(`Okres: ${period}`);
  return lines;
}

function periodChecks(contract: Pick<ContractRecord, "startAt" | "endAt">): Check[] {
  const both = isIsoDate(contract.startAt) && isIsoDate(contract.endAt);
  return [
    { key: "period", label: "okres współpracy (od–do)", done: both },
    ...(both && contract.endAt < contract.startAt
      ? [{ key: "period_order", label: "koniec po początku okresu", done: false }]
      : []),
  ];
}

/** Co musi być ustalone, zanim handlowiec zatwierdzi wariant (zależy od typu partnera). */
export function termsChecks(mission: Pick<Mission, "terms" | "contract">, segment: PartnerSegment): Check[] {
  const t = mission.terms;
  if (segment === "venue") {
    const d = t.discount;
    const value = d.kind === "percent" ? Boolean(d.percent && d.percent > 0 && d.percent <= 100) : Boolean(d.freebie.trim());
    return [
      { key: "discount", label: "zniżka: wysokość albo gratis", done: value },
      { key: "redemption", label: "sposób realizacji zniżki (QR / kod / hasło)", done: Boolean(d.redemption) },
      ...(d.redemption === "password"
        ? [{ key: "password", label: "hasło dla obsługi", done: Boolean(d.password.trim()) }]
        : []),
      ...periodChecks(mission.contract),
    ];
  }
  if (segment === "community") {
    return [
      {
        key: "events",
        label: "liczba wydarzeń w cyklu",
        done: Boolean(t.cycle.events && t.cycle.events >= 1),
        hint: t.cycle.events === 1 ? "Umowa na cykl, nie na pojedyncze wydarzenie — rozważ więcej niż jedno." : undefined,
      },
      { key: "frequency", label: "częstotliwość wydarzeń", done: Boolean(t.cycle.frequency) },
      { key: "first_event", label: "termin pierwszego wydarzenia", done: isIsoDate(t.cycle.firstEventAt) },
      ...periodChecks(mission.contract),
    ];
  }
  return [
    { key: "team", label: "zespół pilotażowy", done: Boolean(t.pilot.team.trim()) },
    { key: "people", label: "liczba osób w pilotażu", done: Boolean(t.pilot.people && t.pilot.people >= 1) },
    { key: "feedback", label: "termin feedbacku", done: isIsoDate(t.pilot.feedbackAt) },
    ...periodChecks(mission.contract),
  ];
}

/** Ostrzeżenia, które nie blokują (np. zniżka spoza zwykłego zakresu). */
export function termsWarnings(mission: Pick<Mission, "terms">, segment: PartnerSegment) {
  const warnings: string[] = [];
  const d = mission.terms.discount;
  if (segment === "venue" && d.kind === "percent" && d.percent && (d.percent < DISCOUNT_RANGE.min || d.percent > DISCOUNT_RANGE.max)) {
    warnings.push(`Zwykle ustalamy ${DISCOUNT_RANGE.min}–${DISCOUNT_RANGE.max}%. Upewnij się, że ${d.percent}% to świadoma decyzja.`);
  }
  if (segment === "community" && mission.terms.cycle.events === 1) {
    warnings.push("Jedno wydarzenie to test, nie cykl — jednorazowe testy nie budują nawyku.");
  }
  return warnings;
}
