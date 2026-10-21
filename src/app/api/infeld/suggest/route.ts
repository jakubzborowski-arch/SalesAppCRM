import { readFileSync } from "node:fs";
import { join } from "node:path";
import { completeDraftText, resolveDraftBackend } from "@/lib/draft-complete";
import { searchViaCursorBridge } from "@/lib/infeld-bridge-client";
import { infeldSearch, resolveInfeldMcpConfig } from "@/lib/infeld-mcp";
import {
  buildInfeldSearchQuery,
  composeFromInfeld,
  composeKlubVoice,
  focusHintCards,
  infeldSectionLabel,
  isKlubCategory,
  klubSectionHints,
  venueInfeldText,
  type KnowledgeHint,
} from "@/lib/infeld-suggest";
import { loggedInSalesUser } from "@/lib/sales-session";
import { STAGES, type Mission, type Partner } from "@/lib/types";

const HINT_SYSTEM =
  "Układasz jedną podpowiedź dla handlowca Lutry. Piszesz tylko z kart playbooka. Nie znasz telefonu, maila, NIP-u ani nagrania. To wskazówka na ekranie, nie wiadomość do partnera i nie umowa.";

async function arrangeVoice(
  request: Request,
  voice: string,
  hints: KnowledgeHint[],
  partner: Partner,
  mission: Mission,
) {
  if (voice.trim().length < 80) return voice;
  const backend = resolveDraftBackend(request);
  if (!backend) return voice;
  if (backend.place === "zen" && !(await loggedInSalesUser(request))) return voice;
  const stage = STAGES.find((item) => item.id === mission.currentStage)?.label ?? mission.currentStage;
  const facts = (mission.needs ?? [])
    .filter((need) => need.confirmed && need.status === "fact")
    .map((need) => need.title || need.description)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const cards = focusHintCards(hints, facts)
    .map((hint) => `${hint.title}\n${hint.body}`)
    .join("\n\n")
    .slice(0, 900);
  const source = `${cards}\n${voice}`;
  const done = await completeDraftText(request, {
    system: HINT_SYSTEM,
    source,
    maxTokens: 180,
    timeoutMs: 25_000,
    user: [
      `Krok: ${stage}. Lokal: ${(partner.name || "lokal").slice(0, 80)}.`,
      facts ? `Potwierdzony fakt: ${facts}. Oprzyj podpowiedź na tym fakcie i pomiń karty, które go nie dotyczą.` : "",
      "Ułóż 3 krótkie zdania swoimi słowami handlowca: co powiedzieć, potem jedno pytanie, na końcu czego nie obiecywać. Nie zaczynaj od cytatu obiekcji i nie powtarzaj zdań. Nie dopisuj rabatu, liczby gości, wyłączności, VIP ani Premium.",
      cards || voice,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  return done.ok ? done.text : voice;
}

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
    const voice = await arrangeVoice(
      request,
      composeKlubVoice(body.partner, body.mission, hints, remote),
      hints,
      body.partner,
      body.mission,
    );
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
  const composed = composeFromInfeld(body.partner, body.mission, remote);
  const label = text ? infeldSectionLabel(text) : "";
  const at = text.indexOf(label);
  const hints =
    composed && text
      ? [{ title: label, body: text.slice(at >= 0 ? at : 0, (at >= 0 ? at : 0) + 700).trim() }]
      : [];
  const voice = await arrangeVoice(request, composed, hints, body.partner, body.mission);
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
