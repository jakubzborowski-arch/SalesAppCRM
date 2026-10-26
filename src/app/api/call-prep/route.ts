import { claudeKeyProblem, claudeResearch, claudeStructured, resolveClaude } from "@/lib/claude-api";
import {
  PREP_JSON_ONLY,
  PREP_SCHEMA,
  PREP_SYSTEM,
  RESEARCH_SYSTEM,
  prepUserMessage,
  researchUserMessage,
  sanitizePrepContext,
} from "@/lib/call-prep";
import { parseLooseJson } from "@/lib/discovery-extract";
import { completeRaw, resolveDraftBackend } from "@/lib/draft-complete";
import { AI_DENIED, aiAccess, logServer, quotaMessage, takeAiQuota } from "@/lib/ai-access";

export const runtime = "nodejs";
export const maxDuration = 150;

const MAX_BODY_BYTES = 60_000;

type Engine =
  | { engine: "claude"; claude: NonNullable<ReturnType<typeof resolveClaude>> }
  | { engine: "mac" | "zen" };

function engineFor(request: Request): Engine | null {
  const claude = resolveClaude();
  if (claude) return { engine: "claude", claude };
  const backend = resolveDraftBackend(request);
  return backend ? { engine: backend.place } : null;
}

export async function GET(request: Request) {
  const engine = engineFor(request);
  if (!engine) return Response.json({ enabled: false, reason: claudeKeyProblem() ?? "no_engine" });
  const allowed = await aiAccess(request, engine.engine);
  if (!allowed.ok) return Response.json({ enabled: false, reason: allowed.reason });
  return Response.json({ enabled: true, engine: engine.engine, search: engine.engine === "claude" });
}

export async function POST(request: Request) {
  const engine = engineFor(request);
  if (!engine) {
    return Response.json({ error: "AI nie jest podłączone na tym serwerze. Dodaj ANTHROPIC_API_KEY do .env.local." }, { status: 404 });
  }
  const allowed = await aiAccess(request, engine.engine);
  if (!allowed.ok) return Response.json({ error: AI_DENIED[allowed.reason] }, { status: allowed.reason === "login" ? 401 : 403 });

  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Za dużo danych w zapytaniu." }, { status: 413 });
  let body: { context?: unknown; search?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ error: "Niepoprawny JSON." }, { status: 400 });
  }
  const ctx = sanitizePrepContext(body.context);
  if (!ctx) return Response.json({ error: "Brak nazwy partnera." }, { status: 400 });
  if (engine.engine !== "mac" && !(await takeAiQuota(request, allowed.who, "extract"))) {
    return Response.json({ error: quotaMessage("extract") }, { status: 429 });
  }

  const started = Date.now();
  if (engine.engine === "claude") {
    // 1) Research w internecie (strona z karty + wyszukiwarka). Błąd nie przerywa — przygotowanie powstaje z CRM.
    let research = "";
    let sources: Array<{ url: string; title: string }> = [];
    let searchNote = "";
    let searches = 0;
    let usage = { input: 0, output: 0 };
    if (body.search !== false) {
      const found = await claudeResearch(engine.claude, {
        system: RESEARCH_SYSTEM,
        user: researchUserMessage(ctx),
        timeoutMs: 80_000,
      });
      if (found.ok) {
        research = found.text;
        sources = found.sources;
        searches = found.searches;
        usage = found.usage;
        if (!research) searchNote = "Wyszukiwanie nic nie zwróciło.";
      } else {
        searchNote = found.disabled
          ? "Wyszukiwanie w Claude API jest niedostępne (Claude Console → Settings → Capabilities: web search / web fetch)."
          : found.error;
        logServer("warn", "prep_research_failed", { status: found.status, ms: Date.now() - started });
      }
    } else {
      searchNote = "Bez wyszukiwania (wyłączone przy tym przygotowaniu).";
    }

    // 2) Przygotowanie w stałym formacie.
    const done = await claudeStructured(engine.claude, {
      system: PREP_SYSTEM,
      user: prepUserMessage(ctx, research),
      schema: PREP_SCHEMA,
      jsonFallback: PREP_JSON_ONLY,
      maxTokens: 4000,
      timeoutMs: Math.max(20_000, 140_000 - (Date.now() - started)),
    });
    if (!done.ok) {
      logServer("error", "prep_failed", { engine: "claude", status: done.status, ms: Date.now() - started });
      return Response.json({ error: done.error }, { status: done.status });
    }
    const total = { input: usage.input + done.usage.input, output: usage.output + done.usage.output };
    logServer("info", "prep_done", {
      engine: "claude",
      model: done.model,
      input_tokens: total.input,
      output_tokens: total.output,
      searches,
      sources: sources.length,
      ms: Date.now() - started,
    });
    return Response.json({
      ok: true,
      engine: "claude",
      model: done.model,
      searched: Boolean(research),
      searchNote,
      sources,
      searches,
      usage: total,
      durationMs: Date.now() - started,
      data: done.data,
    });
  }

  // Lokalny model / Zen: bez internetu, tylko dane z CRM.
  const system = `${PREP_SYSTEM}\n\n${PREP_JSON_ONLY}`;
  const user = prepUserMessage(ctx, "");
  const done = await completeRaw(request, {
    system,
    user,
    maxTokens: 2500,
    timeoutMs: engine.engine === "mac" ? 110_000 : 90_000,
    json: true,
    numCtx: Math.min(16_384, Math.ceil((system.length + user.length) / 3) + 3_000),
  });
  if (!done.ok) {
    logServer("error", "prep_failed", { engine: engine.engine, status: done.status, ms: Date.now() - started });
    return Response.json({ error: done.error }, { status: done.status });
  }
  const data = parseLooseJson(done.text);
  if (!data || typeof data !== "object") {
    return Response.json({ error: "Model nie oddał przygotowania w formacie JSON. Spróbuj jeszcze raz." }, { status: 502 });
  }
  return Response.json({
    ok: true,
    engine: done.place,
    model: null,
    searched: false,
    searchNote: "Lokalny model nie ma dostępu do internetu — przygotowanie tylko z danych w CRM.",
    sources: [],
    searches: 0,
    durationMs: Date.now() - started,
    data,
  });
}
