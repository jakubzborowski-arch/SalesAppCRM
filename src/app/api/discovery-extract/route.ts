import { claudeStructured, resolveClaude } from "@/lib/claude-api";
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
import { isLocalCrmRequest } from "@/lib/local-llm";
import { emailAllowed, salesUser } from "@/lib/sales-session";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Największe ciało zapytania (transkrypty + notatka), zanim w ogóle zaczniemy je czytać. */
const MAX_BODY_BYTES = 700_000;
/** Mały lokalny model (Ollama) ma krótkie okno — wysyłamy mniej tekstu i podnosimy num_ctx. */
const LOCAL_SOURCE_CHARS = 60_000;
/** Limit zapytań na osobę: chroni klucz przed pętlą albo nadużyciem. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(who: string, now = Date.now()) {
  const recent = (hits.get(who) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(who, recent);
    return true;
  }
  recent.push(now);
  hits.set(who, recent);
  return false;
}

type Engine =
  | { engine: "claude"; claude: NonNullable<ReturnType<typeof resolveClaude>> }
  | { engine: "mac" | "zen" };

function engineFor(request: Request): Engine | null {
  const claude = resolveClaude();
  if (claude) return { engine: "claude", claude };
  const backend = resolveDraftBackend(request);
  return backend ? { engine: backend.place } : null;
}

type Access = { ok: true; who: string } | { ok: false; reason: "login" | "not_allowed" | "local_only" };

/**
 * Lokalny Qwen: tylko ten komputer. Claude / Zen z Supabase: zalogowany handlowiec (opcjonalnie z listy
 * AI_ALLOWED_EMAILS). Bez Supabase (demo) płatny klucz działa tylko po jawnym AI_ALLOW_WITHOUT_LOGIN=1.
 */
async function access(request: Request, engine: Engine): Promise<Access> {
  if (engine.engine === "mac") return isLocalCrmRequest(request) ? { ok: true, who: "local" } : { ok: false, reason: "local_only" };
  if (isSupabaseConfigured()) {
    const user = await salesUser(request);
    if (!user) return { ok: false, reason: "login" };
    if (!emailAllowed(user.email)) return { ok: false, reason: "not_allowed" };
    return { ok: true, who: user.id };
  }
  const demo = process.env.AI_ALLOW_WITHOUT_LOGIN === "1" && isLocalCrmRequest(request);
  return demo ? { ok: true, who: "demo" } : { ok: false, reason: "local_only" };
}

const DENIED: Record<Exclude<Access, { ok: true }>["reason"], string> = {
  login: "Zaloguj się ponownie, żeby odczytać rozmowę.",
  not_allowed: "Twoje konto nie ma dostępu do AI w tym CRM (AI_ALLOWED_EMAILS).",
  local_only: "AI działa tu tylko z logowaniem do CRM.",
};

export async function GET(request: Request) {
  const engine = engineFor(request);
  if (!engine) return Response.json({ enabled: false, reason: "no_engine" });
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
    return Response.json(
      { error: "AI nie jest podłączone na tym serwerze. Dodaj ANTHROPIC_API_KEY albo użyj ścieżki przez Claude." },
      { status: 404 },
    );
  }
  const allowed = await access(request, engine);
  if (!allowed.ok) return Response.json({ error: DENIED[allowed.reason] }, { status: 401 });

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
  if (rateLimited(allowed.who)) {
    return Response.json({ error: `Limit ${RATE_LIMIT} odczytów rozmów na godzinę. Spróbuj później.` }, { status: 429 });
  }

  const user = extractionUserMessage(ctx);
  if (engine.engine === "claude") {
    const done = await claudeStructured(engine.claude, { system: EXTRACTION_SYSTEM, user, schema: EXTRACTION_SCHEMA });
    if (!done.ok) return Response.json({ error: done.error }, { status: done.status });
    return Response.json({
      ok: true,
      engine: "claude",
      model: done.model,
      usage: done.usage,
      clipped: Boolean(ctx.clipped),
      data: done.data,
    });
  }

  // Qwen na tym komputerze albo OpenCode Zen: ten sam format, JSON z tekstu odpowiedzi.
  const system = `${EXTRACTION_SYSTEM}\n\n${JSON_ONLY}`;
  const done = await completeRaw(request, {
    system,
    user,
    maxTokens: 2400,
    timeoutMs: engine.engine === "mac" ? 110_000 : 90_000,
    json: true,
    // Ok. 3 znaki na token po polsku + miejsce na odpowiedź; domyślne okno Ollamy ucina początek polecenia.
    numCtx: Math.min(32_768, Math.ceil((system.length + user.length) / 3) + 3_000),
  });
  if (!done.ok) return Response.json({ error: done.error }, { status: done.status });
  const data = parseLooseJson(done.text);
  if (!data || typeof data !== "object") {
    return Response.json({ error: "Model nie oddał pól w formacie JSON. Spróbuj jeszcze raz." }, { status: 502 });
  }
  return Response.json({ ok: true, engine: done.place, model: null, clipped: Boolean(ctx.clipped), data });
}
