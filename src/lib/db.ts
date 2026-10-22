import { isValidNip, normalizeNip } from "./company";
import { loadMissionCore, syncMissionCore } from "./mission-core";
import { mergeCare, mergeTerms } from "./terms";
import { nextPriorityForDb, normalizePartnerPriority, priorityForDb } from "./partner-priority";
import { OBJECTION_KEYS } from "./playbook";
import { fetchAll, groupBy, selectIn } from "./fetch-all";
import { emptyMission } from "./seed";
import { dateOrNull, uuidOrNull } from "./sql-coerce";
import { getSupabase, isMissingCrmTable } from "./supabase";
import type {
  Activity,
  ActivityDirection,
  ActivityOutcome,
  CallRecord,
  Channel,
  ConsentStatus,
  Mission,
  MissionEvent,
  NewActivityInput,
  NewPartnerInput,
  Partner,
  PartnerContact,
  StageId,
  InvitePeek,
  TaskItem,
  TeamInvite,
  TeamMember,
} from "./types";

export type WorkspaceContext = {
  workspaceId: string;
  workspaceName: string;
  fullName: string;
  /** Szablon umowy zespołu (migracja v6). `null` = szablon domyślny. */
  contractTemplate: string | null;
  /** Szablon porozumienia mailowego (migracja v7). `null` = domyślny. */
  agreementTemplate: string | null;
};

type MissionDetails = {
  completedStages?: StageId[];
  checklist?: Mission["checklist"];
  selectedChannel?: Channel | null;
  conversationNote?: string;
  recordingConsent?: Mission["recordingConsent"];
  disclosureShown?: boolean;
  discovery?: Mission["discovery"];
  needs?: Mission["needs"];
  decision?: Mission["decision"];
  recommendedVariant?: Mission["recommendedVariant"];
  selectedVariant?: Mission["selectedVariant"];
  offerApproved?: boolean;
  offerSentAt?: string;
  objections?: Mission["objections"];
  contract?: Mission["contract"];
  activation?: Mission["activation"];
  closeNote?: string;
  terms?: Partial<Mission["terms"]>;
  agreementForm?: Mission["agreementForm"];
  care?: Partial<Mission["care"]>;
};

function uiDetailsOf(mission: Mission): MissionDetails {
  return {
    completedStages: mission.completedStages,
    selectedChannel: mission.selectedChannel,
    conversationNote: mission.conversationNote,
    recordingConsent: mission.recordingConsent,
    disclosureShown: mission.disclosureShown,
    discovery: mission.discovery,
    recommendedVariant: mission.recommendedVariant,
    closeNote: mission.closeNote,
    terms: mission.terms,
    agreementForm: mission.agreementForm,
    care: mission.care,
  };
}

function detailsOf(mission: Mission): MissionDetails {
  return {
    ...uiDetailsOf(mission),
    checklist: mission.checklist,
    needs: mission.needs,
    decision: mission.decision,
    selectedVariant: mission.selectedVariant,
    offerApproved: mission.offerApproved,
    offerSentAt: mission.offerSentAt,
    objections: mission.objections,
    contract: mission.contract,
    activation: mission.activation,
  };
}

function missionFromRow(
  row: {
    id: string;
    partner_id: string;
    owner_user_id?: string | null;
    status: Mission["status"];
    current_stage: StageId;
    next_step_label: string | null;
    next_step_at: string | null;
    outcome: Mission["outcome"];
    loss_reason: string | null;
    details: MissionDetails | null;
    started_at?: string | null;
    closed_at?: string | null;
  },
  calls: CallRecord[],
  activities: Activity[],
  events: MissionEvent[],
): Mission {
  const base = emptyMission(row.partner_id, row.id);
  const d = row.details ?? {};
  return {
    ...base,
    ...d,
    id: row.id,
    partnerId: row.partner_id,
    ownerUserId: row.owner_user_id ?? undefined,
    startedAt: row.started_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
    closeNote: d.closeNote ?? "",
    activities,
    events,
    status: row.status,
    currentStage: row.current_stage,
    nextStepLabel: row.next_step_label ?? base.nextStepLabel,
    nextStepAt: row.next_step_at ?? base.nextStepAt,
    outcome: row.outcome,
    lossReason: row.loss_reason ?? "",
    contract: { ...base.contract, ...(d.contract ?? {}) },
    activation: { ...base.activation, ...(d.activation ?? {}) },
    terms: mergeTerms(d.terms),
    agreementForm: d.agreementForm ?? null,
    care: mergeCare(d.care),
    objections: d.objections?.length
      ? d.objections
      : OBJECTION_KEYS.map((item) => ({
          key: item.key,
          checked: false,
          argumentWorked: false,
        })),
    calls,
  };
}

function mapPartner(
  row: {
    id: string;
    name: string;
    segment: Partner["segment"];
    city: string | null;
    address: string | null;
    category: string | null;
    subcategory: string | null;
    website?: string | null;
    instagram?: string | null;
    facebook?: string | null;
    social_other?: string | null;
    priority?: string | null;
    priority_reason?: string | null;
    source: string | null;
    dnc_status: string;
    hours: string | null;
    notes: string | null;
    owner_user_id?: string | null;
    capacity?: number | null;
    legal_name?: string | null;
    nip?: string | null;
    regon?: string | null;
    legal_address?: string | null;
    mailing_address?: string | null;
    billing_email?: string | null;
  },
  contacts: PartnerContact[],
  consents: Partner["consents"],
): Partner {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id ?? undefined,
    name: row.name,
    segment: row.segment === "company" || row.segment === "community" ? row.segment : "venue",
    capacity: typeof row.capacity === "number" && row.capacity > 0 ? row.capacity : null,
    city: row.city ?? "",
    address: row.address ?? "",
    category: row.category ?? "",
    subcategory: row.subcategory ?? "",
    website: row.website ?? "",
    instagram: row.instagram ?? "",
    facebook: row.facebook ?? "",
    socialOther: row.social_other ?? "",
    priority: normalizePartnerPriority(row.priority ?? "") || row.priority || "",
    priorityReason: row.priority_reason ?? "",
    source: row.source ?? "",
    dnc: row.dnc_status === "do_not_contact",
    hours: row.hours ?? undefined,
    notes: row.notes ?? undefined,
    company: {
      legalName: row.legal_name ?? "",
      nip: row.nip ?? "",
      regon: row.regon ?? "",
      legalAddress: row.legal_address ?? "",
      mailingAddress: row.mailing_address ?? "",
      billingEmail: row.billing_email ?? "",
    },
    contacts,
    consents,
  };
}

