"use client";

import { useEffect, useState } from "react";
import { offerName } from "@/lib/playbook";
import { cleanCompany, companyMissing, contractFromCompany, normalizeNip } from "@/lib/company";
import { contractBlockers, isValidNip } from "@/lib/gates";
import { contractPdfUrl } from "@/lib/mission-core";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { LocalDraft } from "@/components/mission/local-draft";
import { CheckRow, Field, inputClass } from "@/components/ui";

export function ContractStep({ mission, partner }: { mission: Mission; partner?: Partner }) {
  const { updateContract, uploadContract, updatePartner } = useStore();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null);
  const c = mission.contract;
  const missing = contractBlockers(mission);
  const selectedOfferName = offerName(mission.selectedVariant);
  const pdfName = c.documentPath?.split("/").pop();
  const localOnly = Boolean(c.documentPath?.startsWith("local/"));

  // Link do PDF tylko dla aktualnego pliku — stary link nie zostaje po zmianie pliku.
  const pdfUrl = signed && signed.path === c.documentPath && !localOnly ? signed.url : null;
  useEffect(() => {
    const path = c.documentPath;
    if (!path || localOnly) return;
    let cancelled = false;
    void contractPdfUrl(path).then((url) => {
      if (!cancelled) setSigned({ path, url });
    });
    return () => {
      cancelled = true;
    };
  }, [c.documentPath, localOnly]);

  const fillFromPartner = () => {
    if (!partner) return;
    updateContract(mission.id, contractFromCompany(c, partner));
  };
  const company = partner?.company;
  const companyKnown = Boolean(company && companyMissing(company).length < 3);
  const contractEmpty = !c.companyName.trim() || !c.nip.trim() || !c.address.trim();
  // Dane wpisane w umowie, których nie ma jeszcze na karcie partnera.
  const canSaveToPartner = Boolean(
    partner &&
      company &&
      c.status !== "signed" &&
      ((c.companyName.trim() && c.companyName.trim() !== company.legalName) ||
        (isValidNip(c.nip) && normalizeNip(c.nip) !== company.nip) ||
        (c.address.trim() && c.address.trim() !== company.legalAddress)) &&
      (!company.legalName || !company.nip || !company.legalAddress),
  );
  const saveToPartner = () => {
    if (!partner || !company) return;
    updatePartner(partner.id, {
      company: cleanCompany({
        ...company,
        legalName: company.legalName || c.companyName,
        nip: company.nip || (isValidNip(c.nip) ? c.nip : ""),
        legalAddress: company.legalAddress || c.address,
      }),
    });
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Umowa i podpis</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        PDF z warunkami zatwierdzonego wariantu i podpis człowieka. Model nie wystawia dokumentu.
      </p>

      <div className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm">
        <p className="font-medium text-foreground">
          Wariant {mission.selectedVariant ?? "—"}
          {selectedOfferName ? ` · ${selectedOfferName}` : ""}
        </p>
        <p className="mt-1 text-muted">
          {mission.offerApproved
            ? `Warunki z discovery: ${mission.decision.constraintSummary || "uzupełnij ograniczenia na mapie potrzeb"}.`
            : "Najpierw zatwierdź wariant A/B/C."}
        </p>
        {partner && contractEmpty ? (
          <button type="button" onClick={fillFromPartner} className="mt-2 text-xs font-semibold text-lutra">
            {companyKnown ? "Wpisz dane firmy z karty partnera" : "Wpisz nazwę i adres z karty partnera"}
          </button>
        ) : null}
        {canSaveToPartner ? (
          <button type="button" onClick={saveToPartner} className="ml-4 mt-2 text-xs font-semibold text-lutra">
            Zapisz te dane w karcie partnera
          </button>
        ) : null}
      </div>
      {partner ? <LocalDraft partner={partner} mission={mission} mode="umowa" /> : null}

      {missing.length ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Do aktywacji brakuje: {missing.join(", ")}.
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
          Umowa kompletna. Możesz przejść do aktywacji.
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Field label="Nazwa firmy / lokalu">
          <input
            className={inputClass}
            value={c.companyName}
            onChange={(e) => updateContract(mission.id, { companyName: e.target.value })}
          />
        </Field>
        <Field label="NIP">
          <input
            className={inputClass}
            inputMode="numeric"
            placeholder="10 cyfr"
            value={c.nip}
            onChange={(e) => updateContract(mission.id, { nip: e.target.value })}
          />
        </Field>
      </div>
      {c.nip.trim() && !isValidNip(c.nip) ? (
        <p className="mt-1 text-xs text-amber-700">Niepoprawny NIP — sprawdź cyfry (10 cyfr z cyfrą kontrolną).</p>
      ) : null}

      <div className="mt-4">
        <Field label="Adres siedziby">
          <input
            className={inputClass}
            value={c.address}
            onChange={(e) => updateContract(mission.id, { address: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Start">
          <input
            type="date"
            className={inputClass}
            value={c.startAt}
            onChange={(e) => updateContract(mission.id, { startAt: e.target.value })}
          />
        </Field>
        <Field label="Koniec">
          <input
            type="date"
            className={inputClass}
            value={c.endAt}
            onChange={(e) => updateContract(mission.id, { endAt: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Zasady zmian i wypowiedzenia">
          <textarea
            className={`${inputClass} min-h-[88px]`}
            value={c.changeRules}
            onChange={(e) => updateContract(mission.id, { changeRules: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-5 rounded-2xl border border-line px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">PDF umowy</p>
        <p className="mt-1 text-sm text-muted">
          {pdfName ? `Zapisany: ${pdfName}` : "Jeszcze nie wgrano pliku."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white">
            {uploading ? "Wgrywam…" : pdfName ? "Zamień PDF" : "Wgraj PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setUploading(true);
                setUploadError(null);
                const result = await uploadContract(mission.id, file);
                setUploading(false);
                if (!result.ok) setUploadError(result.error ?? "Nie udało się wgrać PDF.");
              }}
            />
          </label>
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra"
            >
              Otwórz PDF
            </a>
          ) : null}
        </div>
        {localOnly ? (
          <p className="mt-2 text-xs text-muted">Kopia lokalna — wgraj ponownie po połączeniu z bazą, żeby otworzyć plik.</p>
        ) : null}
        {uploadError ? <p className="mt-2 text-sm text-rose-600">{uploadError}</p> : null}
      </div>

      <div className="mt-4">
        <CheckRow
          checked={c.signedByHuman}
          disabled={!c.documentPath}
          label={
            c.documentPath
              ? "Podpisuję jako handlowiec — dokument jest kompletny i zgodny z zatwierdzoną ofertą"
              : "Najpierw wgraj PDF, potem podpis"
          }
          onChange={() => updateContract(mission.id, { signedByHuman: !c.signedByHuman })}
        />
        {c.signedAt ? (
          <p className="mt-2 text-xs text-muted">
            Podpis zapisany {new Date(c.signedAt).toLocaleString("pl-PL")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
