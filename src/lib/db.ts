import { loadMissionCore, syncMissionCore } from "./mission-core";
import { nextPriorityForDb, normalizePartnerPriority, priorityForDb } from "./partner-priority";
import { OBJECTION_KEYS } from "./playbook";
import { emptyMission } from "./seed";
import { dateOrNull, uuidOrNull } from "./sql-coerce";
import { getSupabase, isMissingCrmTable } from "./supabase";
import type {
  CallRecord,
  Channel,
  ConsentStatus,
  Mission,
  NewPartnerInput,
  Partner,
  PartnerContact,
  StageId,
} from "./types";

export type WorkspaceContext = {
  workspaceId: string;
  workspaceName: string;
  fullName: string;
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

function filled(value?: string) {
  return Boolean(value?.trim());
}

function missionFromRow(
  row: {
    id: string;
    partner_id: string;
    status: Mission["status"];
    current_stage: StageId;
    next_step_label: string | null;
    next_step_at: string | null;
    outcome: Mission["outcome"];
    loss_reason: string | null;
    details: MissionDetails | null;
  },
  calls: CallRecord[],
): Mission {
  const base = emptyMission(row.partner_id, row.id);
  const d = row.details ?? {};
  return {
    ...base,
    ...d,
    id: row.id,
    partnerId: row.partner_id,
    status: row.status,
    currentStage: row.current_stage,
    nextStepLabel: row.next_step_label ?? base.nextStepLabel,
    nextStepAt: row.next_step_at ?? base.nextStepAt,
    outcome: row.outcome,
    lossReason: row.loss_reason ?? "",
    contract: { ...base.contract, ...(d.contract ?? {}) },
    activation: { ...base.activation, ...(d.activation ?? {}) },
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
  },
  contacts: PartnerContact[],
  consents: Partner["consents"],
): Partner {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
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
  const { data: workspace } = await sb.from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
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
  };
}

export async function loadCrm(workspaceId: string): Promise<{
  partners: Partner[];
  missions: Mission[];
  tasks: import("./types").TaskItem[];
}> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");

  const { data: partnerRows, error: partnerError } = await sb
    .from("partners")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (partnerError) throw partnerError;

  const partnerIds = (partnerRows ?? []).map((p) => p.id as string);
  const { data: contactRows } = partnerIds.length
    ? await sb.from("partner_contacts").select("*").in("partner_id", partnerIds)
    : { data: [] };
  const { data: consentRows } = partnerIds.length
    ? await sb.from("consents").select("*").in("partner_id", partnerIds)
    : { data: [] };

  const partners = (partnerRows ?? []).map((row) =>
    mapPartner(
      row,
      (contactRows ?? [])
        .filter((c) => c.partner_id === row.id)
        .map((c) => ({
          id: c.id as string,
          name: String(c.name ?? c.contact_person ?? "").trim(),
          role: (c.role as string) ?? "",
          isDecisionMaker: Boolean(c.is_decision_maker),
          phone: (c.phone as string) ?? undefined,
          email: (c.email as string) ?? undefined,
          linkedin: (c.linkedin as string) ?? undefined,
        })),
      (consentRows ?? [])
        .filter((c) => c.partner_id === row.id)
        .map((c) => ({
          channel: c.channel as Channel,
          purpose: c.purpose as Partner["consents"][number]["purpose"],
          status: c.status as ConsentStatus,
        })),
    ),
  );

  const { data: missionRows, error: missionError } = await sb
    .from("missions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false });
  if (missionError) throw missionError;

  const missionIds = (missionRows ?? []).map((m) => m.id as string);
  const callsByMission = new Map<string, CallRecord[]>();
  if (missionIds.length) {
    const { data: convos } = await sb.from("conversations").select("*").in("mission_id", missionIds);
    const convoIds = (convos ?? []).map((c) => c.id as string);
    const { data: recs } = convoIds.length
      ? await sb.from("recordings").select("*").in("conversation_id", convoIds)
      : { data: [] };
    const { data: trs } = convoIds.length
      ? await sb.from("transcripts").select("*").in("conversation_id", convoIds)
      : { data: [] };

    for (const convo of convos ?? []) {
      const rec = (recs ?? []).find((r) => r.conversation_id === convo.id);
      const tr = (trs ?? []).find((t) => t.conversation_id === convo.id);
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
    }
  }

  const missions = (missionRows ?? []).map((row) =>
    missionFromRow(row, callsByMission.get(row.id as string) ?? []),
  );

  const { byMission, tasks } = await loadMissionCore(missionIds);
  const merged = missions.map((mission) => {
    const core = byMission.get(mission.id);
    if (!core) return mission;
    const decisionFromCore =
      core.decision &&
      (filled(core.decision.problem) ||
        filled(core.decision.expectedResult) ||
        filled(core.decision.decisionMakerId) ||
        filled(core.decision.nextStep));
    const contractFromCore =
      core.contract &&
      (filled(core.contract.companyName) ||
        filled(core.contract.nip) ||
        core.contract.documentPath ||
        core.contract.signedByHuman);
    const activationFromCore =
      core.activation &&
      (filled(core.activation.partnerCode) ||
        core.activation.hoursConfirmed ||
        core.activation.testPassed ||
        filled(core.activation.opsContactName));
    return {
      ...mission,
      needs: core.needs?.length ? core.needs : mission.needs,
      decision: decisionFromCore ? core.decision! : mission.decision,
      checklist: { ...mission.checklist, ...core.checklist },
      objections: core.objections?.length
        ? mission.objections.map((item) => core.objections?.find((o) => o.key === item.key) ?? item)
        : mission.objections,
      selectedVariant: core.selectedVariant ?? mission.selectedVariant,
      offerApproved: core.offerApproved ?? mission.offerApproved,
      offerSentAt: core.offerSentAt ?? mission.offerSentAt,
      contract: contractFromCore ? { ...mission.contract, ...core.contract } : mission.contract,
      activation: activationFromCore
        ? { ...mission.activation, ...core.activation }
        : mission.activation,
    };
  });

  return { partners, missions: merged, tasks };
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
        ["subcategory", "website", "instagram", "facebook", "social_other", "priority", "priority_reason"].includes(
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
  } satisfies Record<string, unknown>;
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

export async function persistPartner(partner: Partner) {
  const sb = getSupabase();
  if (!sb) return;
  for (const contact of partner.contacts) {
    await upsertPartnerContactRow(partner.id, contact);
  }
  await sb
    .from("partners")
    .update({
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
    })
    .eq("id", partner.id);

  for (const consent of partner.consents) {
    const { data: existing } = await sb
      .from("consents")
      .select("id")
      .eq("partner_id", partner.id)
      .eq("channel", consent.channel)
      .eq("purpose", consent.purpose)
      .maybeSingle();
    if (existing?.id) {
      await sb
        .from("consents")
        .update({
          status: consent.status,
          granted_at: consent.status === "granted" ? new Date().toISOString() : null,
        })
        .eq("id", existing.id);
    } else {
      await sb.from("consents").insert({
        partner_id: partner.id,
        channel: consent.channel,
        purpose: consent.purpose,
        status: consent.status,
      });
    }
  }
}

export async function deletePartner(partnerId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { error: missionError } = await sb.from("missions").delete().eq("partner_id", partnerId);
  if (missionError && !isMissingCrmTable(missionError)) throw missionError;
  const { error } = await sb.from("partners").delete().eq("id", partnerId);
  if (error) throw error;
}

export async function persistMission(
  mission: Mission,
  workspaceId: string,
  userId: string,
) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("missions").upsert({
    id: mission.id,
    workspace_id: workspaceId,
    partner_id: mission.partnerId,
    owner_user_id: userId,
    status: mission.status,
    current_stage: mission.currentStage,
    next_step_label: mission.nextStepLabel,
    next_step_at: dateOrNull(mission.nextStepAt),
    outcome: mission.outcome,
    loss_reason: mission.lossReason || null,
    details: detailsOf(mission),
    closed_at: mission.status === "won" || mission.status === "lost" ? new Date().toISOString() : null,
  });
  if (error) throw error;
  await syncConversationMeta(mission);
  const coreStatus = await syncMissionCore(mission, workspaceId, userId);
  if (coreStatus === "synced") {
    const { error: slimError } = await sb
      .from("missions")
      .update({ details: uiDetailsOf(mission) })
      .eq("id", mission.id);
    if (slimError) throw slimError;
  }
}

