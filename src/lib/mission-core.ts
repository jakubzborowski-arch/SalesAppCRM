import { selectIn } from "./fetch-all";
import { dateOrNull, persistNeedId, uuidOrNull } from "./sql-coerce";
import { ACTIVATION_ITEMS, CONTRACT_ITEMS, RESEARCH_ITEMS_BY_SEGMENT, ROLLOUT_ITEMS } from "./playbook";
import { getSupabase, isMissingCrmTable } from "./supabase";
import { agreementFormOf } from "./terms";
import type {
  ActivationRecord,
  AgreementForm,
  ContractRecord,
  Mission,
  Need,
  PartnerSegment,
  TaskItem,
} from "./types";

function optionalTable(error: { code?: string; message?: string } | null) {
  return isMissingCrmTable(error) || error?.code === "PGRST205" || error?.code === "42P01";
}

const CHECKLIST_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    Object.values(RESEARCH_ITEMS_BY_SEGMENT)
      .flat()
      .map((i) => [`research:${i.key}`, i.label]),
  ),
  ...Object.fromEntries(ROLLOUT_ITEMS.map((i) => [i.key, i.label])),
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
      selectIn(sb, "needs", "mission_id", missionIds),
      selectIn(sb, "decision_context", "mission_id", missionIds, "mission_id"),
      selectIn(sb, "mission_checklist_items", "mission_id", missionIds),
      selectIn(sb, "mission_objections", "mission_id", missionIds),
      selectIn(sb, "offers", "mission_id", missionIds),
      selectIn(sb, "contracts", "mission_id", missionIds),
      selectIn(sb, "activations", "mission_id", missionIds),
      selectIn(sb, "tasks", "mission_id", missionIds),
    ]);
  tasksRes.data.sort((a, b) => String(a.due_at ?? "").localeCompare(String(b.due_at ?? "")));

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
      category: row.category as Need["category"],
      title: (row.title as string) || "",
      description: (row.description as string) ?? "",
      priority: (row.priority as number | null) ?? null,
      quote: (row.quote as string) ?? undefined,
      expectedResult: (row.expected_result as string) ?? undefined,
      constraints: (row.constraints as string) ?? undefined,
      status: row.status as Need["status"],
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
    slot.selectedVariant = row.variant as Mission["selectedVariant"];
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
      sentAt: (row.sent_at as string) ?? undefined,
      // Przed v6 „podpisana” znaczyło podpis handlowca po rozmowie z partnerem.
      partnerSignedAt:
        (row.partner_signed_at as string) ??
        (row.status === "signed" && !("partner_signed_at" in row) ? ((row.signed_at as string) ?? undefined) : undefined),
      signedDocumentPath: (row.signed_document_path as string) ?? undefined,
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

  const tasks: TaskItem[] = (tasksRes.data ?? []).map(taskFromRow);

  return { byMission, tasks };
}

type Row = Record<string, unknown>;

/** Tabele misji, które zapisuje się razem z misją (ta sama lista co w `save_mission_bundle`). */
export type CoreTable =
  | "decision_context"
  | "needs"
  | "mission_checklist_items"
  | "mission_objections"
  | "offers"
  | "contracts"
  | "activations"
  | "tasks";

/**
 * Jedna operacja zapisu misji. Te same operacje wykonuje funkcja `save_mission_bundle`
 * (jedna transakcja, v8) albo — w starszej bazie — klient, zapytanie po zapytaniu.
 */
export type BundleOp = {
  table: CoreTable;
  op: "upsert" | "insert" | "update" | "delete";
  rows?: Row[];
  set?: Row;
  ids?: string[];
  /** Kolumna = id oferty/umowy tej misji, odczytane w chwili zapisu (po wcześniejszych operacjach). */
  refs?: Record<string, "offers" | "contracts">;
  /** Kolumny, których może brakować w starszej bazie — wtedy zapis bez nich. */
  optional?: string[];
  /** Zapisane wiersze wracają pod tym kluczem. */
  key?: string;
  /** Dokładnie jeden wiersz (jak `.single()`). */
  single?: boolean;
  /** Wiersze dla bazy bez v6 (umowa bez etapów podpisu) — gdy baza odrzuci nowe kolumny albo status. */
  legacyRows?: Row[];
  /** Tylko zapis po staremu: błąd nie przerywa zapisu (jak dotąd przy usuwaniu potrzeb). */
  bestEffort?: boolean;
};

