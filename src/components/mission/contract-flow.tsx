"use client";

import { useEffect, useState } from "react";
import { buildContractPdf } from "@/lib/contract-pdf";
import {
  DEFAULT_AGREEMENT_TEMPLATE,
  DEFAULT_CONTRACT_TEMPLATE,
  fillTemplate,
  missingFields,
  splitEmail,
  templateValues,
  toBlocks,
} from "@/lib/contract-template";
import { contractPdfUrl } from "@/lib/mission-core";
import { useStore } from "@/lib/store";
import type { ContractStatus, Mission, Partner } from "@/lib/types";
import { CheckRow, Note } from "@/components/ui";

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Szkic — brak dokumentu",
  ready: "Dokument gotowy",
  sent: "Wysłana do podpisu",
  partner_signed: "Podpisana przez partnera",
  signed: "Podpisana przez obie strony",
};

/** Te same statusy dla porozumienia mailowego. */
export const AGREEMENT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Mail z warunkami jeszcze nie wyszedł",
  ready: "Mail z warunkami jeszcze nie wyszedł",
  sent: "Mail wysłany — czekamy na potwierdzenie",
  partner_signed: "Partner potwierdził — brakuje zatwierdzenia Lutry",
  signed: "Porozumienie potwierdzone przez obie strony",
};

/** Kontakt do maila: decydent z rozmowy, potem główny kontakt, potem pierwszy z adresem. */
function mailContact(partner: Partner, mission: Mission) {
  return (
    partner.contacts.find((c) => c.id === mission.decision.decisionMakerId && c.email) ??
    partner.contacts.find((c) => c.isDecisionMaker && c.email) ??
    partner.contacts.find((c) => c.email)
  );
}

/** Wpis w dzienniku kontaktów przy wysyłce / potwierdzeniu (bez blokowania, gdy dziennika nie ma). */
function useLogMail(mission: Mission, partner?: Partner) {
  const { logActivity } = useStore();
  return (subject: string, direction: "outbound" | "inbound") => {
    const contactId =
      (partner && mailContact(partner, mission)?.id) ??
      partner?.contacts.find((c) => c.isDecisionMaker)?.id ??
      partner?.contacts[0]?.id ??
      "";
    void logActivity({
      missionId: mission.id,
      channel: "email",
      direction,
      outcome: direction === "outbound" ? "sent" : "replied",
      subject,
      summary: "",
      contactId,
      occurredAt: new Date().toISOString(),
      durationMin: null,
    }).catch(() => undefined);
  };
}

/**
 * Porozumienie mailowe (krótka współpraca do 3 miesięcy): treść maila z szablonu, wysyłka z własnej poczty,
 * potwierdzenie partnera i zatwierdzenie Lutry. Bez PDF.
 */