export async function ensureWorkspace(): Promise<WorkspaceContext> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { data: wsId, error } = await sb.rpc("ensure_workspace");
  if (error) throw error;
  const workspaceId = wsId as string;
  const { data: workspace } = await sb.from("workspaces").select("*").eq("id", workspaceId).maybeSingle();
  const { data: userData } = await sb.auth.getUser();
  const { data: profile } = await sb
    .from("profiles")
    .select("full_name")
    .eq("id", userData.user?.id)
    .maybeSingle();
  return {
    workspaceId,
    workspaceName: workspace?.name ?? "Lutra",
    fullName: profile?.full_name ?? "Handlowiec",
    contractTemplate: (workspace?.contract_template as string | null | undefined) ?? null,
    agreementTemplate: (workspace?.agreement_template as string | null | undefined) ?? null,
  };
}

function contactFromRow(c: Record<string, unknown>): PartnerContact {
  return {
    id: c.id as string,
    name: String(c.name ?? c.contact_person ?? "").trim(),
    role: (c.role as string) ?? "",
    isDecisionMaker: Boolean(c.is_decision_maker),
    phone: (c.phone as string) ?? undefined,
    email: (c.email as string) ?? undefined,
    linkedin: (c.linkedin as string) ?? undefined,
  };
}

function partnerFromRows(
  row: Record<string, unknown>,
  contactRows: Record<string, unknown>[],
  consentRows: Record<string, unknown>[],
) {
  return mapPartner(
    row as Parameters<typeof mapPartner>[0],
    contactRows.map(contactFromRow),
    consentRows.map((c) => ({
      channel: c.channel as Channel,
      purpose: c.purpose as Partner["consents"][number]["purpose"],
      status: c.status as ConsentStatus,
    })),
  );
}

/** Świeża wersja jednego partnera z bazy (np. po konflikcie zapisu kontaktu). */
export async function loadPartner(partnerId: string): Promise<Partner | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: row, error } = await sb.from("partners").select("*").eq("id", partnerId).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const [{ data: contacts }, { data: consents }] = await Promise.all([
    sb.from("partner_contacts").select("*").eq("partner_id", partnerId),
    sb.from("consents").select("*").eq("partner_id", partnerId),
  ]);
  return partnerFromRows(row, contacts ?? [], consents ?? []);
}

