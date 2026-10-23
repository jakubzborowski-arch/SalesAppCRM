import { formatNip } from "./company";
import { formatPlDate, isIsoDate, toIsoDate } from "./dates";
import { CONTRACT_DISCLAIMERS, offerName, segmentLabel } from "./playbook";
import { periodText, termsLines } from "./terms";
import type { Mission, Partner, PartnerSegment } from "./types";

/**
 * Szablon umowy: zwykły tekst z polami {{nazwa}}.
 * Linia zaczynająca się od „# ” to tytuł, „## ” — nagłówek paragrafu, „- ” — punkt listy.
 * Pusta linia rozdziela akapity.
 */
export const TEMPLATE_FIELDS: { key: string; label: string }[] = [
  { key: "data", label: "Data sporządzenia" },
  { key: "firma", label: "Nazwa firmy / organizacji partnera" },
  { key: "nip", label: "NIP partnera" },
  { key: "regon", label: "REGON partnera" },
  { key: "adres_siedziby", label: "Adres siedziby" },
  { key: "adres_korespondencji", label: "Adres do korespondencji" },
  { key: "email_faktury", label: "E-mail do faktur" },
  { key: "lokal", label: "Nazwa partnera w aplikacji (lokal, społeczność, firma)" },
  { key: "lokal_adres", label: "Adres lokalu" },
  { key: "reprezentant", label: "Osoba podpisująca po stronie partnera" },
  { key: "osoba", label: "Imię osoby kontaktowej (do maila)" },
  { key: "typ", label: "Typ partnera (miejsce / społeczność / firma)" },
  { key: "wariant", label: "Wariant oferty (A/B/C + nazwa)" },
  { key: "warunki_wspolpracy", label: "Ustalone warunki: zniżka, miejsce, cykl albo pilotaż (punkty)" },
  { key: "realizacja", label: "Jak działa realizacja (zniżka: QR / kod / hasło; cykl albo pilotaż w aplikacji)" },
  { key: "warunki", label: "Warunki i ograniczenia z rozmowy" },
  { key: "okres", label: "Okres współpracy (od–do)" },
  { key: "start", label: "Data rozpoczęcia" },
  { key: "koniec", label: "Data zakończenia" },
  { key: "zasady_zmian", label: "Zasady zmian i wycofania (7 dni)" },
  { key: "zgody_marki", label: "Zgody na nazwę, logo i zdjęcia" },
  { key: "kontakt_awaryjny", label: "Kontakt awaryjny / organizator po stronie partnera" },
  { key: "kolejne_kroki", label: "Co dzieje się po potwierdzeniu (zależnie od typu partnera)" },
  { key: "raporty", label: "Co i jak często przekazujemy partnerowi — zdanie do umowy" },
  { key: "raporty_mail", label: "Co i jak często przekażemy partnerowi — zdanie do maila" },
  { key: "handlowiec", label: "Handlowiec Lutry" },
  { key: "zakazy", label: "Czego Lutra nie gwarantuje (lista do umowy)" },
];

