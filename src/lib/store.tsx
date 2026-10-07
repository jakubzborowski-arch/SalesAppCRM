"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { activationBlockers, canEnterStage, contractBlockers, nextStage, offerBlockers } from "./gates";
import { categoryLabel, suggestVariant } from "./playbook";
import { emptyMission, seedState } from "./seed";
import {
  ensureWorkspace,
  insertPartner,
  isMissingPartnersTable,
  loadCrm,
  persistMission,
  persistPartner,
  deletePartner as deletePartnerRow,
  insertPartnerContact,
  saveManualTranscript,
  saveRecording,
  updateTranscriptText,
} from "./db";
import { fetchInfeldSuggest, type InfeldSuggestResult } from "./infeld-client";
import { buildSmokeInfeldQuery } from "./infeld-suggest";
import { SKILL_SMOKE_TRANSCRIPT, skillSmokeFullMission } from "./skill-smoke-test";
import {
  generatePartnerCode,
  insertTask,
  setTaskDone,
  uploadContractPdf,
} from "./mission-core";
import { getSupabase, isMissingCrmTable, isSupabaseConfigured } from "./supabase";
import type {
  AppState,
  Channel,
  Mission,
  Need,
  NewPartnerInput,
  OfferVariant,
  Partner,
  StageId,
  TaskItem,
} from "./types";

const STORAGE_KEY = "lutra-crm-v1";

export type DbStatus = "loading" | "need-login" | "need-sql" | "ok" | "error";

type Store = {
  ready: boolean;
  dbStatus: DbStatus;
  dbError: string | null;
  saveState: "idle" | "saving" | "saved" | "error";
  authEmail: string | null;
  state: AppState;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  retryCloud: () => Promise<void>;
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
  applySkillSmokeTest: (
    missionId: string,
    partnerId: string,
  ) => Promise<{ ok: boolean; error?: string; infeld?: InfeldSuggestResult }>;
  partnerById: (id: string) => Partner | undefined;
  missionByPartner: (partnerId: string) => Mission | undefined;
  urgentMission: () => { partner: Partner; mission: Mission } | undefined;
  startMission: (partnerId: string) => string | null;
  goToStage: (missionId: string, stage: StageId) => { ok: boolean; reason?: string };
  advance: (missionId: string) => { ok: boolean; reason?: string };
  toggleChecklist: (missionId: string, key: string) => void;
  updatePartner: (partnerId: string, patch: Partial<Partner>) => void;
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
  selectVariant: (missionId: string, variant: OfferVariant) => void;
  approveOffer: (missionId: string) => { ok: boolean; reason?: string };
  markOfferSent: (missionId: string) => { ok: boolean; reason?: string };
  toggleObjection: (missionId: string, key: string, field: "checked" | "argumentWorked") => void;
  updateContract: (missionId: string, patch: Partial<Mission["contract"]>) => void;
  uploadContract: (missionId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  updateActivation: (missionId: string, patch: Partial<Mission["activation"]>) => void;
  assignPartnerCode: (missionId: string) => string | null;
  addTask: (input: { missionId: string; title: string; dueAt: string }) => Promise<{ ok: boolean; error?: string }>;
  completeTask: (taskId: string, done: boolean) => void;
  completeActivation: (missionId: string) => { ok: boolean; reason?: string };
};

const StoreContext = createContext<Store | null>(null);

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

function withRecommended(mission: Mission): Mission {
  const cats = mission.needs
    .filter((n) => n.confirmed && n.status === "fact")
    .map((n) => n.category);
  return { ...mission, recommendedVariant: suggestVariant(cats) };
}

function readLocal(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState;
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...seedState,
      ...parsed,
      partners: (parsed.partners ?? []).map((p) => ({
        ...p,
        website: p.website ?? "",
        instagram: p.instagram ?? "",
        facebook: p.facebook ?? "",
        socialOther: p.socialOther ?? "",
        priority: p.priority ?? "",
        priorityReason: p.priorityReason ?? "",
      })),
      missions: (parsed.missions ?? []).map((m) => {
        const base = emptyMission(m.partnerId, m.id);
        return {
          ...base,
          ...m,
          contract: { ...base.contract, ...(m.contract ?? {}) },
          activation: { ...base.activation, ...(m.activation ?? {}) },
        };
      }),
    };
  } catch {
    return seedState;
  }
}

