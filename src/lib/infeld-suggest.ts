import type { Mission, Partner, StageId } from "./types";

export type KnowledgeHint = {
  title: string;
  body: string;
};

const STAGE_QUERY: Record<StageId, string> = {
  research:
    "Lutra sprzedaż partnerska research lokalu: hipoteza potrzeby, czego nie traktować jako fakt, checklista przed kontaktem",
  contact:
    "Lutra pierwszy kontakt zgoda na nagranie skrypt rozmowy czego nie obiecywać liczba klientów",
  discovery:
    "Lutra discovery lokale pytania: słabe dni godziny wielkość grupy marża wyłączenia poprzednie promocje sukces po 3 miesiącach",
  needs:
    "Lutra mapa potrzeb bramka oferty: problem rezultat ograniczenie decydent termin decyzji wcześniejsze próby następny krok fakt vs hipoteza",
  offer:
    "Lutra oferta A B C lokale: ruch poza szczytem oferta grupowa kontrolowany pilotaż tylko z biblioteki",
  negotiation:
    "Lutra obiekcje: inne aplikacje ile osób zniżka nie opłaca brak czasu zapytam właściciela wróćcie później odpowiedzi z biblioteki",
  contract: "Lutra umowa partnera kompletność danych podpis człowieka zakazane obietnice",
  activation: "Lutra aktywacja partnera kod test oferty kontakt operacyjny check-in",
};

export function buildInfeldSearchQuery(partner: Partner, mission: Mission) {
  const stage = STAGE_QUERY[mission.currentStage] ?? STAGE_QUERY.discovery;
  const facts = mission.needs
    .filter((n) => n.confirmed)
    .map((n) => n.title || n.description)
    .filter(Boolean)
    .slice(0, 4)
    .join("; ");
  const bits = [
    stage,
    `Partner: ${partner.segment} ${partner.category} ${partner.city}`.trim(),
    facts ? `Potwierdzone fakty: ${facts}` : "",
  ].filter(Boolean);
  return bits.join(". ");
}

/** Kroi odpowiedź MCP na krótkie karty do panelu. */
export function hintsFromInfeldText(text: string): KnowledgeHint[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  if (/no indexed matches|no documents found|projectUuid, projectName, or organizationUuid is required/i.test(clean)) {
    return [];
  }

  const resultBlocks = clean.split(/(?=^Result \d+:)/m).map((b) => b.trim()).filter(Boolean);
  const source = resultBlocks.length > 1 || /^Result \d+:/m.test(clean) ? resultBlocks : clean.split(/\n{2,}/);

  const hints: KnowledgeHint[] = [];
  for (const block of source.slice(0, 5)) {
    const file = block.match(/\[project\]\s+([^\n]+)/)?.[1]?.trim();
    const stripped = block
      .replace(/^Result \d+:\s*/i, "")
      .replace(/\[project\][^\n]+\n?/g, "")
      .replace(/Source kind:[^\n]+\n?/g, "")
      .replace(/Score:[^\n]+\n?/g, "")
      .replace(/Citation:[^\n]+\n?/g, "")
      .replace(/Document:[^\n]+\n?/g, "")
      .replace(/Graph expanded:[^\n]+\n?/g, "")
      .trim();
    const lines = stripped.split("\n").map((l) => l.replace(/^[-*#\s]+/, "").trim()).filter(Boolean);
    const title = (file?.split("/").at(-1) || lines[0] || "Z bazy Infelda").slice(0, 80);
    const body = (lines.join(" ").trim() || stripped).slice(0, 420);
    if (body.length < 20) continue;
    hints.push({ title, body });
  }
  return hints.slice(0, 4);
}
