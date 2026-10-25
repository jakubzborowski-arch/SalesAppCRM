"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { activationBlockers, canEnterStage, contractBlockers, nextStage, offerBlockers } from "./gates";
import { categoryLabel, suggestVariant } from "./playbook";
import { emptyCompany } from "./company";
import { agreementFormOf, changeRulesFor, isDefaultChangeRules, isShortTerm, mergeCare, mergeTerms, termsChecks } from "./terms";
import {
  canDeletePartner as canDeletePartnerIn,
  canEditMission as canEditMissionIn,
  canEditPartner as canEditPartnerIn,
} from "./permissions";
import { emptyMission, seedState } from "./seed";
import {
  MissionConflictError,
  acceptInviteToken,
  clearMissionVersions,
  replaceMissionVersions,
  setMissionVersion,
  createInvite as createInviteRow,
  deleteActivity,
  ensureWorkspace,
  insertActivity,
  insertPartner,
  isMissingPartnersTable,
  listInvites as listInviteRows,
  loadCrm,
  loadMissionEvents,
  loadTeam,
  peekInvite,
  persistMission,
  persistPartner,
  detectSchemaV5,
  detectSchemaV6,
  detectSchemaV7,
  detectSchemaV8,
  saveAgreementTemplate as saveAgreementTemplateRow,
  saveContractTemplate as saveContractTemplateRow,
  V7_MISSING,
  V8_MISSING,
  loadPartnerMetrics,
  savePartnerMetricsRow,
  transferMission as transferMissionRow,
  V5_MISSING,
  loadPartner,
  deletePartner as deletePartnerRow,
  insertPartnerContact,
  removeMember as removeMemberRow,
  renameWorkspace as renameWorkspaceRow,
  revokeInvite as revokeInviteRow,
  saveManualTranscript,
  saveRecording,
  updateTranscriptText,
  attachTranscript,
  deleteTranscript,
} from "./db";
import { MAX_TRANSCRIPT_CHARS } from "./transcript";
import { SKILL_SMOKE_TRANSCRIPT, skillSmokeEnabled, skillSmokeFullMission } from "./skill-smoke-test";
import {
  generatePartnerCode,
  insertTask,
  setTaskDone,
  contractStatus,
  uploadContractPdf,
} from "./mission-core";
import { migrationDrift, type MigrationDrift } from "./migrations";
import { fitOf, pickUrgentMission } from "./fit";
import { MONTH_RE } from "./health";
import { getSupabase, isMissingCrmTable, isSupabaseConfigured } from "./supabase";
import type {
  MissionTerms,
  CareReview,
  AgreementForm,
  Activity,
  AppState,
  CallRecord,
  Channel,
  CloseStatus,
  InvitePeek,
  Mission,
  Need,
  NewActivityInput,
  NewPartnerInput,
  OfferVariant,
  Partner,
  PartnerContact,
  PartnerMetrics,
  PartnerMetricsInput,
  StageId,
  TaskItem,
  TeamInvite,
} from "./types";

const STORAGE_KEY = "lutra-crm-v1";
const INVITE_KEY = "lutra-invite";
/** Po powrocie do karty odświeżamy dane zespołu najwyżej raz na tyle ms. */
const REFRESH_MIN_MS = 30_000;

export type DbStatus = "loading" | "need-login" | "need-sql" | "ok" | "error";

export type Notice = { kind: "ok" | "error"; text: string };

/** Zaproszenie czekające na decyzję: podgląd z bazy i stan przycisku „Dołącz”. */
export type InviteState = {
  token: string;
  loading: boolean;
  busy: boolean;
  info: InvitePeek | null;
  error: string | null;
};

type Result = { ok: boolean; error?: string };
type GateResult = { ok: boolean; reason?: string };

export type CloseMissionInput = {
  status: CloseStatus;
  reason: string;
  note: string;
  returnAt: string;
};

