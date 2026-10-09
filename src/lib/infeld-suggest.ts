import { OBJECTION_KEYS } from "./playbook";
import type { Channel, Mission, Partner, StageId } from "./types";

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

const VENUE_SECTION_QUERY: Record<StageId, string> = {
  research: "S02-01 Badanie potrzeb Lokale pytania pogłębiające",
  contact: "S02-01 pierwsze spotkanie z lokalem pytania pogłębiające",
  discovery: "S02-01 Badanie potrzeb Lokale pytania pogłębiające dni godziny",
  needs: "S03-01 wymagane przed wysłaniem oferty problem rezultat decydent",
  offer: "S03-02 Warianty oferty A B C dla Lokali",
  negotiation: "S04 Biblioteka obiekcji Odpowiedź standardowa Pytanie pogłębiające",
  contract: "S05-02 Czego nie wolno obiecywać klientowi",
  activation: "S05-02 Bezwzględnie NIE OBIECUJEMY liczby klientów wyłączności",
};

const KLUB_STAGE_SECTION: Record<StageId, string> = {
  research: "S-KLUB-02",
  contact: "S-KLUB-03",
  discovery: "S-KLUB-04",
  needs: "S-KLUB-05",
  offer: "S-KLUB-06",
  negotiation: "S-KLUB-07",
  contract: "S-KLUB-08",
  activation: "S-KLUB-09",
};

const KLUB_SECTION_QUERY: Record<StageId, string> = {
  research: "S-KLUB-02 Research klubu zanim zadzwonisz",
  contact: "S-KLUB-03 Kontakt skrypt 15 minut discovery",
  discovery: "S-KLUB-04 Discovery pytania tylko dla klubu",
  needs: "S-KLUB-05 Typowe potrzeby dopiero po potwierdzeniu",
  offer: "S-KLUB-06 Oferta A/B/C dla klubu tylko z biblioteki",
  negotiation: "S-KLUB-07 Obiekcje klubu odpowiedź dopytaj",
  contract: "S-KLUB-08 Czego nie obiecywać w klubie",
  activation: "S-KLUB-09 Następny krok recap z datą",
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
    "v3",
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
    mission.discovery?.quote ?? "",
    mission.discovery?.description ?? "",
  ].join("|");
}

export function isKlubCategory(category?: string) {
  return /klub/i.test(category ?? "");
}

export function buildInfeldSearchQuery(partner: Partner, mission: Mission) {
  const stageId = mission.currentStage;
  if (isKlubCategory(partner.category)) {
    const base = KLUB_SECTION_QUERY[stageId];
    if (stageId !== "negotiation") return base;
    const labels = mission.objections
      .filter((item) => item.checked)
      .map((item) => OBJECTION_KEYS.find((entry) => entry.key === item.key)?.label)
      .filter(Boolean);
    return labels.length ? `${base} ${labels.join(" ")}` : base;
  }
  const base = VENUE_SECTION_QUERY[stageId] ?? VENUE_SECTION_QUERY.discovery;
  const ctx = missionSearchContext(mission);
  const checkedLabels = ctx.objections
    .map((key) => OBJECTION_KEYS.find((item) => item.key === key)?.label)
    .filter(Boolean)
    .join(" ");
  const negotiationQ = stageId === "negotiation" && checkedLabels ? checkedLabels : "";
  return [base, negotiationQ].filter(Boolean).join(" ");
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
  if (/klub|parkiet|DJ|booker/i.test(text)) {
    score += opts.category && !/klub/i.test(opts.category) ? -12 : 2;
  }
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

export type KlubSection = { code: string; title: string; body: string };

export function parseKlubSections(text: string): KlubSection[] {
  const clean = text.replace(/\r/g, "");
  const re = /(?:^|\n)(S-KLUB-\d+)\s*·\s*([^\n]+)/g;
  const matches = [...clean.matchAll(re)];
  const byCode = new Map<string, KlubSection>();
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? clean.length;
    let body = clean.slice(start, end);
    body = body.split(/\n(?=Result \d+:)/)[0] ?? body;
    body = stripResultChrome(body).replace(/\n---\s*$/g, "").trim();
    const section = { code: match[1], title: match[2].trim(), body };
    const prev = byCode.get(section.code);
    if (!prev || section.body.length > prev.body.length) byCode.set(section.code, section);
  }
  return [...byCode.values()];
}

function filterKlubObjections(body: string, keys: string[]) {
  if (!keys.length) return body;
  const blocks = body.match(/„[^”]+”[\s\S]*?(?=„|$)/g) ?? [];
  const picked = blocks
    .map((block) => block.trim())
    .filter((block) => keys.some((key) => OBJECTION_MARKERS[key]?.test(block)));
  return picked.length ? picked.join("\n\n") : body;
}