function initialsFrom(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(seedState);
  const [ready, setReady] = useState(false);
  const [dbStatus, setDbStatus] = useState<DbStatus>("loading");
  const [dbError, setDbError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const workspaceIdRef = useRef<string | null>(null);
  const persistOk = useRef(false);

  const persistMissions = async (missions: Mission[]) => {
    const workspaceId = workspaceIdRef.current;
    const userId = userIdRef.current;
    if (!workspaceId || !userId) return;
    setSaveState("saving");
    try {
      const related = new Set(missions.map((m) => m.partnerId));
      for (const partner of state.partners) {
        if (!related.has(partner.id)) continue;
        try {
          await persistPartner(partner);
        } catch {
          /* kontakt dociągniemy przy następnym zapisie — misji nie blokujemy */
        }
      }
      for (const mission of missions) {
        await persistMission(mission, workspaceId, userId);
      }
      persistOk.current = true;
      setDbStatus("ok");
      setDbError(null);
      setSaveState("saved");
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (isMissingPartnersTable(error)) setDbStatus("need-sql");
      else setDbError(error.message ?? "Nie udało się zapisać misji.");
      setSaveState("error");
    }
  };

  const hydrateUser = async (userId: string, email: string, fullName?: string) => {
    userIdRef.current = userId;
    setAuthEmail(email);
    try {
      const ctx = await ensureWorkspace();
      workspaceIdRef.current = ctx.workspaceId;
      const { partners, missions, tasks } = await loadCrm(ctx.workspaceId);
      setState({
        user: {
          name: fullName || ctx.fullName,
          initials: initialsFrom(fullName || ctx.fullName, email),
          role: "Handlowiec",
        },
        workspace: { name: ctx.workspaceName, id: ctx.workspaceId },
        partners,
        missions,
        tasks,
      });
      persistOk.current = true;
      setDbStatus("ok");
      setDbError(null);
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (isMissingPartnersTable(error)) {
        setState({
          ...readLocal(),
          user: {
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
    }
    setReady(true);
  };

  useEffect(() => {
    const sb = getSupabase();
    if (!isSupabaseConfigured() || !sb) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        persistOk.current = false;
        setAuthEmail(null);
        setDbStatus("need-login");
        return;
      }
      void hydrateUser(
        session.user.id,
        session.user.email ?? "",
        typeof session.user.user_metadata?.full_name === "string"
          ? session.user.user_metadata.full_name
          : undefined,
      );
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  useEffect(() => {
    if (!ready || dbStatus !== "ok" || !userIdRef.current || !workspaceIdRef.current) return;
    const handle = window.setTimeout(() => {
      void persistMissions(state.missions);
    }, 500);
    return () => window.clearTimeout(handle);
  }, [ready, state.missions, dbStatus]);

  const patchMission = (missionId: string, fn: (m: Mission) => Mission) => {
    setState((prev) => {
      let changed = false;
      const missions = prev.missions.map((m) => {
        if (m.id !== missionId) return m;
        const next = fn(m);
        if (next === m) return m;
        changed = true;
        return next;
      });
      return changed ? { ...prev, missions } : prev;
    });
  };

  const store = useMemo<Store>(() => {
    const partnerById = (id: string) => state.partners.find((p) => p.id === id);
    const missionByPartner = (partnerId: string) =>
      state.missions.find((m) => m.partnerId === partnerId && m.status === "active");

    return {
      ready,
      dbStatus,
      dbError,
      saveState,
      authEmail,
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
          options: { data: { full_name: name } },
        });
        if (error) return { ok: false, error: error.message };
        if (!data.session) {
          return {
            ok: false,
            error:
              "Konto utworzone, ale wymaga potwierdzenia e-maila. W Supabase: Authentication → Providers → wyłącz Confirm email.",
          };
        }
        return { ok: true };
      },
      signOut: async () => {
        await getSupabase()?.auth.signOut();
        userIdRef.current = null;
        workspaceIdRef.current = null;
        persistOk.current = false;
        setAuthEmail(null);
        setDbStatus("need-login");
      },
      retryCloud: async () => {
        const sb = getSupabase();
        if (!sb) return;
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
        );
      },
      reset: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        setState((prev) => ({ ...prev, partners: [], missions: [], tasks: [] }));
      },
      addPartner: async (input) => {
        const workspaceId = workspaceIdRef.current;
        const userId = userIdRef.current;
        if (!workspaceId || !userId) return { ok: false, error: "Brak workspace. Odpal SQL v2." };
        try {
          const partner = await insertPartner(workspaceId, userId, input);
          setState((prev) => ({ ...prev, partners: [...prev.partners, partner] }));
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
        const failed: { name: string; error: string }[] = [];
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i];
          try {
            created.push(await insertPartner(workspaceId, userId, input));
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
          patchMission(missionId, (m) => ({
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
            call = await saveManualTranscript({
              missionId,
              channel: "phone",
              text: SKILL_SMOKE_TRANSCRIPT,
              note: "Smoke test skilla — przykładowa rozmowa discovery",
            });
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
          setState((prev) => {
            const partners = prev.partners.map((p) => (p.id === partnerId ? partnerWithConsent : p));
            void persistPartner(partnerWithConsent);
            return { ...prev, partners };
          });
          const infeld = await fetchInfeldSuggest(
            partnerWithConsent,
            nextMission,
            buildSmokeInfeldQuery(partnerWithConsent, nextMission),
          );
          return { ok: true, infeld };
        } catch (err) {
          const error = err as { message?: string };
          return { ok: false, error: error.message ?? "Nie udało się wczytać przykładu skilla." };
        }
      },
      saveTranscript: async (conversationId, text) => {
        try {
          await updateTranscriptText(conversationId, text);
          setState((prev) => ({
            ...prev,
            missions: prev.missions.map((m) => ({
              ...m,
              calls: (m.calls ?? []).map((call) =>
                call.id === conversationId
                  ? { ...call, transcriptText: text, transcriptStatus: "ready" as const }
                  : call,
              ),
            })),
          }));
          return { ok: true };
        } catch (err) {
          const error = err as { message?: string };
          return { ok: false, error: error.message ?? "Nie udało się zapisać transkryptu." };
        }
      },
      partnerById,
      missionByPartner,
      urgentMission: () => {
        const mission = [...state.missions]
          .filter((m) => m.status === "active")
          .sort((a, b) => a.nextStepAt.localeCompare(b.nextStepAt))[0];
        if (!mission) return undefined;
        const partner = partnerById(mission.partnerId);
        if (!partner) return undefined;
        return { partner, mission };
      },
      startMission: (partnerId) => {
        const partner = partnerById(partnerId);
        if (!partner) return null;
        if (partner.dnc) return null;
        const existing = missionByPartner(partnerId);
        if (existing) return existing.id;
        const mission = emptyMission(partnerId, crypto.randomUUID());
        const followUp: TaskItem = {
          id: crypto.randomUUID(),
          missionId: mission.id,
          title: mission.nextStepLabel,
          dueAt: mission.nextStepAt,
          source: "next_step",
        };
        setState((prev) => ({
          ...prev,
          missions: [mission, ...prev.missions],
          tasks: [followUp, ...prev.tasks],
        }));
        const workspaceId = workspaceIdRef.current;
        const userId = userIdRef.current;
        if (workspaceId && userId) void persistMission(mission, workspaceId, userId);
        return mission.id;
      },
      goToStage: (missionId, stage) => {
        const mission = state.missions.find((m) => m.id === missionId);
        const partner = mission ? partnerById(mission.partnerId) : undefined;
        if (!mission || !partner) return { ok: false, reason: "Brak misji." };
        const gate = canEnterStage(stage, mission, partner);
        if (!gate.ok) return gate;
        patchMission(missionId, (m) => ({ ...m, currentStage: stage }));
        return { ok: true };
      },
      advance: (missionId) => {
        const mission = state.missions.find((m) => m.id === missionId);
        const partner = mission ? partnerById(mission.partnerId) : undefined;
        if (!mission || !partner) return { ok: false, reason: "Brak misji." };
        const nxt = nextStage(mission.currentStage);
        if (!nxt) {
          patchMission(missionId, (m) => ({
            ...m,
            status: "won",
            outcome: "won",
            nextStepLabel: "Opieka: check-in 30 dni",
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
      toggleChecklist: (missionId, key) => {
        patchMission(missionId, (m) => ({
          ...m,
          checklist: { ...m.checklist, [key]: !m.checklist[key] },
        }));
      },
      updatePartner: (partnerId, patch) => {
        setState((prev) => {
          const partners = prev.partners.map((p) => (p.id === partnerId ? { ...p, ...patch } : p));
          const next = partners.find((p) => p.id === partnerId);
          if (next) void persistPartner(next);
          return { ...prev, partners };
        });
      },
      addPartnerContact: async (partnerId, input) => {
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
        setState((prev) => {
          const partners = prev.partners.map((p) => {
            if (p.id !== partnerId) return p;
            const exists = p.consents.some((c) => c.channel === channel && c.purpose === "contact");
            const consents = exists
              ? p.consents.map((c) =>
                  c.channel === channel && c.purpose === "contact" ? { ...c, status } : c,
                )
              : [...p.consents, { channel, purpose: "contact" as const, status }];
            return { ...p, consents };
          });
          const next = partners.find((p) => p.id === partnerId);
          if (next) void persistPartner(next);
          return { ...prev, partners };
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
          return withRecommended({ ...m, needs });
        });
      },
      upsertNeed: (missionId, need) => {
        patchMission(missionId, (m) =>
          withRecommended({
            ...m,
            needs: m.needs.some((n) => n.id === need.id)
              ? m.needs.map((n) => (n.id === need.id ? need : n))
              : [...m.needs, need],
          }),
        );
      },
      removeNeed: (missionId, needId) => {
        patchMission(missionId, (m) =>
          withRecommended({
            ...m,
            needs: m.needs.filter((n) => n.id !== needId),
          }),
        );
      },
      confirmNeed: (missionId, needId, confirmed) => {
        patchMission(missionId, (m) =>
          withRecommended({
            ...m,
            needs: m.needs.map((n) =>
              n.id === needId
                ? { ...n, confirmed, status: confirmed ? "fact" : n.status }
                : n,
            ),
          }),
        );
      },
      updateDecision: (missionId, patch) => {
        patchMission(missionId, (m) => ({ ...m, decision: { ...m.decision, ...patch } }));
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
          if (patch.signedByHuman === true && !m.contract.documentPath && !patch.documentPath) {
            return m;
          }
          const contract = { ...m.contract, ...patch };
          if (patch.signedByHuman === true) {
            contract.signedAt = new Date().toISOString();
            contract.status = "signed";
          }
          if (patch.signedByHuman === false) {
            contract.signedAt = undefined;
            contract.status = contract.documentPath ? "ready" : "draft";
          }
          return { ...m, contract };
        });
      },
      uploadContract: async (missionId, file) => {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) return { ok: false, error: "Tylko plik PDF." };
        const userId = userIdRef.current;
        try {
          const path = userId
            ? await uploadContractPdf(userId, missionId, file)
            : `local/${missionId}.pdf`;
          patchMission(missionId, (m) => ({
            ...m,
            contract: {
              ...m.contract,
              documentPath: path,
              status: m.contract.signedByHuman ? "signed" : "ready",
            },
          }));
          return { ok: true };
        } catch (err) {
          const error = err as { message?: string };
          return { ok: false, error: error.message ?? "Nie udało się wgrać PDF. Odpal SQL v3 (bucket contracts)." };
        }
      },
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
        const contractMissing = contractBlockers(mission);
        if (contractMissing.length) {
          return { ok: false, reason: `Umowa: ${contractMissing.join(", ")}.` };
        }
        const missing = activationBlockers(mission);
        if (missing.length) return { ok: false, reason: `Brakuje: ${missing.join(", ")}.` };
        const care = "Opieka: check-in i kwartalne potwierdzenie warunków";
        const now = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          missions: prev.missions.map((m) =>
            m.id === missionId
              ? {
                  ...m,
                  status: "won" as const,
                  outcome: "won" as const,
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
    };
  }, [ready, state, dbStatus, dbError, saveState, authEmail]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreProvider missing");
  return ctx;
}
