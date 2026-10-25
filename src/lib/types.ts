export const STAGES = [
  { id: "research", label: "Research", short: "Research" },
  { id: "contact", label: "Kontakt", short: "Kontakt" },
  { id: "discovery", label: "Discovery", short: "Discovery" },
  { id: "needs", label: "Potrzeby", short: "Potrzeby" },
  { id: "offer", label: "Oferta A/B/C", short: "Oferta A/B/C" },
  { id: "negotiation", label: "Negocjacje", short: "Negocjacje" },
  { id: "contract", label: "Umowa", short: "Umowa" },
  { id: "activation", label: "Aktywacja", short: "Aktywacja" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

/** Miejsce (lokal), społeczność (klub, grupa, koło) albo firma (zespoły zdalne). */
export type PartnerSegment = "venue" | "company" | "community";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Jak gość realizuje zniżkę: QR skanowany przez obsługę, kod numeryczny w kasie albo hasło lokalu. */
export type RedemptionMethod = "qr" | "code" | "password";

/** Zniżka dla ludzi z Lutry — warunek obecności lokalu w aplikacji. */
export type DiscountTerms = {
  /** Rabat procentowy albo gratis (np. kawa do deseru). */
  kind: "percent" | "freebie";
  percent: number | null;
  freebie: string;
  /** Dni, w których obowiązuje (puste = każdy dzień otwarcia). */
  days: Weekday[];
  /** Okno godzinowe, np. godziny martwe 16:00–19:00 (puste = cały dzień). */
  hoursFrom: string;
  hoursTo: string;
  /** Minimalna grupa (np. 3 = „zniżka od grupy 3+”). */
  minGroup: number | null;
  /** Wyłączone produkty, dni albo okazje. */
  exclusions: string;
  redemption: RedemptionMethod | null;
  /** Hasło dla wariantu bez wdrożenia. */
  password: string;
};

/** Miejsce na wydarzenia: stolik albo przestrzeń w ustalonych godzinach. */
export type SpaceTerms = {
  offered: boolean;
  days: Weekday[];
  hoursFrom: string;
  hoursTo: string;
  /** Ile osób na jedno wydarzenie. */
  seats: number | null;
  notes: string;
};

/** Społeczność: cykl wydarzeń prowadzony w Lutrze. */
export type CycleTerms = {
  events: number | null;
  frequency: "" | "weekly" | "biweekly" | "monthly";
  firstEventAt: string;
};

/** Firma: pilotaż na jednym zespole i feedback. */
export type PilotTerms = {
  team: string;
  people: number | null;
  feedbackAt: string;
};

/** Ustalone warunki współpracy. Okres współpracy = daty umowy (`contract.startAt/endAt`). */
export type MissionTerms = {
  discount: DiscountTerms;
  space: SpaceTerms;
  cycle: CycleTerms;
  pilot: PilotTerms;
};

/** Porozumienie mailowe (krótka współpraca do 3 miesięcy) albo umowa (PDF i podpisy). */
export type AgreementForm = "email" | "contract";

/** Przegląd po cyklu: frekwencja, zgłoszenia uczestników, decyzja o kontynuacji. */
export type CareReview = {
  id: string;
  at: string;
  attendance: string;
  feedback: string;
  decision: "continue" | "change" | "end";
  note: string;
  by?: string;
};

/** Miesięczna informacja dla partnera o liczbie realizacji zniżki. */
export type RedemptionReport = {
  /** „2026-10” */
  month: string;
  count: number | null;
  sentAt: string;
};

/** Opieka po aktywacji. */
export type CareState = {
  reviews: CareReview[];
  /** Kiedy partner ostatnio potwierdził warunki (co kwartał). */
  termsConfirmedAt?: string;
  reports: RedemptionReport[];
};
export type MissionStatus = "active" | "won" | "lost" | "nurture" | "no_fit" | "paused";
export type NeedStatus = "fact" | "observation" | "ai_hypothesis";
export type NeedCategory =
  | "acquisition"
  | "attendance"
  | "off_peak"
  | "margin"
  | "operations"
  | "marketing"
  | "wellbeing"
  | "integration"
  | "budget"
  | "risk";
export type Channel = "phone" | "email" | "linkedin" | "in_person";
export type ConsentStatus = "granted" | "denied" | "unknown" | "withdrawn";
export type OfferVariant = "A" | "B" | "C";
export type Outcome = "won" | "lost" | "nurture" | "no_fit";
/** Statusy, którymi handlowiec zamyka misję ręcznie (wygrana idzie przez aktywację). */
export type CloseStatus = "lost" | "nurture" | "no_fit" | "paused";

export type ActivityDirection = "outbound" | "inbound";
export type ActivityOutcome =
  | "connected"
  | "no_answer"
  | "callback"
  | "refused"
  | "sent"
  | "replied"
  | "meeting_booked"
  | "other";

/** Jeden kontakt z partnerem: telefon, mail, wiadomość albo spotkanie. Wiersz w `conversations`. */
export type Activity = {
  id: string;
  missionId: string;
  channel: Channel | "other";
  direction: ActivityDirection;
  outcome: ActivityOutcome | null;
  subject: string;
  summary: string;
  contactId: string | null;
  occurredAt: string;
  durationMin: number | null;
  createdBy: string | null;
  hasRecording: boolean;
  hasTranscript: boolean;
};

export type NewActivityInput = {
  missionId: string;
  channel: Channel;
  direction: ActivityDirection;
  outcome: ActivityOutcome;
  subject: string;
  summary: string;
  contactId: string;
  occurredAt: string;
  durationMin: number | null;
  nextStep?: string;
  nextStepAt?: string;
};

/** Zmiana etapu albo statusu misji, zapisana przez trigger w bazie (`mission_events`). */
export type MissionEvent = {
  id: string;
  missionId: string;
  kind: "created" | "stage" | "status";
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  actorId: string | null;
  at: string;
};

export type TeamMember = {
  id: string;
  fullName: string;
  role: "admin" | "seller";
  email: string;
  isMe: boolean;
};

/** Podgląd zaproszenia przed dołączeniem (RPC peek_workspace_invite). */
export type InvitePeek = {
  status: "ok" | "missing" | "revoked" | "accepted" | "used" | "expired" | "email_mismatch" | "same_workspace";
  workspaceName: string | null;
  invitedBy: string | null;
  inviteEmail: string | null;
  /** Czy pytający jest sam w obecnym workspace (wtedy jego dane przechodzą do zespołu). */
  alone: boolean;
  ownPartners: number;
  ownMissions: number;
};

export type TeamInvite = {
  id: string;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  createdByName: string | null;
};

export type PartnerContact = {
  id: string;
  name: string;
  role: string;
  isDecisionMaker: boolean;
  phone?: string;
  email?: string;
  linkedin?: string;
};

export type Consent = {
  /** „other” = zgoda niezwiązana z kanałem (np. informacja o analizie AI). */
  channel: Channel | "other";
  purpose: "contact" | "recording" | "ai_analysis";
  status: ConsentStatus;
};

/** Dane rejestrowe firmy partnera — do umowy i faktur. NIP i REGON jako same cyfry. */
export type CompanyData = {
  legalName: string;
  nip: string;
  regon: string;
  legalAddress: string;
  mailingAddress: string;
  billingEmail: string;
};

export type Partner = {
  id: string;
  /** Kto dodał partnera / za niego odpowiada. */
  ownerUserId?: string;
  name: string;
  segment: PartnerSegment;
  /** Pojemność miejsca (osób) — sprawdzana przed publikacją. */
  capacity: number | null;
  city: string;
  address: string;
  category: string;
  subcategory: string;
  website: string;
  instagram: string;
  facebook: string;
  socialOther: string;
  priority: string;
  priorityReason: string;
  source: string;
  dnc: boolean;
  hours?: string;
  notes?: string;
  company: CompanyData;
  contacts: PartnerContact[];
  consents: Consent[];
};

export type ChecklistState = Record<string, boolean>;

export type DiscoveryDraft = {
  category: NeedCategory | "";
  categorySource: "human" | "ai" | "";
  priority: number;
  description: string;
  quote: string;
  decisionMakerId: string;
  decisionDeadline: string;
  previousAttempts: string;
  constraints: string[];
};

export type Need = {
  id: string;
  category: NeedCategory;
  title: string;
  description: string;
  priority: number | null;
  quote?: string;
  expectedResult?: string;
  constraints?: string;
  status: NeedStatus;
  confirmed: boolean;
};

export type DecisionContext = {
  problem: string;
  expectedResult: string;
  constraintSummary: string;
  decisionMakerId: string;
  decisionDeadline: string;
  previousAttempts: string;
  nextStep: string;
};

export type MissionObjection = {
  key: string;
  checked: boolean;
  argumentWorked: boolean;
};

export type ContractRecord = {
  companyName: string;
  nip: string;
  address: string;
  startAt: string;
  endAt: string;
  changeRules: string;
  /** Podpis po stronie Lutry (handlowiec). */
  signedByHuman: boolean;
  documentPath?: string;
  signedAt?: string;
  /** Kiedy umowę wysłano partnerowi do podpisu. */
  sentAt?: string;
  /** Kiedy partner podpisał. */
  partnerSignedAt?: string;
  /** Skan albo PDF podpisany przez partnera. */
  signedDocumentPath?: string;
  status: ContractStatus;
};

/** draft → ready (jest PDF) → sent (u partnera) → partner_signed → signed (obie strony). */
export type ContractStatus = "draft" | "ready" | "sent" | "partner_signed" | "signed";

export type ActivationRecord = {
  partnerCode: string;
  hoursConfirmed: boolean;
  opsContactName: string;
  opsContactPhone: string;
  testPassed: boolean;
  testNotes: string;
  checkInAt: string;
  activatedAt?: string;
};

export type TaskItem = {
  id: string;
  missionId: string;
  title: string;
  dueAt: string;
  doneAt?: string;
  source: "human" | "next_step" | "ai_draft";
};

export type CallRecord = {
  id: string;
  channel: Channel;
  recordingConsent: "pending" | "granted" | "denied";
  storagePath?: string;
  durationSec?: number;
  transcriptStatus: "idle" | "processing" | "ready" | "failed";
  transcriptText?: string;
  error?: string;
  createdAt: string;
};

export type Mission = {
  id: string;
  partnerId: string;
  /** Właściciel misji. Nie zmienia się, gdy misję edytuje ktoś inny z zespołu. */
  ownerUserId?: string;
  startedAt?: string;
  /** Kiedy misję zamknięto (wygrana, przegrana, pauza…). Puste dla aktywnej. */
  closedAt?: string;
  /** Notatka do zamknięcia misji. Powód z listy siedzi w `lossReason`. */
  closeNote: string;
  activities: Activity[];
  events: MissionEvent[];
  status: MissionStatus;
  currentStage: StageId;
  completedStages: StageId[];
  /** Warunki współpracy: zniżka, miejsce, cykl albo pilotaż. */
  terms: MissionTerms;
  /** Forma zawarcia: porozumienie mailowe albo umowa. `null` = wynika z okresu. */
  agreementForm: AgreementForm | null;
  care: CareState;
  nextStepLabel: string;
  nextStepAt: string;
  checklist: ChecklistState;
  selectedChannel: Channel | null;
  conversationNote: string;
  recordingConsent: "pending" | "granted" | "denied";
  disclosureShown: boolean;
  discovery: DiscoveryDraft;
  needs: Need[];
  decision: DecisionContext;
  recommendedVariant: OfferVariant;
  selectedVariant: OfferVariant | null;
  offerApproved: boolean;
  offerSentAt?: string;
  objections: MissionObjection[];
  outcome: Outcome | null;
  lossReason: string;
  calls: CallRecord[];
  contract: ContractRecord;
  activation: ActivationRecord;
};

export type AppState = {
  user: { name: string; initials: string; role: string; id?: string; isAdmin?: boolean };
  workspace: { name: string; id: string; contractTemplate?: string | null; agreementTemplate?: string | null };
  partners: Partner[];
  missions: Mission[];
  tasks: TaskItem[];
  team: TeamMember[];
};

export type NewPartnerInput = {
  name: string;
  city: string;
  address: string;
  category: string;
  subcategory: string;
  website: string;
  instagram: string;
  facebook: string;
  socialOther: string;
  priority: string;
  priorityReason: string;
  source: string;
  hours: string;
  notes: string;
  legalName?: string;
  nip?: string;
  segment?: PartnerSegment;
  capacity?: number | null;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
  phoneConsent: ConsentStatus;
  emailConsent: ConsentStatus;
};
