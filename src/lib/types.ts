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

export type PartnerSegment = "venue" | "company" | "community";
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
  channel: Channel;
  purpose: "contact" | "recording" | "ai_analysis";
  status: ConsentStatus;
};

export type Partner = {
  id: string;
  name: string;
  segment: PartnerSegment;
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
  signedByHuman: boolean;
  documentPath?: string;
  signedAt?: string;
  status: "draft" | "ready" | "signed";
};

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
  status: MissionStatus;
  currentStage: StageId;
  completedStages: StageId[];
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
  user: { name: string; initials: string; role: string };
  workspace: { name: string; id: string };
  partners: Partner[];
  missions: Mission[];
  tasks: TaskItem[];
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
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
  phoneConsent: ConsentStatus;
  emailConsent: ConsentStatus;
};
