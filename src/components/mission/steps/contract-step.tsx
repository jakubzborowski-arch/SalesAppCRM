"use client";

import { offerName } from "@/lib/playbook";
import { cleanCompany, companyMissing, contractFromCompany } from "@/lib/company";
import { contractChecks, isValidNip, opsContactLabel } from "@/lib/gates";
import { agreementFormOf, changeRulesFor, isShortTerm, SHORT_TERM_MONTHS, termsChecks } from "@/lib/terms";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { AgreementForm, Mission, Partner } from "@/lib/types";
import { AgreementEmail, ContractDocument, ContractSigning } from "@/components/mission/contract-flow";
import { LocalDraft } from "@/components/mission/local-draft";
import { PeriodFields, TermsFields } from "@/components/mission/terms-editor";
import { TermsSummary } from "@/components/mission/steps/offer-step";
import { CheckRow, Field, HelpLink, inputClass, Requirements, Section } from "@/components/ui";

const BRAND_ITEMS = [
  { key: "contract:brand_app", label: "Nazwa i logo w aplikacji Lutra", required: true },
  { key: "contract:brand_photos", label: "Zdjęcia miejsca w aplikacji", required: false },
  { key: "contract:brand_social", label: "Nazwa, logo i zdjęcia w social mediach Lutry", required: false },
] as const;

/** Kontakt awaryjny / organizator / kontakt w firmie — wpisany raz, używany w umowie i przy aktywacji. */
export function OpsContactFields({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { updateActivation } = useStore();
  const a = mission.activation;
  const label = opsContactLabel(partner.segment);
  const card = partner.contacts.find((c) => c.isDecisionMaker) ?? partner.contacts[0];
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={label}>
          <input
            className={inputClass}
            placeholder="Imię i rola"
            value={a.opsContactName}
            onChange={(e) => updateActivation(mission.id, { opsContactName: e.target.value })}
          />
        </Field>
        <Field label="Telefon">
          <input
            className={inputClass}
            placeholder="+48 …"
            value={a.opsContactPhone}
            onChange={(e) => updateActivation(mission.id, { opsContactPhone: e.target.value })}
          />
        </Field>
      </div>
      {card && !a.opsContactName.trim() ? (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-lutra"
          onClick={() =>
            updateActivation(mission.id, {
              opsContactName: `${card.name}${card.role ? `, ${card.role}` : ""}`,
              opsContactPhone: card.phone ?? a.opsContactPhone,
            })
          }
        >
          Wpisz {card.name} z karty partnera
        </button>
      ) : null}
    </div>
  );
}

function FormCard({
  active,
  disabled,
  title,
  lines,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  lines: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-lutra bg-chip" : "border-chip-mid bg-white hover:border-blue",
      )}
    >
      <span className="block font-semibold text-foreground">{title}</span>
      <ul className="mt-1 space-y-0.5 text-xs leading-5 text-muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </button>
  );
}