export function klubSectionHints(playbook: string, mission: Mission, remoteText?: string): KnowledgeHint[] {
  const byCode = new Map(parseKlubSections(playbook).map((section) => [section.code, section]));
  for (const section of remoteText ? parseKlubSections(remoteText) : []) {
    const prev = byCode.get(section.code);
    const complete = !prev || section.body.length >= Math.max(80, Math.floor(prev.body.length * 0.85));
    if (complete && section.body.length >= 40) byCode.set(section.code, section);
  }

  const primary = KLUB_STAGE_SECTION[mission.currentStage];
  const codes = [primary];
  if (
    (mission.currentStage === "offer" || mission.currentStage === "negotiation") &&
    primary !== "S-KLUB-08"
  ) {
    codes.push("S-KLUB-08");
  }

  const keys = mission.objections.filter((item) => item.checked).map((item) => item.key);
  const hints: KnowledgeHint[] = [];
  for (const code of codes) {
    const section = byCode.get(code);
    if (!section) continue;
    const body = code === "S-KLUB-07" ? filterKlubObjections(section.body, keys) : section.body;
    if (body.trim().length < 10) continue;
    hints.push({ title: `${section.code} · ${section.title}`, body: body.trim() });
  }
  if (!hints.length) {
    hints.push({
      title: primary,
      body: "W playbooku klubu nie ma tej sekcji.",
    });
  }
  return hints;
}

function scriptLine(body: string) {
  const match = body.match(/Skrypt \(klub\):\s*([\s\S]*?)(?:\n\n|$)/);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function objectionSpeech(body: string) {
  const answer = body.match(/Odpowiedź:\s*([^\n]+)/)?.[1]?.trim();
  const ask = body.match(/Dopytaj:\s*([^\n]+)/)?.[1]?.trim();
  return [answer, ask].filter(Boolean).join(" ");
}

function numberedQuestions(body: string) {
  const clean = (value: string) => value.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const fromLines = [...body.matchAll(/(?:^|\n)\s*\d+\.\s+([^\n]+)/g)].map((match) => clean(match[1]));
  if (fromLines.length) return fromLines.filter(Boolean);
  return [...body.matchAll(/\d+\.\s+([^?]+\?)/g)].map((match) => clean(match[1])).filter(Boolean);
}

function discoveryVoice(name: string, body: string, quote: string) {
  const questions = numberedQuestions(body);
  const open = questions.filter((question) => {
    if (!quote) return true;
    if (
      /puste|dni albo godziny/i.test(question) &&
      /środ|czwart|wtork|piąt|sobot|pust|godzin|ruch|wiecz/i.test(quote)
    ) {
      return false;
    }
    if (/od ilu osób/i.test(question) && /\d+\s*os|osób|grup/i.test(quote)) return false;
    return true;
  });
  const ask = open.slice(0, 2);
  const askLine = ask.length
    ? `Dopytaj: ${ask.join(" ")}`
    : "Dopytaj, co musi być wyłączone i kto decyduje o oknie.";
  if (quote) {
    const said = quote.replace(/[.?!…]+$/g, "");
    return `${name} mówi: „${said}”. Zapisz to jako cytat, nie jako fakt. ${askLine} Nie podawaj liczby gości z Lutry.`;
  }
  return ask.length
    ? `U ${name} pytaj słowami partnera: ${ask.join(" ")} Cytat zapisujesz dosłownie.`
    : `U ${name} pytaj słowami partnera: które dni są puste, czy grupa siada czy stoi przy barze i co musi być wyłączone. Cytat zapisujesz dosłownie.`;
}

export function venueInfeldText(raw: string) {
  const clean = raw.replace(/\r/g, "").trim();
  if (!clean) return "";
  const blocks = clean.split(/(?=^Result \d+:)/m).map((block) => block.trim()).filter(Boolean);
  const source = blocks.length > 1 || /^Result \d+:/m.test(clean) ? blocks : [clean];
  return source
    .filter((block) => !/infeld-playbook-klub|S-KLUB-/i.test(block))
    .map((block) => stripResultChrome(block))
    .filter((block) => block.length > 40)
    .join("\n\n");
}

function infeldQuestions(body: string, mission: Mission) {
  const said = [mission.discovery?.quote, mission.discovery?.description].filter(Boolean).join(" ");
  return numberedQuestions(body)
    .filter((question) => {
      if (/dni|godzin/i.test(question) && /środ|czwart|wtork|piąt|sobot|pust|godzin|ruch/i.test(said)) {
        return false;
      }
      if (/wielkość grupy|liczba osób|rachunek/i.test(question) && /\d+\s*os|osób/i.test(said)) return false;
      return true;
    })
    .slice(0, 2);
}

function infeldVariants(body: string) {
  return [...body.matchAll(/(?:^|\s)([ABC]\.\s+[^.]{8,140}\.)/g)].map((match) => match[1].trim()).slice(0, 3);
}

function infeldObjection(body: string) {
  const answer = body.match(/Odpowiedź standardowa:\s*"([^"]+)"/)?.[1]?.trim();
  const ask = body.match(/Pytanie pogłębiające[^:]*:\s*"([^"]+)"/)?.[1]?.trim();
  return [answer, ask].filter(Boolean).join(" ");
}