async function syncConversationMeta(mission: Mission) {
  const sb = getSupabase();
  if (!sb) return;
  const hasContact =
    Boolean(mission.selectedChannel) ||
    mission.recordingConsent !== "pending" ||
    Boolean(mission.conversationNote.trim()) ||
    Boolean(mission.disclosureShown);
  if (!hasContact) return;

  const { data: existing, error } = await sb
    .from("conversations")
    .select("id, disclosure_shown_at")
    .eq("mission_id", mission.id)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  const payload = {
    channel: mission.selectedChannel ?? "phone",
    recording_consent: mission.recordingConsent,
    disclosure_shown_at: mission.disclosureShown
      ? ((existing?.[0]?.disclosure_shown_at as string | null) ?? new Date().toISOString())
      : null,
    summary_human: mission.conversationNote.trim() || null,
  };

  if (existing?.[0]?.id) {
    const { error: updateError } = await sb.from("conversations").update(payload).eq("id", existing[0].id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await sb.from("conversations").insert({
    mission_id: mission.id,
    ...payload,
  });
  if (insertError) throw insertError;
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

  const { data: convos, error: listError } = await sb
    .from("conversations")
    .select("id")
    .eq("mission_id", params.missionId)
    .order("started_at", { ascending: false });
  if (listError) throw listError;

  const convoIds = (convos ?? []).map((row) => row.id as string);
  const { data: recs } = convoIds.length
    ? await sb.from("recordings").select("conversation_id").in("conversation_id", convoIds)
    : { data: [] };
  const used = new Set((recs ?? []).map((row) => row.conversation_id as string));
  let conversationId = convoIds.find((id) => !used.has(id));

  if (!conversationId) {
    conversationId = crypto.randomUUID();
    const { error: convoError } = await sb.from("conversations").insert({
      id: conversationId,
      mission_id: params.missionId,
      channel: params.channel,
      recording_consent: "granted",
      disclosure_shown_at: new Date().toISOString(),
      summary_human: params.note?.trim() || null,
    });
    if (convoError) throw convoError;
  } else {
    const { error: updateError } = await sb
      .from("conversations")
      .update({
        channel: params.channel,
        recording_consent: "granted",
        disclosure_shown_at: new Date().toISOString(),
        summary_human: params.note?.trim() || null,
      })
      .eq("id", conversationId);
    if (updateError) throw updateError;
  }

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
