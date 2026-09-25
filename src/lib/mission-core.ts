import { dateOrNull, uuidOrNull } from "./sql-coerce";
import { ACTIVATION_ITEMS, CONTRACT_ITEMS, RESEARCH_ITEMS } from "./playbook";
import { getSupabase, isMissingCrmTable } from "./supabase";
import type {
  ActivationRecord,
  ContractRecord,
  Mission,
  Need,
  TaskItem,
} from "./types";

function optionalTable(error: { code?: string; message?: string } | null) {
  return isMissingCrmTable(error) || error?.code === "PGRST205" || error?.code === "42P01";
}

const CHECKLIST_LABELS: Record<string, string> = {
  ...Object.fromEntries(RESEARCH_ITEMS.map((i) => [`research:${i.key}`, i.label])),
  ...Object.fromEntries(CONTRACT_ITEMS.map((i) => [`contract:${i.key}`, i.label])),
  ...Object.fromEntries(ACTIVATION_ITEMS.map((i) => [`activation:${i.key}`, i.label])),
};

export type MissionCore = {
  needs: Need[];
  decision: Mission["decision"];
  checklist: Mission["checklist"];
  objections: Mission["objections"];
  selectedVariant: Mission["selectedVariant"];
  offerApproved: boolean;
  offerSentAt?: string;
  contract: ContractRecord;
  activation: ActivationRecord;
};

export async function loadMissionCore(missionIds: string[]): Promise<{
  byMission: Map<string, Partial<MissionCore>>;
  tasks: TaskItem[];
}> {
  const byMission = new Map<string, Partial<MissionCore>>();
  if (!missionIds.length) return { byMission, tasks: [] };
  const sb = getSupabase();
  if (!sb) return { byMission, tasks: [] };

  const [needsRes, decisionRes, checklistRes, objectionsRes, offersRes, contractsRes, activationsRes, tasksRes] =
    await Promise.all([
      sb.from("needs").select("*").in("mission_id", missionIds),
      sb.from("decision_context").select("*").in("mission_id", missionIds),
      sb.from("mission_checklist_items").select("*").in("mission_id", missionIds),
      sb.from("mission_objections").select("*").in("mission_id", missionIds),
      sb.from("offers").select("*").in("mission_id", missionIds),
      sb.from("contracts").select("*").in("mission_id", missionIds),
      sb.from("activations").select("*").in("mission_id", missionIds),
      sb.from("tasks").select("*").in("mission_id", missionIds).order("due_at", { ascending: true }),
    ]);

  const skip =
    optionalTable(needsRes.error) ||
    optionalTable(decisionRes.error) ||
    optionalTable(tasksRes.error);
  if (skip) return { byMission, tasks: [] };
  if (needsRes.error) throw needsRes.error;
  if (decisionRes.error) throw decisionRes.error;
  if (checklistRes.error) throw checklistRes.error;
  if (objectionsRes.error) throw objectionsRes.error;
  if (offersRes.error) throw offersRes.error;
  if (contractsRes.error) throw contractsRes.error;
  if (activationsRes.error) throw activationsRes.error;
  if (tasksRes.error) throw tasksRes.error;

  const ensure = (id: string) => {
    const current = byMission.get(id) ?? {};
    byMission.set(id, current);
    return current;
  };

  for (const row of needsRes.data ?? []) {
    const slot = ensure(row.mission_id as string);
    const need: Need = {
      id: row.id as string,
      category: row.category,
      title: (row.title as string) || "",
      description: (row.description as string) ?? "",
      priority: (row.priority as number | null) ?? null,
      quote: (row.quote as string) ?? undefined,
      expectedResult: (row.expected_result as string) ?? undefined,
      constraints: (row.constraints as string) ?? undefined,
      status: row.status,
      confirmed: row.status === "fact" && Boolean(row.confirmed_at),
    };
    slot.needs = [...(slot.needs ?? []), need];
  }

  for (const row of decisionRes.data ?? []) {
    ensure(row.mission_id as string).decision = {
      problem: (row.problem as string) ?? "",
      expectedResult: (row.expected_result as string) ?? "",
      constraintSummary: (row.constraint_summary as string) ?? "",
      decisionMakerId: (row.decision_maker_contact_id as string) ?? "",
      decisionDeadline: (row.decision_deadline as string) ?? "",
      previousAttempts: (row.previous_attempts as string) ?? "",
      nextStep: (row.next_step as string) ?? "",
    };
  }

  for (const row of checklistRes.data ?? []) {
    const slot = ensure(row.mission_id as string);
    const key = `${row.stage}:${row.item_key}`;
    slot.checklist = { ...(slot.checklist ?? {}), [key]: Boolean(row.is_done) };
  }

  for (const row of objectionsRes.data ?? []) {
    const slot = ensure(row.mission_id as string);
    slot.objections = [
      ...(slot.objections ?? []),
      {
        key: row.library_key as string,
        checked: Boolean(row.checked),
        argumentWorked: Boolean(row.argument_worked),
      },
    ];
  }

  for (const row of offersRes.data ?? []) {
    const slot = ensure(row.mission_id as string);
    slot.selectedVariant = row.variant;
    slot.offerApproved = row.status === "approved" || row.status === "sent" || Boolean(row.approved_at);
    slot.offerSentAt = (row.sent_at as string) ?? undefined;
  }

  for (const row of contractsRes.data ?? []) {
    ensure(row.mission_id as string).contract = {
      companyName: (row.company_name as string) ?? "",
      nip: (row.nip as string) ?? "",
      address: (row.address as string) ?? "",
      startAt: (row.start_at as string) ?? "",
      endAt: (row.end_at as string) ?? "",
      changeRules: (row.change_rules as string) ?? "",
      signedByHuman: Boolean(row.signed_by_human),
      documentPath: (row.document_path as string) ?? undefined,
      signedAt: (row.signed_at as string) ?? undefined,
      status: (row.status as ContractRecord["status"]) ?? "draft",
    };
  }

  for (const row of activationsRes.data ?? []) {
    ensure(row.mission_id as string).activation = {
      partnerCode: (row.partner_code as string) ?? "",
      hoursConfirmed: Boolean(row.hours_confirmed),
      opsContactName: (row.ops_contact_name as string) ?? "",
      opsContactPhone: (row.ops_contact_phone as string) ?? "",
      testPassed: Boolean(row.test_passed),
      testNotes: (row.test_notes as string) ?? "",
      checkInAt: (row.check_in_at as string) ?? "",
      activatedAt: (row.activated_at as string) ?? undefined,
    };
  }

  const tasks: TaskItem[] = (tasksRes.data ?? []).map((row) => ({
    id: row.id as string,
    missionId: row.mission_id as string,
    title: row.title as string,
    dueAt: (row.due_at as string) ?? "",
    doneAt: (row.done_at as string) ?? undefined,
    source: row.source as TaskItem["source"],
  }));

  return { byMission, tasks };
}