const NEXT_STEP_KEY = "next_step";

export type PlannedMissionCore = {
  status: "planned";
  ops: BundleOp[];
  /** Zadanie „następny krok”: znane już z odczytu albo zwrócone przez zapis. */
  nextStep: { task: TaskItem | null } | { key: string };
  /**
   * Pliki umowy zastąpione nowymi. Storage nie wchodzi do transakcji: w jednej transakcji kasujemy je
   * dopiero po udanym zapisie, po staremu — zaraz po zapisie umowy.
   */
  staleFiles: string[];
};

export type MissionCorePlan = { status: "skipped" } | PlannedMissionCore;

export type CoreSyncResult = { status: "synced" | "skipped"; nextStepTask: TaskItem | null };

function taskFromRow(row: Record<string, unknown>): TaskItem {
  return {
    id: row.id as string,
    missionId: row.mission_id as string,
    title: row.title as string,
    dueAt: (row.due_at as string) ?? "",
    doneAt: (row.done_at as string) ?? undefined,
    source: row.source as TaskItem["source"],
  };
}

/**
 * Plan zapisu tabel misji: odczyty, których zapis potrzebuje (kto i kiedy potwierdził fakt,
 * daty odhaczenia, zatwierdzenie oferty, poprzednie pliki umowy, otwarte kroki), i lista operacji.
 * Sam niczego nie zapisuje.
 */
