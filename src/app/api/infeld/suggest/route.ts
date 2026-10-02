import { infeldSearch, resolveInfeldMcpConfig } from "@/lib/infeld-mcp";
import { buildInfeldSearchQuery, hintsFromInfeldText } from "@/lib/infeld-suggest";
import type { Mission, Partner } from "@/lib/types";

export const runtime = "nodejs";

type Body = {
  partner?: Partner;
  mission?: Mission;
};

export async function POST(request: Request) {
  const config = resolveInfeldMcpConfig();
  if ("error" in config) {
    return Response.json({ error: config.error, code: config.code, hints: [] }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Niepoprawne JSON.", hints: [] }, { status: 400 });
  }

  if (!body.partner?.id || !body.mission?.id) {
    return Response.json({ error: "Brak partnera lub misji.", hints: [] }, { status: 400 });
  }

  const query = buildInfeldSearchQuery(body.partner, body.mission);

  try {
    const found = await infeldSearch(config, query, 6);
    const hints = hintsFromInfeldText(found.text);
    return Response.json({
      ok: true,
      hints,
      source: "infeld",
      empty: hints.length === 0,
    });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Infeld nie odpowiedział",
        code: "search_failed",
        hints: [],
      },
      { status: 502 },
    );
  }
}
