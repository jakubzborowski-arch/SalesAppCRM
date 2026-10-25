import { claudeKeyProblem, claudeStructured, resolveClaude } from "@/lib/claude-api";
import {
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM,
  JSON_ONLY,
  MAX_SOURCE_CHARS,
  extractionUserMessage,
  hasMaterial,
  parseLooseJson,
  sanitizeContext,
} from "@/lib/discovery-extract";
import { completeRaw, resolveDraftBackend } from "@/lib/draft-complete";
import { PROMPT_VERSION } from "@/lib/ai-log";
import { AI_DENIED, aiAccess, logServer, quotaMessage, takeAiQuota } from "@/lib/ai-access";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Największe ciało zapytania (transkrypty + notatka), zanim w ogóle zaczniemy je czytać. */
const MAX_BODY_BYTES = 700_000;
/** Mały lokalny model (Ollama) ma krótkie okno — wysyłamy mniej tekstu i podnosimy num_ctx. */
const LOCAL_SOURCE_CHARS = 60_000;
type Engine =
  | { engine: "claude"; claude: NonNullable<ReturnType<typeof resolveClaude>> }
  | { engine: "mac" | "zen" };

function engineFor(request: Request): Engine | null {
  const claude = resolveClaude();
  if (claude) return { engine: "claude", claude };
  const backend = resolveDraftBackend(request);
  return backend ? { engine: backend.place } : null;
}

async function access(request: Request, engine: Engine) {
  return aiAccess(request, engine.engine);
}

/** Zamiast ogólnego „brak klucza” mówimy wprost, że w .env.local jest nie ten token. */
const KEY_PROBLEM: Record<NonNullable<ReturnType<typeof claudeKeyProblem>>, string> = {
  oauth_token:
    "W ANTHROPIC_API_KEY jest token z „claude setup-token” (sk-ant-oat…). To token Claude Code w ramach subskrypcji — Claude API go nie przyjmie. Utwórz klucz API w Claude Console (sk-ant-api…).",
  admin_key: "W ANTHROPIC_API_KEY jest klucz administracyjny (sk-ant-admin…). Do odczytu rozmów potrzebny jest zwykły klucz API.",
};

export async function GET(request: Request) {
  const engine = engineFor(request);
  const problem = claudeKeyProblem();
  if (!engine) return Response.json({ enabled: false, reason: problem ?? "no_engine" });
  const allowed = await access(request, engine);
  if (!allowed.ok) return Response.json({ enabled: false, reason: allowed.reason });
  return Response.json({
    enabled: true,
    engine: engine.engine,
    model: engine.engine === "claude" ? engine.claude.model : null,
    limit: engine.engine === "mac" ? LOCAL_SOURCE_CHARS : MAX_SOURCE_CHARS,
  });
}

export async function POST(request: Request) {
  const engine = engineFor(request);
  if (!engine) {
    const problem = claudeKeyProblem();
    return Response.json(
      {
        error: problem
          ? KEY_PROBLEM[problem]
          : "AI nie jest podłączone na tym serwerze. Dodaj ANTHROPIC_API_KEY albo użyj ścieżki przez Claude.",
      },
      { status: 404 },
    );
  }
  const allowed = await access(request, engine);
  if (!allowed.ok) return Response.json({ error: AI_DENIED[allowed.reason] }, { status: allowed.reason === "login" ? 401 : 403 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return Response.json({ error: "Rozmowa jest za długa. Skróć transkrypt." }, { status: 413 });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "Nie udało się odczytać zapytania." }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Rozmowa jest za długa. Skróć transkrypt." }, { status: 413 });
  }
  let body: { context?: unknown };
  try {
    body = JSON.parse(raw) as { context?: unknown };
  } catch {
    return Response.json({ error: "Niepoprawny JSON." }, { status: 400 });
  }
  const ctx = sanitizeContext(body.context, engine.engine === "mac" ? LOCAL_SOURCE_CHARS : MAX_SOURCE_CHARS);
  if (!ctx || !hasMaterial(ctx)) {
    return Response.json(
      { error: "Najpierw wklej transkrypt albo dopisz notatkę z rozmowy. Model nie zgaduje z pustej karty." },
      { status: 400 },
    );
  }
  if (!(await takeAiQuota(request, allowed.who, "extract"))) {
    return Response.json({ error: quotaMessage("extract") }, { status: 429 });
  }

  const user = extractionUserMessage(ctx);
  const started = Date.now();
  if (engine.engine === "claude") {
    const done = await claudeStructured(engine.claude, { system: EXTRACTION_SYSTEM, user, schema: EXTRACTION_SCHEMA });
    if (!done.ok) {
      logServer("error", "extract_failed", { engine: "claude", status: done.status, ms: Date.now() - started });
      return Response.json({ error: done.error }, { status: done.status });
    }
    logServer("info", "extract_done", {
      engine: "claude",
      model: done.model,
      input_tokens: done.usage.input,
      output_tokens: done.usage.output,
      ms: Date.now() - started,
      chars: user.length,
      prompt: PROMPT_VERSION,
    });
    return Response.json({
      ok: true,
      engine: "claude",
      model: done.model,
      usage: done.usage,
      durationMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
      clipped: Boolean(ctx.clipped),
      data: done.data,
    });
  }

  // Qwen na tym komputerze albo OpenCode Zen: ten sam format, JSON z tekstu odpowiedzi.
  const system = `${EXTRACTION_SYSTEM}\n\n${JSON_ONLY}`;
  const done = await completeRaw(request, {
    system,
    user,
    // Pola + dowody (zdania partnera) to kilka tysięcy znaków JSON-u.
    maxTokens: 4000,
    timeoutMs: engine.engine === "mac" ? 110_000 : 90_000,
    json: true,
    // Ok. 3 znaki na token po polsku + miejsce na odpowiedź; domyślne okno Ollamy ucina początek polecenia.
    numCtx: Math.min(32_768, Math.ceil((system.length + user.length) / 3) + 4_500),
  });
  if (!done.ok) {
    logServer("error", "extract_failed", { engine: engine.engine, status: done.status, ms: Date.now() - started });
    return Response.json({ error: done.error }, { status: done.status });
  }
  const data = parseLooseJson(done.text);
  if (!data || typeof data !== "object") {
    logServer("warn", "extract_bad_json", { engine: done.place, ms: Date.now() - started });
    return Response.json({ error: "Model nie oddał pól w formacie JSON. Spróbuj jeszcze raz." }, { status: 502 });
  }
  return Response.json({
    ok: true,
    engine: done.place,
    model: null,
    durationMs: Date.now() - started,
    promptVersion: PROMPT_VERSION,
    clipped: Boolean(ctx.clipped),
    data,
  });
}