export async function planMissionCore(
  mission: Mission,
  workspaceId: string,
  userId: string,
  segment: PartnerSegment = "venue",
): Promise<MissionCorePlan> {
  const sb = getSupabase();
  if (!sb) return { status: "skipped" };
  const ownerId = uuidOrNull(mission.ownerUserId) ?? userId;
  const now = new Date().toISOString();
  const d = mission.decision;
  const makerId = uuidOrNull(d.decisionMakerId);
  const c = mission.contract;
  const hasContract =
    c.companyName.trim() ||
    c.nip.trim() ||
    c.signedByHuman ||
    c.documentPath ||
    c.startAt ||
    c.endAt ||
    c.sentAt ||
    c.partnerSignedAt;

  const [makerRes, needsRes, checklistRes, libraryRes, offerRes, tasksRes, previousRes] = await Promise.all([
    makerId ? sb.from("partner_contacts").select("id").eq("id", makerId).maybeSingle() : null,
    sb.from("needs").select("id, confirmed_at, confirmed_by").eq("mission_id", mission.id),
    sb.from("mission_checklist_items").select("stage, item_key, done_at").eq("mission_id", mission.id),
    mission.selectedVariant
      ? sb
          .from("offer_library")
          .select("id")
          .eq("segment", segment)
          .eq("variant", mission.selectedVariant)
          .maybeSingle()
      : null,
    mission.selectedVariant
      ? sb.from("offers").select("variant, approved_at, approved_by").eq("mission_id", mission.id).maybeSingle()
      : null,
    sb
      .from("tasks")
      .select("*")
      .eq("mission_id", mission.id)
      .eq("source", "next_step")
      .order("done_at", { ascending: false, nullsFirst: true }),
    hasContract ? sb.from("contracts").select("*").eq("mission_id", mission.id).maybeSingle() : null,
  ]);
  // Baza bez tabel misji (przed v3): misja żyje tylko w `details`.
  if (optionalTable(needsRes.error) || optionalTable(tasksRes.error)) return { status: "skipped" };
  if (needsRes.error) throw needsRes.error;
  if (tasksRes.error) throw tasksRes.error;

  const ops: BundleOp[] = [];
  ops.push({
    table: "decision_context",
    op: "upsert",
    rows: [
      {
        mission_id: mission.id,
        problem: d.problem || null,
        expected_result: d.expectedResult || null,
        constraint_summary: d.constraintSummary || null,
        decision_maker_contact_id: (makerRes?.data?.id as string) ?? null,
        decision_deadline: d.decisionDeadline || null,
        previous_attempts: d.previousAttempts || null,
        next_step: d.nextStep || null,
      },
    ],
  });

  const existingNeeds = (needsRes.data ?? []) as Row[];
  // Kto i kiedy potwierdził fakt — zostaje przy kolejnych zapisach, nie przeskakuje na „teraz”.
  const confirmedBefore = new Map(
    existingNeeds
      .filter((n) => n.confirmed_at)
      .map((n) => [n.id as string, { at: n.confirmed_at as string, by: (n.confirmed_by as string | null) ?? null }]),
  );
  const keep = new Set(mission.needs.map((n) => persistNeedId(n.id)));
  const stale = existingNeeds.map((n) => n.id as string).filter((id) => !keep.has(id));
  if (stale.length) ops.push({ table: "needs", op: "delete", ids: stale, bestEffort: true });
  if (mission.needs.length) {
    ops.push({
      table: "needs",
      op: "upsert",
      rows: mission.needs.map((need) => {
        const id = persistNeedId(need.id);
        const before = confirmedBefore.get(id);
        return {
          id,
          mission_id: mission.id,
          category: need.category,
          title: need.title || null,
          description: need.description || null,
          priority: need.priority,
          expected_result: need.expectedResult || null,
          constraints: need.constraints || null,
          quote: need.quote || null,
          status: need.confirmed ? "fact" : need.status,
          confirmed_by: need.confirmed ? (before ? before.by : userId) : null,
          confirmed_at: need.confirmed ? (before?.at ?? now) : null,
          source: "manual",
        };
      }),
    });
  }

  const doneBefore = new Map(
    ((checklistRes.data ?? []) as Row[])
      .filter((row) => row.done_at)
      .map((row) => [`${row.stage}:${row.item_key}`, row.done_at as string]),
  );
  const checklistRows = Object.entries(mission.checklist).map(([fullKey, isDone]) => {
    const [stage, ...rest] = fullKey.split(":");
    const itemKey = rest.join(":");
    return {
      mission_id: mission.id,
      stage,
      item_key: itemKey,
      label: CHECKLIST_LABELS[fullKey] ?? itemKey,
      is_done: isDone,
      done_at: isDone ? (doneBefore.get(fullKey) ?? now) : null,
    };
  });
  if (checklistRows.length) ops.push({ table: "mission_checklist_items", op: "upsert", rows: checklistRows });

  if (mission.objections.length) {
    ops.push({
      table: "mission_objections",
      op: "upsert",
      rows: mission.objections.map((item) => ({
        mission_id: mission.id,
        library_key: item.key,
        checked: item.checked,
        argument_worked: item.argumentWorked,
      })),
    });
  }

  if (mission.selectedVariant) {
    const existingOffer = (offerRes?.data ?? null) as Row | null;
    // Zatwierdzenie tego samego wariantu zachowuje pierwotną datę i osobę.
    const keepApproval =
      mission.offerApproved && existingOffer?.approved_at && existingOffer.variant === mission.selectedVariant;
    const status = mission.offerSentAt ? "sent" : mission.offerApproved ? "approved" : "draft";
    ops.push({
      table: "offers",
      op: "upsert",
      rows: [
        {
          mission_id: mission.id,
          library_id: (libraryRes?.data?.id as string) ?? null,
          variant: mission.selectedVariant,
          custom_terms: {
            constraints: mission.decision.constraintSummary,
            nextStep: mission.decision.nextStep,
            // Ustalone warunki (zniżka, miejsce, cykl, pilotaż) — do odczytu także poza CRM.
            segment,
            terms: mission.terms,
            period: { from: mission.contract.startAt || null, to: mission.contract.endAt || null },
            agreementForm: agreementFormOf(mission),
          },
          recommended_by: "human",
          approved_by: mission.offerApproved
            ? keepApproval
              ? ((existingOffer?.approved_by as string | null) ?? null)
              : userId
            : null,
          approved_at: mission.offerApproved ? (keepApproval ? (existingOffer?.approved_at as string) : now) : null,
          sent_at: mission.offerSentAt || null,
          status,
        },
      ],
    });
  }

  const nextStep = planNextStep(mission, workspaceId, ownerId, (tasksRes.data ?? []) as Row[], now);
  ops.push(...nextStep.ops);

  let staleFiles: string[] = [];
  if (hasContract) {
    const previous = (previousRes?.data ?? null) as Row | null;
    const status = contractStatus(c, agreementFormOf(mission));
    const base = {
      mission_id: mission.id,
      company_name: c.companyName.trim() || null,
      nip: c.nip.trim() || null,
      address: c.address.trim() || null,
      start_at: c.startAt || null,
      end_at: c.endAt || null,
      change_rules: c.changeRules.trim() || null,
      signed_by_human: c.signedByHuman,
      document_path: c.documentPath || null,
      signed_at: c.signedByHuman ? (c.signedAt ?? now) : null,
    };
    ops.push({
      table: "contracts",
      op: "upsert",
      refs: { offer_id: "offers" },
      optional: ["sent_at", "partner_signed_at", "signed_document_path"],
      rows: [
        {
          ...base,
          sent_at: c.sentAt ?? null,
          partner_signed_at: c.partnerSignedAt ?? null,
          signed_document_path: c.signedDocumentPath ?? null,
          status,
        },
      ],
      // Baza bez v6: zapisujemy po staremu (bez etapów podpisu).
      legacyRows: [{ ...base, status: status === "signed" ? "signed" : c.documentPath ? "ready" : "draft" }],
    });
    // Zastąpione pliki PDF nie zostają w Storage jako sieroty.
    staleFiles = [previous?.document_path, previous?.signed_document_path].filter(
      (path): path is string =>
        typeof path === "string" &&
        !path.startsWith("local/") &&
        path !== c.documentPath &&
        path !== c.signedDocumentPath,
    );
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
    ops.push({
      table: "activations",
      op: "upsert",
      refs: { contract_id: "contracts" },
      optional: ["test_notes"],
      rows: [
        {
          mission_id: mission.id,
          partner_code: a.partnerCode.trim() || null,
          hours_confirmed: a.hoursConfirmed,
          ops_contact_name: a.opsContactName.trim() || null,
          ops_contact_phone: a.opsContactPhone.trim() || null,
          test_passed: a.testPassed,
          test_notes: a.testNotes?.trim() || null,
          check_in_at: a.checkInAt || null,
          activated_at: a.activatedAt || (mission.status === "won" ? now : null),
        },
      ],
    });
  }

  return { status: "planned", ops, nextStep: nextStep.result, staleFiles };
}

