import { parseLooseJson } from "./discovery-extract";

/**
 * Claude API (Anthropic) — tylko po stronie serwera. Klucz w ANTHROPIC_API_KEY (.env.local / Vercel),
 * nigdy w przeglądarce ani w repozytorium.
 */
const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

type Effort = "low" | "medium" | "high";
export type ClaudeConfig = { apiKey: string; model: string; effort: Effort | null };

/** Modele 5.x przyjmują output_config.effort; starszym wysyłamy zapytanie bez niego. */
export function supportsEffort(model: string) {
  return /^claude-(?:opus|sonnet|haiku|fable|mythos)-5(?:-\d+)*$/.test(model);
}

export function resolveClaude(env: Record<string, string | undefined> = process.env): ClaudeConfig | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (apiKey.length < 20 || apiKey.length > 400 || /\s/.test(apiKey)) return null;
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
  if (!/^claude-[a-z0-9.-]{2,60}$/.test(model)) return null;
  const wanted = env.ANTHROPIC_EFFORT?.trim().toLowerCase();
  const effort: Effort = wanted === "medium" || wanted === "high" ? wanted : "low";
  return { apiKey, model, effort: supportsEffort(model) ? effort : null };
}

export type ClaudeResult =
  | { ok: true; data: unknown; model: string; usage: { input: number; output: number } }
  | { ok: false; error: string; status: number };

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
  if (status === 400) return message ? `Claude API odrzucił zapytanie: ${message}` : "Claude API odrzucił zapytanie.";
  return `Claude API: błąd ${status}.`;
}

/** Jedno zapytanie z odpowiedzią w JSON zgodnym ze schematem (structured outputs). */
export async function claudeStructured(
  config: ClaudeConfig,
  input: { system: string; user: string; schema: object; maxTokens?: number; timeoutMs?: number },
  fetcher: typeof fetch = fetch,
): Promise<ClaudeResult> {
  let response: Response;
  try {
    response = await fetcher(MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(input.timeoutMs ?? 110_000),
      body: JSON.stringify({
        model: config.model,
        max_tokens: input.maxTokens ?? 8000,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
        output_config: {
          format: { type: "json_schema", schema: input.schema },
          ...(config.effort ? { effort: config.effort } : {}),
        },
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
    return { ok: false, status: 502, error: claudeError(response.status, payload, config.model) };
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
  };
}
