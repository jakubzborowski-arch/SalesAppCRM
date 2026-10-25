import { completeDraftText, resolveDraftBackend } from "@/lib/draft-complete";
import { briefForModel, systemForDraft, type LocalDraftMode } from "@/lib/local-llm";
import { AI_DENIED, aiAccess, logServer, quotaMessage, takeAiQuota } from "@/lib/ai-access";
import type { Mission, Partner } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  mode?: LocalDraftMode;
  partner?: Partner;
  mission?: Mission;
};

/** Partner + misja w szkicu to kilkadziesiąt kB; więcej oznacza błąd albo nadużycie. */
const MAX_BODY_BYTES = 200_000;

export async function GET(request: Request) {
  const backend = resolveDraftBackend(request);
  if (!backend) return Response.json({ enabled: false });
  if (!(await aiAccess(request, backend.place)).ok) return Response.json({ enabled: false });
  return Response.json({ enabled: true, place: backend.place });
}

export async function POST(request: Request) {
  const backend = resolveDraftBackend(request);
  if (!backend) {
    return Response.json({ error: "Szkice są wyłączone na tym hoście." }, { status: 404 });
  }
  const allowed = await aiAccess(request, backend.place);
  if (!allowed.ok) {
    return Response.json({ error: AI_DENIED[allowed.reason] }, { status: allowed.reason === "login" ? 401 : 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "Za dużo danych w zapytaniu." }, { status: 413 });
  }

  let body: Body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Za dużo danych w zapytaniu." }, { status: 413 });
    body = JSON.parse(raw) as Body;
  } catch {
    return Response.json({ error: "Niepoprawny JSON." }, { status: 400 });
  }

  if (!body.partner?.id || !body.mission?.id || !body.mission.decision || !Array.isArray(body.mission.needs)) {
    return Response.json({ error: "Brak partnera lub misji." }, { status: 400 });
  }
  if (body.mode !== "wniosek" && body.mode !== "umowa" && body.mode !== "mail") {
    return Response.json({ error: "Nieznany tryb." }, { status: 400 });
  }
  if (body.mode === "umowa" && !body.mission.selectedVariant) {
    return Response.json({ error: "Najpierw wybierz wariant A, B albo C." }, { status: 400 });
  }

  const brief = briefForModel(body.partner, body.mission, body.mode);
  if (!brief.hasFact) {
    return Response.json(
      { error: "Wklej rozmowę w notatkę na etapie dzwonienia albo potwierdź fakt. Model nie zgaduje z pustej karty." },
      { status: 400 },
    );
  }

  if (backend.place === "zen" && !(await takeAiQuota(request, allowed.who, "draft"))) {
    return Response.json({ error: quotaMessage("draft") }, { status: 429 });
  }

  const done = await completeDraftText(request, {
    system: systemForDraft(body.mode),
    user: `${brief.task}\n\n${brief.source}`,
    source: brief.source,
  });
  if (!done.ok) {
    logServer("error", "draft_failed", { place: backend.place, mode: body.mode, status: done.status });
    return Response.json({ error: done.error }, { status: done.status });
  }
  logServer("info", "draft_done", { place: backend.place, mode: body.mode, chars: done.text.length });
  return Response.json({ ok: true, draft: done.text });
}