/**
 * Zadanie „następny krok” misji. Gdy poprzedni krok jest już odhaczony, a w misji
 * pojawia się nowy, dopisujemy nowe zadanie (historia kroków zostaje).
 * Przegrana albo brak dopasowania zamyka otwarte kroki.
 */
function planNextStep(
  mission: Mission,
  workspaceId: string,
  ownerId: string,
  rows: Row[],
  now: string,
): { ops: BundleOp[]; result: PlannedMissionCore["nextStep"] } {
  const title = mission.nextStepLabel.trim();
  // Przegrana, brak dopasowania albo pauza bez terminu powrotu: otwarte kroki się zamykają.
  const closing =
    mission.status === "lost" ||
    mission.status === "no_fit" ||
    (mission.status !== "active" && mission.status !== "won" && !title);
  const open = rows.filter((row) => !row.done_at);

  if (closing) {
    const ops: BundleOp[] = open.length
      ? [{ table: "tasks", op: "update", set: { done_at: now }, ids: open.map((row) => row.id as string) }]
      : [];
    return { ops, result: { task: null } };
  }

  if (!title) return { ops: [], result: { task: null } };
  const dueAt = dateOrNull(mission.nextStepAt);
  const current = open[0];

  if (current) {
    if (current.title === title && (current.due_at ?? null) === dueAt) {
      return { ops: [], result: { task: taskFromRow(current) } };
    }
    return {
      ops: [
        {
          table: "tasks",
          op: "update",
          set: { title, due_at: dueAt },
          ids: [current.id as string],
          key: NEXT_STEP_KEY,
          single: true,
        },
      ],
      result: { key: NEXT_STEP_KEY },
    };
  }

  const alreadyDone = rows.some((row) => row.title === title && (row.due_at ?? null) === dueAt);
  if (alreadyDone) return { ops: [], result: { task: null } };

  return {
    ops: [
      {
        table: "tasks",
        op: "insert",
        rows: [
          {
            workspace_id: workspaceId,
            mission_id: mission.id,
            owner_user_id: ownerId,
            title,
            due_at: dueAt,
            source: "next_step",
          },
        ],
        key: NEXT_STEP_KEY,
        single: true,
      },
    ],
    result: { key: NEXT_STEP_KEY },
  };
}

