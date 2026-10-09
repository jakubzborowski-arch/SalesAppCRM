import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchViaCursorBridge } from "@/lib/infeld-bridge-client";
import { infeldSearch, resolveInfeldMcpConfig } from "@/lib/infeld-mcp";
import {
  buildInfeldSearchQuery,
  composeFromInfeld,
  composeKlubVoice,
  infeldSectionLabel,
  isKlubCategory,
  klubSectionHints,
  venueInfeldText,
} from "@/lib/infeld-suggest";
import type { Mission, Partner } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  partner?: Partner;
  mission?: Mission;
  query?: string;
};

export async function POST(request: Request) {
  const config = resolveInfeldMcpConfig();

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

  if (isKlubCategory(body.partner.category)) {
    let playbook = "";
    try {
      playbook = readFileSync(join(process.cwd(), "docs/infeld-playbook-klub.txt"), "utf8");
    } catch {
      playbook = "";
    }
    let remote = "";
    let composer: "mcp" | "playbook" = "playbook";
    try {
      remote = await searchViaCursorBridge(query, 4);
      if (remote.trim()) composer = "mcp";
    } catch {
      remote = "";
    }
    if (!remote.trim() && !("error" in config)) {
      try {
        const found = await infeldSearch(config, query, 4);
        remote = found.text;
      } catch {
        remote = "";
      }
    }
    const hints = klubSectionHints(playbook, body.mission, remote);
    const label = hints.map((hint) => hint.title.split("·")[0]?.trim()).filter(Boolean).join(" + ");
    const voice = composeKlubVoice(body.partner, body.mission, hints, remote);
    return Response.json({
      ok: true,
      query,
      hints,
      label,
      voice,
      source: composer === "mcp" ? "infeld-mcp" : "playbook-section",
      composer,
      empty: !voice,
    });
  }

  let remote = "";
  try {
    remote = await searchViaCursorBridge(query, 8);
  } catch {
    remote = "";
  }
  if (!remote.trim() && !("error" in config)) {
    try {
      const found = await infeldSearch(config, query, 8);
      remote = found.text;
    } catch {
      remote = "";
    }
  }
  const text = venueInfeldText(remote);
  const voice = composeFromInfeld(body.partner, body.mission, remote);
  const label = text ? infeldSectionLabel(text) : "";
  const at = text.indexOf(label);
  const hints =
    voice && text
      ? [{ title: label, body: text.slice(at >= 0 ? at : 0, (at >= 0 ? at : 0) + 700).trim() }]
      : [];
  return Response.json({
    ok: true,
    query,
    hints,
    voice,
    label,
    source: "infeld-mcp",
    composer: voice ? "mcp" : "playbook",
    empty: !voice,
    error: voice ? undefined : "Infeld nie oddał sekcji dla tej kategorii.",
  });
}