function infeldBanned(body: string) {
  const chunk = body.split(/Bezwzględnie NIE OBIECUJEMY:/i)[1];
  if (!chunk) return "";
  return listFrom(chunk.split(/Zakres:|###/)[0] ?? "").slice(0, 4).join("; ");
}

export function infeldSectionLabel(body: string) {
  return body.match(/S\d{2}-\d{2}/)?.[0] ?? "Infeld";
}

/** Zdanie tylko z tekstu Infelda. Puste, gdy sekcja lokalu nie wróciła. */
export function composeFromInfeld(partner: Partner, mission: Mission, remote: string) {
  const body = venueInfeldText(remote);
  if (!body) return "";
  const name = partner.name.trim() || "ten lokal";
  const questions = infeldQuestions(body, mission);
  const variants = infeldVariants(body);
  const objection = infeldObjection(body);
  const banned = infeldBanned(body);

  switch (mission.currentStage) {
    case "research":
    case "contact":
    case "discovery":
      return questions.length
        ? `${name}. ${questions.join(" ")}`
        : firstSentences(body, 2);
    case "needs":
      return firstSentences(body, 2);
    case "offer":
      return variants.length ? `${name}. ${variants.join(" ")}` : firstSentences(body, 2);
    case "negotiation":
      return objection ? `${name}. ${objection}` : firstSentences(body, 2);
    case "contract":
    case "activation":
      return banned ? `${name}. Bezwzględnie nie obiecuj: ${banned}.` : firstSentences(body, 2);
    default:
      return firstSentences(body, 2);
  }
}

export function composeKlubVoice(
  partner: Partner,
  mission: Mission,
  hints: KnowledgeHint[],
  mcpText = "",
) {
  const name = partner.name.trim() || "ten klub";
  const body = [mcpText, ...hints.map((hint) => hint.body)].filter(Boolean).join("\n\n");
  const facts = (mission.needs ?? []).filter((need) => need.confirmed && need.status === "fact");
  const factLine = facts
    .map((need) => need.title || need.description)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const quote = mission.discovery?.quote?.trim() ?? "";

  switch (mission.currentStage) {
    case "research":
      return `Zanim zadzwonisz do ${name}, sprawdź publicznie godziny, dni koncertów i kto jest bookerem albo właścicielem. To, co widać na socialu, zostaw jako hipotezę. Nie obiecuj, że wypełnicie parkiet.`;
    case "contact": {
      const script = scriptLine(body);
      return script
        ? `Na pierwszy kontakt z ${name} umawiasz 15 minut i nie sprzedajesz wariantu. ${script} Jeśli odeślą na piątek wieczór, zostaw termin na dzień roboczy.`
        : `Zadzwoń do ${name} po 15 minut discovery. Oferty A, B ani C na tym kroku nie składaj.`;
    }
    case "discovery":
      return discoveryVoice(name, body, quote);
    case "needs":
      return facts.length
        ? `Potwierdzone u ${name}: ${factLine}. Reszta zostaje obserwacją, dopóki sam tego nie potwierdzisz.`
        : `Mapy potrzeb jeszcze nie ma. Puste godziny, marża, próg grupy, ochrona i ryzyko to na razie etykiety, nie fakty ${name}.`;
    case "offer": {
      if (!facts.length) {
        return `Oferty dla ${name} jeszcze nie układaj. Najpierw fakt: puste okno, próg grupy albo zgoda na krótki pilotaż. Bez liczby gości i bez ruszania weekendu w szczycie.`;
      }
      const categories = new Set(facts.map((need) => need.category));
      const variant = categories.has("attendance")
        ? "B: próg grupy albo rachunku, który podaje partner"
        : categories.has("off_peak")
          ? "A: ruch w słabym oknie, nie w sobotni szczyt"
          : "C: krótki pilotaż na jeden dzień, bez wyłączności";
      return `Z potwierdzonych faktów (${factLine}) pasuje wariant ${variant}. Nie obiecuj liczby osób, piątku ani wstępu na event z biletem.`;
    }
    case "negotiation": {
      const speech = objectionSpeech(body);
      return speech
        ? `Na obiekcję ${name}: ${speech} Liczby gości nie obiecuj.`
        : `Dopytaj, które okno chcą dociążyć poza szczytem. Soboty pełnej nie ruszaj i nie zgaduj, ilu ludzi przyjdzie.`;
    }
    case "contract":
      return `W rozmowie z ${name} nie obiecuj liczby gości, pełnego piątku, wyłączności ani darmowego wstępu na event. Warunki idą dopiero po Twoim potwierdzeniu i na piśmie.`;
    case "activation":
      return `Następny krok z ${name} ustaw z datą: recap i 15 minut na wariant A, B albo C. Oferty nie wysyłaj z researchu ani z pierwszego telefonu.`;
    default:
      return "";
  }
}

export function readableInfeldCards(hints: KnowledgeHint[]) {
  return hints
    .filter((h) => !/infeld-playbook|\.txt|playbook klub$|segmenty i|źródło:|sales crm/i.test(`${h.title} ${h.body}`))
    .slice(0, 4);
}