/** Zadanie „następny krok” po zapisie: z odczytu planu albo z wierszy zwróconych przez zapis. */
export function nextStepTaskOf(
  plan: PlannedMissionCore,
  returned: Record<string, Row[] | undefined> | null | undefined,
): TaskItem | null {
  if ("task" in plan.nextStep) return plan.nextStep.task;
  const row = returned?.[plan.nextStep.key]?.[0];
  return row ? taskFromRow(row) : null;
}

/** Operacje w postaci dla `save_mission_bundle` (bez pól, które zna tylko zapis po staremu). */
export function bundlePayload(ops: BundleOp[], legacy = false) {
  return ops.map((op) => {
    const { legacyRows, bestEffort: _bestEffort, ...rest } = op;
    return legacy && legacyRows ? { ...rest, rows: legacyRows } : rest;
  });
}

/** Czy baza odrzuciła umowę w nowym formacie (brak v6) — wtedy powtórka z `legacyRows`. */
export function needsLegacyRows(ops: BundleOp[], error: { message?: string } | null) {
  return Boolean(error && ops.some((op) => op.legacyRows) && /contracts_status_check/.test(error.message ?? ""));
}

const ON_CONFLICT: Partial<Record<CoreTable, string>> = {
  mission_checklist_items: "mission_id,stage,item_key",
  mission_objections: "mission_id,library_key",
  offers: "mission_id",
  contracts: "mission_id",
  activations: "mission_id",
};

function pick(row: Row | undefined, keys: string[]): Row {
  return Object.fromEntries(keys.filter((k) => row && k in row).map((k) => [k, row![k]]));
}

function omit(row: Row, keys: string[]): Row {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
}

/**
 * Zapis po staremu (baza bez `save_mission_bundle`): te same operacje, zapytanie po zapytaniu.
 * Nie jest atomowy — dlatego wersję misji domyka dopiero `persistMission`.
 */
