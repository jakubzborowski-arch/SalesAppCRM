import { parseLooseJson } from "./discovery-extract";

/**
 * Claude API (Anthropic) — tylko po stronie serwera. Klucz w ANTHROPIC_API_KEY (.env.local / Vercel),
 * nigdy w przeglądarce ani w repozytorium.
 */
const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

type Effort = "low" | "medium" | "high";
export type ClaudeConfig = { apiKey: string; model: string; effort: Effort | null; workspaceId?: string };

/**
 * Klucz, który wygląda na Claude, ale nie jest kluczem API: token z `claude setup-token` (sk-ant-oat…)
 * służy tylko Claude Code w ramach subskrypcji, a klucz administracyjny (sk-ant-admin…) — tylko Admin API.
 */
export function claudeKeyProblem(env: Record<string, string | undefined> = process.env): "oauth_token" | "admin_key" | null {
  const key = env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (/^sk-ant-oat/i.test(key)) return "oauth_token";
  if (/^sk-ant-admin/i.test(key)) return "admin_key";
  return null;
}

/** Modele 5.x przyjmują output_config.effort; starszym wysyłamy zapytanie bez niego. */
export function supportsEffort(model: string) {
  return /^claude-(?:opus|sonnet|haiku|fable|mythos)-5(?:-\d+)*$/.test(model);
}

export function resolveClaude(env: Record<string, string | undefined> = process.env): ClaudeConfig | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (apiKey.length < 20 || apiKey.length > 400 || /\s/.test(apiKey) || claudeKeyProblem(env)) return null;
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
  if (!/^claude-[a-z0-9.-]{2,60}$/.test(model)) return null;
  const wanted = env.ANTHROPIC_EFFORT?.trim().toLowerCase();
  const effort: Effort = wanted === "medium" || wanted === "high" ? wanted : "low";
  // Klucz bez przypisanego workspace'u wymaga nagłówka anthropic-workspace-id (Console → Workspaces).
  const workspace = env.ANTHROPIC_WORKSPACE_ID?.trim() ?? "";
  const workspaceId = /^wrkspc_[A-Za-z0-9]{6,64}$/.test(workspace) ? workspace : undefined;
  return { apiKey, model, effort: supportsEffort(model) ? effort : null, ...(workspaceId ? { workspaceId } : {}) };
}

export type ClaudeResult =
  | { ok: true; data: unknown; model: string; usage: { input: number; output: number }; structured: boolean }
  | { ok: false; error: string; status: number };

/** Błąd 400, gdy schemat jest za duży/złożony dla structured outputs (gramatyka ma limit rozmiaru). */
export function isSchemaTooComplex(status: number, payload: unknown) {
  if (status !== 400) return false;
  return /grammar is too large|schema is too (?:large|complex)|simplify your (?:tool )?schemas?|too many (?:strict|optional)/i.test(
    apiMessage(payload),
  );
}

/** Schematy, których Claude API nie przyjął — kolejne zapytania od razu idą ścieżką „JSON w poleceniu”. */
let rejectedSchemas = new WeakSet<object>();

/** Tylko dla testów: zapomina odrzucone schematy. */
export function forgetRejectedSchemas() {
  rejectedSchemas = new WeakSet<object>();
}

