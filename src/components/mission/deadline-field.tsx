"use client";

import { addDaysIso, formatPlDate, hasExplicitDate, isIsoDate, parseDeadline, relativeDeadline } from "@/lib/dates";
import { Field, inputClass } from "@/components/ui";

const QUICK: { label: string; text: string }[] = [
  { label: "Koniec tygodnia", text: "koniec tygodnia" },
  { label: "Za tydzień", text: "za tydzień" },
  { label: "Za 2 tygodnie", text: "za 2 tygodnie" },
  { label: "Koniec miesiąca", text: "koniec miesiąca" },
];

/** Termin decyzji partnera jako data. Stare wpisy tekstowe („Czwartek”) pokazuje do zamiany. */
export function DeadlineField({
  value,
  onChange,
  optional,
}: {
  value: string;
  onChange: (iso: string) => void;
  optional?: boolean;
}) {
  const legacy = value.trim() && !isIsoDate(value) ? value.trim() : "";
  // Zwrot typu „czwartek” liczony od dziś dałby zły dzień, jeśli wpisano go tydzień temu.
  const suggestion = legacy && hasExplicitDate(legacy) ? parseDeadline(legacy) : null;
  const relative = relativeDeadline(value);
  const past = isIsoDate(value) && relative.endsWith("temu");

  return (
    <div>
      <Field label="Termin decyzji" optional={optional}>
        <input
          type="date"
          className={inputClass}
          min={addDaysIso(0)}
          value={isIsoDate(value) ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {QUICK.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              const iso = parseDeadline(item.text);
              if (iso) onChange(iso);
            }}
            className="rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold text-muted hover:text-lutra"
          >
            {item.label}
          </button>
        ))}
        {isIsoDate(value) ? (
          <span className={`ml-1 text-xs ${past ? "font-semibold text-rose-600" : "text-muted"}`}>
            {formatPlDate(value)} · {past ? `minął ${relative}` : relative}
          </span>
        ) : null}
      </div>
      {legacy ? (
        <p className="mt-2 text-xs text-amber-700">
          Zapisane jako tekst: „{legacy}”.{" "}
          {suggestion ? (
            <button type="button" onClick={() => onChange(suggestion)} className="font-semibold text-lutra">
              Ustaw {formatPlDate(suggestion)}
            </button>
          ) : (
            "Wybierz dzień w kalendarzu."
          )}
        </p>
      ) : null}
    </div>
  );
}
