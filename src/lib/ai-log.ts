import { EXTRACTION_SCHEMA, EXTRACTION_SYSTEM, type ProposalRow } from "./discovery-extract";

export type AiEngine = "claude" | "zen" | "mac" | "manual";

/** Jeden wiersz podglądu: co AI zaproponowało i co handlowiec zrobił. */
export type AiSuggestionRow = {
  key: string;
  label: string;
  group: string;
  /** Zaznaczone domyślnie (CRM uznał za pewne). */
  suggested: boolean;
  /** Wstawione do misji. */
  accepted: boolean;
  /** Wiersz miał ostrzeżenie (brak dowodu, inne zdanie…). */
  warned: boolean;
};

export type AiSuggestion = {
  id: string;
  missionId: string | null;
  userId?: string | null;
  createdAt: string;
  outcome: "applied" | "discarded";
  engine: AiEngine;
  model: string | null;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  speakersKnown: boolean | null;
  rows: AiSuggestionRow[];
};

/** Skrót polecenia i schematu: po zmianie promptu wyniki liczą się osobno. */
function fnv1a(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const PROMPT_VERSION = `p-${fnv1a(EXTRACTION_SYSTEM + JSON.stringify(EXTRACTION_SCHEMA))}`;

export function suggestionRows(rows: ProposalRow[], selected: Set<string>): AiSuggestionRow[] {
  return rows.slice(0, 120).map((row) => ({
    key: row.key.slice(0, 80),
    label: row.label.slice(0, 120),
    group: (row.group ?? "").slice(0, 80),
    suggested: row.checked,
    accepted: selected.has(row.key),
    warned: Boolean(row.warning),
  }));
}

/** Klucz pola bez numeru potrzeby („need:2” → „need”), żeby liczyć jakość per rodzaj pola. */
export function fieldKey(key: string) {
  return key.replace(/:\d+$/, "");
}

/** Ceny w USD za milion tokenów (wejście / wyjście). Nieznany model — bez kosztu. */
const PRICES: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /haiku/i, input: 0.1, output: 0.5 },
  { match: /sonnet/i, input: 2, output: 10 },
  { match: /opus/i, input: 10, output: 50 },
];

export function costUsd(model: string | null, input: number, output: number) {
  const price = model ? PRICES.find((item) => item.match.test(model)) : undefined;
  if (!price) return null;
  return (input * price.input + output * price.output) / 1_000_000;
}

export type FieldQuality = {
  key: string;
  label: string;
  group: string;
  proposed: number;
  accepted: number;
  /** Zaznaczone domyślnie i przyjęte. */
  agreed: number;
  /** Handlowiec odznaczył domyślnie zaznaczone. */
  rejectedSuggested: number;
  /** Handlowiec zaznaczył coś, czego CRM nie zaznaczył (np. bez dowodu). */
  addedUnsuggested: number;
};

