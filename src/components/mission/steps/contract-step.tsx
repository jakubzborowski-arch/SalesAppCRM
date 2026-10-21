"use client";

import { offerName } from "@/lib/playbook";
import { cleanCompany, companyMissing, contractFromCompany } from "@/lib/company";
import { contractBlockers, isValidNip } from "@/lib/gates";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { ContractDocument, ContractSigning } from "@/components/mission/contract-flow";
import { LocalDraft } from "@/components/mission/local-draft";
import { Field, inputClass } from "@/components/ui";

export function ContractStep({ mission, partner }: { mission: Mission; partner?: Partner }) {
  const { updateContract, updatePartner, schemaV5 } = useStore();
  const c = mission.contract;
  const missing = contractBlockers(mission);
  const selectedOfferName = offerName(mission.selectedVariant);

  const fillFromPartner = () => {
    if (!partner) return;
    updateContract(mission.id, contractFromCompany(c, partner));
  };
  const company = partner?.company;
  const companyKnown = Boolean(company && companyMissing(company).length < 3);
  const contractEmpty = !c.companyName.trim() || !c.nip.trim() || !c.address.trim();
  // Dane wpisane w umowie, których brakuje na karcie partnera (to samo pole: w umowie jest, na karcie pusto).
  const canSaveToPartner = Boolean(
    partner &&
      company &&
      schemaV5 !== false &&
      ((c.companyName.trim() && !company.legalName) ||
        (isValidNip(c.nip) && !company.nip) ||
        (c.address.trim() && !company.legalAddress)),
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

      <ContractDocument mission={mission} partner={partner} />
      <ContractSigning mission={mission} />
    </div>
  );
}