export function AgreementEmail({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { state, updateContract, uploadSignedContract } = useStore();
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logMail = useLogMail(mission, partner);
  const c = mission.contract;
  const template = state.workspace.agreementTemplate || DEFAULT_AGREEMENT_TEMPLATE;
  const values = templateValues(partner, mission, state.user.name);
  const missing = missingFields(template, values);
  const { subject, body } = splitEmail(fillTemplate(template, values));
  const contact = mailContact(partner, mission);
  const proof = useFileUrl(c.signedDocumentPath);
  const brandMissing = partner.segment !== "company" && !mission.checklist["contract:brand_app"];

  const copy = async (what: "subject" | "body") => {
    try {
      await navigator.clipboard.writeText(what === "subject" ? subject : body);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Przeglądarka nie pozwoliła skopiować — zaznacz tekst ręcznie.");
    }
  };
  const mailto = contact?.email
    ? `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <div className="mt-5 rounded-2xl border border-line px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">Porozumienie mailowe</p>
      <p className="mt-1 text-sm text-muted">
        {AGREEMENT_STATUS_LABEL[c.status]}. Mail wysyłasz ze swojej skrzynki — CRM go nie wysyła.
      </p>
      {missing.length ? (
        <p className="mt-2 text-xs text-amber-700">Puste pola w mailu: {missing.join(", ")}.</p>
      ) : null}
      {brandMissing ? (
        <div className="mt-3">
          <Note tone="warn">Zaznacz zgodę na nazwę i logo powyżej, zanim wyślesz mail — partner potwierdza ją odpowiedzią.</Note>
        </div>
      ) : null}

      <div className="mt-3 rounded-2xl bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="text-muted">Temat: </span>
            <span className="font-medium text-foreground">{subject}</span>
          </p>
          <button type="button" onClick={() => void copy("subject")} className="text-xs font-semibold text-lutra">
            {copied === "subject" ? "Skopiowano" : "Kopiuj temat"}
          </button>
        </div>
        <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-5 text-foreground">
          {body}
        </pre>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy("body")}
          className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white"
        >
          {copied === "body" ? "Skopiowano" : "Kopiuj treść maila"}
        </button>
        {mailto ? (
          <a href={mailto} className="rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra">
            Otwórz w programie pocztowym ({contact?.email})
          </a>
        ) : (
          <span className="text-xs text-muted">Dodaj e-mail kontaktu na karcie partnera, żeby otworzyć gotowy mail.</span>
        )}
      </div>

      <ol className="mt-4 space-y-3 text-sm">
        <li>
          <CheckRow
            checked={Boolean(c.sentAt)}
            label={c.sentAt ? `Mail z warunkami wysłany ${when(c.sentAt)}` : "Wysłałem mail z warunkami"}
            onChange={() => {
              if (!c.sentAt) logMail("Porozumienie: potwierdzenie warunków współpracy", "outbound");
              updateContract(mission.id, { sentAt: c.sentAt ? undefined : new Date().toISOString() });
            }}
          />
        </li>
        <li className="rounded-2xl bg-surface px-4 py-3">
          <CheckRow
            checked={Boolean(c.partnerSignedAt)}
            disabled={!c.sentAt}
            label={
              c.partnerSignedAt
                ? `Partner potwierdził mailem ${when(c.partnerSignedAt)}`
                : c.sentAt
                  ? "Partner odpisał i potwierdził warunki"
                  : "Najpierw wyślij mail"
            }
            onChange={() => {
              if (!c.partnerSignedAt) logMail("Partner potwierdził warunki współpracy", "inbound");
              updateContract(mission.id, { partnerSignedAt: c.partnerSignedAt ? undefined : new Date().toISOString() });
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-1">
            <label
              className={`inline-flex rounded-full border border-lutra px-3 py-1.5 text-xs font-semibold text-lutra ${
                c.sentAt ? "cursor-pointer" : "pointer-events-none opacity-50"
              }`}
            >
              {busy ? "Wgrywam…" : c.signedDocumentPath ? "Zamień załącznik" : "Dołącz odpowiedź partnera (PDF / zrzut)"}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                disabled={busy || !c.sentAt}
                onChange={async (e) => {
                  const picked = e.target.files?.[0];
                  e.target.value = "";
                  if (!picked) return;
                  setBusy(true);
                  setError(null);
                  const result = await uploadSignedContract(mission.id, picked);
                  setBusy(false);
                  if (!result.ok) setError(result.error ?? "Nie udało się wgrać pliku.");
                }}
              />
            </label>
            <span className="text-[11px] text-muted">opcjonalne</span>
            {proof.url ? (
              <a href={proof.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-navy">
                Otwórz załącznik
              </a>
            ) : null}
          </div>
        </li>
        <li>
          <CheckRow
            checked={c.signedByHuman}
            disabled={!c.partnerSignedAt}
            label={
              c.partnerSignedAt
                ? "Zatwierdzam za Lutrę — potwierdzone warunki są zgodne z zatwierdzoną ofertą"
                : "Zatwierdzenie Lutry po potwierdzeniu partnera"
            }
            onChange={() => updateContract(mission.id, { signedByHuman: !c.signedByHuman })}
          />
          {c.signedAt ? (
            <p className="mt-1 text-xs text-muted">Zatwierdzone {new Date(c.signedAt).toLocaleString("pl-PL")}</p>
          ) : null}
        </li>
      </ol>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}

/** Podpisany link do pliku w Storage — tylko dla aktualnej ścieżki. */
function useFileUrl(path: string | undefined) {
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null);
  const local = Boolean(path?.startsWith("local/"));
  useEffect(() => {
    if (!path || local) return;
    let cancelled = false;
    void contractPdfUrl(path).then((url) => {
      if (!cancelled) setSigned({ path, url });
    });
    return () => {
      cancelled = true;
    };
  }, [path, local]);
  return { url: signed && signed.path === path && !local ? signed.url : null, local };
}

function when(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("pl-PL") : "";
}

/** Dokument umowy: generowanie z szablonu zespołu albo własny PDF. */
export function ContractDocument({ mission, partner }: { mission: Mission; partner?: Partner }) {
  const { state, generateContract, uploadContract } = useStore();
  const [busy, setBusy] = useState<"generate" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const c = mission.contract;
  const file = useFileUrl(c.documentPath);
  const template = state.workspace.contractTemplate || DEFAULT_CONTRACT_TEMPLATE;
  const values = partner ? templateValues(partner, mission, state.user.name) : null;
  const missing = values ? missingFields(template, values) : [];
  const advanced = c.status === "sent" || c.status === "partner_signed" || c.status === "signed";

  const replaceOk = () =>
    !advanced ||
    window.confirm("Nowy dokument zastąpi wersję wysłaną lub podpisaną. Status podpisu zacznie się od nowa. Kontynuować?");

  const generate = async () => {
    if (!partner || !values || !replaceOk()) return;
    setBusy("generate");
    setError(null);
    try {
      const pdf = await buildContractPdf(toBlocks(fillTemplate(template, values)), {
        title: `Umowa — ${partner.name}`,
        footer: `Umowa współpracy · ${partner.name}`,
      });
      const result = await generateContract(mission.id, pdf);
      if (!result.ok) setError(result.error ?? "Nie udało się zapisać PDF.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wygenerować PDF.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-line px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">Dokument umowy</p>
      <p className="mt-1 text-sm text-muted">
        {c.documentPath ? `${CONTRACT_STATUS_LABEL[c.status]}.` : "Wygeneruj PDF z szablonu zespołu albo wgraj własny."}
      </p>
      {partner && missing.length ? (
        <p className="mt-2 text-xs text-amber-700">
          W szablonie zostaną puste pola: {missing.join(", ")}. Uzupełnij kartę partnera albo dane umowy.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {partner ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void generate()}
            className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "generate" ? "Generuję…" : c.documentPath ? "Wygeneruj ponownie" : "Wygeneruj PDF z szablonu"}
          </button>
        ) : null}
        <label className="inline-flex cursor-pointer rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra">
          {busy === "upload" ? "Wgrywam…" : c.documentPath ? "Zamień na własny PDF" : "Wgraj własny PDF"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={busy !== null}
            onChange={async (e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (!picked || !replaceOk()) return;
              setBusy("upload");
              setError(null);
              const result = await uploadContract(mission.id, picked);
              setBusy(null);
              if (!result.ok) setError(result.error ?? "Nie udało się wgrać PDF.");
            }}
          />
        </label>
        {file.url ? (
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-navy"
          >
            Otwórz PDF
          </a>
        ) : null}
      </div>
      {file.local ? (
        <p className="mt-2 text-xs text-muted">Kopia lokalna — po połączeniu z bazą wygeneruj albo wgraj ponownie.</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}

/** Obieg podpisu: wysyłka → podpis partnera (skan) → podpis Lutry. */
export function ContractSigning({ mission, partner }: { mission: Mission; partner?: Partner }) {
  const { updateContract, uploadSignedContract } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logMail = useLogMail(mission, partner);
  const c = mission.contract;
  const scan = useFileUrl(c.signedDocumentPath);
  const hasDoc = Boolean(c.documentPath);

  return (
    <div className="mt-4 rounded-2xl border border-line px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">Podpis</p>
      <ol className="mt-3 space-y-3 text-sm">
        <li>
          <CheckRow
            checked={Boolean(c.sentAt)}
            disabled={!hasDoc}
            label={
              c.sentAt
                ? `Wysłana partnerowi do podpisu ${when(c.sentAt)}`
                : hasDoc
                  ? "Wysłałem umowę partnerowi do podpisu"
                  : "Najpierw przygotuj dokument"
            }
            onChange={() => {
              if (!c.sentAt) logMail("Umowa wysłana do podpisu", "outbound");
              updateContract(mission.id, { sentAt: c.sentAt ? undefined : new Date().toISOString() });
            }}
          />
        </li>
        <li className="rounded-2xl bg-surface px-4 py-3">
          <p className="font-medium text-foreground">
            {c.partnerSignedAt ? `Partner podpisał ${when(c.partnerSignedAt)}` : "Podpis partnera"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex rounded-full border border-lutra px-3 py-1.5 text-xs font-semibold text-lutra ${
                hasDoc ? "cursor-pointer" : "pointer-events-none opacity-50"
              }`}
            >
              {busy ? "Wgrywam…" : c.signedDocumentPath ? "Zamień podpisany skan" : "Wgraj podpisany egzemplarz"}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                disabled={busy || !hasDoc}
                onChange={async (e) => {
                  const picked = e.target.files?.[0];
                  e.target.value = "";
                  if (!picked) return;
                  setBusy(true);
                  setError(null);
                  const result = await uploadSignedContract(mission.id, picked);
                  setBusy(false);
                  if (!result.ok) setError(result.error ?? "Nie udało się wgrać skanu.");
                }}
              />
            </label>
            {scan.url ? (
              <a href={scan.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-navy">
                Otwórz podpisany
              </a>
            ) : null}
            {!c.partnerSignedAt && hasDoc ? (
              <button
                type="button"
                onClick={() => updateContract(mission.id, { partnerSignedAt: new Date().toISOString() })}
                className="text-xs font-semibold text-muted"
              >
                Podpisał (skan dołączę później)
              </button>
            ) : null}
            {c.partnerSignedAt && !c.signedDocumentPath ? (
              <button
                type="button"
                onClick={() => updateContract(mission.id, { partnerSignedAt: undefined })}
                className="text-xs font-semibold text-muted"
              >
                Cofnij
              </button>
            ) : null}
          </div>
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
        </li>
        <li>
          <CheckRow
            checked={c.signedByHuman}
            disabled={!hasDoc}
            label={
              hasDoc
                ? "Podpisuję za Lutrę — dokument jest kompletny i zgodny z zatwierdzoną ofertą"
                : "Najpierw przygotuj dokument, potem podpis"
            }
            onChange={() => updateContract(mission.id, { signedByHuman: !c.signedByHuman })}
          />
          {c.signedAt ? (
            <p className="mt-1 text-xs text-muted">Podpis Lutry zapisany {new Date(c.signedAt).toLocaleString("pl-PL")}</p>
          ) : null}
        </li>
      </ol>
    </div>
  );
}
