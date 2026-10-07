import { OBJECTION_KEYS } from "./playbook";
import { STAGES, type Channel, type Mission, type Partner, type StageId } from "./types";

export type KnowledgeHint = {
  title: string;
  body: string;
};

export type InfeldHintOpts = {
  stage?: StageId;
  channel?: Channel | null;
  category?: string;
  objections?: string[];
};

const STAGE_QUERY: Record<StageId, string> = {
  research: "research lokalu zanim zadzwonisz: hipoteza potrzeby, checklista publiczna, nie zapisuj jako fakt",
  contact: "pierwszy kontakt cel: umówić 15 min discovery, nie sprzedawaj oferty A/B/C na pierwszym sygnale",
  discovery: "discovery pytania: puste dni godziny wielkość grupy marża wyłączenia poprzednie promocje decydent",
  needs: "mapa potrzeb dopiero po potwierdzeniu: problem rezultat ograniczenie — nie zgaduj z researchu",
  offer: "oferta A B C tylko z biblioteki: ruch poza szczytem oferta grupowa kontrolowany pilotaż",
  negotiation: "obiekcje: zniżka nie opłaca pełny weekend ile osób brak czasu zapytać właściciela",
  contract: "umowa partnera: komplet danych podpis człowieka warunki tylko na piśmie",
  activation: "aktywacja: recap kod partnera check-in, nie wysyłaj oferty z pierwszego telefonu",
};

const KLUB_STAGE_CODE: Partial<Record<StageId, string>> = {
  research: "S-KLUB-02",
  contact: "S-KLUB-03",
  discovery: "S-KLUB-04",
  needs: "S-KLUB-05",
  offer: "S-KLUB-06",
  negotiation: "S-KLUB-07",
  activation: "S-KLUB-09",
};

const CHANNEL_QUERY: Record<Channel, string> = {
  phone: "telefon pierwszy sygnał skrypt rozmowy: dzień dobry z Lutry, umów 15 min, nie dzwoń z ofertą w piątek wieczór, SMS gdy nie odbiera",
  email: "e-mail pierwszy kontakt: temat wiadomości, krótki mail o słabym oknie, poproś o 15 min, bez załącznika z ofertą, follow-up",
  linkedin: "LinkedIn InMail do właściciela managera: krótka wiadomość, umów discovery, bez oferty i liczby użytkowników",
  in_person: "kontakt osobisty albo z polecenia: nie pitchuj na sali, umów 15 min w dzień roboczy",
};

const KLUB_CHANNEL_CODE: Record<Channel, string> = {
  phone: "S-KLUB-10",
  email: "S-KLUB-11",
  linkedin: "S-KLUB-12",
  in_person: "S-KLUB-13",
};

const STAGE_MARKERS: Record<StageId, RegExp> = {
  research: /research|zanim zadzwonisz|sprawdź publicznie|instagram to nie mapa|godziny otwarcia/i,
  contact:
    /kontakt|skrypt|telefon|e-?mail|linkedin|inmail|pierwszy sygnał|temat:|wiadomość|nie odbiera|sms|follow-up|osobiście|polecen/i,
  discovery: /pytania tylko|które dni|zadaj i zapisz|od ilu osób|discovery —/i,
  needs: /typowe potrzeb|mapa potrzeb|off_peak|dopiero po potwierdzeniu/i,
  offer: /oferta a\/b\/c|ruch poza szczytem|kontrolowany pilotaż|tylko z biblioteki/i,
  negotiation: /obiekcj|zniżka mi się nie|ile osób mi|muszę zapytać|w sobotę i tak/i,
  contract: /umow|podpis|na piśmie|komplet/i,
  activation: /aktywac|kod partnera|check-in|następny krok/i,
};

const OBJECTION_MARKERS: Record<string, RegExp> = {
  other_apps: /inne aplikacje|inne apki|kuponem na weekend/i,
  how_many: /ile osób|przyprowadz/i,
  margin: /zniżka mi się nie|zepsuję bar|nie opłaca/i,
  no_time: /nie mam czasu|ochrona nie|pilnować/i,
  ask_owner: /zapytać właściciela|recap z oknem/i,
  come_back: /wróćcie|więcej użytkowników/i,
};

const CHANNEL_MARKERS: Record<Channel, RegExp> = {
  phone: /telefon|skrypt|nie odbiera|zadzwoń|piątek wieczór|dzień dobry, tu/i,
  email: /e-?mail|temat:|piszę z lutry|follow-up|bez załącznika|temat wiadomości/i,
  linkedin: /linkedin|inmail|cześć \[imię\]/i,
  in_person: /osobiście|na sali|polecen|przy barze|serwet/i,
};

export function buildSmokeInfeldQuery(partner: Partner, mission: Mission) {
  return buildInfeldSearchQuery(partner, mission);
}

