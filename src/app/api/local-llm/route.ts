import { completeDraftText, resolveDraftBackend } from "@/lib/draft-complete";
import { briefForModel, parseFactFields, systemForDraft, type LocalDraftMode } from "@/lib/local-llm";
import { loggedInSalesUser } from "@/lib/sales-session";
import type { Mission, Partner } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  mode?: LocalDraftMode;
  partner?: Partner;
  mission?: Mission;
};

export async function GET(request: Request) {
  const backend = resolveDraftBackend(request);
  if (!backend) return Response.json({ enabled: false });
  if (backend.place === "zen" && !(await loggedInSalesUser(request))) {
    return Response.json({ enabled: false });
  }
  return Response.json({ enabled: true, place: backend.place });
}

export async function POST(request: Request) {
  const backend = resolveDraftBackend(request);
  if (!backend) {
    return Response.json({ error: "Szkice są wyłączone na tym hoście." }, { status: 404 });
  }
  if (backend.place === "zen" && !(await loggedInSalesUser(request))) {
    return Response.json({ error: "Zaloguj się, żeby ułożyć szkic." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Niepoprawne JSON." }, { status: 400 });
  }

  if (!body.partner?.id || !body.mission?.id || !body.mission.decision || !Array.isArray(body.mission.needs)) {
    return Response.json({ error: "Brak partnera lub misji." }, { status: 400 });
  }
  if (body.mode !== "wniosek" && body.mode !== "umowa" && body.mode !== "mail" && body.mode !== "pola") {
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

  const done = await completeDraftText(request, {
    system: systemForDraft(body.mode),
    user: `${brief.task}\n\n${brief.source}`,
    source: brief.source,
    ...(body.mode === "pola" ? { maxTokens: 360, minLength: 24 } : {}),
  });
  if (!done.ok) return Response.json({ error: done.error }, { status: done.status });
  if (body.mode === "pola") {
    const fields = parseFactFields(done.text, brief.source);
    if (!fields.problem && !fields.quote) {
      return Response.json(
        { error: "Z notatki nie dało się wziąć problemu ani cytatu. Dopisz rozmowę albo wypełnij pola ręcznie." },
        { status: 422 },
      );
    }
    return Response.json({ ok: true, fields });
  }
  return Response.json({ ok: true, draft: done.text });
}