export async function executeMissionCore(
  missionId: string,
  ops: BundleOp[],
  staleFiles: string[] = [],
): Promise<{ status: "synced" | "skipped"; returned: Record<string, Row[]> }> {
  const sb = getSupabase();
  const returned: Record<string, Row[]> = {};
  if (!sb) return { status: "skipped", returned };
  for (const op of ops) {
    if ((op.op === "upsert" || op.op === "insert") && !op.rows?.length) continue;
    let rows = op.rows;
    if (rows && op.refs) {
      for (const [column, table] of Object.entries(op.refs)) {
        const { data } = await sb.from(table).select("id").eq("mission_id", missionId).maybeSingle();
        const id = (data?.id as string) ?? null;
        rows = rows.map((row) => ({ ...row, [column]: id }));
      }
    }
    const write = async (payload: Row[] | undefined) => {
      const q = sb.from(op.table);
      if (op.op === "delete") return q.delete().in("id", op.ids ?? []);
      if (op.op === "update") {
        const updated = q.update(op.set ?? {}).in("id", op.ids ?? []);
        return op.key ? (op.single ? updated.select("*").single() : updated.select("*")) : updated;
      }
      const conflict = ON_CONFLICT[op.table];
      const written =
        op.op === "insert"
          ? q.insert(payload ?? [])
          : q.upsert(payload ?? [], conflict ? { onConflict: conflict } : undefined);
      return op.key ? (op.single ? written.select("*").single() : written.select("*")) : written;
    };
    let { data, error } = await write(rows);
    const message = error?.message ?? "";
    const optional = op.optional ?? [];
    const mentionsOptional = optional.some((column) => new RegExp(column, "i").test(message));
    if (error && op.legacyRows && (mentionsOptional || message.includes(`${op.table}_status_check`))) {
      // Baza bez nowych kolumn albo statusów: wiersze w starym formacie (z odczytanymi odwołaniami).
      const refKeys = Object.keys(op.refs ?? {});
      ({ data, error } = await write(op.legacyRows.map((row, i) => ({ ...row, ...pick(rows?.[i], refKeys) }))));
    } else if (error && mentionsOptional && rows) {
      ({ data, error } = await write(rows.map((row) => omit(row, optional))));
    }
    if (error) {
      if (op.table === "decision_context" && optionalTable(error)) return { status: "skipped", returned };
      if (op.bestEffort) continue;
      throw error;
    }
    if (op.key) {
      const list = Array.isArray(data) ? (data as Row[]) : data ? [data as Row] : [];
      returned[op.key] = [...(returned[op.key] ?? []), ...list];
    }
    // Bez transakcji umowa wskazuje nowe pliki już teraz — stare kasujemy od razu (jak dotąd),
    // inaczej nieudany dalszy zapis zostawiłby je w Storage bez odwołania.
    if (op.table === "contracts") await removeContractFiles(staleFiles);
  }
  return { status: "synced", returned };
}

/** Tabele misji po staremu (bez jednej transakcji): plan, potem zapytanie po zapytaniu. */
export async function syncMissionCore(
  mission: Mission,
  workspaceId: string,
  userId: string,
  segment: PartnerSegment = "venue",
  planned?: MissionCorePlan,
): Promise<CoreSyncResult> {
  const plan = planned ?? (await planMissionCore(mission, workspaceId, userId, segment));
  if (plan.status === "skipped") return { status: "skipped", nextStepTask: null };
  const { status, returned } = await executeMissionCore(mission.id, plan.ops, plan.staleFiles);
  if (status === "skipped") return { status, nextStepTask: null };
  return { status, nextStepTask: nextStepTaskOf(plan, returned) };
}

/** Sprzątanie zastąpionych plików umowy — najlepszym wysiłkiem, gdy umowa już wskazuje nowe pliki. */
export async function removeContractFiles(paths: string[]) {
  const sb = getSupabase();
  if (!sb || !paths.length) return;
  try {
    await sb.storage.from("contracts").remove(paths);
  } catch {
    // Sprzątanie jest najlepszym wysiłkiem — zapis umowy już się udał.
  }
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

/**
 * Status umowy wynika z faktów: dokument (albo mail z warunkami), wysyłka, potwierdzenie obu stron.
 * Porozumienie mailowe nie ma PDF — „wysłana” to mail z warunkami, „podpis partnera” to jego odpowiedź.
 */
export function contractStatus(c: ContractRecord, form: AgreementForm = "contract"): ContractRecord["status"] {
  if (c.signedByHuman && c.partnerSignedAt) return "signed";
  if (c.partnerSignedAt) return "partner_signed";
  if (c.sentAt) return "sent";
  if (form === "contract" && c.documentPath) return "ready";
  return "draft";
}

export async function uploadContractPdf(userId: string, missionId: string, file: File) {
  const sb = getSupabase();
  if (!sb) throw new Error("Brak klienta Supabase.");
  // Każda wersja PDF ma własną nazwę: nowy plik nigdy nie nadpisuje starego (także cudzego
  // albo starego, niepodpiętego pliku, którego RLS już nie pozwala ruszyć).
  const type = file.type === "image/png" || file.type === "image/jpeg" ? file.type : "application/pdf";
  const ext = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "pdf";
  const path = `${userId}/${missionId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("contracts").upload(path, file, {
    contentType: type,
    upsert: false,
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
