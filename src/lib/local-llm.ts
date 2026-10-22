import { constraintText } from "./gates";
import { offerName, segmentLabel } from "./playbook";
import { termsLines } from "./terms";
import type { Mission, Partner } from "./types";

export type LocalDraftMode = "wniosek" | "umowa" | "mail" | "pola";

export type FactFields = {
  quote: string;
  problem: string;
  result: string;
  constraints: string[];
  makerName: string;
  makerRole: string;
  deadline: string;
  attempts: string;
  nextStep: string;
  nextStepAt: string;
};

const PROMISE = [
  /wyłączno/i,
  /\bpremium\b/i,
  /wypełnimy/i,
  /przyprowadzimy/i,
  /liczb[aę]\s+gości/i,
  /gwarantuj/i,
  /\bvip\b/i,
  /retencj/i,
  /\bgratis\b/i,
  /\d+\s*%/,
];

export function resolveLocalLlm(): { baseUrl: string; model: string } | null {
  const raw = process.env.LOCAL_LLM_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") return null;
  const model = process.env.LOCAL_LLM_MODEL?.trim() || "qwen3.5:4b";
  if (!/^[\w.:-]{1,64}$/.test(model)) return null;
  return { baseUrl: `${url.protocol}//${url.host}`, model };
}

export function isLocalCrmRequest(request: Request) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  return host.startsWith("127.0.0.1") || host.startsWith("localhost") || host.startsWith("[::1]");
}

const ZEN_CHAT = "/zen/v1/chat/completions";
const ZEN_MESSAGES = "/zen/v1/messages";

export type HostedLlm = {
  url: string;
  model: string;
  apiKey: string;
  wire: "openai" | "anthropic";
};

/** Klucz OpenCode Zen. Tylko oficjalny host, bez dowolnego URL. */
export function resolveHostedLlm(): HostedLlm | null {
  const apiKey = process.env.HOSTED_LLM_API_KEY?.trim() ?? "";
  if (apiKey.length < 8 || apiKey.length > 400 || /[\s]/.test(apiKey)) return null;
  const raw = process.env.HOSTED_LLM_URL?.trim() || `https://opencode.ai${ZEN_CHAT}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "opencode.ai") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const path = url.pathname.replace(/\/$/, "");
  if (path !== ZEN_CHAT && path !== ZEN_MESSAGES) return null;
  const model =
    process.env.HOSTED_LLM_MODEL?.trim() || (path === ZEN_MESSAGES ? "qwen3.5-plus" : "deepseek-v4-flash");
  if (!/^[\w.-]{1,64}$/.test(model)) return null;
  return { url: `https://opencode.ai${path}`, model, apiKey, wire: path === ZEN_MESSAGES ? "anthropic" : "openai" };
}

