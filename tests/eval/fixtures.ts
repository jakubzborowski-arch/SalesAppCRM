import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeContext, sourceOf, type ExtractionContext } from "@/lib/discovery-extract";
import { speakerView, type SpeakerView } from "@/lib/evidence";
import { buildMissionProposal } from "@/lib/mission-extract";
import { segmentLabel } from "@/lib/playbook";
import { emptyCompany } from "@/lib/company";
import { emptyMission } from "@/lib/seed";
import type { DiscoveryExtraction } from "@/lib/discovery-extract";
import type { Mission, Partner, PartnerSegment } from "@/lib/types";

/**
 * Zestaw opisanych rozmów do testów jakości AI (tests/eval/conversations/*.json).
 * Ten sam kontekst co w CRM: rozmowa przechodzi przez sanitizeContext (redakcja telefonów, maili, NIP-ów),
 * źródło i podział na mówców liczymy tak jak podgląd w talk-bubble.tsx.
 */

export type EvalFixture = {
  id: string;
  title: string;
  segment: PartnerSegment;
  /** Dzień rozmowy (RRRR-MM-DD) — od niego liczone są daty względne w złotym wzorcu. */
  callDate: string;
  partner: { name: string; city: string; category: string; contacts: Array<{ name: string; role: string }> };
  seller: string;
  /** Czy transkrypt ma etykiety mówców („Imię Nazwisko: tekst”). */
  labeled: boolean;
  transcript: string;
  /** Oczekiwana odpowiedź modelu — dokładnie kształt EXTRACTION_SCHEMA. */
  gold: Record<string, unknown>;
  notes: string;
};

export const CONVERSATIONS_DIR = fileURLToPath(new URL("./conversations", import.meta.url));

export function loadFixtures(dir = CONVERSATIONS_DIR): EvalFixture[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as EvalFixture);
}

export function fixturePartner(f: EvalFixture): Partner {
  return {
    id: `p-${f.id}`,
    name: f.partner.name,
    segment: f.segment,
    capacity: null,
    city: f.partner.city,
    address: "",
    category: f.partner.category,
    subcategory: "",
    website: "",
    instagram: "",
    facebook: "",
    socialOther: "",
    priority: "",
    priorityReason: "",
    source: "",
    dnc: false,
    company: emptyCompany(),
    contacts: f.partner.contacts.map((c, i) => ({ id: `c-${f.id}-${i}`, name: c.name, role: c.role, isDecisionMaker: false })),
    consents: [],
  };
}

/**
 * Świeża misja. emptyMission ustawia datę następnego kroku na „jutro” według zegara — tu ją czyścimy,
 * żeby wynik nie zależał od dnia uruchomienia.
 */
export function fixtureMission(f: EvalFixture): Mission {
  return { ...emptyMission(`p-${f.id}`, `m-${f.id}`), nextStepAt: "" };
}

/** Kontekst jak z /api/discovery-extract: po sanitizeContext (redakcja danych osobowych, limity). */
export function fixtureContext(f: EvalFixture): ExtractionContext {
  const ctx = sanitizeContext({
    partner: { name: f.partner.name, segment: segmentLabel(f.segment), city: f.partner.city, category: f.partner.category },
    contacts: f.partner.contacts,
    seller: f.seller,
    callDate: f.callDate,
    note: "",
    transcripts: [{ date: f.callDate, channel: "spotkanie", text: f.transcript }],
  });
  if (!ctx) throw new Error(`Nie da się zbudować kontekstu dla ${f.id}`);
  return ctx;
}

export type FixtureSetup = {
  partner: Partner;
  mission: Mission;
  ctx: ExtractionContext;
  /** Źródło sprawdzania cytatów — dokładnie to, co dostaje model (po redakcji). */
  source: string;
  view: SpeakerView;
};

export function fixtureSetup(f: EvalFixture): FixtureSetup {
  const ctx = fixtureContext(f);
  return { partner: fixturePartner(f), mission: fixtureMission(f), ctx, source: sourceOf(ctx), view: speakerView(ctx) };
}

/** Lokalna północ dnia rozmowy — „dziś” w podglądzie (żeby daty z rozmowy nie były „minione”). */
export function dayOf(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Podgląd misji, jaki zobaczy handlowiec dla danej odpowiedzi (z bramką dowodów). */
export function previewFor(f: EvalFixture, setup: FixtureSetup, ext: DiscoveryExtraction) {
  return buildMissionProposal(ext, {
    mission: setup.mission,
    partner: setup.partner,
    source: setup.source,
    callDate: setup.ctx.callDate,
    fromDate: setup.ctx.callDate,
    today: dayOf(f.callDate),
    view: setup.view,
  });
}

/** Wszystkie teksty z odpowiedzi (rekurencyjnie) — do sprawdzenia, że nie ma w nich telefonów ani maili. */
export function allStrings(value: unknown, path = ""): Array<{ path: string; text: string }> {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => allStrings(item, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => allStrings(item, path ? `${path}.${key}` : key));
  }
  return [];
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;

/** Telefon (9+ cyfr w jednym ciągu z odstępami / myślnikami), e-mail albo NIP (10 cyfr). */
export function privateDataIn(text: string) {
  if (EMAIL.test(text)) return "e-mail";
  const runs = text.match(/\+?\d[\d\s().-]{7,}\d/g) ?? [];
  if (runs.some((run) => run.replace(/\D/g, "").length >= 9)) return "telefon / NIP";
  return null;
}
