"use client";

import { useEffect, useState } from "react";
import { OFFER_LIBRARY } from "@/lib/playbook";
import { contractBlockers, isValidNip } from "@/lib/gates";
import { contractPdfUrl } from "@/lib/mission-core";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { CheckRow, Field, inputClass } from "@/components/ui";

export function ContractStep({ mission, partner }: { mission: Mission; partner?: Partner }) {
  const { updateContract, uploadContract } = useStore();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const c = mission.contract;
  const missing = contractBlockers(mission);
  const offer = OFFER_LIBRARY.find((item) => item.variant === mission.selectedVariant);
  const pdfName = c.documentPath?.split("/").pop();
  const localOnly = Boolean(c.documentPath?.startsWith("local/"));

  useEffect(() => {
    if (!c.documentPath || localOnly) {
      setPdfUrl(null);
      return;
    }
    let cancelled = false;
    void contractPdfUrl(c.documentPath).then((url) => {
      if (!cancelled) setPdfUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [c.documentPath, localOnly]);

  const fillFromPartner = () => {
    if (!partner) return;
    updateContract(mission.id, {
      companyName: c.companyName.trim() || partner.name,
      address: c.address.trim() || partner.address,
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
          {offer ? ` · ${offer.name}` : ""}
        </p>
        <p className="mt-1 text-muted">
          {mission.offerApproved
            ? `Warunki z discovery: ${mission.decision.constraintSummary || "uzupełnij ograniczenia na mapie potrzeb"}.`
            : "Najpierw zatwierdź wariant A/B/C."}
        </p>
        {partner ? (
          <button type="button" onClick={fillFromPartner} className="mt-2 text-xs font-semibold text-lutra">
            Wpisz nazwę i adres z karty partnera
          </button>
        ) : null}
      </div>

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
        <p className="mt-1 text-xs text-amber-700">NIP musi mieć 10 cyfr.</p>
      ) : null}

      <div className="mt-4">
        <Field label="Adres korespondencyjny">
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