function partnerContext(partner: Partner) {
  const segment =
    partner.segment === "venue"
      ? "lokal"
      : partner.segment === "company"
        ? "firma"
        : partner.segment === "community"
          ? "społeczność"
          : "lokal";
  const city = partner.city?.trim() || "";
  const category = [partner.category, partner.subcategory].map((v) => v?.trim()).filter(Boolean).join(" / ");
  return { segment, city, category };
}

function missionSearchContext(mission: Mission) {
  const facts = mission.needs
    .filter((n) => n.confirmed && n.status === "fact")
    .map((n) => n.title || n.description)
    .filter(Boolean)
    .slice(0, 4);
  const objections = mission.objections.filter((o) => o.checked).map((o) => o.key);
  return {
    facts,
    problem: mission.decision.problem.trim(),
    result: mission.decision.expectedResult.trim(),
    constraints: mission.decision.constraintSummary.trim(),
    objections,
    variant: mission.selectedVariant ?? "",
  };
}

export function infeldSuggestKey(partner: Partner, mission: Mission) {
  const ctx = missionSearchContext(mission);
  return [
    mission.currentStage,
    mission.selectedChannel ?? "",
    partner.segment,
    partner.category,
    partner.subcategory,
    partner.city,
    ctx.facts.join(","),
    ctx.problem,
    ctx.result,
    ctx.constraints,
    ctx.objections.join(","),
    ctx.variant,
  ].join("|");
}

export function buildInfeldSearchQuery(partner: Partner, mission: Mission) {
  const stageId = mission.currentStage;
  const klub = /klub/i.test(partner.category ?? "");
  const stage = [
    klub ? KLUB_STAGE_CODE[stageId] : "",
    STAGE_QUERY[stageId] ?? STAGE_QUERY.discovery,
  ]
    .filter(Boolean)
    .join(" ");
  const channelQ =
    stageId === "contact" && mission.selectedChannel
      ? [klub ? KLUB_CHANNEL_CODE[mission.selectedChannel] : "", CHANNEL_QUERY[mission.selectedChannel]]
          .filter(Boolean)
          .join(" ")
      : "";
  const stageLabel = STAGES.find((s) => s.id === stageId)?.label ?? stageId;
  const who = partnerContext(partner);
  const ctx = missionSearchContext(mission);
  const checkedLabels = ctx.objections
    .map((key) => OBJECTION_KEYS.find((item) => item.key === key)?.label)
    .filter(Boolean)
    .join(" ");
  const negotiationQ =
    stageId === "negotiation" && checkedLabels
      ? `${klub ? "S-KLUB-07" : ""} obiekcja ${checkedLabels} odpowiedź dopytaj`.trim()
      : "";
  const filterBits =
    stageId === "needs" || stageId === "offer" || stageId === "negotiation"
      ? [
          ctx.facts.length ? `Filtr z misji (nie zapisuj do bazy): ${ctx.facts.join("; ")}` : "",
          ctx.problem ? `Problem: ${ctx.problem}` : "",
          ctx.result ? `Rezultat: ${ctx.result}` : "",
          ctx.constraints ? `Ograniczenia: ${ctx.constraints}` : "",
          checkedLabels ? `Zaznaczone obiekcje: ${checkedLabels}` : "",
          ctx.variant ? `Wybrany wariant: ${ctx.variant}` : "",
        ]
      : [];
  return [
    negotiationQ || channelQ || stage,
    `Szukaj wyłącznie sekcji playbooka na krok ${stageLabel}${
      channelQ ? ` i kanał ${channelLabel(mission.selectedChannel)}` : ""
    }.`,
    who.category ? `Kategoria w CRM: ${who.category} (${who.segment}${who.city ? `, ${who.city}` : ""}).` : `Segment: ${who.segment}.`,
    ...filterBits,
    "Nie bierz wstępu pliku, researchu ani mapy potrzeb, jeśli ten krok tego nie dotyczy. Krótko, po polsku. Bez rabatów i liczby klientów.",
  ]
    .filter(Boolean)
    .join(" ");
}

function channelLabel(channel: Channel | null | undefined) {
  if (channel === "phone") return "telefon";
  if (channel === "email") return "e-mail";
  if (channel === "linkedin") return "LinkedIn";
  if (channel === "in_person") return "kontakt osobisty";
  return "";
}

function stripResultChrome(block: string) {
  return block
    .replace(/^Result \d+:\s*/i, "")
    .replace(/\[project\][^\n]+\n?/g, "\n")
    .replace(/Source kind:[^\n]+\n?/g, "")
    .replace(/Score:[^\n]+\n?/g, "")
    .replace(/Citation:[^\n]+\n?/g, "")
    .replace(/Document:[^\n]+\n?/g, "")
    .replace(/Graph expanded:[^\n]+\n?/g, "")
    .replace(/Źródło:[^\n.]*/gi, "")
    .replace(/Sales CRM/gi, "")
    .replace(/Note(?:taker)?/gi, "")
    .replace(/-{3,}/g, "\n")
    .trim();
}