export async function loadCrm(workspaceId: string): Promise<{
  partners: Partner[];
  missions: Mission[];
  tasks: import("./types").TaskItem[];
  /** Wersje misji z bazy (`updated_at`). Ustawia je ten, kto podmienia misje w widoku. */
  versions: Map<string, string>;
}> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");

  const { data: partnerRows, error: partnerError } = await fetchAll((from, to) =>
    sb
      .from("partners")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (partnerError) throw partnerError;

  const partnerIds = partnerRows.map((p) => p.id as string);
  const { data: contactRows } = await selectIn(sb, "partner_contacts", "partner_id", partnerIds);
  const { data: consentRows } = await selectIn(sb, "consents", "partner_id", partnerIds);
  const contactsByPartner = groupBy(contactRows, "partner_id");
  const consentsByPartner = groupBy(consentRows, "partner_id");

  const partners = partnerRows.map((row) =>
    partnerFromRows(row, contactsByPartner.get(row.id as string) ?? [], consentsByPartner.get(row.id as string) ?? []),
  );

  const { data: missionRows, error: missionError } = await fetchAll((from, to) =>
    sb
      .from("missions")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("started_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (missionError) throw missionError;
  const versions = new Map<string, string>();
  for (const row of missionRows) {
    if (row.updated_at) versions.set(row.id as string, String(row.updated_at));
  }

  const missionIds = missionRows.map((m) => m.id as string);
  const callsByMission = new Map<string, CallRecord[]>();
  const activitiesByMission = new Map<string, Activity[]>();
  const eventsByMission = new Map<string, MissionEvent[]>();
  if (missionIds.length) {
    const { data: convos } = await selectIn(sb, "conversations", "mission_id", missionIds);
    const convoIds = convos.map((c) => c.id as string);
    const { data: recs } = await selectIn(sb, "recordings", "conversation_id", convoIds);
    const { data: trs } = await selectIn(sb, "transcripts", "conversation_id", convoIds);
    const recByConvo = new Map(recs.map((r) => [r.conversation_id as string, r]));
    const trByConvo = new Map(trs.map((t) => [t.conversation_id as string, t]));

    for (const convo of convos) {
      const rec = recByConvo.get(convo.id as string);
      const tr = trByConvo.get(convo.id as string);
      const call: CallRecord = {
        id: convo.id as string,
        channel: convo.channel as Channel,
        recordingConsent: convo.recording_consent as CallRecord["recordingConsent"],
        storagePath: rec?.storage_path as string | undefined,
        durationSec: rec?.duration_sec as number | undefined,
        transcriptStatus:
          tr?.status === "ready"
            ? "ready"
            : tr?.status === "failed"
              ? "failed"
              : tr
                ? "processing"
                : "idle",
        transcriptText: tr?.status === "ready" ? ((tr.full_text as string) ?? undefined) : undefined,
        error: tr?.status === "failed" ? ((tr.full_text as string) ?? undefined) : undefined,
        createdAt: convo.started_at as string,
      };
      const list = callsByMission.get(convo.mission_id as string) ?? [];
      list.push(call);
      callsByMission.set(convo.mission_id as string, list);

      const activity = activityFromRow(convo, {
        hasRecording: Boolean(rec),
        hasTranscript: Boolean(tr?.status === "ready" && String(tr.full_text ?? "").trim()),
      });
      const acts = activitiesByMission.get(activity.missionId) ?? [];
      acts.push(activity);
      activitiesByMission.set(activity.missionId, acts);
    }
    for (const list of callsByMission.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const list of activitiesByMission.values()) list.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    const { data: eventRows, error: eventsError } = await selectIn(sb, "mission_events", "mission_id", missionIds);
    if (!eventsError) {
      for (const row of eventRows) {
        const event = eventFromRow(row);
        const list = eventsByMission.get(event.missionId) ?? [];
        list.push(event);
        eventsByMission.set(event.missionId, list);
      }
      for (const list of eventsByMission.values()) list.sort((a, b) => a.at.localeCompare(b.at));
    }
  }

  const missions = missionRows.map((row) =>
    missionFromRow(
      row as Parameters<typeof missionFromRow>[0],
      callsByMission.get(row.id as string) ?? [],
      activitiesByMission.get(row.id as string) ?? [],
      eventsByMission.get(row.id as string) ?? [],
    ),
  );

  const { byMission, tasks } = await loadMissionCore(missionIds);
  const merged = missions.map((mission) => {
    const core = byMission.get(mission.id);
    if (!core) return mission;
    return {
      ...mission,
      needs: core.needs?.length ? core.needs : mission.needs,
      // Wiersz z tabel misji wygrywa pole po polu. Puste pole w wierszu nie kasuje danych ze starszego
      // zapisu w `details`. Wcześniej cały wiersz liczył się tylko z nazwą firmy, NIP-em albo PDF-em,
      // więc okres ustalony w ofercie (bez danych firmy) znikał po odświeżeniu.
      decision: core.decision ? preferFilled(mission.decision, core.decision) : mission.decision,
      checklist: { ...mission.checklist, ...core.checklist },
      objections: core.objections?.length
        ? mission.objections.map((item) => core.objections?.find((o) => o.key === item.key) ?? item)
        : mission.objections,
      selectedVariant: core.selectedVariant ?? mission.selectedVariant,
      offerApproved: core.offerApproved ?? mission.offerApproved,
      offerSentAt: core.offerSentAt ?? mission.offerSentAt,
      contract: core.contract ? preferFilled(mission.contract, core.contract) : mission.contract,
      activation: core.activation ? preferFilled(mission.activation, core.activation) : mission.activation,
    };
  });

  return { partners, missions: merged, tasks, versions };
}

/** Pola z `core`, które mają wartość (niepusty tekst, `true`, liczba), nadpisują `base`. */
export function preferFilled<T extends object>(base: T, core: Partial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(core)) {
    if (value === undefined || value === null || value === false) continue;
    if (typeof value === "string" && !value.trim()) continue;
    out[key] = value;
  }
  return out as T;
}

export async function insertPartner(
  workspaceId: string,
  userId: string,
  input: NewPartnerInput,
): Promise<Partner> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");

  const extraNote = [
    input.subcategory.trim() && `Subkategoria: ${input.subcategory.trim()}`,
    input.priority.trim() && `Priorytet: ${input.priority.trim()}`,
    input.priorityReason.trim() && `Uzasadnienie: ${input.priorityReason.trim()}`,
    input.website.trim() && `www: ${input.website.trim()}`,
    input.instagram.trim() && `Instagram: ${input.instagram.trim()}`,
    input.facebook.trim() && `Facebook: ${input.facebook.trim()}`,
    input.socialOther.trim() && `Inne social: ${input.socialOther.trim()}`,
    input.legalName?.trim() && `Firma: ${input.legalName.trim()}`,
    input.nip?.trim() && `NIP: ${input.nip.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const payload: Record<string, unknown> = {
    workspace_id: workspaceId,
    owner_user_id: userId,
    name: input.name.trim(),
    segment: "venue",
    city: input.city.trim(),
    address: input.address.trim(),
    category: input.category.trim(),
    subcategory: input.subcategory.trim() || null,
    website: input.website.trim() || null,
    instagram: input.instagram.trim() || null,
    facebook: input.facebook.trim() || null,
    social_other: input.socialOther.trim() || null,
    priority: priorityForDb(input.priority) || undefined,
    priority_reason: input.priorityReason.trim() || null,
    source: input.source.trim() || "ręczne dodanie",
    hours: input.hours.trim() || null,
    notes: input.notes.trim() || null,
    dnc_status: "ok",
  };
  if (!payload.priority) delete payload.priority;
  if (input.segment === "company" || input.segment === "community") payload.segment = input.segment;
  if (input.capacity && input.capacity > 0) payload.capacity = Math.round(input.capacity);
  if (input.legalName?.trim()) payload.legal_name = input.legalName.trim();
  if (input.nip && isValidNip(input.nip)) payload.nip = normalizeNip(input.nip);
  else if (input.nip?.trim()) {
    // Błędny NIP z importu nie blokuje zapisu partnera — ląduje w notatce do sprawdzenia.
    payload.notes = [payload.notes, `NIP do sprawdzenia: ${input.nip.trim()}`].filter(Boolean).join("\n");
  }

  let partner: Parameters<typeof mapPartner>[0] | null = null;
  let lastError: { message?: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, error } = await sb.from("partners").insert(payload).select("*").single();
    if (!error && data) {
      partner = data;
      break;
    }
    lastError = error;
    const message = `${error?.message ?? ""} ${error?.code ?? ""}`;
    const rejectedPriority = message.match(/invalid input value for enum partner_priority: "([^"]*)"/i)?.[1];
    if (rejectedPriority != null) {
      const next = nextPriorityForDb(input.priority, rejectedPriority);
      if (next) {
        payload.priority = next;
        continue;
      }
      delete payload.priority;
      continue;
    }
    const notNullCol = message.match(/null value in column "([^"]+)"/i)?.[1];
    if (notNullCol && notNullCol in payload) {
      payload[notNullCol] = "";
      continue;
    }
    const missing =
      message.match(/Could not find the '([a-z_]+)' column/i)?.[1] ??
      message.match(/column (?:public\.)?partners\.([a-z_]+) does not exist/i)?.[1] ??
      message.match(/column "([a-z_]+)" does not exist/i)?.[1];
    if (missing && missing in payload) {
      delete payload[missing];
      if (
        ["subcategory", "website", "instagram", "facebook", "social_other", "priority", "priority_reason", "legal_name", "nip"].includes(
          missing,
        ) &&
        extraNote
      ) {
        payload.notes = [input.notes.trim(), extraNote].filter(Boolean).join("\n") || null;
      }
      continue;
    }
    break;
  }
  if (!partner) {
    throw new Error(lastError?.message ?? "Nie udało się zapisać partnera.");
  }

  let contacts: PartnerContact[] = [];
  if (input.contactName.trim()) {
    const contact = await insertPartnerContact(partner.id, {
      name: input.contactName.trim(),
      role: input.contactRole.trim() || "kontakt",
      isDecisionMaker: true,
      phone: input.contactPhone.trim() || undefined,
      email: input.contactEmail.trim() || undefined,
    });
    contacts = [contact];
  }

  const consentRows = [
    { channel: "phone" as Channel, status: input.phoneConsent },
    { channel: "email" as Channel, status: input.emailConsent },
  ];
  await sb.from("consents").insert(
    consentRows.map((c) => ({
      partner_id: partner.id,
      channel: c.channel,
      purpose: "contact",
      status: c.status,
      granted_at: c.status === "granted" ? new Date().toISOString() : null,
    })),
  );

  return mapPartner(
    partner,
    contacts,
    consentRows.map((c) => ({ channel: c.channel, purpose: "contact" as const, status: c.status })),
  );
}

function contactWritePayload(partnerId: string, contact: PartnerContact) {
  const name = contact.name.trim();
  return {
    id: contact.id,
    partner_id: partnerId,
    name,
    contact_person: name,
    role: contact.role || null,
    is_decision_maker: contact.isDecisionMaker,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    linkedin: contact.linkedin ?? null,
  } satisfies Record<string, unknown>;
}

const blank = (value: unknown) => (value == null ? "" : String(value).trim());

/** Czy wiersz w bazie to dalej ta wersja kontaktu, którą znamy (nikt jej w międzyczasie nie zmienił). */
function contactRowMatches(row: Record<string, unknown>, known: PartnerContact) {
  const current = contactFromRow(row);
  return (
    blank(current.name) === blank(known.name) &&
    blank(current.role) === blank(known.role) &&
    blank(current.phone) === blank(known.phone) &&
    blank(current.email) === blank(known.email) &&
    ("linkedin" in row ? blank(current.linkedin) === blank(known.linkedin) : true) &&
    current.isDecisionMaker === known.isDecisionMaker
  );
}

function adaptContactPayload(payload: Record<string, unknown>, message: string) {
  const missing =
    message.match(/Could not find the '([a-z_]+)' column/i)?.[1] ??
    message.match(/column "([a-z_]+)" of relation/i)?.[1];
  if (missing && missing in payload) {
    delete payload[missing];
    return true;
  }
  const required = message.match(/null value in column "([^"]+)"/i)?.[1];
  if (required === "contact_person" && payload.name) {
    payload.contact_person = payload.name;
    return true;
  }
  if (required === "name" && payload.contact_person) {
    payload.name = payload.contact_person;
    return true;
  }
  return false;
}

export async function insertPartnerContact(
  partnerId: string,
  input: { name: string; role?: string; isDecisionMaker?: boolean; phone?: string; email?: string },
): Promise<PartnerContact> {
  const contact: PartnerContact = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    role: input.role?.trim() || "osoba kontaktowa",
    isDecisionMaker: Boolean(input.isDecisionMaker),
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
  };
  const sb = getSupabase();
  if (sb) {
    const payload: Record<string, unknown> = contactWritePayload(partnerId, contact);
    let lastError: { message?: string } | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data, error } = await sb.from("partner_contacts").insert(payload).select("id").single();
      if (!error && data) {
        contact.id = data.id as string;
        lastError = null;
        break;
      }
      lastError = error;
      if (adaptContactPayload(payload, `${error?.message ?? ""}`)) continue;
      break;
    }
    if (lastError) throw lastError;
  }
  return contact;
}

async function upsertPartnerContactRow(partnerId: string, contact: PartnerContact) {
  const sb = getSupabase();
  const id = uuidOrNull(contact.id);
  if (!sb || !id || !contact.name.trim()) return;
  const payload: Record<string, unknown> = contactWritePayload(partnerId, { ...contact, id });
  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await sb.from("partner_contacts").upsert(payload);
    if (!error) return;
    if (adaptContactPayload(payload, `${error.message ?? ""}`)) continue;
    throw error;
  }
}

function partnerColumns(partner: Partner): Record<string, unknown> {
  const c = partner.company;
  return {
    name: partner.name,
    city: partner.city,
    address: partner.address,
    category: partner.category,
    subcategory: partner.subcategory || null,
    website: partner.website || null,
    instagram: partner.instagram || null,
    facebook: partner.facebook || null,
    social_other: partner.socialOther || null,
    priority: priorityForDb(partner.priority) || partner.priority || null,
    priority_reason: partner.priorityReason || null,
    source: partner.source,
    hours: partner.hours ?? null,
    notes: partner.notes ?? null,
    dnc_status: partner.dnc ? "do_not_contact" : "ok",
    legal_name: c.legalName || null,
    nip: normalizeNip(c.nip) || null,
    regon: c.regon.replace(/\D/g, "") || null,
    legal_address: c.legalAddress || null,
    mailing_address: c.mailingAddress || null,
    billing_email: c.billingEmail || null,
    segment: partner.segment,
    capacity: partner.capacity && partner.capacity > 0 ? Math.round(partner.capacity) : null,
  };
}

const COMPANY_COLUMNS = ["legal_name", "nip", "regon", "legal_address", "mailing_address", "billing_email"];
/** Kolumny z migracji v7 (typ partnera i pojemność). */
const V7_PARTNER_COLUMNS = ["segment", "capacity"];

/** Zabrakło kolumn typu partnera / pojemności — trzeba uruchomić migrację v7. */
export const V7_MISSING = "Baza nie ma jeszcze pól typu partnera i pojemności. Uruchom migrację v7 z paska u góry strony.";

/** Zabrakło kolumn danych firmy — trzeba uruchomić migrację v5. */
export const V5_MISSING = "Baza nie ma jeszcze pól danych firmy. Uruchom migrację v5 z paska u góry strony.";

/**
 * Zapisuje partnera. Z `before` (wersja ostatnio zapisana) wysyła tylko pola, które się zmieniły —
 * dwie osoby edytujące różne pola karty nie nadpisują sobie nawzajem pracy.
 */
export async function persistPartner(
  partner: Partner,
  before?: Partner,
): Promise<{ dropped: ("company" | "priority" | "v7")[]; conflicts: string[] }> {
  const dropped: ("company" | "priority" | "v7")[] = [];
  /** Kontakty zmienione w międzyczasie przez kogoś innego — ich nie zapisujemy. */
  const conflicts: string[] = [];
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  for (const contact of partner.contacts) {
    const old = before?.contacts.find((c) => c.id === contact.id);
    if (old && JSON.stringify(old) === JSON.stringify(contact)) continue;
    if (old) {
      // Edycja istniejącego kontaktu: zapisujemy tylko, jeśli nikt go w międzyczasie nie zmienił.
      const { data: row } = await sb.from("partner_contacts").select("*").eq("id", contact.id).maybeSingle();
      if (!row || !contactRowMatches(row, old)) {
        conflicts.push(contact.id);
        continue;
      }
    }
    await upsertPartnerContactRow(partner.id, contact);
  }

  const next = partnerColumns(partner);
  const prev = before ? partnerColumns(before) : null;
  const changed = Object.fromEntries(
    Object.entries(next).filter(([key, value]) => {
      if (!prev) return !([...COMPANY_COLUMNS, "capacity"].includes(key) && value === null);
      return JSON.stringify(prev[key]) !== JSON.stringify(value);
    }),
  );
  if (Object.keys(changed).length) {
    const send = async () =>
      Object.keys(changed).length
        ? (await sb.from("partners").update(changed).eq("id", partner.id)).error
        : null;
    let error = await send();
    for (let attempt = 0; error && attempt < 5; attempt++) {
      const missing = missingColumnName(error);
      if ("priority" in changed && /partner_priority/i.test(error.message ?? "")) {
        // Starsza baza ma inny zestaw priorytetów — reszta zmian i tak ma się zapisać.
        delete changed.priority;
        dropped.push("priority");
      } else if (
        isMissingColumn(error) &&
        Object.keys(changed).some((key) => V7_PARTNER_COLUMNS.includes(key)) &&
        (!missing || V7_PARTNER_COLUMNS.includes(missing))
      ) {
        // Bez migracji v7 brakuje kolumny typu albo pojemności — pomijamy tylko brakującą, reszta karty się zapisuje.
        // (Starsze bazy mają już typ partnera; zmiana typu nie może przepaść razem z pojemnością.)
        const drop = missing && V7_PARTNER_COLUMNS.includes(missing) ? [missing] : V7_PARTNER_COLUMNS;
        for (const key of drop) delete changed[key];
        if (!dropped.includes("v7")) dropped.push("v7");
      } else if (isMissingColumn(error) && Object.keys(changed).some((key) => COMPANY_COLUMNS.includes(key))) {
        // Bez migracji v5 dane firmy nie mają gdzie się zapisać — reszta karty tak.
        for (const key of COMPANY_COLUMNS) delete changed[key];
        dropped.push("company");
      } else break;
      error = await send();
    }
    if (error) throw error;
  }

  for (const consent of partner.consents) {
    const old = before?.consents.find((c) => c.channel === consent.channel && c.purpose === consent.purpose);
    if (old && old.status === consent.status) continue;
    const { data: existing } = await sb
      .from("consents")
      .select("id")
      .eq("partner_id", partner.id)
      .eq("channel", consent.channel)
      .eq("purpose", consent.purpose)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await sb
        .from("consents")
        .update({
          status: consent.status,
          granted_at: consent.status === "granted" ? new Date().toISOString() : null,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("consents").insert({
        partner_id: partner.id,
        channel: consent.channel,
        purpose: consent.purpose,
        status: consent.status,
      });
      if (error) throw error;
    }
  }
  return { dropped, conflicts };
}

/** Czy baza ma kolumny danych firmy (migracja v5). */
export async function detectSchemaV5(): Promise<boolean | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { error } = await sb.from("partners").select("legal_name, nip, regon, legal_address").limit(1);
  if (!error) return true;
  if (isMissingColumn(error) || isMissingCrmTable(error)) return false;
  return null;
}

/** Pliki umów i nagrań misji partnera. Kasujemy je razem z partnerem, żeby nie zostały sieroty. */
async function partnerFiles(partnerId: string) {
  const sb = getSupabase();
  if (!sb) return { contracts: [] as string[], recordings: [] as string[] };
  const { data: missionRows } = await sb.from("missions").select("id").eq("partner_id", partnerId);
  const missionIds = (missionRows ?? []).map((row) => row.id as string);
  if (!missionIds.length) return { contracts: [], recordings: [] };
  const { data: contractRows } = await selectIn(sb, "contracts", "mission_id", missionIds);
  const { data: convoRows } = await selectIn(sb, "conversations", "mission_id", missionIds);
  const { data: recordingRows } = await selectIn(
    sb,
    "recordings",
    "conversation_id",
    convoRows.map((row) => row.id as string),
  );
  return {
    contracts: contractRows.map((row) => row.document_path as string).filter(Boolean),
    recordings: recordingRows.map((row) => row.storage_path as string).filter(Boolean),
  };
}

export async function deletePartner(partnerId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  // Najpierw pliki (póki misje je wskazują i RLS wie, że są zespołu), potem wiersze.
  try {
    const files = await partnerFiles(partnerId);
    if (files.contracts.length) await sb.storage.from("contracts").remove(files.contracts);
    if (files.recordings.length) await sb.storage.from("recordings").remove(files.recordings);
  } catch {
    /* plik, którego nie da się skasować, nie blokuje usunięcia partnera */
  }
  const { error: missionError } = await sb.from("missions").delete().eq("partner_id", partnerId);
  if (missionError && !isMissingCrmTable(missionError)) throw missionError;
  const { data: removed, error } = await sb.from("partners").delete().eq("id", partnerId).select("id");
  if (error) throw error;
  if (!removed?.length) {
    throw new Error("Tego partnera usuwa jego opiekun albo administrator (i tylko bez cudzych misji).");
  }
}

/**
 * Czy tabele misji (v3) są w bazie. Po pierwszym udanym zapisie wiemy, że tak,
 * i od razu zapisujemy szczupłe `details` (bez przepisywania pełnego JSON-a tam i z powrotem).
 */
let coreTablesAvailable: boolean | null = null;

/**
 * Wersja misji z bazy (`missions.updated_at`, migracja v4), na której opiera się misja w widoku.
 * Zapis przechodzi tylko, gdy w bazie jest wciąż ta wersja — inaczej ktoś z zespołu był szybszy.
 * Wersję ustawia ten, kto podmienia treść misji (wczytanie, odświeżenie, własny zapis).
 */
const missionVersions = new Map<string, string>();

export function setMissionVersion(missionId: string, version: string | undefined) {
  if (version) missionVersions.set(missionId, version);
  else missionVersions.delete(missionId);
}

export function replaceMissionVersions(versions: Map<string, string>) {
  missionVersions.clear();
  for (const [id, version] of versions) missionVersions.set(id, version);
}

/** Po wylogowaniu wersje z poprzedniej sesji nie są już nic warte. */
export function clearMissionVersions() {
  missionVersions.clear();
}

export class MissionConflictError extends Error {
  missionId: string;
  constructor(missionId: string) {
    super("Ktoś z zespołu zmienił tę misję w tym samym czasie.");
    this.name = "MissionConflictError";
    this.missionId = missionId;
  }
}

export async function persistMission(
  mission: Mission,
  workspaceId: string,
  userId: string,
  segment: Partner["segment"] = "venue",
): Promise<{ nextStepTask: TaskItem | null }> {
  const sb = getSupabase();
  if (!sb) return { nextStepTask: null };
  const slim = coreTablesAvailable === true;
  const changes = {
    workspace_id: workspaceId,
    partner_id: mission.partnerId,
    // Właściciel zostaje ten sam, nawet gdy misję zapisuje ktoś inny z zespołu.
    owner_user_id: uuidOrNull(mission.ownerUserId) ?? userId,
    status: mission.status,
    current_stage: mission.currentStage,
    next_step_label: mission.nextStepLabel,
    next_step_at: dateOrNull(mission.nextStepAt),
    outcome: mission.outcome,
    loss_reason: mission.lossReason || null,
    details: slim ? uiDetailsOf(mission) : detailsOf(mission),
    closed_at: mission.status === "active" ? null : (mission.closedAt ?? null),
  };

  const version = missionVersions.get(mission.id);
  let claimed: string | undefined;
  if (version) {
    const { data, error } = await sb
      .from("missions")
      .update(changes)
      .eq("id", mission.id)
      .eq("updated_at", version)
      .select("*");
    if (error) throw error;
    if (!data?.length) throw new MissionConflictError(mission.id);
    claimed = data[0].updated_at ? String(data[0].updated_at) : undefined;
  } else {
    const { data, error } = await sb
      .from("missions")
      .upsert({ id: mission.id, ...changes })
      .select("*")
      .single();
    if (error) throw error;
    claimed = data?.updated_at ? String(data.updated_at) : undefined;
  }
  setMissionVersion(mission.id, claimed);

  const core = await syncMissionCore(mission, workspaceId, userId, segment);
  if (core.status === "synced") {
    if (claimed) {
      // Domknięcie zapisu: nowa wersja dopiero po zapisaniu tabel misji. Kto wczytał misję
      // w trakcie naszego zapisu, ma starszą wersję i jego zapis skończy się konfliktem,
      // zamiast wgrać z powrotem połowiczny stan.
      const { data, error: sealError } = await sb
        .from("missions")
        .update({ details: uiDetailsOf(mission) })
        .eq("id", mission.id)
        .eq("updated_at", claimed)
        .select("*");
      if (sealError) throw sealError;
      if (!data?.length) throw new MissionConflictError(mission.id);
      setMissionVersion(mission.id, data[0].updated_at ? String(data[0].updated_at) : undefined);
    } else if (!slim) {
      const { error: slimError } = await sb
        .from("missions")
        .update({ details: uiDetailsOf(mission) })
        .eq("id", mission.id);
      if (slimError) throw slimError;
    }
    coreTablesAvailable = true;
  } else {
    coreTablesAvailable = false;
  }
  return { nextStepTask: core.nextStepTask };
}

/** Nazwa brakującej kolumny z komunikatu PostgREST/Postgres (jeśli da się ją odczytać). */
function missingColumnName(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return (
    message.match(/Could not find the '([a-z_]+)' column/i)?.[1] ??
    message.match(/column (?:[a-z_]+\.)?([a-z_]+) does not exist/i)?.[1] ??
    message.match(/column "([a-z_]+)" (?:of relation|does not exist)/i)?.[1] ??
    null
  );
}

function isMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? "")
  );
}

function isMissingFunction(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

export const V4_MISSING =
  "Brakuje migracji v4 w bazie. Otwórz SQL Editor w Supabase, wklej supabase/v4-team-timeline.sql i kliknij Run.";

/** `true` gdy w bazie są kolumny dziennika kontaktów z migracji v4. `null` gdy nie wiadomo. */
export async function detectSchemaV4(): Promise<boolean | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { error } = await sb.from("conversations").select("direction, outcome").limit(1);
  if (!error) return true;
  if (isMissingColumn(error) || isMissingCrmTable(error)) return false;
  return null;
}

const OUTCOMES: ActivityOutcome[] = [
  "connected",
  "no_answer",
  "callback",
  "refused",
  "sent",
  "replied",
  "meeting_booked",
  "other",
];

function activityFromRow(
  row: Record<string, unknown>,
  flags: { hasRecording: boolean; hasTranscript: boolean },
): Activity {
  const outcome = OUTCOMES.includes(row.outcome as ActivityOutcome) ? (row.outcome as ActivityOutcome) : null;
  const channel = String(row.channel ?? "phone");
  return {
    id: String(row.id),
    missionId: String(row.mission_id),
    channel: (["phone", "email", "linkedin", "in_person"].includes(channel) ? channel : "other") as Activity["channel"],
    direction: (row.direction === "inbound" ? "inbound" : "outbound") as ActivityDirection,
    outcome,
    subject: String(row.subject ?? ""),
    summary: String(row.summary_human ?? ""),
    contactId: (row.contact_id as string | null) ?? null,
    occurredAt: String(row.started_at ?? new Date().toISOString()),
    durationMin: typeof row.duration_min === "number" ? row.duration_min : null,
    createdBy: (row.created_by as string | null) ?? null,
    hasRecording: flags.hasRecording,
    hasTranscript: flags.hasTranscript,
  };
}

function eventFromRow(row: Record<string, unknown>): MissionEvent {
  const kind = row.kind === "stage" || row.kind === "status" ? row.kind : "created";
  return {
    id: String(row.id),
    missionId: String(row.mission_id),
    kind,
    fromValue: (row.from_value as string | null) ?? null,
    toValue: (row.to_value as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    actorId: (row.actor_id as string | null) ?? null,
    at: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function insertActivity(input: NewActivityInput): Promise<Activity> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const occurred = new Date(input.occurredAt);
  const { data, error } = await sb
    .from("conversations")
    .insert({
      mission_id: input.missionId,
      channel: input.channel,
      direction: input.direction,
      outcome: input.outcome,
      subject: input.subject.trim() || null,
      summary_human: input.summary.trim() || null,
      contact_id: uuidOrNull(input.contactId),
      started_at: Number.isNaN(occurred.getTime()) ? new Date().toISOString() : occurred.toISOString(),
      duration_min: input.durationMin,
    })
    .select("*")
    .single();
  if (error) {
    if (isMissingColumn(error) || (error.message ?? "").includes("schema cache")) throw new Error(V4_MISSING);
    throw error;
  }
  return activityFromRow(data, { hasRecording: false, hasTranscript: false });
}

export async function deleteActivity(activityId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { data, error } = await sb.from("conversations").delete().eq("id", activityId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Ten wpis usuwa jego autor albo administrator workspace.");
}

export async function loadMissionEvents(missionId: string): Promise<MissionEvent[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("mission_events")
    .select("*")
    .eq("mission_id", missionId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(eventFromRow);
}

export const V6_MISSING = "Brakuje migracji v6 w bazie (uprawnienia, obieg podpisu, szablon umowy). Skopiuj SQL z paska u góry strony.";

function rpcError(error: { code?: string; message?: string }, fallback: string, missing = V4_MISSING) {
  if (isMissingFunction(error)) return new Error(missing);
  return new Error(error.message || fallback);
}

/** Członkowie workspace. `null`, gdy w bazie nie ma jeszcze migracji v4. */
export async function loadTeam(): Promise<TeamMember[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("workspace_members");
  if (error) {
    if (isMissingFunction(error)) return null;
    throw rpcError(error, "Nie udało się wczytać zespołu.");
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name ?? "").trim() || String(row.email ?? "Handlowiec"),
    role: row.role === "admin" ? "admin" : "seller",
    email: String(row.email ?? ""),
    isMe: Boolean(row.is_me),
  }));
}

export async function peekInvite(token: string): Promise<InvitePeek> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { data, error } = await sb.rpc("peek_workspace_invite", { p_token: token.trim() });
  if (error) throw rpcError(error, "Nie udało się sprawdzić zaproszenia.");
  const row = ((data ?? []) as Array<Record<string, unknown>>)[0] ?? { status: "missing" };
  const statuses: InvitePeek["status"][] = [
    "ok",
    "missing",
    "revoked",
    "accepted",
    "used",
    "expired",
    "email_mismatch",
    "same_workspace",
  ];
  const status = statuses.includes(row.status as InvitePeek["status"]) ? (row.status as InvitePeek["status"]) : "missing";
  return {
    status,
    workspaceName: (row.workspace_name as string | null) ?? null,
    invitedBy: (row.invited_by as string | null) ?? null,
    inviteEmail: (row.invite_email as string | null) ?? null,
    alone: Boolean(row.alone),
    ownPartners: Number(row.own_partners ?? 0),
    ownMissions: Number(row.own_missions ?? 0),
  };
}

export async function listInvites(): Promise<TeamInvite[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("list_workspace_invites");
  if (error) throw rpcError(error, "Nie udało się wczytać zaproszeń.");
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    email: (row.email as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    expiresAt: String(row.expires_at ?? ""),
    createdByName: (row.created_by_name as string | null) ?? null,
  }));
}

export async function createInvite(email: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { data, error } = await sb.rpc("create_workspace_invite", { p_email: email.trim() || null });
  if (error) throw rpcError(error, "Nie udało się utworzyć zaproszenia.");
  return String(data);
}

export async function acceptInviteToken(token: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { data, error } = await sb.rpc("accept_workspace_invite", { p_token: token.trim() });
  if (error) throw rpcError(error, "Nie udało się dołączyć do zespołu.");
  return String(data);
}

export async function revokeInvite(inviteId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { error } = await sb.rpc("revoke_workspace_invite", { p_invite: inviteId });
  if (error) throw rpcError(error, "Nie udało się cofnąć zaproszenia.");
}

export async function removeMember(memberId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { error } = await sb.rpc("remove_workspace_member", { p_user: memberId });
  if (error) throw rpcError(error, "Nie udało się usunąć osoby z zespołu.");
}

/** Czy baza ma uprawnienia per właściciel i obieg podpisu (migracja v6). */
export async function detectSchemaV6(): Promise<boolean | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { error } = await sb.from("contracts").select("sent_at, partner_signed_at").limit(1);
  if (!error) return true;
  if (isMissingColumn(error) || isMissingCrmTable(error)) return false;
  return null;
}

/** Przekazuje misję. Zwraca nową wersję misji (updated_at) do zapisu warunkowego. */
export async function transferMission(missionId: string, userId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { data, error } = await sb.rpc("transfer_mission", { p_mission: missionId, p_user: userId });
  if (error) throw rpcError(error, "Nie udało się przekazać misji.", V6_MISSING);
  return typeof data === "string" ? data : undefined;
}

/** Czy baza ma typ partnera, pojemność i szablon porozumienia mailowego (migracja v7). */
export async function detectSchemaV7(): Promise<boolean | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { error } = await sb.from("partners").select("segment, capacity").limit(1);
  if (error) {
    if (isMissingColumn(error) || isMissingCrmTable(error)) return false;
    return null;
  }
  const { error: wsError } = await sb.from("workspaces").select("agreement_template").limit(1);
  if (!wsError) return true;
  if (isMissingColumn(wsError)) return false;
  return null;
}

/** Szablon porozumienia mailowego zespołu (admin, migracja v7). */
export async function saveAgreementTemplate(template: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { error } = await sb.rpc("set_agreement_template", { p_template: template });
  if (error) throw rpcError(error, "Nie udało się zapisać szablonu.", V7_MISSING);
}

export async function saveContractTemplate(template: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { error } = await sb.rpc("set_contract_template", { p_template: template });
  if (error) throw rpcError(error, "Nie udało się zapisać szablonu.", V6_MISSING);
}

export async function renameWorkspace(name: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { error } = await sb.rpc("rename_workspace", { p_name: name });
  if (error) throw rpcError(error, "Nie udało się zmienić nazwy.");
}

export async function saveManualTranscript(params: {
  missionId: string;
  channel: Channel;
  text: string;
  note?: string;
}): Promise<CallRecord> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const conversationId = crypto.randomUUID();
  const { error: convoError } = await sb.from("conversations").insert({
    id: conversationId,
    mission_id: params.missionId,
    channel: params.channel,
    recording_consent: "denied",
    summary_human: params.note?.trim() || "Transkrypt wklejony (skill / Spinach)",
  });
  if (convoError) throw convoError;

  const { error: transcriptError } = await sb.from("transcripts").insert({
    conversation_id: conversationId,
    provider: "manual",
    language: "pl",
    status: "ready",
    full_text: params.text.trim(),
    segments: [],
  });
  if (transcriptError) throw transcriptError;

  return {
    id: conversationId,
    channel: params.channel,
    recordingConsent: "denied",
    durationSec: 0,
    transcriptStatus: "ready",
    transcriptText: params.text.trim(),
    createdAt: new Date().toISOString(),
  };
}

export async function updateTranscriptText(conversationId: string, text: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { error } = await sb
    .from("transcripts")
    .update({ full_text: text, status: "ready", provider: "manual" })
    .eq("conversation_id", conversationId);
  if (error) throw error;
}

export async function saveRecording(params: {
  missionId: string;
  userId: string;
  channel: Channel;
  blob: Blob;
  durationSec: number;
  note?: string;
  transcriptText?: string;
}): Promise<CallRecord> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const ext = params.blob.type.includes("mp4") ? "mp4" : "webm";

  // Każde nagranie to osobny wpis w dzienniku. Nie doklejamy go do wcześniejszego kontaktu.
  const conversationId = crypto.randomUUID();
  const { error: convoError } = await sb.from("conversations").insert({
    id: conversationId,
    mission_id: params.missionId,
    channel: params.channel,
    recording_consent: "granted",
    disclosure_shown_at: new Date().toISOString(),
    summary_human: params.note?.trim() || null,
  });
  if (convoError) throw convoError;

  const storagePath = `${params.userId}/${conversationId}.${ext}`;

  const { error: uploadError } = await sb.storage.from("recordings").upload(storagePath, params.blob, {
    contentType: params.blob.type || "audio/webm",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: recording, error: recError } = await sb
    .from("recordings")
    .insert({
      conversation_id: conversationId,
      storage_path: storagePath,
      duration_sec: Math.round(params.durationSec),
      mime_type: params.blob.type || "audio/webm",
      consent_snapshot: { granted: true, at: new Date().toISOString() },
      retention_until: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (recError) throw recError;

  const transcriptText = params.transcriptText?.trim() ?? "";
  const { error: transcriptError } = await sb.from("transcripts").insert({
    recording_id: recording.id,
    conversation_id: conversationId,
    provider: transcriptText ? "web-speech" : "manual",
    language: "pl",
    status: "ready",
    full_text: transcriptText,
    segments: [],
  });
  if (transcriptError) throw transcriptError;

  return {
    id: conversationId,
    channel: params.channel,
    recordingConsent: "granted",
    storagePath,
    durationSec: params.durationSec,
    transcriptStatus: "ready",
    transcriptText,
    createdAt: new Date().toISOString(),
  };
}

export function isMissingPartnersTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    isMissingCrmTable(error) ||
    error.code === "PGRST202" ||
    (error.message ?? "").includes("ensure_workspace") ||
    (error.message ?? "").includes("partners")
  );
}
