import { formatNip } from "./company";
import { formatPlDate, isIsoDate, toIsoDate } from "./dates";
import { FORBIDDEN_PROMISES, offerName } from "./playbook";
import type { Mission, Partner } from "./types";

/**
 * Szablon umowy: zwykły tekst z polami {{nazwa}}.
 * Linia zaczynająca się od „# ” to tytuł, „## ” — nagłówek paragrafu, „- ” — punkt listy.
 * Pusta linia rozdziela akapity.
 */
export const TEMPLATE_FIELDS: { key: string; label: string }[] = [
  { key: "data", label: "Data sporządzenia" },
  { key: "firma", label: "Nazwa firmy partnera" },
  { key: "nip", label: "NIP partnera" },
  { key: "regon", label: "REGON partnera" },
  { key: "adres_siedziby", label: "Adres siedziby" },
  { key: "adres_korespondencji", label: "Adres do korespondencji" },
  { key: "email_faktury", label: "E-mail do faktur" },
  { key: "lokal", label: "Nazwa lokalu" },
  { key: "lokal_adres", label: "Adres lokalu" },
  { key: "reprezentant", label: "Osoba podpisująca po stronie partnera" },
  { key: "wariant", label: "Wariant oferty (A/B/C + nazwa)" },
  { key: "warunki", label: "Warunki i ograniczenia z rozmowy" },
  { key: "start", label: "Data rozpoczęcia" },
  { key: "koniec", label: "Data zakończenia" },
  { key: "zasady_zmian", label: "Zasady zmian i wypowiedzenia" },
  { key: "handlowiec", label: "Handlowiec Lutry" },
  { key: "zakazy", label: "Lista rzeczy, których Lutra nie obiecuje" },
];

export const DEFAULT_CONTRACT_TEMPLATE = `# Umowa współpracy partnerskiej

Wzór roboczy — przed pierwszym użyciem do weryfikacji prawnej. Pola w nawiasach kwadratowych uzupełnia administrator w Ustawieniach, w sekcji Szablon umowy.

Zawarta dnia {{data}} pomiędzy:

[pełna nazwa spółki Lutra], [adres], NIP [NIP Lutry], reprezentowaną przez [imię i nazwisko, funkcja], zwaną dalej „Lutrą”,

a

{{firma}}, {{adres_siedziby}}, NIP {{nip}}, REGON {{regon}}, reprezentowaną przez {{reprezentant}}, zwaną dalej „Partnerem”, prowadzącą lokal {{lokal}} ({{lokal_adres}}).

## § 1. Przedmiot umowy

Lutra udostępnia Partnerowi miejsce w aplikacji Lutra i prezentuje jego ofertę użytkownikom aplikacji. Partner honoruje ofertę na warunkach z § 2.

## § 2. Oferta Partnera

Wariant: {{wariant}}.

Warunki uzgodnione w rozmowie: {{warunki}}.

## § 3. Okres obowiązywania

Umowa obowiązuje od {{start}} do {{koniec}}.

{{zasady_zmian}}

## § 4. Czego Lutra nie obiecuje

Lutra nie gwarantuje w szczególności:

{{zakazy}}

## § 5. Kontakt i korespondencja

Korespondencję do Partnera kieruje się na adres: {{adres_korespondencji}}. Faktury: {{email_faktury}}.

Opiekun Partnera po stronie Lutry: {{handlowiec}}.

## § 6. Postanowienia końcowe

Zmiany umowy wymagają formy pisemnej lub elektronicznej pod rygorem nieważności. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze stron.

Za Lutrę: ______________________ (data, podpis)

Za Partnera: ______________________ (data, podpis)
`;

export type TemplateValues = Record<string, string>;

/** Wartości pól z karty partnera i misji. Puste pole = brak danych. */
export function templateValues(partner: Partner, mission: Mission, seller: string, today = new Date()): TemplateValues {
  const c = partner.company;
  const contract = mission.contract;
  const signer =
    partner.contacts.find((p) => p.id === mission.decision.decisionMakerId) ??
    partner.contacts.find((p) => p.isDecisionMaker);
  const date = (value: string) => (isIsoDate(value) ? formatPlDate(value) : value.trim());
  const variant = mission.selectedVariant ? `${mission.selectedVariant} — ${offerName(mission.selectedVariant)}` : "";
  const conditions = mission.decision.constraintSummary.trim() || mission.discovery.constraints.join(", ");
  return {
    data: formatPlDate(toIsoDate(today)),
    firma: contract.companyName.trim() || c.legalName,
    nip: contract.nip.trim() ? formatNip(contract.nip) : c.nip ? formatNip(c.nip) : "",
    regon: c.regon,
    adres_siedziby: contract.address.trim() || c.legalAddress,
    adres_korespondencji: c.mailingAddress || c.legalAddress || contract.address.trim(),
    email_faktury: c.billingEmail,
    lokal: partner.name,
    lokal_adres: [partner.address, partner.city].filter(Boolean).join(", "),
    reprezentant: signer ? [signer.name, signer.role].filter(Boolean).join(", ") : "",
    wariant: variant,
    warunki: conditions,
    start: date(contract.startAt),
    koniec: date(contract.endAt),
    zasady_zmian: contract.changeRules.trim(),
    handlowiec: seller,
    zakazy: FORBIDDEN_PROMISES.map((item) => `- ${item}`).join("\n"),
  };
}

const FIELD = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Pola użyte w szablonie, dla których brakuje danych. */
export function missingFields(template: string, values: TemplateValues) {
  const missing = new Set<string>();
  for (const match of template.matchAll(FIELD)) {
    const key = match[1];
    if (!(values[key] ?? "").trim()) missing.add(key);
  }
  return [...missing].map((key) => TEMPLATE_FIELDS.find((f) => f.key === key)?.label ?? key);
}

/** Nieznane pola w szablonie (literówki). */
export function unknownFields(template: string) {
  const known = new Set(TEMPLATE_FIELDS.map((f) => f.key));
  return [...new Set([...template.matchAll(FIELD)].map((m) => m[1]).filter((key) => !known.has(key)))];
}

export function fillTemplate(template: string, values: TemplateValues) {
  return template.replace(FIELD, (_, key: string) => (values[key] ?? "").trim() || "……………");
}

export type Block = { kind: "title" | "heading" | "paragraph" | "bullet"; text: string };

/** Tekst umowy → bloki do złożenia PDF. */
export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("# ")) {
      flush();
      blocks.push({ kind: "title", text: line.slice(2).trim() });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "heading", text: line.slice(3).trim() });
    } else if (/^[-•]\s+/.test(line)) {
      flush();
      blocks.push({ kind: "bullet", text: line.replace(/^[-•]\s+/, "") });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
