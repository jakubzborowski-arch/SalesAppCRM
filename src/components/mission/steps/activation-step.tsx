"use client";

import { useState } from "react";
import { activationBlockers } from "@/lib/gates";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { CheckRow, Field, inputClass } from "@/components/ui";

export function ActivationStep({ mission, partner }: { mission: Mission; partner?: Partner }) {
  const { updateActivation, assignPartnerCode } = useStore();
  const a = mission.activation;
  const missing = activationBlockers(mission);
  const [copied, setCopied] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const codeLocked = Boolean(a.partnerCode.trim());
  const ops = partner?.contacts[0];

  const copyCode = async () => {
    if (!a.partnerCode) return;
    await navigator.clipboard.writeText(a.partnerCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Aktywacja partnera</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Kod partnera i test w produkcie Lutra. Oferta nie jest aktywna, dopóki tego nie domkniesz.
      </p>

      {missing.length ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Do zakończenia brakuje: {missing.join(", ")}.
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
          Aktywacja kompletna. Możesz zamknąć misję.
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-line px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">Kod partnera</p>
        <p className="mt-2 font-mono text-lg font-semibold tracking-wide">
          {a.partnerCode || "—"}
        </p>
        <p className="mt-1 text-xs text-muted">
          Ten kod idzie do produktu Lutra. Nie wymyśla go model i nie zmienia się po nadaniu.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={codeLocked}
            onClick={() => assignPartnerCode(mission.id)}
            className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {codeLocked ? "Kod nadany" : "Nadaj kod LUTRA-…"}
          </button>
          {codeLocked ? (
            <button
              type="button"
              onClick={() => void copyCode()}
              className="rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra"
            >
              {copied ? "Skopiowano" : "Kopiuj kod"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <Field label="Co sprawdziłeś w Lutrze">
          <textarea
            className={`${inputClass} min-h-[88px]`}
            placeholder="Jedno wejście jako gość: kod działa, godziny i limity z umowy, brak obietnic spoza wariantu."
            value={a.testNotes ?? ""}
            onChange={(e) => {
              setTestError(null);
              updateActivation(mission.id, { testNotes: e.target.value });
            }}
          />
        </Field>
      </div>

      <div className="mt-4 space-y-2.5">
        <CheckRow
          checked={a.hoursConfirmed}
          label={`Godziny, limity i wyłączenia zgodne z umową${partner?.hours ? ` (${partner.hours})` : ""}`}
          onChange={() => updateActivation(mission.id, { hoursConfirmed: !a.hoursConfirmed })}
        />
        <CheckRow
          checked={a.testPassed}
          label="Test oferty w Lutrze: jedno wejście jako gość, kod działa, warunki z umowy"
          onChange={() => {
            if (!a.testPassed && !a.testNotes.trim()) {
              setTestError("Najpierw opisz, co sprawdziłeś w produkcie.");
              return;
            }
            setTestError(null);
            updateActivation(mission.id, { testPassed: !a.testPassed });
          }}
        />
      </div>
      {testError ? <p className="mt-2 text-sm text-rose-600">{testError}</p> : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Kontakt operacyjny">
          <input
            className={inputClass}
            placeholder="Imię i rola"
            value={a.opsContactName}
            onChange={(e) => updateActivation(mission.id, { opsContactName: e.target.value })}
          />
        </Field>
        <Field label="Telefon operacyjny">
          <input
            className={inputClass}
            placeholder="+48 …"
            value={a.opsContactPhone}
            onChange={(e) => updateActivation(mission.id, { opsContactPhone: e.target.value })}
          />
        </Field>
      </div>
      {ops && !a.opsContactName.trim() ? (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-lutra"
          onClick={() =>
            updateActivation(mission.id, {
              opsContactName: `${ops.name}${ops.role ? `, ${ops.role}` : ""}`,
              opsContactPhone: ops.phone ?? a.opsContactPhone,
            })
          }
        >
          Wpisz kontakt z karty partnera
        </button>
      ) : null}

      <div className="mt-4">
        <Field label="Check-in 30/60/90">
          <input
            type="date"
            className={inputClass}
            value={a.checkInAt}
            onChange={(e) => updateActivation(mission.id, { checkInAt: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