export function ContractStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { updateContract, updatePartner, setAgreementForm, setChecklistItem, schemaV5 } = useStore();
  const c = mission.contract;
  const segment = partner.segment;
  const form = agreementFormOf(mission);
  const short = isShortTerm(c.startAt, c.endAt);
  const checks = contractChecks(mission, partner);
  const termsMissing = termsChecks(mission, segment).filter(
    (check) => !check.done && check.key !== "period" && check.key !== "period_order",
  );
  const selectedOfferName = offerName(mission.selectedVariant, segment);

  const company = partner.company;
  const companyKnown = companyMissing(company).length < 3;
  const contractEmpty = !c.companyName.trim() || (segment !== "community" && !c.nip.trim()) || !c.address.trim();
  // Dane wpisane tutaj, których brakuje na karcie partnera.
  const canSaveToPartner = Boolean(
    schemaV5 !== false &&
      ((c.companyName.trim() && !company.legalName) ||
        (isValidNip(c.nip) && !company.nip) ||
        (c.address.trim() && !company.legalAddress)),
  );
  const saveToPartner = () => {
    updatePartner(partner.id, {
      company: cleanCompany({
        ...company,
        legalName: company.legalName || c.companyName,
        nip: company.nip || (isValidNip(c.nip) ? c.nip : ""),
        legalAddress: company.legalAddress || c.address,
      }),
    });
  };
  const choose = (next: AgreementForm) => setAgreementForm(mission.id, next);
  const suggestedRules = short === null ? "" : changeRulesFor(short, segment);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Porozumienie albo umowa</h2>
        <HelpLink anchor="umowa">Kiedy mail, a kiedy umowa?</HelpLink>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Wariant {mission.selectedVariant ?? "—"}
        {selectedOfferName ? ` · ${selectedOfferName}` : ""}. Do {SHORT_TERM_MONTHS} miesięcy wystarczy porozumienie
        mailowe, dłużej — umowa w PDF z podpisami obu stron. Dokument przygotowujesz i zatwierdzasz Ty.
      </p>

      <div className="mt-4">
        <Requirements
          checks={checks}
          title="Do aktywacji brakuje"
          doneText={form === "email" ? "Porozumienie kompletne — możesz przejść do aktywacji." : "Umowa kompletna — możesz przejść do aktywacji."}
        />
      </div>

      <TermsSummary mission={mission} partner={partner} />
      {termsMissing.length ? (
        <Section
          title="Uzupełnij warunki"
          hint={`Porozumienie i umowa biorą warunki z oferty. Brakuje: ${termsMissing.map((check) => check.label).join(", ")}.`}
        >
          <TermsFields mission={mission} segment={segment} />
        </Section>
      ) : null}

      <Section title="1. Okres i forma">
        <PeriodFields mission={mission} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup">
          <FormCard
            active={form === "email"}
            disabled={short === false}
            onClick={() => choose("email")}
            title="Porozumienie mailowe"
            lines={[
              `Okres do ${SHORT_TERM_MONTHS} miesięcy.`,
              "Mail z warunkami + odpowiedź partnera.",
              short === false ? "Niedostępne: okres dłuższy niż 3 miesiące." : "Bez PDF i podpisów.",
            ]}
          />
          <FormCard
            active={form === "contract"}
            onClick={() => choose("contract")}
            title="Umowa z podpisami"
            lines={["Dłuższa współpraca albo na życzenie partnera.", "PDF z szablonu, podpis partnera i Lutry."]}
          />
        </div>
      </Section>

      <Section
        title="2. Strony"
        aside={
          contractEmpty || canSaveToPartner ? (
            <div className="flex flex-wrap gap-3">
              {contractEmpty ? (
                <button
                  type="button"
                  onClick={() => updateContract(mission.id, contractFromCompany(c, partner))}
                  className="text-xs font-semibold text-lutra"
                >
                  {companyKnown ? "Wpisz dane firmy z karty partnera" : "Wpisz nazwę i adres z karty partnera"}
                </button>
              ) : null}
              {canSaveToPartner ? (
                <button type="button" onClick={saveToPartner} className="text-xs font-semibold text-lutra">
                  Zapisz te dane w karcie partnera
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={segment === "community" ? "Nazwa organizacji" : "Nazwa firmy"}>
            <input
              className={inputClass}
              value={c.companyName}
              onChange={(e) => updateContract(mission.id, { companyName: e.target.value })}
            />
          </Field>
          <Field label="NIP" optional={segment === "community"}>
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
        <div className="mt-3">
          <Field label="Adres siedziby">
            <input
              className={inputClass}
              value={c.address}
              onChange={(e) => updateContract(mission.id, { address: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-4">
          <OpsContactFields mission={mission} partner={partner} />
        </div>
      </Section>

      <Section
        title="3. Zasady zmian i wycofania"
        hint="Wpisują się same po ustaleniu okresu (7 dni). Zmieniasz tylko, jeśli ustaliliście coś innego."
        aside={
          suggestedRules && c.changeRules.trim() !== suggestedRules ? (
            <button
              type="button"
              onClick={() => updateContract(mission.id, { changeRules: suggestedRules })}
              className="text-xs font-semibold text-lutra"
            >
              Wstaw zasady dla tego okresu
            </button>
          ) : null
        }
      >
        <textarea
          className={`${inputClass} min-h-[88px]`}
          value={c.changeRules}
          placeholder="Ustal okres — zasady wpiszą się same."
          onChange={(e) => updateContract(mission.id, { changeRules: e.target.value })}
        />
      </Section>

      {segment === "company" ? null : (
        <Section
          title="4. Zgody na nazwę, logo i zdjęcia"
          hint="Bez zgody na nazwę i logo partner nie pojawi się w aplikacji. Social media Lutry — tylko za osobną zgodą."
        >
          <div className="space-y-2">
            {BRAND_ITEMS.map((item) => (
              <CheckRow
                key={item.key}
                checked={Boolean(mission.checklist[item.key])}
                label={`${item.label}${item.required ? "" : " (opcjonalnie)"}`}
                onChange={() => setChecklistItem(mission.id, item.key, !mission.checklist[item.key])}
              />
            ))}
          </div>
        </Section>
      )}

      <LocalDraft partner={partner} mission={mission} mode="umowa" />

      {form === "email" ? (
        <AgreementEmail mission={mission} partner={partner} />
      ) : (
        <>
          <ContractDocument mission={mission} partner={partner} />
          <ContractSigning mission={mission} partner={partner} />
        </>
      )}
    </div>
  );
}