function apiMessage(payload: unknown) {
  const message = (payload as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" ? message.slice(0, 240) : "";
}

export function claudeError(status: number, payload: unknown, model: string) {
  const message = apiMessage(payload);
  if (status === 401) return "Claude API odrzucił klucz. Sprawdź ANTHROPIC_API_KEY w .env.local.";
  if (status === 403) return "Ten klucz Claude API nie ma dostępu do modelu albo funkcji.";
  if (status === 404) return `Claude API nie zna modelu „${model}”. Sprawdź ANTHROPIC_MODEL w .env.local.`;
  if (status === 413) return "Rozmowa jest za długa na jedno zapytanie. Skróć transkrypt.";
  if (status === 429) return "Za dużo zapytań do Claude API. Spróbuj za minutę.";
  if (status === 529 || status === 503) return "Claude jest teraz przeciążony. Spróbuj za chwilę.";
  if (/credit balance/i.test(message)) return "Brak środków na koncie Claude API (Console → Billing).";
  if (/workspace/i.test(message)) {
    return "Klucz nie jest przypisany do workspace'u. Utwórz klucz z wybranym workspace (Console → API keys) albo dopisz ANTHROPIC_WORKSPACE_ID w .env.local.";
  }
  if (status === 400) return message ? `Claude API odrzucił zapytanie: ${message}` : "Claude API odrzucił zapytanie.";
  return `Claude API: błąd ${status}.`;
}

/**
 * Jedno zapytanie z odpowiedzią w JSON zgodnym ze schematem (structured outputs).
 * Gdy API odrzuci schemat jako za złożony, a podano `jsonFallback` (opis kształtu JSON w poleceniu),
 * zapytanie idzie jeszcze raz bez output_config.format, a JSON czytamy z tekstu odpowiedzi.
 */
export async function claudeStructured(
  config: ClaudeConfig,
  input: { system: string; user: string; schema: object; maxTokens?: number; timeoutMs?: number; jsonFallback?: string },
  fetcher: typeof fetch = fetch,
): Promise<ClaudeResult> {
  const fallback = input.jsonFallback?.trim();
  if (fallback && rejectedSchemas.has(input.schema)) return claudeRequest(config, input, false, fetcher);
  const first = await claudeRequest(config, input, true, fetcher);
  if (first.ok || !fallback || !("schemaRejected" in first)) return stripFlag(first);
  rejectedSchemas.add(input.schema);
  return claudeRequest(config, input, false, fetcher);
}

function stripFlag(result: ClaudeResult & { schemaRejected?: true }): ClaudeResult {
  if (result.ok) return result;
  return { ok: false, error: result.error, status: result.status };
}

async function claudeRequest(
  config: ClaudeConfig,
  input: { system: string; user: string; schema: object; maxTokens?: number; timeoutMs?: number; jsonFallback?: string },
  structured: boolean,
  fetcher: typeof fetch,
): Promise<ClaudeResult & { schemaRejected?: true }> {
  const system = structured ? input.system : `${input.system}\n\n${input.jsonFallback ?? ""}`.trim();
  const outputConfig = {
    ...(structured ? { format: { type: "json_schema", schema: input.schema } } : {}),
    ...(config.effort ? { effort: config.effort } : {}),
  };
  let response: Response;
  try {
    response = await fetcher(MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        ...(config.workspaceId ? { "anthropic-workspace-id": config.workspaceId } : {}),
      },
      signal: AbortSignal.timeout(input.timeoutMs ?? 110_000),
      body: JSON.stringify({
        model: config.model,
        max_tokens: input.maxTokens ?? 8000,
        system,
        messages: [{ role: "user", content: input.user }],
        ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
      }),
    });
  } catch (err) {
    const timeout = (err as { name?: string } | null)?.name === "TimeoutError";
    return {
      ok: false,
      status: timeout ? 504 : 503,
      error: timeout ? "Claude nie odpowiedział na czas. Spróbuj jeszcze raz." : "Brak połączenia z Claude API.",
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    model?: string;
    stop_reason?: string;
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  if (!response.ok) {
    const error = claudeError(response.status, payload, config.model);
    if (structured && isSchemaTooComplex(response.status, payload)) return { ok: false, status: 502, error, schemaRejected: true };
    return { ok: false, status: 502, error };
  }
  if (payload?.stop_reason === "refusal") {
    return { ok: false, status: 422, error: "Claude odmówił odczytu tej rozmowy." };
  }
  if (payload?.stop_reason === "max_tokens") {
    return { ok: false, status: 502, error: "Odpowiedź Claude została ucięta. Spróbuj jeszcze raz." };
  }
  const text = (payload?.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = parseLooseJson(text);
  }
  if (!data || typeof data !== "object") {
    return { ok: false, status: 502, error: "Claude oddał odpowiedź, której nie da się odczytać. Spróbuj jeszcze raz." };
  }
  return {
    ok: true,
    data,
    model: payload?.model ?? config.model,
    usage: { input: payload?.usage?.input_tokens ?? 0, output: payload?.usage?.output_tokens ?? 0 },
    structured,
  };
}