export type AiQuality = {
  runs: number;
  applied: number;
  discarded: number;
  fields: FieldQuality[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  avgSeconds: number | null;
  speakersUnknown: number;
};

/** Zbiorczo: akceptacja per pole, koszt i czas. Tylko odczyty zakończone wstawieniem albo odrzuceniem. */
export function aiQuality(list: AiSuggestion[]): AiQuality {
  const fields = new Map<string, FieldQuality>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let priced = false;
  let time = 0;
  let timed = 0;
  for (const run of list) {
    inputTokens += run.inputTokens ?? 0;
    outputTokens += run.outputTokens ?? 0;
    const c = costUsd(run.model, run.inputTokens ?? 0, run.outputTokens ?? 0);
    if (c !== null) {
      cost += c;
      priced = true;
    }
    if (run.durationMs) {
      time += run.durationMs;
      timed += 1;
    }
    for (const row of run.rows) {
      const key = fieldKey(row.key);
      const item = fields.get(key) ?? {
        key,
        label: row.label,
        group: row.group,
        proposed: 0,
        accepted: 0,
        agreed: 0,
        rejectedSuggested: 0,
        addedUnsuggested: 0,
      };
      item.proposed += 1;
      if (row.accepted) item.accepted += 1;
      if (row.suggested && row.accepted) item.agreed += 1;
      if (run.outcome === "applied" && row.suggested && !row.accepted) item.rejectedSuggested += 1;
      if (row.accepted && !row.suggested) item.addedUnsuggested += 1;
      fields.set(key, item);
    }
  }
  return {
    runs: list.length,
    applied: list.filter((run) => run.outcome === "applied").length,
    discarded: list.filter((run) => run.outcome === "discarded").length,
    fields: [...fields.values()].sort((a, b) => b.proposed - a.proposed || a.label.localeCompare(b.label, "pl")),
    inputTokens,
    outputTokens,
    costUsd: priced ? cost : null,
    avgSeconds: timed ? Math.round(time / timed / 100) / 10 : null,
    speakersUnknown: list.filter((run) => run.speakersKnown === false).length,
  };
}

// ---------------------------------------------------------------------------
// Tryb demo: dziennik w przeglądarce (bez Supabase)

const LOCAL_KEY = "lutra-ai-suggestions";

export function readLocalSuggestions(): AiSuggestion[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as AiSuggestion[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLocalSuggestion(entry: AiSuggestion) {
  try {
    const next = [entry, ...readLocalSuggestions()].slice(0, 200);
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    // Pełna pamięć albo prywatne okno — dziennik jakości to dodatek, nic się nie psuje.
  }
}

// ---------------------------------------------------------------------------
// Zapis i odczyt (Supabase po migracji v8, inaczej przeglądarka)

type Row = Record<string, unknown>;

function fromRow(row: Row): AiSuggestion {
  return {
    id: String(row.id),
    missionId: (row.mission_id as string | null) ?? null,
    userId: (row.user_id as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    outcome: row.outcome === "discarded" ? "discarded" : "applied",
    engine: (["claude", "zen", "mac", "manual"].includes(String(row.engine)) ? row.engine : "manual") as AiEngine,
    model: (row.model as string | null) ?? null,
    promptVersion: String(row.prompt_version ?? ""),
    inputTokens: typeof row.input_tokens === "number" ? row.input_tokens : null,
    outputTokens: typeof row.output_tokens === "number" ? row.output_tokens : null,
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    speakersKnown: typeof row.speakers_known === "boolean" ? row.speakers_known : null,
    rows: Array.isArray(row.rows) ? (row.rows as AiSuggestionRow[]) : [],
  };
}

/** Zapisuje odczyt rozmowy z decyzjami handlowca. Błąd zapisu nie przerywa pracy (to statystyka). */
export async function saveAiSuggestion(entry: AiSuggestion, workspaceId: string | undefined) {
  const { getSupabase, isSupabaseConfigured } = await import("./supabase");
  const sb = getSupabase();
  if (!isSupabaseConfigured() || !sb || !workspaceId) {
    writeLocalSuggestion(entry);
    return;
  }
  const { error } = await sb.from("ai_suggestions").insert({
    workspace_id: workspaceId,
    mission_id: entry.missionId,
    outcome: entry.outcome,
    engine: entry.engine,
    model: entry.model,
    prompt_version: entry.promptVersion,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    duration_ms: entry.durationMs,
    speakers_known: entry.speakersKnown,
    rows: entry.rows,
  });
  if (error) console.warn("[ai_suggestions] zapis pominięty:", error.message);
}

export async function loadAiSuggestions(sinceIso: string | null): Promise<{ list: AiSuggestion[]; missingTable: boolean }> {
  const { getSupabase, isSupabaseConfigured, isMissingCrmTable } = await import("./supabase");
  const sb = getSupabase();
  if (!isSupabaseConfigured() || !sb) {
    const list = readLocalSuggestions();
    return { list: sinceIso ? list.filter((item) => item.createdAt >= sinceIso) : list, missingTable: false };
  }
  let query = sb.from("ai_suggestions").select("*").order("created_at", { ascending: false }).limit(2000);
  if (sinceIso) query = query.gte("created_at", sinceIso);
  const { data, error } = await query;
  if (error) return { list: [], missingTable: isMissingCrmTable(error) };
  return { list: ((data ?? []) as Row[]).map(fromRow), missingTable: false };
}
