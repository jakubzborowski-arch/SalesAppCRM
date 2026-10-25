import { monthLabel } from "./agenda";
import { shiftMonth } from "./health";
import type { Partner, PartnerMetrics, PartnerMetricsInput } from "./types";

export type ReportEmail = { to: string; subject: string; body: string };

/** Adres do maila z podsumowaniem: decydent, potem dowolny kontakt z mailem. Pusty, gdy nie ma. */
export function reportRecipient(partner: Pick<Partner, "contacts">) {
  const withEmail = partner.contacts.filter((c) => c.email?.trim());
  return (withEmail.find((c) => c.isDecisionMaker) ?? withEmail[0])?.email?.trim() ?? "";
}

function change(current: number | null, previous: number | null | undefined, prevMonth: string) {
  if (current === null || previous === null || previous === undefined) return "";
  const diff = current - previous;
  const sign = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "bez zmian";
  return ` (${monthLabel(prevMonth)}: ${previous}, ${sign})`;
}

/**
 * Mail z miesięcznym podsumowaniem dla partnera: same fakty z panelu Lutry, zmiana względem poprzedniego miesiąca,
 * bez obietnic co do przyszłych liczb. CRM niczego nie wysyła — handlowiec kopiuje albo otwiera w poczcie.
 */
export function partnerReportEmail(input: {
  partner: Pick<Partner, "name" | "segment" | "contacts">;
  month: string;
  metric: PartnerMetricsInput;
  previous?: PartnerMetrics | null;
  senderName?: string;
}): ReportEmail {
  const { partner, month, metric, previous } = input;
  const prevMonth = shiftMonth(month, -1);
  const lines: string[] = [];
  if (metric.events !== null) lines.push(`- Wydarzenia z Lutrą: ${metric.events}${change(metric.events, previous?.events, prevMonth)}`);
  if (metric.attendees !== null) {
    lines.push(`- Uczestnicy: ${metric.attendees}${change(metric.attendees, previous?.attendees, prevMonth)}`);
  }
  if (partner.segment === "venue" && metric.redemptions !== null) {
    lines.push(`- Realizacje zniżki: ${metric.redemptions}${change(metric.redemptions, previous?.redemptions, prevMonth)}`);
  }
  const body = [
    "Dzień dobry,",
    "",
    `przesyłam krótkie podsumowanie współpracy ${partner.name} z Lutrą za ${monthLabel(month)}.`,
    "",
    ...(lines.length ? lines : ["- W tym miesiącu nie mamy jeszcze liczb do pokazania."]),
    "",
    partner.segment === "venue"
      ? "Liczby pochodzą z panelu Lutry: realizacje to zniżki wykorzystane przez osoby z aplikacji."
      : "Liczby pochodzą z panelu Lutry.",
    "Jeśli coś nie zgadza się z Państwa obserwacjami albo chcą Państwo coś zmienić w godzinach lub warunkach, proszę o krótką wiadomość — chętnie porozmawiam.",
    "",
    "Pozdrawiam",
    input.senderName?.trim() || "Zespół Lutry",
    "Lutra",
  ].join("\n");
  return {
    to: reportRecipient(partner),
    subject: `Lutra × ${partner.name}: podsumowanie za ${monthLabel(month)}`,
    body,
  };
}

export function mailtoHref(mail: ReportEmail) {
  const params = `subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body.replace(/\n/g, "\r\n"))}`;
  return `mailto:${mail.to ? encodeURIComponent(mail.to).replace(/%40/g, "@") : ""}?${params}`;
}