export async function syncMissionCore(
  mission: Mission,
  workspaceId: string,
  userId: string,
): Promise<"synced" | "skipped"> {
  const sb = getSupabase();
  if (!sb) return "skipped";
  const d = mission.decision;
  const { error: decisionError } = await sb.from("decision_context").upsert({
    mission_id: mission.id,
    problem: d.problem || null,
    expected_result: d.expectedResult || null,
    constraint_summary: d.constraintSummary || null,
    decision_maker_contact_id: uuidOrNull(d.decisionMakerId),
    decision_deadline: d.decisionDeadline || null,
    previous_attempts: d.previousAttempts || null,
    next_step: d.nextStep || null,
  });
  if (decisionError) {
    if (optionalTable(decisionError)) return "skipped";
    throw decisionError;
  }

  const { data: existingNeeds, error: listNeedsError } = await sb
    .from("needs")
    .select("id")
    .eq("mission_id", mission.id);
  if (listNeedsError) throw listNeedsError;
  const keep = new Set(mission.needs.map((n) => n.id));
  const stale = (existingNeeds ?? []).map((n) => n.id as string).filter((id) => !keep.has(id));
  if (stale.length) await sb.from("needs").delete().in("id", stale);
  if (mission.needs.length) {
    const { error } = await sb.from("needs").upsert(
      mission.needs.map((need) => ({
        id: need.id,
        mission_id: mission.id,
        category: need.category,
        title: need.title || null,
        description: need.description || null,
        priority: need.priority,
        expected_result: need.expectedResult || null,
        constraints: need.constraints || null,
        quote: need.quote || null,
        status: need.confirmed ? "fact" : need.status,
        confirmed_by: need.confirmed ? userId : null,
        confirmed_at: need.confirmed ? new Date().toISOString() : null,
        source: "manual",
      })),
    );
    if (error) throw error;
  }

  const checklistRows = Object.entries(mission.checklist).map(([fullKey, isDone]) => {
    const [stage, ...rest] = fullKey.split(":");
    const itemKey = rest.join(":");
    return {
      mission_id: mission.id,
      stage,
      item_key: itemKey,
      label: CHECKLIST_LABELS[fullKey] ?? itemKey,
      is_done: isDone,
      done_at: isDone ? new Date().toISOString() : null,
    };
  });
  if (checklistRows.length) {
    const { error } = await sb.from("mission_checklist_items").upsert(checklistRows, {
      onConflict: "mission_id,stage,item_key",
    });
    if (error) throw error;
  }

  const { error: objError } = await sb.from("mission_objections").upsert(
    mission.objections.map((item) => ({
      mission_id: mission.id,
      library_key: item.key,
      checked: item.checked,
      argument_worked: item.argumentWorked,
    })),
    { onConflict: "mission_id,library_key" },
  );
  if (objError) throw objError;

  if (mission.selectedVariant) {
    const { data: library } = await sb
      .from("offer_library")
      .select("id")
      .eq("segment", "venue")
      .eq("variant", mission.selectedVariant)
      .maybeSingle();
    const status = mission.offerSentAt ? "sent" : mission.offerApproved ? "approved" : "draft";
    const { error } = await sb.from("offers").upsert(
      {
        mission_id: mission.id,
        library_id: library?.id ?? null,
        variant: mission.selectedVariant,
        custom_terms: {
          constraints: mission.decision.constraintSummary,
          nextStep: mission.decision.nextStep,
        },
        recommended_by: "human",
        approved_by: mission.offerApproved ? userId : null,
        approved_at: mission.offerApproved ? new Date().toISOString() : null,
        sent_at: mission.offerSentAt || null,
        status,
      },
      { onConflict: "mission_id" },
    );
    if (error) throw error;
  }

  if (mission.nextStepLabel.trim()) {
    const { data: rows } = await sb
      .from("tasks")
      .select("id, done_at")
      .eq("mission_id", mission.id)
      .eq("source", "next_step")
      .limit(1);
    const existing = rows?.[0];
    const payload = {
      workspace_id: workspaceId,
      mission_id: mission.id,
      owner_user_id: userId,
      title: mission.nextStepLabel.trim(),
      due_at: dateOrNull(mission.nextStepAt),
      source: "next_step",
      done_at: existing?.done_at ?? null,
    };
    if (existing?.id) {
      const { error } = await sb.from("tasks").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("tasks").insert(payload);
      if (error) throw error;
    }
  }

  const c = mission.contract;
  const hasContract =
    c.companyName.trim() ||
    c.nip.trim() ||
    c.signedByHuman ||
    c.documentPath ||
    c.startAt ||
    c.endAt;
  if (hasContract) {
    const { data: offer } = await sb.from("offers").select("id").eq("mission_id", mission.id).maybeSingle();
    const status = c.signedByHuman ? "signed" : c.companyName.trim() ? "ready" : "draft";
    const { error } = await sb.from("contracts").upsert(
      {
        mission_id: mission.id,
        offer_id: offer?.id ?? null,
        company_name: c.companyName.trim() || null,
        nip: c.nip.trim() || null,
        address: c.address.trim() || null,
        start_at: c.startAt || null,
        end_at: c.endAt || null,
        change_rules: c.changeRules.trim() || null,
        signed_by_human: c.signedByHuman,
        document_path: c.documentPath || null,
        signed_at: c.signedByHuman ? (c.signedAt ?? new Date().toISOString()) : null,
        status,
      },
      { onConflict: "mission_id" },
    );
    if (error) throw error;
  }

  const a = mission.activation;
  const hasActivation =
    a.partnerCode.trim() ||
    a.hoursConfirmed ||
    a.testPassed ||
    a.testNotes.trim() ||
    a.opsContactName.trim() ||
    a.checkInAt;
  if (hasActivation) {
    const { data: contract } = await sb
      .from("contracts")
      .select("id")
      .eq("mission_id", mission.id)
      .maybeSingle();
    const payload = {
      mission_id: mission.id,
      contract_id: contract?.id ?? null,
      partner_code: a.partnerCode.trim() || null,
      hours_confirmed: a.hoursConfirmed,
      ops_contact_name: a.opsContactName.trim() || null,
      ops_contact_phone: a.opsContactPhone.trim() || null,
      test_passed: a.testPassed,
      test_notes: a.testNotes?.trim() || null,
      check_in_at: a.checkInAt || null,
      activated_at: a.activatedAt || (mission.status === "won" ? new Date().toISOString() : null),
    };
    let { error } = await sb.from("activations").upsert(payload, { onConflict: "mission_id" });
    if (error && /test_notes/i.test(error.message ?? "")) {
      const { test_notes: _notes, ...withoutNotes } = payload;
      ({ error } = await sb.from("activations").upsert(withoutNotes, { onConflict: "mission_id" }));
    }
    if (error) throw error;
  }

  return "synced";
}

export async function insertTask(
  workspaceId: string,
  userId: string,
  input: { missionId: string; title: string; dueAt: string },
): Promise<TaskItem> {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const { data, error } = await sb
    .from("tasks")
    .insert({
      workspace_id: workspaceId,
      mission_id: input.missionId,
      owner_user_id: userId,
      title: input.title.trim(),
      due_at: input.dueAt || null,
      source: "human",
    })
    .select("*")
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    missionId: data.mission_id as string,
    title: data.title as string,
    dueAt: (data.due_at as string) ?? "",
    source: "human",
  };
}

export async function setTaskDone(taskId: string, done: boolean) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error && !optionalTable(error)) throw error;
}

export async function uploadContractPdf(userId: string, missionId: string, file: File) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  const path = `${userId}/${missionId}.pdf`;
  const { error } = await sb.storage.from("contracts").upload(path, file, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function contractPdfUrl(path: string) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.storage.from("contracts").createSignedUrl(path, 180);
  if (error) return null;
  return data.signedUrl;
}

export function generatePartnerCode(name: string, city: string) {
  const slug = `${name} ${city}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LUTRA-${slug || "LOC"}-${suffix}`;
}