type Store = {
  ready: boolean;
  dbStatus: DbStatus;
  dbError: string | null;
  saveState: "idle" | "saving" | "saved" | "error";
  authEmail: string | null;
  /** `true` gdy w bazie jest migracja v4 (zespół, dziennik). `null` gdy nie wiadomo. */
  schemaV4: boolean | null;
  /** Czy baza ma pola danych firmy (migracja v5). */
  schemaV5: boolean | null;
  /** Czy baza ma uprawnienia per właściciel i obieg podpisu (migracja v6). */
  schemaV6: boolean | null;
  /** Czy bieżący użytkownik może edytować misję / partnera (cudze — tylko podgląd). */
  canEditMission: (mission: Mission) => boolean;
  canEditPartner: (partner: Partner) => boolean;
  /** Czy można usunąć partnera (opiekun albo admin, bez cudzych misji). */
  canDeletePartner: (partner: Partner) => boolean;
  /** Przekazanie misji innej osobie z zespołu. */
  transferMission: (missionId: string, userId: string) => Promise<Result>;
  /** Szablon umowy zespołu (`null` = domyślny). Zmienia administrator. */
  saveContractTemplate: (template: string) => Promise<Result>;
  /** Szablon porozumienia mailowego (`null` = domyślny). Zmienia administrator. */
  saveAgreementTemplate: (template: string) => Promise<Result>;
  /** Czy baza ma typ partnera, pojemność i szablon porozumienia (migracja v7). */
  schemaV7: boolean | null;
  /** Czy baza ma v8 (znaczniki wersji, jakość AI, opieka). */
  schemaV8: boolean | null;
  /** Starsza migracja odpalona po nowszej — trzeba powtórzyć kolejne. */
  migrationDrift: MigrationDrift | null;
  /** Zmiana warunków współpracy: zniżka, miejsce, cykl albo pilotaż. */
  updateTerms: <K extends keyof MissionTerms>(missionId: string, section: K, patch: Partial<MissionTerms[K]>) => void;
  /** Forma zawarcia: porozumienie mailowe (do 3 miesięcy) albo umowa. */
  setAgreementForm: (missionId: string, form: AgreementForm) => void;
  /** Ustawia pozycję checklisty (z datą odhaczenia w bazie). */
  setChecklistItem: (missionId: string, key: string, done: boolean) => void;
  /** Opieka: przegląd po cyklu. */
  addCareReview: (missionId: string, review: Omit<CareReview, "id" | "at" | "by">) => GateResult;
  /** Opieka: partner potwierdził warunki (kwartalnie). */
  confirmTerms: (missionId: string) => void;
  /** Opieka: wysłana miesięczna informacja o liczbie realizacji. */
  reportRedemptions: (missionId: string, month: string, count: number | null) => void;
  /** Miesięczne metryki partnera (wydarzenia, uczestnicy, realizacje zniżki, notatka). */
  savePartnerMetrics: (partnerId: string, month: string, values: PartnerMetricsInput) => Promise<Result>;
  /** Baza nie ma jeszcze tabeli metryk (migracja v8). */
  metricsMissing: boolean;
  /** Zapisuje w dzienniku wysłany mail po telefonie albo spotkaniu. */
  logFollowUpMail: (missionId: string, afterActivityId: string) => Promise<Result>;
  /** Generuje PDF umowy z szablonu i podpina go do misji. */
  generateContract: (missionId: string, pdf: Uint8Array) => Promise<{ ok: boolean; error?: string }>;
  /** Podpisany przez partnera skan / PDF. */
  uploadSignedContract: (missionId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  notice: Notice | null;
  dismissNotice: () => void;
  state: AppState;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ ok: boolean; error?: string; confirm?: boolean }>;
  signOut: () => Promise<void>;
  retryCloud: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
  addPartner: (input: NewPartnerInput) => Promise<{ ok: boolean; id?: string; error?: string }>;
  deletePartner: (partnerId: string) => Promise<{ ok: boolean; error?: string }>;
  addPartners: (
    inputs: NewPartnerInput[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<{
    ok: boolean;
    created: number;
    failed: { name: string; error: string }[];
    error?: string;
  }>;
  saveCall: (
    missionId: string,
    blob: Blob,
    durationSec: number,
    transcriptText?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  saveTranscript: (conversationId: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  /** Transkrypt rozmowy (np. ze Spinach): nowy wpis w dzienniku albo do istniejącego kontaktu. */
  addTranscript: (
    missionId: string,
    input: { text: string; channel: Channel; occurredAt: string; attachTo?: string | null; note?: string },
  ) => Promise<{ ok: boolean; id?: string; error?: string }>;
  /** Usuwa transkrypt (wpis w dzienniku i nagranie zostają). */
  removeTranscript: (missionId: string, conversationId: string) => Promise<Result>;
  applySkillSmokeTest: (
    missionId: string,
    partnerId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  partnerById: (id: string) => Partner | undefined;
  /** Aktywna misja partnera (status „W toku”). */
  missionByPartner: (partnerId: string) => Mission | undefined;
  /** Najnowsza misja partnera w dowolnym statusie. */
  latestMissionByPartner: (partnerId: string) => Mission | undefined;
  missionsOfPartner: (partnerId: string) => Mission[];
  memberName: (userId: string | null | undefined) => string;
  urgentMission: () => { partner: Partner; mission: Mission } | undefined;
  startMission: (partnerId: string) => string | null;
  goToStage: (missionId: string, stage: StageId) => GateResult;
  advance: (missionId: string) => GateResult;
  closeMission: (missionId: string, input: CloseMissionInput) => GateResult;
  reopenMission: (missionId: string) => GateResult;
  logActivity: (input: NewActivityInput) => Promise<Result>;
  removeActivity: (missionId: string, activityId: string) => Promise<Result>;
  toggleChecklist: (missionId: string, key: string) => void;
  updatePartner: (partnerId: string, patch: Partial<Partner>) => void;
  updatePartnerContact: (partnerId: string, contactId: string, patch: Partial<PartnerContact>) => void;
  addPartnerContact: (
    partnerId: string,
    input: { name: string; role?: string; isDecisionMaker?: boolean },
  ) => Promise<{ ok: boolean; id?: string; error?: string }>;
  removeNeed: (missionId: string, needId: string) => void;
  setConsent: (
    partnerId: string,
    channel: Channel,
    status: Partner["consents"][number]["status"],
  ) => void;
  setChannel: (missionId: string, channel: Channel) => void;
  setRecording: (
    missionId: string,
    patch: Partial<Pick<Mission, "recordingConsent" | "disclosureShown" | "conversationNote">>,
  ) => void;
  updateDiscovery: (missionId: string, patch: Partial<Mission["discovery"]>) => void;
  seedNeedsIfEmpty: (missionId: string) => void;
  upsertNeed: (missionId: string, need: Need) => void;
  confirmNeed: (missionId: string, needId: string, confirmed: boolean) => void;
  updateDecision: (missionId: string, patch: Partial<Mission["decision"]>) => void;
  setNextStepAt: (missionId: string, at: string) => void;
  selectVariant: (missionId: string, variant: OfferVariant) => void;
  approveOffer: (missionId: string) => GateResult;
  markOfferSent: (missionId: string) => GateResult;
  toggleObjection: (missionId: string, key: string, field: "checked" | "argumentWorked") => void;
  updateContract: (missionId: string, patch: Partial<Mission["contract"]>) => void;
  uploadContract: (missionId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  updateActivation: (missionId: string, patch: Partial<Mission["activation"]>) => void;
  assignPartnerCode: (missionId: string) => string | null;
  addTask: (input: { missionId: string; title: string; dueAt: string }) => Promise<{ ok: boolean; error?: string }>;
  completeTask: (taskId: string, done: boolean) => void;
  completeActivation: (missionId: string) => GateResult;
  /** Zaproszenie do zespołu czekające na potwierdzenie (z linku albo wklejone w Ustawieniach). */
  invite: InviteState | null;
  /** Sprawdza link/kod i pokazuje potwierdzenie. Niczego jeszcze nie przyjmuje. */
  checkInvite: (tokenOrLink: string) => Promise<Result>;
  /** Przyjmuje sprawdzone zaproszenie (po kliknięciu „Dołącz”). */
  confirmInvite: () => Promise<Result>;
  dismissInvite: () => void;
  createInvite: (email: string) => Promise<{ ok: boolean; token?: string; error?: string }>;
  listInvites: () => Promise<{ ok: boolean; invites?: TeamInvite[]; error?: string }>;
  revokeInvite: (inviteId: string) => Promise<Result>;
  removeMember: (memberId: string) => Promise<Result>;
  renameWorkspace: (name: string) => Promise<Result>;
};

const StoreContext = createContext<Store | null>(null);

const emptyState: AppState = {
  user: { name: "", initials: "", role: "Handlowiec" },
  workspace: { name: "Lutra", id: "" },
  partners: [],
  missions: [],
  tasks: [],
  team: [],
  metrics: [],
};

/** Wyciąga kod zaproszenia z linku (`…/login?invite=KOD`) albo z samego kodu. */
export function parseInviteToken(raw: string) {
  const text = raw.trim();
  const fromLink = text.match(/[?&]invite=([0-9a-f]{32,128})/i)?.[1];
  if (fromLink) return fromLink.toLowerCase();
  const bare = text.match(/^[0-9a-f]{32,128}$/i)?.[0];
  return bare ? bare.toLowerCase() : "";
}

/** Zapamiętuje kod zaproszenia na czas logowania (tylko ta karta przeglądarki). */
export function rememberInvite(token: string) {
  try {
    window.sessionStorage.setItem(INVITE_KEY, token);
  } catch {
    /* prywatne okno bez sessionStorage — zaproszenie da się wkleić w Ustawieniach */
  }
}

function readPendingInvite() {
  try {
    return window.sessionStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}

function clearPendingInvite() {
  try {
    window.sessionStorage.removeItem(INVITE_KEY);
  } catch {
    /* brak sessionStorage */
  }
}

function tomorrow() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function byNewest(a: Activity, b: Activity) {
  return b.occurredAt.localeCompare(a.occurredAt);
}

/** Wstawia zadania z bazy w miejsce lokalnych kopii. Jedno otwarte „następny krok” na misję. */
function mergeTasks(current: TaskItem[], incoming: TaskItem[]) {
  let next = [...current];
  for (const task of incoming) {
    if (task.source === "next_step") {
      next = next.filter(
        (item) =>
          item.id === task.id ||
          !(item.missionId === task.missionId && item.source === "next_step" && !item.doneAt),
      );
    }
    const index = next.findIndex((item) => item.id === task.id);
    if (index >= 0) next[index] = task;
    else next = [task, ...next];
  }
  return next;
}

function syncDecisionFromDiscovery(mission: Mission): Mission {
  const d = mission.discovery;
  return {
    ...mission,
    decision: {
      ...mission.decision,
      problem: d.description || mission.decision.problem,
      constraintSummary: d.constraints.join(", ") || mission.decision.constraintSummary,
      decisionMakerId: d.decisionMakerId || mission.decision.decisionMakerId,
      decisionDeadline: d.decisionDeadline || mission.decision.decisionDeadline,
      previousAttempts: d.previousAttempts || mission.decision.previousAttempts,
    },
  };
}

/** Typ albo pojemność z formularza nie wróciły z bazy (brak migracji v7). */
function lostV7Fields(input: NewPartnerInput, partner: Partner) {
  const segmentLost = Boolean(input.segment && input.segment !== partner.segment);
  const capacityLost = Boolean(input.capacity && input.capacity > 0 && partner.capacity !== Math.round(input.capacity));
  return segmentLost || capacityLost;
}

function withRecommended(mission: Mission, segment: Partner["segment"] = "venue"): Mission {
  const cats = mission.needs
    .filter((n) => n.confirmed && n.status === "fact")
    .map((n) => n.category);
  return { ...mission, recommendedVariant: suggestVariant(cats, segment) };
}

function readLocal(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState;
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...seedState,
      ...parsed,
      team: [],
      partners: (parsed.partners ?? []).map((p) => ({
        ...p,
        website: p.website ?? "",
        instagram: p.instagram ?? "",
        facebook: p.facebook ?? "",
        socialOther: p.socialOther ?? "",
        priority: p.priority ?? "",
        priorityReason: p.priorityReason ?? "",
        company: { ...emptyCompany(), ...(p.company ?? {}) },
        segment: p.segment ?? "venue",
        capacity: p.capacity ?? null,
        fit: fitOf(p),
      })),
      metrics: (parsed.metrics ?? []).filter((m) => m && typeof m.partnerId === "string" && MONTH_RE.test(m.month)),
      missions: (parsed.missions ?? []).map((m) => {
        const base = emptyMission(m.partnerId, m.id);
        return {
          ...base,
          ...m,
          activities: m.activities ?? [],
          events: m.events ?? [],
          closeNote: m.closeNote ?? "",
          contract: { ...base.contract, ...(m.contract ?? {}) },
          activation: { ...base.activation, ...(m.activation ?? {}) },
          terms: mergeTerms(m.terms),
          agreementForm: m.agreementForm ?? null,
          care: mergeCare(m.care),
        };
      }),
    };
  } catch {
    return seedState;
  }
}

function clearLocalCopy() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* brak dostępu do localStorage */
  }
}

function initialsFrom(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

const READ_ONLY = "To misja kogoś z zespołu — możesz ją oglądać. Edytuje właściciel albo administrator.";

function errorText(err: unknown, fallback: string) {
  const message = (err as { message?: string } | null)?.message;
  return message?.trim() ? message : fallback;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(seedState);
  const [ready, setReady] = useState(false);
  const [dbStatus, setDbStatus] = useState<DbStatus>("loading");
  const [dbError, setDbError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [schemaV4, setSchemaV4] = useState<boolean | null>(null);
  const [schemaV5, setSchemaV5] = useState<boolean | null>(null);
  const [schemaV6, setSchemaV6] = useState<boolean | null>(null);
  const [schemaV7, setSchemaV7] = useState<boolean | null>(null);
  const [schemaV8, setSchemaV8] = useState<boolean | null>(null);
  const [metricsMissing, setMetricsMissing] = useState(false);
  const [drift, setDrift] = useState<MigrationDrift | null>(null);
  const storeRef = useRef<Store | null>(null);
  /** Uprawnienia egzekwujemy w widoku tylko, gdy baza ma v6 (inaczej baza też nikogo nie ogranicza). */
  const enforceRef = useRef(false);
  useEffect(() => {
    enforceRef.current = dbStatus === "ok" && schemaV6 === true;
  }, [dbStatus, schemaV6]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [invite, setInvite] = useState<InviteState | null>(null);
  const userIdRef = useRef<string | null>(null);
  const workspaceIdRef = useRef<string | null>(null);
  const dbStatusRef = useRef<DbStatus>("loading");
  /** Użytkownik, dla którego dane są wczytane (żeby nie wczytywać dwa razy na start i przy odświeżeniu tokenu). */
  const hydratedFor = useRef<string | null>(null);
  const lastLoadAt = useRef(0);
  /** Najnowszy stan dla zapisu w tle. */
  const latest = useRef<AppState>(seedState);
  /** Tryb demo: localStorage pełny (komunikat pokazujemy raz, do udanego zapisu). */
  const storageFullRef = useRef(false);
  /** Ostatnio zapisane obiekty. Inny obiekt w stanie = zmiana do zapisania. */
  const savedMissions = useRef(new Map<string, Mission>());
  const savedPartners = useRef(new Map<string, Partner>());
  /** Licznik udanych zapisów (klucz `m:id` / `p:id`) — odświeżenie nie cofa zapisanych w międzyczasie zmian. */
  const saveCounter = useRef(new Map<string, number>());
  /** W trakcie wczytywania workspace nie zapisujemy (stan zaraz zostanie podmieniony). */
  const hydrating = useRef(false);
  const flushChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    dbStatusRef.current = dbStatus;
  }, [dbStatus]);

  const markSaved = useCallback((data: Pick<AppState, "missions" | "partners">) => {
    savedMissions.current = new Map(data.missions.map((m) => [m.id, m]));
    savedPartners.current = new Map(data.partners.map((p) => [p.id, p]));
  }, []);

  const bump = (key: string) => saveCounter.current.set(key, (saveCounter.current.get(key) ?? 0) + 1);

  /**
   * Zapisuje tylko misje i partnerów zmienionych od ostatniego zapisu. Misja zapisuje się tylko,
   * gdy w bazie jest wersja, którą wczytaliśmy — inaczej wczytujemy wersję kolegi i mówimy o tym.
   */
  const flush = useCallback(async () => {
    const workspaceId = workspaceIdRef.current;
    const userId = userIdRef.current;
    if (!workspaceId || !userId || dbStatusRef.current !== "ok" || hydrating.current) return;
    const snapshot = latest.current;
    // Stan z innego workspace (np. tuż po dołączeniu do zespołu) nigdy nie idzie do zapisu.
    if (snapshot.workspace.id && snapshot.workspace.id !== workspaceId) return;
    const partners = snapshot.partners.filter((p) => savedPartners.current.get(p.id) !== p);
    const missions = snapshot.missions.filter((m) => savedMissions.current.get(m.id) !== m);
    if (!partners.length && !missions.length) return;

    setSaveState("saving");
    let firstError: { code?: string; message?: string } | null = null;
    const partnerConflicts: { partner: Partner; contactIds: string[] }[] = [];
    for (const partner of partners) {
      try {
        const { dropped, conflicts } = await persistPartner(partner, savedPartners.current.get(partner.id));
        savedPartners.current.set(partner.id, partner);
        if (conflicts.length) partnerConflicts.push({ partner, contactIds: conflicts });
        if (dropped.includes("company")) {
          setSchemaV5(false);
          setNotice({ kind: "error", text: `${partner.name}: ${V5_MISSING}` });
        }
        if (dropped.includes("v7")) {
          setSchemaV7(false);
          setNotice({ kind: "error", text: `${partner.name}: ${V7_MISSING}` });
        }
        if (dropped.includes("v8")) {
          setSchemaV8(false);
          setNotice({ kind: "error", text: `${partner.name}: ${V8_MISSING}` });
        }
        if (dropped.includes("priority")) {
          setNotice({ kind: "error", text: `${partner.name}: baza nie przyjęła tego priorytetu. Reszta zmian zapisana.` });
        }
        bump(`p:${partner.id}`);
      } catch (err) {
        firstError ??= err as { code?: string; message?: string };
      }
    }
    for (const conflict of partnerConflicts) {
      // Reszta karty jest zapisana. Kontakty zmienione przez kolegę bierzemy w jego wersji.
      const fresh = await loadPartner(conflict.partner.id).catch(() => null);
      if (!fresh) continue;
      const withFresh = (p: Partner): Partner => ({
        ...p,
        contacts: p.contacts
          .map((c) => (conflict.contactIds.includes(c.id) ? fresh.contacts.find((f) => f.id === c.id) : c))
          .filter((c): c is PartnerContact => Boolean(c)),
      });
      const saved = withFresh(conflict.partner);
      savedPartners.current.set(saved.id, saved);
      setState((prev) => {
        const next = {
          ...prev,
          partners: prev.partners.map((p) => (p.id !== saved.id ? p : p === conflict.partner ? saved : withFresh(p))),
        };
        latest.current = next;
        return next;
      });
      const names = conflict.partner.contacts
        .filter((c) => conflict.contactIds.includes(c.id))
        .map((c) => c.name)
        .join(", ");
      setNotice({
        kind: "error",
        text: `Kontakt ${names} (${saved.name}) zmienił w międzyczasie ktoś z zespołu. Pokazuję jego wersję — wprowadź swoją zmianę jeszcze raz.`,
      });
    }
    const tasks: TaskItem[] = [];
    const eventsFor: string[] = [];
    const conflicts: string[] = [];
    for (const mission of missions) {
      const before = savedMissions.current.get(mission.id);
      try {
        const segment = snapshot.partners.find((p) => p.id === mission.partnerId)?.segment ?? "venue";
        const { nextStepTask } = await persistMission(mission, workspaceId, userId, segment);
        savedMissions.current.set(mission.id, mission);
        bump(`m:${mission.id}`);
        if (nextStepTask) tasks.push(nextStepTask);
        if (!before || before.currentStage !== mission.currentStage || before.status !== mission.status) {
          eventsFor.push(mission.id);
        }
      } catch (err) {
        if (err instanceof MissionConflictError) conflicts.push(mission.id);
        else firstError ??= err as { code?: string; message?: string };
      }
    }

    const events = await Promise.all(
      eventsFor.map(async (missionId) => ({ missionId, events: await loadMissionEvents(missionId) })),
    );
    if (tasks.length || events.some((item) => item.events.length)) {
      setState((prev) => {
        const next = {
          ...prev,
          tasks: tasks.length ? mergeTasks(prev.tasks, tasks) : prev.tasks,
          missions: prev.missions.map((m) => {
            const found = events.find((item) => item.missionId === m.id);
            if (!found?.events.length) return m;
            const withEvents = { ...m, events: found.events };
            // Historia przyszła z bazy — to nie jest zmiana do zapisania.
            if (savedMissions.current.get(m.id) === m) savedMissions.current.set(m.id, withEvents);
            return withEvents;
          }),
        };
        latest.current = next;
        return next;
      });
    }

    if (conflicts.length) {
      // Ktoś z zespołu zapisał te misje przed nami: bierzemy jego wersję zamiast nadpisywać.
      const names = conflicts
        .map((id) => snapshot.partners.find((p) => p.id === snapshot.missions.find((m) => m.id === id)?.partnerId)?.name)
        .filter(Boolean)
        .join(", ");
      try {
        const fresh = await loadCrm(workspaceId);
        setState((prev) => {
          const next = {
            ...prev,
            missions: prev.missions
              .map((m) => {
                if (!conflicts.includes(m.id)) return m;
                const server = fresh.missions.find((item) => item.id === m.id);
                if (server) {
                  savedMissions.current.set(server.id, server);
                  setMissionVersion(server.id, fresh.versions.get(server.id));
                }
                return server ?? null;
              })
              .filter((m): m is Mission => m !== null),
            tasks: fresh.tasks,
          };
          latest.current = next;
          return next;
        });
      } catch {
        /* wersja kolegi dojdzie przy następnym odświeżeniu */
      }
      setNotice({
        kind: "error",
        text: `Ktoś z zespołu zmienił misję${names ? ` (${names})` : ""} w tym samym czasie. Wczytałem jego wersję — sprawdź ją i powtórz swoją ostatnią zmianę.`,
      });
    }

    if (firstError) {
      if (isMissingPartnersTable(firstError)) setDbStatus("need-sql");
      else setDbError(firstError.message ?? "Nie udało się zapisać zmian.");
      setSaveState("error");
      return;
    }
    setDbError(null);
    setSaveState(conflicts.length ? "error" : "saved");
  }, []);

  const scheduleFlush = useCallback(() => {
    flushChain.current = flushChain.current.then(flush, flush);
    return flushChain.current;
  }, [flush]);

  /** Sprawdza zaproszenie i pokazuje potwierdzenie. Nic nie przyjmuje bez kliknięcia „Dołącz”. */
  const inspectInvite = useCallback(async (token: string) => {
    setInvite({ token, loading: true, busy: false, info: null, error: null });
    try {
      const info = await peekInvite(token);
      setInvite({ token, loading: false, busy: false, info, error: null });
    } catch (err) {
      setInvite({ token, loading: false, busy: false, info: null, error: errorText(err, "Nie udało się sprawdzić zaproszenia.") });
    }
  }, []);

  const hydrateUser = useCallback(
    async (userId: string, email: string, fullName?: string, force = false) => {
      if (!force && hydratedFor.current === userId) return;
      hydratedFor.current = userId;
      userIdRef.current = userId;
      setAuthEmail(email);
      hydrating.current = true;

      try {
        const ctx = await ensureWorkspace();
        const [{ partners, missions, tasks, versions }, team] = await Promise.all([
          loadCrm(ctx.workspaceId),
          loadTeam().catch(() => undefined),
        ]);
        const metricsResult = await loadPartnerMetrics(partners.map((p) => p.id)).catch(() => null);
        setMetricsMissing(Boolean(metricsResult?.missing));
        const me = team?.find((member) => member.isMe);
        const name = fullName || me?.fullName || ctx.fullName;
        const next: AppState = {
          user: {
            id: userId,
            name,
            initials: initialsFrom(name, email),
            role: me?.role === "admin" ? "Administrator" : "Handlowiec",
            isAdmin: me?.role === "admin",
          },
          workspace: {
            name: ctx.workspaceName,
            id: ctx.workspaceId,
            contractTemplate: ctx.contractTemplate,
            agreementTemplate: ctx.agreementTemplate,
          },
          partners,
          missions,
          tasks,
          team: team ?? [],
          metrics: metricsResult?.metrics ?? [],
        };
        // Workspace, stan do zapisu i „zapisane” przestawiamy razem — zapis w tle nie zobaczy pół stanu.
        workspaceIdRef.current = ctx.workspaceId;
        latest.current = next;
        markSaved(next);
        replaceMissionVersions(versions);
        lastLoadAt.current = Date.now();
        setSchemaV4(team === undefined ? null : team !== null);
        void detectSchemaV5().then(setSchemaV5);
        void detectSchemaV6().then(setSchemaV6);
        void detectSchemaV7().then(setSchemaV7);
        void detectSchemaV8().then(({ has, rows }) => {
          setSchemaV8(has);
          setDrift(migrationDrift(rows));
        });
        setState(next);
        // Dane są w Supabase. Stara kopia w przeglądarce (z kontaktami) nie jest potrzebna.
        clearLocalCopy();
        setDbStatus("ok");
        setDbError(null);
        const pending = readPendingInvite();
        if (pending && team !== null) void inspectInvite(pending);
      } catch (err) {
        hydratedFor.current = null;
        const error = err as { code?: string; message?: string };
        if (isMissingPartnersTable(error)) {
          setState({
            ...readLocal(),
            user: {
              id: userId,
              name: fullName || email,
              initials: initialsFrom(fullName || email, email),
              role: "Handlowiec",
            },
          });
          setDbStatus("need-sql");
        } else {
          setDbStatus("error");
          setDbError(error.message ?? "Nie udało się wczytać workspace.");
        }
      } finally {
        hydrating.current = false;
      }
      setReady(true);
    },
    [markSaved, inspectInvite],
  );

  /** Zapisuje lokalne zmiany i wczytuje świeże dane workspace (np. zmiany kolegi z zespołu). */
  const refreshData = useCallback(async () => {
    const workspaceId = workspaceIdRef.current;
    if (!workspaceId || dbStatusRef.current !== "ok" || hydrating.current) return;
    await scheduleFlush();
    const countersAtStart = new Map(saveCounter.current);
    const savedSince = (key: string) => (saveCounter.current.get(key) ?? 0) !== (countersAtStart.get(key) ?? 0);
    try {
      const [{ partners, missions, tasks, versions }, team] = await Promise.all([
        loadCrm(workspaceId),
        loadTeam().catch(() => undefined),
      ]);
      const metricsResult = await loadPartnerMetrics(partners.map((p) => p.id)).catch(() => null);
      if (workspaceIdRef.current !== workspaceId || hydrating.current) return;
      if (metricsResult) setMetricsMissing(metricsResult.missing);
      lastLoadAt.current = Date.now();
      setState((prev) => {
        // Zostawiamy lokalną wersję, gdy ma niezapisane zmiany albo zapisała się już po starcie wczytywania.
        const keepMission = new Map(
          prev.missions
            .filter((m) => savedMissions.current.get(m.id) !== m || savedSince(`m:${m.id}`))
            .map((m) => [m.id, m]),
        );
        const keepPartner = new Map(
          prev.partners
            .filter((p) => savedPartners.current.get(p.id) !== p || savedSince(`p:${p.id}`))
            .map((p) => [p.id, p]),
        );
        const loadedMissionIds = new Set(missions.map((m) => m.id));
        const loadedPartnerIds = new Set(partners.map((p) => p.id));
        // Nowości spoza odczytu (np. misja założona przed chwilą) zostają w widoku.
        const nextMissions = [
          ...[...keepMission.values()].filter((m) => !loadedMissionIds.has(m.id)),
          ...missions.map((m) => keepMission.get(m.id) ?? m),
        ];
        const nextPartners = [
          ...partners.map((p) => keepPartner.get(p.id) ?? p),
          ...[...keepPartner.values()].filter((p) => !loadedPartnerIds.has(p.id)),
        ];
        for (const m of missions) {
          if (keepMission.has(m.id)) continue;
          // Treść z bazy = wersja z bazy. Zostawione lokalne wersje trzymają swoją wersję.
          savedMissions.current.set(m.id, m);
          setMissionVersion(m.id, versions.get(m.id));
        }
        for (const p of partners) if (!keepPartner.has(p.id)) savedPartners.current.set(p.id, p);
        const me = team?.find((member) => member.isMe);
        const next = {
          ...prev,
          // Rola mogła się zmienić (np. awans na administratora po odejściu poprzedniego).
          user: me
            ? { ...prev.user, isAdmin: me.role === "admin", role: me.role === "admin" ? "Administrator" : "Handlowiec" }
            : prev.user,
          partners: nextPartners,
          missions: nextMissions,
          tasks,
          team: team ?? prev.team,
          metrics: metricsResult && !metricsResult.missing ? metricsResult.metrics : prev.metrics,
        };
        // Zapis w tle porównuje z tym samym stanem, który właśnie oznaczyliśmy jako zapisany.
        latest.current = next;
        return next;
      });
    } catch {
      /* odświeżenie w tle — błąd pokaże się przy następnym zapisie */
    }
  }, [scheduleFlush]);

  useEffect(() => {
    const sb = getSupabase();
    if (!isSupabaseConfigured() || !sb) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tryb demo bez Supabase: stan z przeglądarki
      setState(readLocal());
      setDbStatus("ok");
      setReady(true);
      return;
    }

    const start = async () => {
      const { data } = await sb.auth.getSession();
      const session = data.session;
      if (!session?.user) {
        setDbStatus("need-login");
        setReady(true);
        return;
      }
      await hydrateUser(
        session.user.id,
        session.user.email ?? "",
        typeof session.user.user_metadata?.full_name === "string"
          ? session.user.user_metadata.full_name
          : undefined,
      );
    };

    void start();
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        userIdRef.current = null;
        workspaceIdRef.current = null;
        hydratedFor.current = null;
        clearMissionVersions();
        markSaved({ partners: [], missions: [] });
        setAuthEmail(null);
        setState(emptyState);
        setDbStatus("need-login");
        return;
      }
      const user = session.user;
      // Poza blokadą Supabase Auth: zapytania do bazy wewnątrz callbacku potrafią się zakleszczyć.
      window.setTimeout(() => {
        void hydrateUser(
          user.id,
          user.email ?? "",
          typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : undefined,
        );
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [hydrateUser, markSaved]);

  useEffect(() => {
    // Kopia w przeglądarce tylko w trybie demo. Z Supabase dane osobowe nie lądują w localStorage.
    if (!ready || isSupabaseConfigured()) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageFullRef.current = false;
    } catch {
      // Pełny albo zablokowany localStorage (np. duże transkrypty w trybie demo) — mówimy o tym raz.
      if (!storageFullRef.current) {
        storageFullRef.current = true;
        setNotice({
          kind: "error",
          text: "Tryb demo: przeglądarka nie ma miejsca na zapis. Ostatnie zmiany znikną po odświeżeniu — usuń duże transkrypty albo podłącz Supabase.",
        });
      }
    }
  }, [ready, state]);

  useEffect(() => {
    if (!ready || dbStatus !== "ok" || !userIdRef.current || !workspaceIdRef.current) return;
    const handle = window.setTimeout(() => {
      void scheduleFlush();
    }, 500);
    return () => window.clearTimeout(handle);
  }, [ready, state.missions, state.partners, dbStatus, scheduleFlush]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadAt.current < REFRESH_MIN_MS) return;
      void refreshData();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshData]);

  useEffect(() => {
    // Ostrzeżenie przed zamknięciem karty, gdy zmiany jeszcze się zapisują.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState !== "saving") return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  const patchMission = (missionId: string, fn: (m: Mission) => Mission) => {
    setState((prev) => {
      let changed = false;
      const missions = prev.missions.map((m) => {
        if (m.id !== missionId) return m;
        // Cudza misja jest tylko do podglądu — zmiana nie trafia ani do widoku, ani do bazy.
        if (!canEditMissionIn(prev, m, enforceRef.current)) return m;
        const next = fn(m);
        if (next === m) return m;
        changed = true;
        return next;
      });
      return changed ? { ...prev, missions } : prev;
    });
  };

  /** Typ partnera misji (do wariantów A/B/C i bramek). */
  const segmentFor = (partnerId: string): Partner["segment"] =>
    latest.current.partners.find((p) => p.id === partnerId)?.segment ?? "venue";

  const patchPartner = (partnerId: string, fn: (p: Partner) => Partner) => {
    setState((prev) => {
      let changed = false;
      const partners = prev.partners.map((p) => {
        if (p.id !== partnerId || !canEditPartnerIn(prev, p, enforceRef.current)) return p;
        const next = fn(p);
        if (next !== p) changed = true;
        return next;
      });
      return changed ? { ...prev, partners } : prev;
    });
  };

  /** Zmiana tylko w widoku (np. wpis dziennika już zapisany w bazie) — bez ponownego zapisu misji. */
  const patchMissionQuiet = (missionId: string, fn: (m: Mission) => Mission) => {
    setState((prev) => ({
      ...prev,
      missions: prev.missions.map((m) => {
        if (m.id !== missionId) return m;
        const next = fn(m);
        if (savedMissions.current.get(m.id) === m) savedMissions.current.set(m.id, next);
        return next;
      }),
    }));
  };

  const store = useMemo<Store>(() => {
    const partnerById = (id: string) => state.partners.find((p) => p.id === id);
    const missionByPartner = (partnerId: string) =>
      state.missions.find((m) => m.partnerId === partnerId && m.status === "active");
    const missionsOfPartner = (partnerId: string) =>
      state.missions
        .filter((m) => m.partnerId === partnerId)
        .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
    const latestMissionByPartner = (partnerId: string) =>
      missionByPartner(partnerId) ?? missionsOfPartner(partnerId)[0];
    const memberName = (userId: string | null | undefined) => {
      if (!userId) return "";
      const member = state.team.find((item) => item.id === userId);
      if (member) return member.fullName;
      return userId === state.user.id ? state.user.name : "ktoś z zespołu";
    };

    const editable = (missionId: string) => {
      const mission = latest.current.missions.find((m) => m.id === missionId);
      return Boolean(mission && canEditMissionIn(latest.current, mission, enforceRef.current));
    };

    const uploadContractFile = async (missionId: string, file: File): Promise<{ ok: boolean; error?: string }> => {
      if (!editable(missionId)) return { ok: false, error: READ_ONLY };
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) return { ok: false, error: "Tylko plik PDF." };
      const userId = userIdRef.current;
      try {
        const path = userId
          ? await uploadContractPdf(userId, missionId, file)
          : `local/${missionId}.pdf`;
        // Nowa wersja dokumentu: wcześniejsza wysyłka i podpisy dotyczyły starego pliku.
        patchMission(missionId, (m) => {
          const contract = {
            ...m.contract,
            documentPath: path,
            sentAt: undefined,
            partnerSignedAt: undefined,
            signedDocumentPath: undefined,
            signedByHuman: false,
            signedAt: undefined,
          };
          return { ...m, contract: { ...contract, status: contractStatus(contract) } };
        });
        return { ok: true };
      } catch (err) {
        const error = err as { message?: string };
        return { ok: false, error: error.message ?? "Nie udało się wgrać PDF. Odpal SQL v3 (bucket contracts)." };
      }
    };

    const runRpc = async (fn: () => Promise<unknown>, fallback: string): Promise<Result> => {
      try {
        await fn();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errorText(err, fallback) };
      }
    };

    return {
      ready,
      dbStatus,
      dbError,
      saveState,
      authEmail,
      schemaV4,
      schemaV5,
      schemaV6,
      canEditMission: (mission) => canEditMissionIn(state, mission, dbStatus === "ok" && schemaV6 === true),
      canEditPartner: (partner) => canEditPartnerIn(state, partner, dbStatus === "ok" && schemaV6 === true),
      canDeletePartner: (partner) => canDeletePartnerIn(state, partner, dbStatus === "ok" && schemaV6 === true),
      transferMission: async (missionId, userId) => {
        let version: string | undefined;
        const result = await runRpc(async () => {
          version = await transferMissionRow(missionId, userId);
        }, "Nie udało się przekazać misji.");
        if (result.ok) {
          // Nowa wersja z bazy — kolejny zapis tej misji nie jest konfliktem.
          if (version) setMissionVersion(missionId, version);
          setState((prev) => {
            const next = {
              ...prev,
              missions: prev.missions.map((m) => (m.id === missionId ? { ...m, ownerUserId: userId } : m)),
            };
            const before = prev.missions.find((m) => m.id === missionId);
            const saved = savedMissions.current.get(missionId);
            const moved = next.missions.find((m) => m.id === missionId);
            if (saved && moved) {
              // Właściciela zmieniła baza. Niezapisane edycje (jeśli są) zostają do zapisu.
              savedMissions.current.set(missionId, saved === before ? moved : { ...saved, ownerUserId: userId });
            }
            latest.current = next;
            return next;
          });
          setNotice({ kind: "ok", text: `Misja przekazana: ${memberName(userId)}.` });
        }
        return result;
      },
      saveContractTemplate: async (template) => {
        // Tryb demo: szablon tylko w tej przeglądarce.
        const result =
          dbStatus === "ok" && userIdRef.current
            ? await runRpc(() => saveContractTemplateRow(template), "Nie udało się zapisać szablonu.")
            : { ok: true };
        if (result.ok) {
          setState((prev) => ({
            ...prev,
            workspace: { ...prev.workspace, contractTemplate: template.trim() || null },
          }));
        }
        return result;
      },
      saveAgreementTemplate: async (template) => {
        const result =
          dbStatus === "ok" && userIdRef.current
            ? await runRpc(() => saveAgreementTemplateRow(template), "Nie udało się zapisać szablonu.")
            : { ok: true };
        if (result.ok) {
          setState((prev) => ({
            ...prev,
            workspace: { ...prev.workspace, agreementTemplate: template.trim() || null },
          }));
        }
        return result;
      },
      schemaV7,
      schemaV8,
      migrationDrift: drift,
      updateTerms: (missionId, section, patch) => {
        patchMission(missionId, (m) => ({
          ...m,
          terms: { ...m.terms, [section]: { ...m.terms[section], ...patch } },
        }));
      },
      setAgreementForm: (missionId, form) => {
        patchMission(missionId, (m) => {
          const next = { ...m, agreementForm: form };
          return { ...next, contract: { ...m.contract, status: contractStatus(m.contract, agreementFormOf(next)) } };
        });
      },
      setChecklistItem: (missionId, key, done) => {
        patchMission(missionId, (m) =>
          Boolean(m.checklist[key]) === done ? m : { ...m, checklist: { ...m.checklist, [key]: done } },
        );
      },
      addCareReview: (missionId, review) => {
        if (!review.attendance.trim() && !review.feedback.trim() && !review.note.trim()) {
          return { ok: false, reason: "Wpisz frekwencję albo zgłoszenia uczestników." };
        }
        patchMission(missionId, (m) => ({
          ...m,
          care: {
            ...m.care,
            reviews: [
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                by: userIdRef.current ?? undefined,
                attendance: review.attendance.trim(),
                feedback: review.feedback.trim(),
                decision: review.decision,
                note: review.note.trim(),
              },
              ...m.care.reviews,
            ],
          },
        }));
        return { ok: true };
      },
      confirmTerms: (missionId) => {
        patchMission(missionId, (m) => ({ ...m, care: { ...m.care, termsConfirmedAt: new Date().toISOString() } }));
      },
      reportRedemptions: (missionId, month, count) => {
        patchMission(missionId, (m) => ({
          ...m,
          care: {
            ...m.care,
            reports: [
              { month, count, sentAt: new Date().toISOString() },
              ...m.care.reports.filter((r) => r.month !== month),
            ].sort((a, b) => b.month.localeCompare(a.month)),
          },
        }));
      },
      metricsMissing,
      savePartnerMetrics: async (partnerId, month, values) => {
        const partner = latest.current.partners.find((p) => p.id === partnerId);
        if (!partner) return { ok: false, error: "Nie ma takiego partnera." };
        if (!canEditPartnerIn(latest.current, partner, enforceRef.current)) {
          return { ok: false, error: "Metryki wpisuje opiekun partnera, prowadzący misję albo administrator." };
        }
        if (!MONTH_RE.test(month)) return { ok: false, error: "Wybierz miesiąc." };
        const numbers = [values.events, values.attendees, values.redemptions];
        if (numbers.some((v) => v !== null && (!Number.isFinite(v) || v < 0))) {
          return { ok: false, error: "Liczby nie mogą być ujemne." };
        }
        if (numbers.every((v) => v === null) && !values.notes.trim()) {
          return { ok: false, error: "Wpisz przynajmniej jedną liczbę albo notatkę." };
        }
        const clean: PartnerMetricsInput = {
          events: values.events === null ? null : Math.round(values.events),
          attendees: values.attendees === null ? null : Math.round(values.attendees),
          redemptions: values.redemptions === null ? null : Math.round(values.redemptions),
          notes: values.notes.trim().slice(0, 1000),
        };
        let saved: PartnerMetrics;
        if (isSupabaseConfigured() && userIdRef.current) {
          try {
            saved = await savePartnerMetricsRow(partnerId, month, clean);
            setMetricsMissing(false);
          } catch (err) {
            const error = errorText(err, "Nie udało się zapisać metryk.");
            if (error === V8_MISSING) setMetricsMissing(true);
            return { ok: false, error };
          }
        } else {
          // Tryb demo: metryki w przeglądarce razem z resztą stanu.
          const existing = (latest.current.metrics ?? []).find((m) => m.partnerId === partnerId && m.month === month);
          saved = { id: existing?.id ?? crypto.randomUUID(), partnerId, month, ...clean, updatedAt: new Date().toISOString() };
        }
        setState((prev) => {
          const next = {
            ...prev,
            metrics: [...(prev.metrics ?? []).filter((m) => !(m.partnerId === partnerId && m.month === month)), saved],
          };
          latest.current = next;
          return next;
        });
        return { ok: true };
      },
      logFollowUpMail: async (missionId, afterActivityId) => {
        const mission = latest.current.missions.find((m) => m.id === missionId);
        const after = mission?.activities.find((a) => a.id === afterActivityId);
        if (!mission || !after) return { ok: false, error: "Nie ma takiego kontaktu." };
        const partner = latest.current.partners.find((p) => p.id === mission.partnerId);
        const contactId =
          after.contactId ??
          partner?.contacts.find((c) => c.id === mission.decision.decisionMakerId)?.id ??
          partner?.contacts[0]?.id ??
          "";
        const meeting = after.channel === "in_person";
        return storeRef.current!.logActivity({
          missionId,
          channel: "email",
          direction: "outbound",
          outcome: "sent",
          subject: meeting ? "Ustalenia ze spotkania" : "Follow-up po rozmowie telefonicznej",
          summary: "",
          contactId,
          occurredAt: new Date().toISOString(),
          durationMin: null,
        });
      },
      generateContract: async (missionId, pdf) => {
        const copy = new Uint8Array(pdf.byteLength);
        copy.set(pdf);
        const file = new File([copy.buffer], "umowa.pdf", { type: "application/pdf" });
        return uploadContractFile(missionId, file);
      },
      uploadSignedContract: async (missionId, file) => {
        if (!editable(missionId)) return { ok: false, error: READ_ONLY };
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const isImage = /^image\/(png|jpe?g)$/.test(file.type);
        if (!isPdf && !isImage) return { ok: false, error: "Podpisana umowa: PDF albo zdjęcie (JPG/PNG)." };
        const userId = userIdRef.current;
        try {
          const path = userId ? await uploadContractPdf(userId, missionId, file) : `local/${missionId}-signed`;
          patchMission(missionId, (m) => {
            const contract = {
              ...m.contract,
              signedDocumentPath: path,
              partnerSignedAt: m.contract.partnerSignedAt ?? new Date().toISOString(),
            };
            return { ...m, contract: { ...contract, status: contractStatus(contract) } };
          });
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorText(err, "Nie udało się wgrać podpisanej umowy.") };
        }
      },
      notice,
      dismissNotice: () => setNotice(null),
      state,
      signIn: async (email, password) => {
        const sb = getSupabase();
        if (!sb) return { ok: false, error: "Brak konfiguracji Supabase." };
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      },
      signUp: async (email, password, name) => {
        const sb = getSupabase();
        if (!sb) return { ok: false, error: "Brak konfiguracji Supabase." };
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) return { ok: false, error: error.message };
        // Z włączonym „Confirm email” sesja powstaje dopiero po kliknięciu linku w mailu.
        if (!data.session) return { ok: true, confirm: true };
        return { ok: true };
      },
      signOut: async () => {
        await scheduleFlush();
        await getSupabase()?.auth.signOut();
        userIdRef.current = null;
        workspaceIdRef.current = null;
        hydratedFor.current = null;
        clearMissionVersions();
        markSaved({ partners: [], missions: [] });
        setAuthEmail(null);
        setState(emptyState);
        setDbStatus("need-login");
      },
      retryCloud: async () => {
        const sb = getSupabase();
        if (!sb) return;
        // Najpierw zapisujemy, co czeka — wczytanie podmienia cały stan.
        await scheduleFlush();
        const { data } = await sb.auth.getSession();
        const user = data.session?.user;
        if (!user) {
          setDbStatus("need-login");
          return;
        }
        await hydrateUser(
          user.id,
          user.email ?? "",
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : undefined,
          true,
        );
      },
      refresh: refreshData,
      reset: () => {
        clearLocalCopy();
        setState((prev) => ({ ...prev, partners: [], missions: [], tasks: [] }));
      },
      addPartner: async (input) => {
        const workspaceId = workspaceIdRef.current;
        const userId = userIdRef.current;
        if (!workspaceId || !userId) return { ok: false, error: "Brak workspace. Odpal SQL v2." };
        try {
          const partner = await insertPartner(workspaceId, userId, input);
          savedPartners.current.set(partner.id, partner);
          setState((prev) => ({ ...prev, partners: [...prev.partners, partner] }));
          // Baza bez migracji v7 nie ma gdzie zapisać typu albo pojemności — partner wraca bez nich.
          if (lostV7Fields(input, partner)) {
            setNotice({ kind: "error", text: `${partner.name}: ${V7_MISSING}` });
          }
          return { ok: true, id: partner.id };
        } catch (err) {
          const error = err as { message?: string };
          return { ok: false, error: error.message ?? "Nie udało się dodać partnera." };
        }
      },
      deletePartner: async (partnerId) => {
        try {
          await deletePartnerRow(partnerId);
          setState((prev) => {
            const missionIds = new Set(
              prev.missions.filter((m) => m.partnerId === partnerId).map((m) => m.id),
            );
            return {
              ...prev,
              partners: prev.partners.filter((p) => p.id !== partnerId),
              missions: prev.missions.filter((m) => m.partnerId !== partnerId),
              tasks: prev.tasks.filter((t) => !missionIds.has(t.missionId)),
            };
          });
          return { ok: true };
        } catch (err) {
          const error = err as { message?: string };
          return { ok: false, error: error.message ?? "Nie udało się usunąć partnera." };
        }
      },
      addPartners: async (inputs, onProgress) => {
        const workspaceId = workspaceIdRef.current;
        const userId = userIdRef.current;
        if (!workspaceId || !userId) {
          return { ok: false, created: 0, failed: [], error: "Brak workspace. Odpal SQL v2." };
        }
        const created: Partner[] = [];
        const createdInputs: NewPartnerInput[] = [];
        const failed: { name: string; error: string }[] = [];
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i];
          try {
            const partner = await insertPartner(workspaceId, userId, input);
            savedPartners.current.set(partner.id, partner);
            created.push(partner);
            createdInputs.push(input);
          } catch (err) {
            const error = err as { message?: string };
            failed.push({
              name: input.name,
              error: error.message ?? "Nie udało się zapisać wiersza.",
            });
          }
          onProgress?.(i + 1, inputs.length);
        }
        if (created.length) {
          setState((prev) => ({ ...prev, partners: [...prev.partners, ...created] }));
          if (created.some((partner, index) => lostV7Fields(createdInputs[index], partner))) {
            setNotice({ kind: "error", text: `Import: ${V7_MISSING}` });
          }
        }
        return {
          ok: failed.length === 0,
          created: created.length,
          failed,
          error: failed[0]?.error,
        };
      },
      saveCall: async (missionId, blob, durationSec, transcriptText) => {
        const userId = userIdRef.current;
        const mission = state.missions.find((m) => m.id === missionId);
        if (!userId || !mission) return { ok: false, error: "Brak misji albo sesji." };
        if (mission.recordingConsent !== "granted" || !mission.disclosureShown) {
          return { ok: false, error: "Najpierw poinformuj i zbierz zgodę na nagranie." };
        }
        try {
          const call = await saveRecording({
            missionId,
            userId,
            channel: mission.selectedChannel ?? "phone",
            blob,
            durationSec,
            note: mission.conversationNote,
            transcriptText,
          });
          patchMissionQuiet(missionId, (m) => ({
            ...m,
            calls: [call, ...(m.calls ?? []).filter((item) => item.id !== call.id)],
          }));
          return { ok: true };
        } catch (err) {
          const error = err as { message?: string };
          return { ok: false, error: error.message ?? "Nie udało się zapisać nagrania." };
        }
      },
      applySkillSmokeTest: async (missionId, partnerId) => {
        if (!skillSmokeEnabled()) return { ok: false, error: "Smoke test jest wyłączony na tym środowisku." };
        const mission = state.missions.find((m) => m.id === missionId);
        const partner = partnerById(partnerId);
        if (!mission || !partner) return { ok: false, error: "Brak partnera albo misji." };
        try {
          let contactId =
            partner.contacts.find((c) => c.isDecisionMaker)?.id ??
            partner.contacts.find((c) => /anna/i.test(c.name))?.id;
          if (!contactId) {
            try {
              const added = await insertPartnerContact(partnerId, {
                name: "Anna Kowalska",
                role: "właścicielka",
                isDecisionMaker: true,
              });
              contactId = added.id;
              setState((prev) => ({
                ...prev,
                partners: prev.partners.map((p) =>
                  p.id === partnerId ? { ...p, contacts: [...p.contacts, added] } : p,
                ),
              }));
            } catch {
              contactId = undefined;
            }
          }

          let call;
          try {
            call = (
              await saveManualTranscript({
                missionId,
                channel: "phone",
                text: SKILL_SMOKE_TRANSCRIPT,
                note: "Smoke test skilla — przykładowa rozmowa discovery",
              })
            ).call;
          } catch (err) {
            const error = err as { message?: string };
            call = {
              id: crypto.randomUUID(),
              channel: "phone" as const,
              recordingConsent: "denied" as const,
              durationSec: 0,
              transcriptStatus: "ready" as const,
              transcriptText: SKILL_SMOKE_TRANSCRIPT,
              createdAt: new Date().toISOString(),
              error: error.message,
            };
          }

          const nextMission = withRecommended(
            skillSmokeFullMission(mission, partner, { contactId, call }),
            partner.segment,
          );
          patchMission(missionId, () => nextMission);
          const partnerWithConsent: Partner = {
            ...partner,
            consents: partner.consents.some((c) => c.channel === "phone" && c.purpose === "contact")
              ? partner.consents.map((c) =>
                  c.channel === "phone" && c.purpose === "contact" ? { ...c, status: "granted" as const } : c,
                )
              : [...partner.consents, { channel: "phone" as const, purpose: "contact" as const, status: "granted" as const }],
          };
          setState((prev) => ({
            ...prev,
            partners: prev.partners.map((p) => (p.id === partnerId ? partnerWithConsent : p)),
          }));
          return { ok: true };
        } catch (err) {
          const error = err as { message?: string };
          return { ok: false, error: error.message ?? "Nie udało się wczytać przykładu skilla." };
        }
      },
      saveTranscript: async (conversationId, text) => {
        try {
          if (isSupabaseConfigured()) await updateTranscriptText(conversationId, text);
          const owner = state.missions.find((m) => (m.calls ?? []).some((call) => call.id === conversationId));
          if (owner) {
            patchMissionQuiet(owner.id, (m) => ({
              ...m,
              calls: (m.calls ?? []).map((call) =>
                call.id === conversationId
                  ? { ...call, transcriptText: text, transcriptStatus: "ready" as const }
                  : call,
              ),
              activities: m.activities.map((activity) =>
                activity.id === conversationId ? { ...activity, hasTranscript: Boolean(text.trim()) } : activity,
              ),
            }));
          }
          return { ok: true };
        } catch (err) {
          const error = err as { message?: string };
          return { ok: false, error: error.message ?? "Nie udało się zapisać transkryptu." };
        }
      },
      addTranscript: async (missionId, input) => {
        const mission = latest.current.missions.find((m) => m.id === missionId);
        if (!mission) return { ok: false, error: "Brak misji." };
        if (!canEditMissionIn(latest.current, mission, enforceRef.current)) {
          return { ok: false, error: "Tę misję edytuje jej właściciel albo administrator." };
        }
        const text = input.text.trim();
        if (text.length < 20) return { ok: false, error: "Transkrypt jest pusty albo za krótki (co najmniej 20 znaków)." };
        if (text.length > MAX_TRANSCRIPT_CHARS) {
          return { ok: false, error: "Transkrypt jest za długi (ponad 200 tys. znaków). Podziel go na części." };
        }
        const newestFirst = (a: CallRecord, b: CallRecord) => b.createdAt.localeCompare(a.createdAt);
        try {
          if (input.attachTo) {
            const activity = mission.activities.find((item) => item.id === input.attachTo);
            if (!activity || (activity.channel !== "phone" && activity.channel !== "in_person")) {
              return { ok: false, error: "Nie ma takiej rozmowy w dzienniku." };
            }
            if (activity.hasTranscript) {
              return { ok: false, error: "Ta rozmowa ma już transkrypt — popraw go na liście albo dodaj nowy wpis." };
            }
            // Każdy wpis dziennika ma swój CallRecord; „idle” = jeszcze bez wiersza w transcripts.
            const existing = (mission.calls ?? []).find((call) => call.id === activity.id);
            const hasRow = Boolean(existing && existing.transcriptStatus !== "idle");
            if (isSupabaseConfigured()) await attachTranscript(activity.id, text, hasRow);
            const call: CallRecord = existing
              ? { ...existing, transcriptText: text, transcriptStatus: "ready" }
              : {
                  id: activity.id,
                  channel: activity.channel,
                  recordingConsent: "denied",
                  durationSec: 0,
                  transcriptStatus: "ready",
                  transcriptText: text,
                  createdAt: activity.occurredAt,
                };
            patchMissionQuiet(missionId, (m) => ({
              ...m,
              calls: [call, ...(m.calls ?? []).filter((item) => item.id !== call.id)].sort(newestFirst),
              activities: m.activities.map((item) => (item.id === activity.id ? { ...item, hasTranscript: true } : item)),
            }));
            return { ok: true, id: activity.id };
          }

          const when = new Date(input.occurredAt);
          const occurredAt = Number.isNaN(when.getTime()) ? new Date().toISOString() : when.toISOString();
          const note = input.note?.trim() || "Transkrypt rozmowy (Spinach)";
          const saved = isSupabaseConfigured()
            ? await saveManualTranscript({
                missionId,
                channel: input.channel,
                text,
                note,
                occurredAt,
                subject: "Rozmowa — transkrypt",
              })
            : (() => {
                const id = crypto.randomUUID();
                const call: CallRecord = {
                  id,
                  channel: input.channel,
                  recordingConsent: "denied",
                  durationSec: 0,
                  transcriptStatus: "ready",
                  transcriptText: text,
                  createdAt: occurredAt,
                };
                const activity: Activity = {
                  id,
                  missionId,
                  channel: input.channel,
                  direction: "outbound",
                  outcome: "connected",
                  subject: "Rozmowa — transkrypt",
                  summary: note,
                  contactId: null,
                  occurredAt,
                  durationMin: null,
                  createdBy: userIdRef.current,
                  hasRecording: false,
                  hasTranscript: true,
                };
                return { call, activity };
              })();
          patchMissionQuiet(missionId, (m) => ({
            ...m,
            calls: [saved.call, ...(m.calls ?? []).filter((item) => item.id !== saved.call.id)].sort(newestFirst),
            activities: [saved.activity, ...m.activities.filter((item) => item.id !== saved.activity.id)].sort(byNewest),
          }));
          return { ok: true, id: saved.call.id };
        } catch (err) {
          return { ok: false, error: errorText(err, "Nie udało się zapisać transkryptu.") };
        }
      },
      removeTranscript: async (missionId, conversationId) => {
        const mission = latest.current.missions.find((m) => m.id === missionId);
        if (!mission) return { ok: false, error: "Brak misji." };
        if (!canEditMissionIn(latest.current, mission, enforceRef.current)) {
          return { ok: false, error: "Tę misję edytuje jej właściciel albo administrator." };
        }
        try {
          if (isSupabaseConfigured()) await deleteTranscript(conversationId);
          patchMissionQuiet(missionId, (m) => ({
            ...m,
            // Wpis (i ewentualne nagranie) zostaje, tylko bez tekstu — tak samo, jak po ponownym wczytaniu.
            calls: (m.calls ?? []).map((call) =>
              call.id === conversationId ? { ...call, transcriptText: undefined, transcriptStatus: "idle" as const } : call,
            ),
            activities: m.activities.map((item) => (item.id === conversationId ? { ...item, hasTranscript: false } : item)),
          }));
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorText(err, "Nie udało się usunąć transkryptu.") };
        }
      },
      partnerById,
      missionByPartner,
      latestMissionByPartner,
      missionsOfPartner,
      memberName,
      urgentMission: () => pickUrgentMission(state),
      startMission: (partnerId) => {
        const partner = partnerById(partnerId);
        if (!partner) return null;
        if (partner.dnc) return null;
        const existing = missionByPartner(partnerId);
        if (existing) return existing.id;
        const mission: Mission = {
          ...emptyMission(partnerId, crypto.randomUUID()),
          ownerUserId: userIdRef.current ?? undefined,
          startedAt: new Date().toISOString(),
        };
        const followUp: TaskItem = {
          id: crypto.randomUUID(),
          missionId: mission.id,
          title: mission.nextStepLabel,
          dueAt: mission.nextStepAt,
          source: "next_step",
        };
        // Zapis idzie w tle (nowy obiekt misji = zmiana do zapisania).
        setState((prev) => ({
          ...prev,
          missions: [mission, ...prev.missions],
          tasks: [followUp, ...prev.tasks],
        }));
        return mission.id;
      },
      goToStage: (missionId, stage) => {
        const mission = state.missions.find((m) => m.id === missionId);
        const partner = mission ? partnerById(mission.partnerId) : undefined;
        if (!mission || !partner) return { ok: false, reason: "Brak misji." };
        if (mission.status !== "active") return { ok: false, reason: "Misja jest zamknięta. Najpierw ją wznów." };
        const gate = canEnterStage(stage, mission, partner);
        if (!gate.ok) return gate;
        patchMission(missionId, (m) => ({ ...m, currentStage: stage }));
        return { ok: true };
      },
      advance: (missionId) => {
        const mission = state.missions.find((m) => m.id === missionId);
        const partner = mission ? partnerById(mission.partnerId) : undefined;
        if (!mission || !partner) return { ok: false, reason: "Brak misji." };
        if (mission.status !== "active") return { ok: false, reason: "Misja jest zamknięta. Najpierw ją wznów." };
        const nxt = nextStage(mission.currentStage);
        if (!nxt) {
          patchMission(missionId, (m) => ({
            ...m,
            status: "won",
            outcome: "won",
            closedAt: m.closedAt ?? new Date().toISOString(),
            nextStepLabel: "Opieka: check-in 30 dni",
          }));
          return { ok: true };
        }
        if (mission.currentStage === "discovery") {
          const toNeeds = canEnterStage("needs", mission, partner);
          if (!toNeeds.ok) return toNeeds;
          const missing = offerBlockers(mission);
          if (missing.length) return { ok: false, reason: `Brakuje: ${missing.join(", ")}.` };
          patchMission(missionId, (m) => ({
            ...m,
            completedStages: [...new Set([...m.completedStages, "discovery" as const, "needs" as const])],
            currentStage: "offer",
          }));
          return { ok: true };
        }
        const gate = canEnterStage(nxt, mission, partner);
        if (!gate.ok) return gate;
        patchMission(missionId, (m) => ({
          ...m,
          completedStages: m.completedStages.includes(m.currentStage)
            ? m.completedStages
            : [...m.completedStages, m.currentStage],
          currentStage: nxt,
        }));
        return { ok: true };
      },
      closeMission: (missionId, input) => {
        const mission = state.missions.find((m) => m.id === missionId);
        if (!mission) return { ok: false, reason: "Brak misji." };
        if (mission.status !== "active") return { ok: false, reason: "Misja jest już zamknięta." };
        const reason = input.reason.trim();
        const note = input.note.trim();
        const returnAt = input.returnAt.trim();
        if ((input.status === "lost" || input.status === "no_fit" || input.status === "nurture") && !reason) {
          return { ok: false, reason: "Wybierz powód z listy." };
        }
        if (reason === "Inny powód" && !note) {
          return { ok: false, reason: "Przy „Inny powód” dopisz krótko, co się stało." };
        }
        if (input.status === "nurture" && !returnAt) {
          return { ok: false, reason: "Ustaw datę, kiedy wracamy do partnera." };
        }
        if (returnAt && returnAt < todayIso()) {
          return { ok: false, reason: "Data powrotu nie może być w przeszłości." };
        }
        const comesBack = input.status === "nurture" || (input.status === "paused" && Boolean(returnAt));
        const now = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          missions: prev.missions.map((m) =>
            m.id === missionId
              ? {
                  ...m,
                  status: input.status,
                  outcome: input.status === "paused" ? null : input.status,
                  lossReason: reason,
                  closeNote: note,
                  closedAt: now,
                  nextStepLabel: comesBack ? `Wróć do partnera${reason ? ` (${reason})` : ""}` : "",
                  nextStepAt: comesBack ? returnAt : "",
                }
              : m,
          ),
          // Otwarty „następny krok” misji: zamknięty (przegrana) albo przestawiony na termin powrotu.
          tasks: prev.tasks.map((task) => {
            if (task.missionId !== missionId || task.source !== "next_step" || task.doneAt) return task;
            if (comesBack) {
              return { ...task, title: `Wróć do partnera${reason ? ` (${reason})` : ""}`, dueAt: returnAt };
            }
            return { ...task, doneAt: now };
          }),
        }));
        return { ok: true };
      },
      reopenMission: (missionId) => {
        const mission = state.missions.find((m) => m.id === missionId);
        if (!mission) return { ok: false, reason: "Brak misji." };
        if (mission.status === "active") return { ok: true };
        const other = missionByPartner(mission.partnerId);
        if (other && other.id !== missionId) {
          return { ok: false, reason: "Ten partner ma już inną misję w toku." };
        }
        const partner = partnerById(mission.partnerId);
        if (partner?.dnc) return { ok: false, reason: "Status „nie kontaktować” blokuje wznowienie." };
        const keepDate = mission.nextStepAt && mission.nextStepAt >= todayIso() ? mission.nextStepAt : tomorrow();
        patchMission(missionId, (m) => ({
          ...m,
          status: "active",
          outcome: null,
          lossReason: "",
          closeNote: "",
          closedAt: undefined,
          nextStepLabel: m.nextStepLabel.trim() || "Wznów kontakt z partnerem",
          nextStepAt: keepDate,
        }));
        return { ok: true };
      },
      logActivity: async (input) => {
        const mission = state.missions.find((m) => m.id === input.missionId);
        if (!mission) return { ok: false, error: "Brak misji." };
        if (input.durationMin !== null && (input.durationMin < 0 || input.durationMin > 600)) {
          return { ok: false, error: "Czas rozmowy: od 0 do 600 minut." };
        }
        try {
          const activity: Activity = isSupabaseConfigured()
            ? await insertActivity(input)
            : {
                id: crypto.randomUUID(),
                missionId: input.missionId,
                channel: input.channel,
                direction: input.direction,
                outcome: input.outcome,
                subject: input.subject.trim(),
                summary: input.summary.trim(),
                contactId: input.contactId || null,
                occurredAt: new Date(input.occurredAt).toISOString(),
                durationMin: input.durationMin,
                createdBy: userIdRef.current,
                hasRecording: false,
                hasTranscript: false,
              };
          const withActivity = (m: Mission) => ({
            ...m,
            activities: [activity, ...m.activities.filter((item) => item.id !== activity.id)].sort(byNewest),
          });
          const nextStep = input.nextStep?.trim() ?? "";
          if (nextStep) {
            // Nowy następny krok to zmiana misji — idzie do zapisu jak każda edycja.
            patchMission(input.missionId, (m) => ({
              ...withActivity(m),
              nextStepLabel: nextStep,
              nextStepAt: input.nextStepAt?.trim() || m.nextStepAt,
              decision: { ...m.decision, nextStep },
            }));
          } else {
            patchMissionQuiet(input.missionId, withActivity);
          }
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorText(err, "Nie udało się zapisać kontaktu.") };
        }
      },
      removeActivity: async (missionId, activityId) => {
        const mission = state.missions.find((m) => m.id === missionId);
        const activity = mission?.activities.find((item) => item.id === activityId);
        if (!mission || !activity) return { ok: false, error: "Nie ma takiego wpisu." };
        if (activity.hasRecording || activity.hasTranscript) {
          return { ok: false, error: "Wpis ma nagranie albo transkrypt — nie usuwam go z dziennika." };
        }
        try {
          if (isSupabaseConfigured()) await deleteActivity(activityId);
          patchMissionQuiet(missionId, (m) => ({
            ...m,
            activities: m.activities.filter((item) => item.id !== activityId),
          }));
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorText(err, "Nie udało się usunąć wpisu.") };
        }
      },
      toggleChecklist: (missionId, key) => {
        patchMission(missionId, (m) => ({
          ...m,
          checklist: { ...m.checklist, [key]: !m.checklist[key] },
        }));
      },
      updatePartner: (partnerId, patch) => {
        patchPartner(partnerId, (p) => ({ ...p, ...patch }));
      },
      updatePartnerContact: (partnerId, contactId, patch) => {
        patchPartner(partnerId, (p) => ({
          ...p,
          contacts: p.contacts.map((c) => {
            if (c.id === contactId) return { ...c, ...patch };
            // Jeden główny decydent na kartę.
            if (patch.isDecisionMaker && c.isDecisionMaker) return { ...c, isDecisionMaker: false };
            return c;
          }),
        }));
      },
      addPartnerContact: async (partnerId, input) => {
        const target = latest.current.partners.find((p) => p.id === partnerId);
        if (target && !canEditPartnerIn(latest.current, target, enforceRef.current)) {
          return { ok: false, error: "Tego partnera edytuje jego opiekun albo administrator." };
        }
        if (!input.name.trim()) return { ok: false, error: "Podaj imię i nazwisko." };
        try {
          const contact = await insertPartnerContact(partnerId, input);
          setState((prev) => ({
            ...prev,
            partners: prev.partners.map((p) =>
              p.id === partnerId ? { ...p, contacts: [...p.contacts, contact] } : p,
            ),
          }));
          return { ok: true, id: contact.id };
        } catch (err) {
          const error = err as { message?: string };
          return { ok: false, error: error.message ?? "Nie udało się dodać osoby." };
        }
      },
      setConsent: (partnerId, channel, status) => {
        patchPartner(partnerId, (p) => {
            const exists = p.consents.some((c) => c.channel === channel && c.purpose === "contact");
            const consents = exists
              ? p.consents.map((c) =>
                  c.channel === channel && c.purpose === "contact" ? { ...c, status } : c,
                )
              : [...p.consents, { channel, purpose: "contact" as const, status }];
            return { ...p, consents };
        });
      },
      setChannel: (missionId, channel) => {
        patchMission(missionId, (m) => ({ ...m, selectedChannel: channel }));
      },
      setRecording: (missionId, patch) => {
        patchMission(missionId, (m) => ({ ...m, ...patch }));
      },
      updateDiscovery: (missionId, patch) => {
        patchMission(missionId, (m) =>
          syncDecisionFromDiscovery({
            ...m,
            discovery: { ...m.discovery, ...patch },
          }),
        );
      },
      seedNeedsIfEmpty: (missionId) => {
        patchMission(missionId, (m) => {
          if (m.needs.length > 0) return m;
          if (!m.discovery.description.trim() && !m.discovery.quote.trim()) return m;
          const mainCategory = m.discovery.category || "off_peak";
          const needs: Need[] = [
            {
              id: crypto.randomUUID(),
              category: mainCategory,
              title: categoryLabel(mainCategory),
              description: m.discovery.description || m.discovery.quote,
              priority: m.discovery.priority,
              quote: m.discovery.quote,
              constraints: m.discovery.constraints.join(", "),
              status: "observation",
              confirmed: false,
            },
          ];
          return withRecommended({ ...m, needs }, segmentFor(m.partnerId));
        });
      },
      upsertNeed: (missionId, need) => {
        patchMission(missionId, (m) =>
          withRecommended(
            {
              ...m,
              needs: m.needs.some((n) => n.id === need.id)
                ? m.needs.map((n) => (n.id === need.id ? need : n))
                : [...m.needs, need],
            },
            segmentFor(m.partnerId),
          ),
        );
      },
      removeNeed: (missionId, needId) => {
        patchMission(missionId, (m) =>
          withRecommended(
            {
              ...m,
              needs: m.needs.filter((n) => n.id !== needId),
            },
            segmentFor(m.partnerId),
          ),
        );
      },
      confirmNeed: (missionId, needId, confirmed) => {
        patchMission(missionId, (m) =>
          withRecommended(
            {
              ...m,
              needs: m.needs.map((n) =>
                n.id === needId ? { ...n, confirmed, status: confirmed ? "fact" : n.status } : n,
              ),
            },
            segmentFor(m.partnerId),
          ),
        );
      },
      updateDecision: (missionId, patch) => {
        patchMission(missionId, (m) => ({
          ...m,
          nextStepLabel: patch.nextStep !== undefined ? patch.nextStep : m.nextStepLabel,
          decision: { ...m.decision, ...patch },
        }));
      },
      setNextStepAt: (missionId, at) => {
        patchMission(missionId, (m) => ({ ...m, nextStepAt: at }));
      },
      selectVariant: (missionId, variant) => {
        patchMission(missionId, (m) => ({ ...m, selectedVariant: variant }));
      },
      approveOffer: (missionId) => {
        const mission = state.missions.find((m) => m.id === missionId);
        if (!mission) return { ok: false, reason: "Brak misji." };
        if (!mission.selectedVariant) return { ok: false, reason: "Wybierz wariant A, B albo C." };
        const missing = offerBlockers(mission);
        if (missing.length) return { ok: false, reason: `Brakuje: ${missing.join(", ")}.` };
        const terms = termsChecks(mission, segmentFor(mission.partnerId)).filter((check) => !check.done);
        if (terms.length) {
          return { ok: false, reason: `Ustal warunki: ${terms.map((check) => check.label).join(", ")}.` };
        }
        patchMission(missionId, (m) => ({ ...m, offerApproved: true }));
        return { ok: true };
      },
      markOfferSent: (missionId) => {
        const mission = state.missions.find((m) => m.id === missionId);
        if (!mission) return { ok: false, reason: "Brak misji." };
        if (!mission.offerApproved) return { ok: false, reason: "Najpierw zatwierdź wariant." };
        patchMission(missionId, (m) => ({
          ...m,
          offerSentAt: m.offerSentAt ?? new Date().toISOString(),
        }));
        return { ok: true };
      },
      toggleObjection: (missionId, key, field) => {
        patchMission(missionId, (m) => ({
          ...m,
          objections: m.objections.map((o) =>
            o.key === key ? { ...o, [field]: !o[field] } : o,
          ),
        }));
      },
      updateContract: (missionId, patch) => {
        patchMission(missionId, (m) => {
          const form = agreementFormOf({ ...m, contract: { ...m.contract, ...patch } });
          // Umowę podpisuje się na dokumencie; porozumienie mailowe zatwierdza się bez PDF.
          if (patch.signedByHuman === true && form === "contract" && !m.contract.documentPath && !patch.documentPath) {
            return m;
          }
          const contract = { ...m.contract, ...patch };
          if (patch.signedByHuman === true) contract.signedAt = new Date().toISOString();
          if (patch.signedByHuman === false) contract.signedAt = undefined;
          // Okres ustalony, zasady puste albo gotowy wzór → zasady zgodne z okresem i typem partnera (7 dni).
          const datesChanged = patch.startAt !== undefined || patch.endAt !== undefined;
          const short = isShortTerm(contract.startAt, contract.endAt);
          if (datesChanged && short !== null && isDefaultChangeRules(contract.changeRules) && patch.changeRules === undefined) {
            contract.changeRules = changeRulesFor(short, segmentFor(m.partnerId));
          }
          contract.status = contractStatus(contract, agreementFormOf({ ...m, contract }));
          return { ...m, contract };
        });
      },
      uploadContract: uploadContractFile,
      updateActivation: (missionId, patch) => {
        patchMission(missionId, (m) => ({
          ...m,
          activation: { ...m.activation, ...patch },
        }));
      },
      assignPartnerCode: (missionId) => {
        const mission = state.missions.find((m) => m.id === missionId);
        const partner = mission ? partnerById(mission.partnerId) : undefined;
        if (!mission || !partner) return null;
        const code = mission.activation.partnerCode.trim() || generatePartnerCode(partner.name, partner.city);
        patchMission(missionId, (m) => ({
          ...m,
          activation: { ...m.activation, partnerCode: code },
        }));
        return code;
      },
      addTask: async (input) => {
        const title = input.title.trim();
        if (!title) return { ok: false, error: "Wpisz treść zadania." };
        const workspaceId = workspaceIdRef.current;
        const userId = userIdRef.current;
        const local: TaskItem = {
          id: crypto.randomUUID(),
          missionId: input.missionId,
          title,
          dueAt: input.dueAt,
          source: "human",
        };
        try {
          const saved =
            workspaceId && userId ? await insertTask(workspaceId, userId, { ...input, title }) : local;
          setState((prev) => ({ ...prev, tasks: [saved, ...prev.tasks] }));
          return { ok: true };
        } catch (err) {
          const error = err as { code?: string; message?: string };
          if (isMissingCrmTable(error)) {
            setState((prev) => ({ ...prev, tasks: [local, ...prev.tasks] }));
            return { ok: true };
          }
          return { ok: false, error: error.message ?? "Nie udało się dodać zadania. Odpal SQL v3." };
        }
      },
      completeTask: (taskId, done) => {
        const task = latest.current.tasks.find((t) => t.id === taskId);
        const owner = task ? latest.current.missions.find((m) => m.id === task.missionId) : undefined;
        if (owner && !canEditMissionIn(latest.current, owner, enforceRef.current)) {
          setNotice({ kind: "error", text: READ_ONLY });
          return;
        }
        const doneAt = done ? new Date().toISOString() : undefined;
        setState((prev) => ({
          ...prev,
          tasks: prev.tasks.map((task) => (task.id === taskId ? { ...task, doneAt } : task)),
        }));
        void setTaskDone(taskId, done).catch(() => undefined);
      },
      completeActivation: (missionId) => {
        const mission = state.missions.find((m) => m.id === missionId);
        if (!mission) return { ok: false, reason: "Brak misji." };
        const partner = partnerById(mission.partnerId);
        const contractMissing = contractBlockers(mission, partner);
        if (contractMissing.length) {
          return { ok: false, reason: `Umowa: ${contractMissing.join(", ")}.` };
        }
        const missing = activationBlockers(mission, partner);
        if (missing.length) return { ok: false, reason: `Brakuje: ${missing.join(", ")}.` };
        const care = "Opieka: przegląd po pierwszym cyklu i kwartalne potwierdzenie warunków";
        const now = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          missions: prev.missions.map((m) =>
            m.id === missionId
              ? {
                  ...m,
                  status: "won" as const,
                  outcome: "won" as const,
                  closedAt: now,
                  completedStages: [...new Set([...m.completedStages, m.currentStage, "activation"])] as StageId[],
                  nextStepLabel: care,
                  activation: { ...m.activation, activatedAt: now },
                }
              : m,
          ),
          tasks: prev.tasks.map((task) =>
            task.missionId === missionId && task.source === "next_step" && !task.doneAt
              ? { ...task, title: care }
              : task,
          ),
        }));
        return { ok: true };
      },
      invite,
      checkInvite: async (tokenOrLink) => {
        const token = parseInviteToken(tokenOrLink);
        if (!token) return { ok: false, error: "To nie wygląda na link ani kod zaproszenia." };
        rememberInvite(token);
        await inspectInvite(token);
        return { ok: true };
      },
      confirmInvite: async () => {
        const current = invite;
        if (!current?.info || current.info.status !== "ok") return { ok: false, error: "Brak ważnego zaproszenia." };
        const sb = getSupabase();
        const { data } = sb ? await sb.auth.getSession() : { data: { session: null } };
        const user = data.session?.user;
        if (!user) return { ok: false, error: "Najpierw się zaloguj." };
        setInvite({ ...current, busy: true, error: null });
        try {
          await scheduleFlush();
          await acceptInviteToken(current.token);
        } catch (err) {
          const error = errorText(err, "Nie udało się dołączyć do zespołu.");
          setInvite({ ...current, busy: false, error });
          return { ok: false, error };
        }
        clearPendingInvite();
        setInvite(null);
        await hydrateUser(
          user.id,
          user.email ?? "",
          typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : undefined,
          true,
        );
        setNotice({ kind: "ok", text: "Dołączyłeś do zespołu. Widzisz teraz wspólnych partnerów i misje." });
        return { ok: true };
      },
      dismissInvite: () => {
        clearPendingInvite();
        setInvite(null);
      },
      createInvite: async (email) => {
        try {
          const token = await createInviteRow(email);
          return { ok: true, token };
        } catch (err) {
          return { ok: false, error: errorText(err, "Nie udało się utworzyć zaproszenia.") };
        }
      },
      listInvites: async () => {
        try {
          return { ok: true, invites: await listInviteRows() };
        } catch (err) {
          return { ok: false, error: errorText(err, "Nie udało się wczytać zaproszeń.") };
        }
      },
      revokeInvite: (inviteId) => runRpc(() => revokeInviteRow(inviteId), "Nie udało się cofnąć zaproszenia."),
      removeMember: async (memberId) => {
        const result = await runRpc(() => removeMemberRow(memberId), "Nie udało się usunąć osoby.");
        if (result.ok) setState((prev) => ({ ...prev, team: prev.team.filter((m) => m.id !== memberId) }));
        return result;
      },
      renameWorkspace: async (name) => {
        const result = await runRpc(() => renameWorkspaceRow(name), "Nie udało się zmienić nazwy.");
        if (result.ok) setState((prev) => ({ ...prev, workspace: { ...prev.workspace, name: name.trim() } }));
        return result;
      },
    };
  }, [
    ready,
    state,
    dbStatus,
    dbError,
    saveState,
    authEmail,
    schemaV4,
    schemaV5,
    schemaV6,
    schemaV7,
    schemaV8,
    metricsMissing,
    drift,
    notice,
    invite,
    inspectInvite,
    hydrateUser,
    markSaved,
    refreshData,
    scheduleFlush,
  ]);

  // Akcje, które wołają inne akcje sklepu (np. zapis maila po spotkaniu), sięgają po bieżący sklep.
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreProvider missing");
  return ctx;
}