export const DEFAULT_CONTRACT_TEMPLATE = `# Umowa współpracy partnerskiej

Wzór roboczy — przed pierwszym użyciem do weryfikacji prawnej. Pola w nawiasach kwadratowych uzupełnia administrator w Ustawieniach, w sekcji Szablony.

Zawarta dnia {{data}} pomiędzy:

[pełna nazwa spółki Lutra], [adres], NIP [NIP Lutry], reprezentowaną przez [imię i nazwisko, funkcja], zwaną dalej „Lutrą”,

a

{{firma}}, {{adres_siedziby}}, NIP {{nip}}, reprezentowaną przez {{reprezentant}}, zwaną dalej „Partnerem” ({{lokal}}, {{lokal_adres}}).

## § 1. Przedmiot umowy

Lutra prezentuje Partnera w aplikacji Lutra i kieruje do niego grupy użytkowników, którzy wspólnie organizują wyjścia. Partner zapewnia warunki z § 2. Współpraca obejmuje cykl wydarzeń, a nie pojedyncze wydarzenie.

## § 2. Warunki współpracy

Typ partnera: {{typ}}. Wariant: {{wariant}}.

{{warunki_wspolpracy}}

Ograniczenia uzgodnione w rozmowie: {{warunki}}.

## § 3. Realizacja

{{realizacja}}

## § 4. Bez opłat

Strony nie pobierają od siebie opłat. Lutra nie płaci za obecność w lokalu, a Partner nie płaci za bycie partnerem — Strony wymieniają się ruchem.

## § 5. Okres, zmiany i wycofanie zniżki

Umowa obowiązuje w okresie: {{okres}}.

{{zasady_zmian}}

## § 6. Nazwa, logo i zdjęcia

{{zgody_marki}}

## § 7. Informacje i przegląd po cyklu

{{raporty}} Po pierwszym cyklu Strony oceniają frekwencję i zgłoszenia uczestników i decydują o kontynuacji współpracy.

Kontakt awaryjny po stronie Partnera: {{kontakt_awaryjny}}.

## § 8. Dane uczestników

Lutra nie sprzedaje ani nie przekazuje Partnerowi danych osobowych uczestników wydarzeń.

## § 9. Czego Lutra nie obiecuje

Lutra nie gwarantuje w szczególności:

{{zakazy}}

## § 10. Kontakt i korespondencja

Korespondencję do Partnera kieruje się na adres: {{adres_korespondencji}}. Faktury i rozliczenia: {{email_faktury}}.

Opiekun Partnera po stronie Lutry: {{handlowiec}}.

## § 11. Postanowienia końcowe

Zmiany umowy wymagają formy pisemnej lub elektronicznej pod rygorem nieważności. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.

Za Lutrę: ______________________ (data, podpis)

Za Partnera: ______________________ (data, podpis)
`;

/** Porozumienie mailowe przy krótkiej współpracy (do 3 miesięcy). Zwykły tekst maila. */
export const DEFAULT_AGREEMENT_TEMPLATE = `Temat: Lutra × {{lokal}} — potwierdzenie warunków współpracy

Dzień dobry,

dziękuję za rozmowę. Zgodnie z ustaleniami potwierdzam warunki współpracy z Lutrą:

{{warunki_wspolpracy}}
- Okres: {{okres}}
- Realizacja: {{realizacja}}

Zasady:
- {{zasady_zmian}}
- Współpraca jest bez opłat w obie strony — wymieniamy się ruchem.
- {{raporty_mail}}
- {{zgody_marki}}
- Nie przekazujemy partnerom danych uczestników.

Proszę o odpowiedź na tego maila z potwierdzeniem warunków. {{kolejne_kroki}}

Pozdrawiam,
{{handlowiec}}
Lutra
`;

export type TemplateValues = Record<string, string>;

const REDEMPTION_TEXT: Record<string, string> = {
  qr: "Po utworzeniu wydarzenia w lokalu aplikacja generuje kod QR ważny jednorazowo w dniu wydarzenia. Obsługa skanuje kod i nalicza zniżkę.",
  code: "Po utworzeniu wydarzenia w lokalu aplikacja generuje kod numeryczny ważny jednorazowo w dniu wydarzenia. Pracownik wpisuje go w kasie jako rabat.",
  password:
    "Gość podaje hasło lokalu i pokazuje wydarzenie w aplikacji Lutra. Obsługa nalicza zniżkę ręcznie (wariant bez wdrożenia).",
};

function brandText(mission: Mission, segment: PartnerSegment) {
  const granted = [
    mission.checklist["contract:brand_app"] ? "nazwy i logo w aplikacji Lutra" : "",
    mission.checklist["contract:brand_photos"] ? "zdjęć w aplikacji Lutra" : "",
    mission.checklist["contract:brand_social"] ? "nazwy, logo i zdjęć w social mediach Lutry" : "",
  ].filter(Boolean);
  if (!granted.length) {
    return segment === "company"
      ? "Lutra nie używa nazwy ani logo firmy publicznie bez osobnej zgody."
      : "Zgoda na nazwę i logo — do uzupełnienia przed publikacją w aplikacji.";
  }
  const rest = segment === "company" ? "" : mission.checklist["contract:brand_social"] ? "" : " Inne użycie (np. social media Lutry) tylko po osobnej zgodzie.";
  return `Zgoda Partnera na użycie: ${granted.join(", ")}.${rest}`;
}