function parseObjectionCards(text: string): KnowledgeHint[] {
  const cards: KnowledgeHint[] = [];
  const re = /„([^”]+)”\s*Odpowiedź:\s*(.+?)\s*Dopytaj:\s*(.+?)(?=„|$)/gis;
  for (const match of text.matchAll(re)) {
    const title = match[1].replace(/\s+/g, " ").trim().slice(0, 58);
    const body = `Odpowiedź: ${match[2].replace(/\s+/g, " ").trim()} Dopytaj: ${match[3].replace(/\s+/g, " ").trim()}`
      .slice(0, 280);
    if (title.length < 6 || body.length < 24) continue;
    if (/źródło:|sales crm|segmenty i/i.test(`${title} ${body}`)) continue;
    cards.push({ title, body });
  }
  return cards;
}

function firstSentences(text: string, n = 2) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18 && !/Kategoria w CRM|Używaj tego rozdziału|Segment:/i.test(s))
    .slice(0, n)
    .join(" ");
}

function listFrom(text: string) {
  const items = text
    .split(/[-–•\n]|(?=\d+\.)/)
    .map((item) => item.replace(/^[\s\d.]+/, "").replace(/[.;]$/, "").trim())
    .filter((item) => item.length > 8 && item.length < 90);
  return items.slice(0, 4);
}

