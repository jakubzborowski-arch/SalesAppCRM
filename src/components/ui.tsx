import { useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { Check } from "@/lib/terms";
import { WEEKDAYS } from "@/lib/terms";
import type { Weekday } from "@/lib/types";

/**
 * Lista wymagań kroku: co już jest, czego brakuje. Zastępuje długie „Brakuje: a, b, c…”.
 * `doneText` pokazuje się, gdy wszystko odhaczone.
 */
export function Requirements({
  checks,
  title = "Czego potrzeba",
  doneText = "Komplet. Możesz iść dalej.",
  className,
}: {
  checks: Check[];
  title?: string;
  doneText?: string;
  className?: string;
}) {
  const done = checks.filter((check) => check.done).length;
  const complete = done === checks.length;
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        complete ? "border-emerald-100 bg-emerald-50/70" : "border-amber-200 bg-amber-50/60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-sm font-semibold", complete ? "text-emerald-800" : "text-amber-900")}>
          {complete ? doneText : title}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            complete ? "bg-emerald-100 text-emerald-800" : "bg-white text-amber-900",
          )}
        >
          {done}/{checks.length}
        </span>
      </div>
      {complete ? null : (
        <ul className="mt-2 grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">
          {checks.map((check) => (
            <li key={check.key} className="flex items-start gap-2">
              <span
                aria-hidden
                className={cn(
                  "mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold",
                  check.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-amber-400 bg-white",
                )}
              >
                {check.done ? "✓" : ""}
              </span>
              <span className={check.done ? "text-muted line-through decoration-emerald-300" : "text-foreground"}>
                {check.label}
                {check.hint && !check.done ? <span className="block text-[11px] text-muted">{check.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ramka sekcji kroku z tytułem i krótkim wyjaśnieniem. */
export function Section({
  title,
  hint,
  children,
  aside,
  className,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-5 rounded-2xl border border-line px-4 py-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">{title}</p>
          {hint ? <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">{hint}</p> : null}
        </div>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Wybór jednej opcji jako „pigułki”. */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { id: T; label: string; hint?: string; disabled?: boolean }[];
  value: T | null | undefined;
  onChange: (next: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => {
        const on = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={option.hint}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm",
              on ? "bg-lutra text-white" : "bg-chip text-lutra hover:bg-chip-strong",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Dni tygodnia (puste = każdy dzień). */
export function WeekdayPicker({ value, onChange }: { value: Weekday[]; onChange: (next: Weekday[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {WEEKDAYS.map((day) => {
        const on = value.includes(day.id);
        return (
          <button
            key={day.id}
            type="button"
            title={day.label}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((d) => d !== day.id) : [...value, day.id])}
            className={cn(
              "h-9 min-w-[44px] rounded-full px-2 text-xs font-semibold transition",
              on ? "bg-lutra text-white" : "bg-surface text-muted hover:bg-chip hover:text-lutra",
            )}
          >
            {day.short}
          </button>
        );
      })}
      <span className="ml-1 text-[11px] text-muted">{value.length ? "" : "każdy dzień"}</span>
    </div>
  );
}

/** Pole liczby: puste = `null`. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  suffix,
  className,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        placeholder={placeholder}
        className={inputClass}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          onChange(n);
        }}
      />
      {suffix ? <span className="shrink-0 text-sm text-muted">{suffix}</span> : null}
    </div>
  );
}

/** Mała podpowiedź z linkiem do Pomocy. */
export function HelpLink({ anchor, children = "Jak to działa?" }: { anchor: string; children?: ReactNode }) {
  return (
    <Link href={`/pomoc#${anchor}`} className="text-xs font-semibold text-lutra hover:underline">
      {children}
    </Link>
  );
}

/** Niebieska ramka z informacją (bez blokowania). */
export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3 text-[13px] leading-5",
        tone === "warn" ? "border border-amber-200 bg-amber-50 text-amber-900" : "bg-chip text-navy",
      )}
    >
      {children}
    </div>
  );
}

export function CheckRow({
  checked,
  label,
  onChange,
  disabled,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-emerald-100 bg-emerald-50/70 text-foreground"
          : "border-line bg-white text-foreground hover:border-blue",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
          checked
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-chip-strong bg-white",
        )}
      >
        {checked ? (
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
            <path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      {label}
    </button>
  );
}

export function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold text-navy">
        <span className="uppercase tracking-[0.08em]">{label}</span>
        {optional ? (
          <span className="text-[10px] font-medium normal-case tracking-normal text-muted">opcjonalne</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-chip-mid bg-surface px-4 py-3 text-sm text-foreground outline-none focus:border-blue";

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Własny warunek, Enter aby dodać",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft("");
  };

  const toggle = (tag: string) => {
    onChange(value.includes(tag) ? value.filter((item) => item !== tag) : [...value, tag]);
  };

  const chips = [...suggestions];
  for (const tag of value) {
    if (!chips.includes(tag)) chips.push(tag);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.map((tag) => {
          const on = value.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                on ? "bg-lutra text-white" : "bg-chip text-lutra",
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className={inputClass}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          className="shrink-0 rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white"
        >
          Dodaj
        </button>
      </div>
    </div>
  );
}
