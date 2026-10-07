import { readFileSync } from "node:fs";
import { join } from "node:path";
import { infeldSearch, resolveInfeldMcpConfig } from "@/lib/infeld-mcp";
import {
  buildInfeldSearchQuery,
  hintsFromInfeldText,
  hintsFromPlaybookText,
  pickStageHints,
} from "@/lib/infeld-suggest";
import type { Mission, Partner } from "@/lib/types";

export const runtime = "nodejs";

function localCategoryHints(category?: string) {
  if (!/klub/i.test(category ?? "")) return [];
  try {
    const text = readFileSync(join(process.cwd(), "docs/infeld-playbook-klub.txt"), "utf8");
    return hintsFromPlaybookText(text);
  } catch {
    return [];
  }
}

type Body = {
  partner?: Partner;
  mission?: Mission;
  query?: string;
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

  const query = body.query?.trim() || buildInfeldSearchQuery(body.partner, body.mission);
  const opts = {
    stage: body.mission.currentStage,
    channel: body.mission.selectedChannel,
    category: body.partner.category,
    objections: (body.mission.objections ?? []).filter((o) => o.checked).map((o) => o.key),
  };

  try {
    const found = await infeldSearch(config, query, 8);
    const fromInfeld = hintsFromInfeldText(found.text, opts);
    const hints = pickStageHints([...localCategoryHints(body.partner.category), ...fromInfeld], opts);
    return Response.json({
      ok: true,
      query,
      hints,
      preview: found.text.trim().slice(0, 900),
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
