import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

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
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
        {label}
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