/** Zdejmuje telefon, mail i NIP. Zostawia daty i krótkie liczby z faktów. */
export function redactPrivate(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[usunieto]")
    .replace(/(?:\+|00)?\d[\d\s().-]{7,}\d/g, (match) =>
      match.replace(/\D/g, "").length >= 9 ? "[usunieto]" : match,
    )
    .replace(/\b\d{10}\b/g, "[usunieto]")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function clipField(text: string) {
  return redactPrivate(text).slice(0, 360);
}

const FACT_EXTRACT_TASK =
  "Z notatki wypisz pola, które da się w niej wskazać. Jedna linia na pole. Gdy czegoś nie powiedziano, napisz BRAK. Nie dopisuj dni, godzin ani liczb spoza notatki.\nCYTAT: jedno zdanie rozmówcy, dosłownie\nPROBLEM:\nREZULTAT:\nOGRANICZENIA: krótkie hasła rozdzielone |\nDECYDENT:\nROLA:\nTERMIN:\nPROBY:\nKROK:\nDATA: RRRR-MM-DD albo BRAK";

export function briefForModel(partner: Partner, mission: Mission, mode: LocalDraftMode) {
  if (mode === "pola") {
    const clean = redactPrivate(mission.conversationNote ?? "").slice(0, 2800);
    return { source: clean, task: FACT_EXTRACT_TASK, hasFact: clean.length >= 40 };
  }
  const facts = mission.needs
    .filter((need) => need.confirmed && need.status === "fact")
    .slice(0, 6)
    .map((need) =>
      [need.title, need.description, need.constraints, need.expectedResult]
        .map((part) => clipField(part ?? ""))
        .filter(Boolean)
        .join(" — "),
    )
    .filter(Boolean);

  const decision = mission.decision;
  const constraints = constraintText(mission);
  const lines = [
    `Partner (${segmentLabel(partner.segment).toLowerCase()}): ${clipField(partner.name) || "partner"}`,
    partner.city.trim() ? `Miasto: ${clipField(partner.city)}` : "",
    partner.category.trim() ? `Kategoria: ${clipField(partner.category)}` : "",
    decision.problem.trim() ? `Problem: ${clipField(decision.problem)}` : "",
    decision.expectedResult.trim() ? `Rezultat: ${clipField(decision.expectedResult)}` : "",
    constraints ? `Ograniczenia: ${clipField(constraints)}` : "",
    decisionMakerLine(partner, decision.decisionMakerId),
    decision.decisionDeadline.trim() ? `Termin decyzji: ${clipField(decision.decisionDeadline)}` : "",
    decision.previousAttempts.trim() ? `Wcześniejsze próby: ${clipField(decision.previousAttempts)}` : "",
    decision.nextStep.trim() ? `Następny krok: ${clipField(decision.nextStep)}` : "",
    mission.nextStepAt?.trim() ? `Data następnego kroku: ${clipField(mission.nextStepAt.slice(0, 10))}` : "",
    facts.length ? `Potwierdzone fakty:\n- ${facts.join("\n- ")}` : "Potwierdzone fakty: brak",
    gateLine(decision, constraints, mission.nextStepAt),
    mission.selectedVariant
      ? `Wybrany wariant: ${mission.selectedVariant}. ${offerName(mission.selectedVariant, partner.segment)}`
      : "",
    // Warunki ustalone w kroku Oferta (zniżka, cykl, pilotaż, okres) — jedyne, które wolno powtórzyć.
    termsLines(mission, partner.segment).length
      ? `Ustalone warunki:\n- ${termsLines(mission, partner.segment).map((line) => clipField(line)).join("\n- ")}`
      : "Ustalone warunki: brak",
    mode === "umowa" ? "" : callNote(mission.conversationNote),
  ].filter(Boolean);

  const source = lines.join("\n");
  const task =
    mode === "umowa"
      ? "Napisz po polsku dwie krótkie części: „Do powiedzenia” (3-5 zdań) i „Recap warunków”. Użyj tylko pól powyżej. Zniżkę i okres podaj tylko tak, jak stoją w „Ustalone warunki”. Nie dodawaj innych rabatów, liczby gości, wyłączności, VIP, Premium ani dat, których nie ma w polach."
      : mode === "mail"
        ? "Napisz propozycję maila recap dla handlowca, nie wysyłkę. Najpierw linia „Temat:”, potem krótka treść. Oprzyj ją na notatce z dzwonienia: powtórz tylko to, co tam padło, i pola, które są wypełnione. Cytat tylko dosłowny z notatki. Status oferty bierz z linii Bramka: przy ZABLOKOWANA nie proponuj wariantu A/B/C. Podpisz „[imię] z Lutry”. Nie powtarzaj listy zakazów i nie podawaj adresu e-mail."
        : "Napisz wniosek po polsku, krótko. 1) Co rozmówca powiedział w notatce z dzwonienia, z jednym krótkim cytatem wziętym stamtąd dosłownie. 2) Co z tego wynika wobec pól. 3) Przepisz status z linii Bramka bez zmiany. Wariant A (ruch poza szczytem), B (oferta grupowa) albo C (pilotaż) tylko gdy Bramka mówi GOTOWA. Nie dopisuj zdań, których nie ma w notatce ani w polach. Nie zmieniaj dni ani godzin. Nie powtarzaj listy zakazów.";

  const note = mission.conversationNote?.trim() ?? "";
  return {
    source,
    task,
    hasFact: facts.length > 0 || Boolean(decision.problem.trim()) || (mode !== "umowa" && note.length >= 40),
  };
}

function callNote(note?: string | null) {
  const clean = redactPrivate(note ?? "").slice(0, 2800);
  return clean.length >= 40
    ? `Notatka z dzwonienia:\n${clean}`
    : "Notatka z dzwonienia: brak. Nie wymyślaj treści rozmowy.";
}

function gateLine(
  decision: Mission["decision"],
  constraints: string,
  nextStepAt?: string,
) {
  const fields: Array<[string, string]> = [
    ["problem", decision.problem],
    ["rezultat", decision.expectedResult],
    ["ograniczenie", constraints],
    ["decydent", decision.decisionMakerId],
    ["termin decyzji", decision.decisionDeadline],
    ["wcześniejsze próby", decision.previousAttempts],
    ["następny krok z datą", decision.nextStep.trim() && nextStepAt?.trim() ? decision.nextStep : ""],
  ];
  const missing = fields.filter(([, value]) => !value.trim()).map(([label]) => label);
  return missing.length
    ? `Bramka: ZABLOKOWANA. Brakuje: ${missing.join(", ")}.`
    : "Bramka: GOTOWA. Siedem pól jest w danych.";
}

function decisionMakerLine(partner: Partner, decisionMakerId: string) {
  const maker =
    partner.contacts.find((contact) => contact.id === decisionMakerId) ??
    partner.contacts.find((contact) => contact.isDecisionMaker);
  if (!maker?.name.trim()) return "";
  const role = maker.role.trim() ? `, ${clipField(maker.role)}` : "";
  return `Decydent: ${clipField(maker.name)}${role}`;
}

export function systemForDraft(mode: LocalDraftMode) {
  const base =
    "Jesteś analitykiem rozmów handlowych B2B dla Lutry. Rozmowa jest w bloku „Notatka z dzwonienia”, jeśli tam jest. Cytat bierz tylko stamtąd, dosłownie. Nie masz telefonu, maila, NIP-u ani pliku nagrania i nie prosisz o nie. Czego nie ma w notatce ani w polach, nie dopisuj. Szkic nie jest umową i nie wolno go wysłać partnerowi bez człowieka.";
  if (mode === "umowa" || mode === "pola") {
    return mode === "pola" ? `${base} Wypisujesz tylko linie pól. Nie piszesz maila ani wniosku.` : base;
  }
  return `${base} Oferta A/B/C jest zablokowana, dopóki w polach nie ma razem: problemu, rezultatu, ograniczenia, decydenta, terminu decyzji, wcześniejszych prób i następnego kroku z datą. Nie obiecuj liczby gości, wyłączności, VIP, Premium ani darmowego wstępu. Zniżkę podawaj wyłącznie z linii „Ustalone warunki” — innych rabatów nie proponuj.`;
}

function blank(value: string) {
  const text = value.trim();
  return !text || /^brak\.?$/i.test(text);
}

function grounded(value: string, note: string) {
  const hay = note.toLocaleLowerCase("pl");
  const needle = value.toLocaleLowerCase("pl").replace(/\s+/g, " ").replace(/[„”"»«]/g, "").trim();
  if (needle.length >= 12 && hay.includes(needle)) return true;
  const words = needle.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4);
  if (!words.length) return false;
  const hits = words.filter((word) => hay.includes(word)).length;
  return hits >= Math.min(2, words.length);
}

function keep(value: string, note: string) {
  const text = value.trim().slice(0, 360);
  if (blank(text) || !grounded(text, note)) return "";
  return text;
}

export function parseFactFields(draft: string, note: string): FactFields {
  const lines = new Map<string, string>();
  for (const raw of draft.split("\n")) {
    const match = raw.match(/^\**\s*([A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)\**\s*:\s*(.*)$/);
    if (!match) continue;
    lines.set(match[1].toLocaleUpperCase("pl"), match[2].trim());
  }
  const read = (key: string) => lines.get(key) ?? "";
  const constraints = read("OGRANICZENIA")
    .split(/[|;]/)
    .map((item) => keep(item, note))
    .filter(Boolean)
    .slice(0, 6);
  const date = read("DATA").trim();
  const nextStepAt = /^\d{4}-\d{2}-\d{2}$/.test(date) && note.includes(date) ? date : "";
  return {
    quote: keep(read("CYTAT"), note),
    problem: keep(read("PROBLEM"), note),
    result: keep(read("REZULTAT"), note),
    constraints,
    makerName: keep(read("DECYDENT"), note),
    makerRole: keep(read("ROLA"), note),
    deadline: keep(read("TERMIN"), note),
    attempts: keep(read("PROBY") || read("PRÓBY"), note),
    nextStep: keep(read("KROK"), note),
    nextStepAt,
  };
}

export function draftBreaksRules(draft: string, source: string) {
  return PROMISE.some((pattern) => pattern.test(draft) && !pattern.test(source));
}

export function stripModelNoise(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```[a-z]*\n?|```/gi, "")
    .trim()
    .slice(0, 1200);
}