function splitHeading(afterCode: string) {
  const line = afterCode.replace(/\s+/g, " ").trim();
  const labeled = line.match(/^(.*?)(?:\s+)(?=(?:Cel|Skrypt|Temat|Treść|Bezwzględnie|Zadaj|Sprawdź|Odpowiedź):)/i);
  if (labeled?.[1] && labeled[1].length >= 6 && labeled[1].length <= 72) {
    return { title: labeled[1].replace(/[·.\-–]+$/, "").trim(), body: line.slice(labeled[0].length).trim() };
  }
  const codes = line.match(/^(.*?)(?:\s+)(?=off_peak|margin|attendance|operations|risk)\b/);
  if (codes?.[1] && codes[1].length >= 8) {
    return { title: codes[1].replace(/[·.\-–]+$/, "").trim(), body: line.slice(codes[0].length).trim() };
  }
  const cut = line.match(/^(.{8,72}?)(?:\s+)(?=[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{3,}\b)/);
  if (cut) return { title: cut[1].replace(/[·.\-–]+$/, "").trim(), body: line.slice(cut[0].length).trim() };
  const dotted = line.match(/^(.{8,72}?\.)\s+(.+)/);
  if (dotted) return { title: dotted[1].replace(/\.$/, "").trim(), body: dotted[2].trim() };
  return { title: line.slice(0, 52).trim(), body: line.slice(52).trim() };
}

function parsePlaybookSections(stripped: string): KnowledgeHint[] {
  const quoted = parseObjectionCards(stripped);
  const parts = stripped.split(/(?=(?:S-[A-Z][A-Z0-9]*-\d+|S\d{2}(?:-\d{2})?)\b)/).map((p) => p.trim()).filter(Boolean);
  const cards: KnowledgeHint[] = [...quoted];
  for (const part of parts) {
    if (parseObjectionCards(part).length) continue;
    const head = part.match(/^(S-[A-Z0-9-]+|S\d{2}(?:-\d{2})?)\s*[·.\-–#\s]*(.*)$/is);
    if (!head?.[2]) continue;
    const split = splitHeading(head[2]);
    const title = split.title.replace(/#{1,6}/g, "").trim().slice(0, 58);
    if (/playbook \/|sprzedaż partnerska Lutry|Kategoria w CRM|segmenty i|^#/i.test(title)) continue;
    let rest = split.body.replace(/Pytają też tak:[\s\S]*?(?=Odpowiedź|Dopytaj|Złota|$)/gi, " ");
    rest = rest
      .replace(/Odpowiedź z playbooka:\s*/gi, "")
      .replace(/Odpowiedź:\s*/gi, "")
      .replace(/Bezwzględnie NIE:?\s*/gi, "Nie: ");
    let body: string;
    if (/Skrypt:|Temat:|Treść:/i.test(rest)) {
      body = firstSentences(rest, 3);
    } else if (/Nie:|liczby gości|wyłączności|wypełnimy/i.test(rest)) {
      const items = listFrom(rest);
      body = items.length >= 2 ? `${items.join("; ")}.` : firstSentences(rest);
    } else if (/^\s*\d+\./m.test(rest) || /Które dni/i.test(rest)) {
      const items = listFrom(rest);
      body = items.length >= 2 ? items.join(" ") : firstSentences(rest);
    } else {
      body = firstSentences(rest);
    }
    body = body.replace(/\s+/g, " ").trim().slice(0, /Skrypt:|Temat:/i.test(body) ? 280 : 240);
    if (title.length < 3 || body.length < 20) continue;
    if (/źródło:|sales crm|segmenty i/i.test(`${title} ${body}`)) continue;
    cards.push({ title, body });
  }
  return cards;
}

export function hintsFromPlaybookText(text: string): KnowledgeHint[] {
  return parsePlaybookSections(text);
}

function hintText(hint: KnowledgeHint) {
  return `${hint.title} ${hint.body}`;
}

function cardChannel(hint: KnowledgeHint): Channel | null {
  const title = hint.title;
  if (/e-?mail/i.test(title)) return "email";
  if (/linkedin/i.test(title)) return "linkedin";
  if (/osobisty|polecen/i.test(title)) return "in_person";
  if (/telefon/i.test(title)) return "phone";
  return null;
}

function scoreHint(hint: KnowledgeHint, opts: InfeldHintOpts) {
  const text = hintText(hint);
  const stage = opts.stage;
  let score = 0;
  if (stage && STAGE_MARKERS[stage].test(text)) score += 10;
  if (stage) {
    for (const [id, rx] of Object.entries(STAGE_MARKERS) as Array<[StageId, RegExp]>) {
      if (id !== stage && rx.test(text)) score -= 6;
    }
  }
  if (stage === "contact" && opts.channel) {
    const card = cardChannel(hint);
    if (card === opts.channel) score += 16;
    else if (card && card !== opts.channel) score -= 12;
    else if (CHANNEL_MARKERS[opts.channel].test(text)) score += 8;
  }
  if (stage === "negotiation" && opts.objections?.length) {
    const hit = opts.objections.some((key) => OBJECTION_MARKERS[key]?.test(text));
    score += hit ? 22 : -10;
  }
  if (stage === "contact" && /nie obiecywać|bezwzględnie nie/i.test(text)) score += 8;
  if (stage === "contact" && /różni się od kawiarni|typowe potrzeb|research klubu|zanim zadzwonisz|oferta a\/b\/c/i.test(text)) {
    score -= 20;
  }
  if (/klub|parkiet|DJ|booker/i.test(text)) score += 2;
  if (opts.category && new RegExp(opts.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)) {
    score += 1;
  }
  return score;
}

export function pickStageHints(hints: KnowledgeHint[], opts: InfeldHintOpts): KnowledgeHint[] {
  const seen = new Set<string>();
  const unique = hints.filter((h) => {
    const key = h.title.toLowerCase();
    const bodyKey = h.body.slice(0, 72).toLowerCase();
    if (seen.has(key) || seen.has(bodyKey)) return false;
    seen.add(key);
    seen.add(bodyKey);
    return true;
  });
  const ranked = unique
    .map((hint) => ({ hint, score: scoreHint(hint, opts) }))
    .sort((a, b) => b.score - a.score);
  const forChannel =
    opts.stage === "contact" && opts.channel
      ? ranked.filter((row) => {
          const ch = cardChannel(row.hint);
          return !ch || ch === opts.channel;
        })
      : ranked;
  if (opts.stage === "negotiation" && opts.objections?.length) {
    const matched = forChannel.filter((row) => row.score >= 18).map((row) => row.hint);
    if (matched.length) return matched.slice(0, 3);
  }
  const onStage = forChannel.filter((row) => row.score >= 8).map((row) => row.hint);
  if (onStage.length >= 2) return onStage.slice(0, 4);
  const rest = forChannel.filter((row) => row.score < 8).map((row) => row.hint);
  return [...onStage, ...rest].slice(0, 4);
}

/** Kroi odpowiedź MCP na krótkie karty do panelu. */
export function hintsFromInfeldText(text: string, opts: InfeldHintOpts = {}): KnowledgeHint[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  if (/no indexed matches|no documents found|projectUuid, projectName, or organizationUuid is required/i.test(clean)) {
    return [];
  }

  const resultBlocks = clean.split(/(?=^Result \d+:)/m).map((b) => b.trim()).filter(Boolean);
  const source = resultBlocks.length > 1 || /^Result \d+:/m.test(clean) ? resultBlocks : [clean];

  const hints: KnowledgeHint[] = [];
  for (const block of source.slice(0, 8)) {
    hints.push(...parsePlaybookSections(stripResultChrome(block)));
  }

  return pickStageHints(hints, opts);
}

export function readableInfeldCards(hints: KnowledgeHint[]) {
  return hints
    .filter((h) => !/infeld-playbook|\.txt|playbook klub$|segmenty i|źródło:|sales crm/i.test(`${h.title} ${h.body}`))
    .slice(0, 4);
}
