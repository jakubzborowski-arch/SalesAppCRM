import { constraintText } from "./gates";
import { offerName, segmentLabel } from "./playbook";
import { redactPrivate } from "./redact";
import { termsLines } from "./terms";
import type { Mission, Partner } from "./types";

export { redactPrivate };

export type LocalDraftMode = "wniosek" | "umowa" | "mail";

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

function clipField(text: string) {
  return redactPrivate(text).slice(0, 360);
}

export function briefForModel(partner: Partner, mission: Mission, mode: LocalDraftMode) {
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
  if (mode === "umowa") return base;
  return `${base} Oferta A/B/C jest zablokowana, dopóki w polach nie ma razem: problemu, ograniczenia, decydenta i następnego kroku z datą (dla społeczności i firm także rezultatu, terminu decyzji i wcześniejszych prób). Nie obiecuj liczby gości, wyłączności, VIP, Premium ani darmowego wstępu. Zniżkę podawaj wyłącznie z linii „Ustalone warunki” — innych rabatów nie proponuj.`;
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