/** Jak działa realizacja warunków u partnera danego typu. */
function realizationText(mission: Mission, segment: PartnerSegment) {
  if (segment === "community") {
    return "Wydarzenia cyklu organizator tworzy w aplikacji Lutra, a uczestnicy zapisują się przez aplikację. Lutra pomaga domknąć listę i frekwencję.";
  }
  if (segment === "company") {
    return "Zespół pilotażowy dostaje dostęp do aplikacji Lutra. Na koniec pilotażu Strony omawiają feedback zespołu i decydują o dalszej współpracy.";
  }
  const d = mission.terms.discount;
  if (!d.redemption) return "";
  return `${REDEMPTION_TEXT[d.redemption]}${d.redemption === "password" && d.password.trim() ? ` Hasło: „${d.password.trim()}”.` : ""}`;
}

/** Co przekazujemy partnerowi po drodze: lokal — liczba realizacji co miesiąc, inni — podsumowanie cyklu. */
function reportsText(segment: PartnerSegment) {
  if (segment === "community") return "Po każdym cyklu Lutra przekazuje podsumowanie frekwencji na wydarzeniach.";
  if (segment === "company") return "Na koniec pilotażu Lutra przekazuje podsumowanie korzystania z aplikacji przez zespół.";
  return "Lutra raz w miesiącu przekazuje Partnerowi informację o liczbie realizacji zniżki.";
}

function reportsMailText(segment: PartnerSegment) {
  if (segment === "community") return "Po każdym cyklu prześlemy podsumowanie frekwencji.";
  if (segment === "company") return "Na koniec pilotażu prześlemy podsumowanie korzystania z aplikacji przez zespół.";
  return "Raz w miesiącu prześlemy informację o liczbie realizacji zniżki.";
}

function nextStepsText(partner: Partner, segment: PartnerSegment) {
  if (segment === "community") return "Po potwierdzeniu pomożemy utworzyć w aplikacji pierwsze wydarzenie cyklu.";
  if (segment === "company") return "Po potwierdzeniu przekażemy dostęp zespołowi pilotażowemu i umówimy termin feedbacku.";
  return `Po potwierdzeniu dodamy ${partner.name} do aplikacji, przekażemy naklejkę i zrobimy razem testową realizację zniżki.`;
}

/**
 * Mail z szablonu porozumienia: pierwsza linia „Temat: …” to temat, reszta to treść.
 * Bez linii tematu temat jest pusty.
 */
export function splitEmail(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const first = lines.findIndex((line) => line.trim());
  const match = first >= 0 ? lines[first].trim().match(/^temat\s*:\s*(.*)$/i) : null;
  if (!match) return { subject: "", body: text.trim() };
  return { subject: match[1].trim(), body: lines.slice(first + 1).join("\n").trim() };
}

/** Wartości pól z karty partnera i misji. Puste pole = brak danych. */
export function templateValues(partner: Partner, mission: Mission, seller: string, today = new Date()): TemplateValues {
  const c = partner.company;
  const contract = mission.contract;
  const segment = partner.segment ?? "venue";
  const signer =
    partner.contacts.find((p) => p.id === mission.decision.decisionMakerId) ??
    partner.contacts.find((p) => p.isDecisionMaker);
  const date = (value: string) => (isIsoDate(value) ? formatPlDate(value) : value.trim());
  const variant = mission.selectedVariant
    ? `${mission.selectedVariant} — ${offerName(mission.selectedVariant, segment)}`
    : "";
  const conditions = mission.decision.constraintSummary.trim() || mission.discovery.constraints.join(", ");
  const lines = termsLines(mission, segment).filter((line) => !line.startsWith("Okres:"));
  const realization = realizationText(mission, segment);
  const a = mission.activation;
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
    osoba: signer?.name.trim().split(/\s+/)[0] ?? "",
    typ: segmentLabel(segment).toLowerCase(),
    wariant: variant,
    warunki_wspolpracy: lines.map((line) => `- ${line}`).join("\n"),
    realizacja: realization,
    warunki: conditions,
    okres: periodText(contract),
    start: date(contract.startAt),
    koniec: date(contract.endAt),
    zasady_zmian: contract.changeRules.trim(),
    zgody_marki: brandText(mission, segment),
    kontakt_awaryjny: [a.opsContactName.trim(), a.opsContactPhone.trim()].filter(Boolean).join(", "),
    kolejne_kroki: nextStepsText(partner, segment),
    raporty: reportsText(segment),
    raporty_mail: reportsMailText(segment),
    handlowiec: seller,
    zakazy: CONTRACT_DISCLAIMERS.map((item) => `- ${item}`).join("\n"),
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
