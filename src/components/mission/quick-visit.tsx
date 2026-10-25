"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { formatPlDate, isIsoDate, toIsoDate } from "@/lib/dates";
import { NEED_CATEGORIES, offerName, suggestVariant } from "@/lib/playbook";
import {
  defaultQuickPeriod,
  quickVisitErrors,
  type QuickVisitErrors,
  type QuickVisitField,
  type QuickVisitInput,
} from "@/lib/quick-visit";
import { useStore } from "@/lib/store";
import { defaultAgreementForm, periodEndIso, SHORT_TERM_MONTHS } from "@/lib/terms";
import type { Mission, NeedCategory, Partner } from "@/lib/types";
import { CheckRow, Field, inputClass, Pills } from "@/components/ui";
import { DiscountEditor, SpaceEditor } from "@/components/mission/terms-editor";

const FIELD_ORDER: QuickVisitField[] = [
  "visitDate",
  "problem",
  "category",
  "maker",
  "discount",
  "hours",
  "redemption",
  "password",
  "space",
  "period",
];

function initialForm(mission: Mission, partner: Partner): QuickVisitInput {
  const today = toIsoDate(new Date());
  const period =
    isIsoDate(mission.contract.startAt) && isIsoDate(mission.contract.endAt)
      ? { startAt: mission.contract.startAt, endAt: mission.contract.endAt }
      : defaultQuickPeriod();
  const maker =
    partner.contacts.find((c) => c.id === mission.discovery.decisionMakerId) ??
    partner.contacts.find((c) => c.isDecisionMaker) ??
    (partner.contacts.length === 1 ? partner.contacts[0] : undefined);
  return {
    visitDate: today,
    problem: mission.discovery.description,
    category: mission.discovery.category,
    quote: mission.discovery.quote,
    makerId: maker?.id ?? "",
    makerName: "",
    makerRole: "",
    discount: { ...mission.terms.discount, days: [...mission.terms.discount.days] },
    space: { ...mission.terms.space, days: [...mission.terms.space.days] },
    ...period,
    brandConsent: Boolean(mission.checklist["contract:brand_app"]),
    note: "",
  };
}

function ErrorText({ text }: { text?: string }) {
  return text ? (
    <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
      {text}
    </p>
  ) : null;
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-navy">{title}</h3>
      {hint ? <p className="mt-1 text-xs leading-5 text-muted">{hint}</p> : null}
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

/** Przycisk w nagłówku misji + formularz po wizycie w lokalu. */
export function QuickVisitButton({
  mission,
  partner,
  onDone,
}: {
  mission: Mission;
  partner: Partner;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="whitespace-nowrap rounded-full bg-lutra px-4 py-1.5 text-xs font-semibold text-white hover:bg-lutra-dark"
      >
        Szybka wizyta
      </button>
      {open ? (
        <QuickVisitDialog
          mission={mission}
          partner={partner}
          onClose={close}
          onSaved={() => {
            setOpen(false);
            onDone();
          }}
        />
      ) : null}
    </>
  );
}

function QuickVisitDialog({
  mission,
  partner,
  onClose,
  onSaved,
}: {
  mission: Mission;
  partner: Partner;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { quickVisit } = useStore();
  const [form, setForm] = useState<QuickVisitInput>(() => initialForm(mission, partner));
  const [newMaker, setNewMaker] = useState(() => !form.makerId);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<QuickVisitErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLTextAreaElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const input: QuickVisitInput = newMaker ? { ...form, makerId: "" } : { ...form, makerName: "", makerRole: "" };
  // Błędy pod polami pokazujemy po pierwszej próbie zapisu i poprawiamy na bieżąco.
  const errors: QuickVisitErrors = submitted ? { ...quickVisitErrors(input), ...serverErrors } : {};
  const set = (patch: Partial<QuickVisitInput>) => {
    setServerErrors({});
    setFormError(null);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  // Fokus na pierwsze pole, blokada przewijania strony, Escape i Tab w obrębie okna.
  useEffect(() => {
    firstRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const focusFirstError = (found: QuickVisitErrors) => {
    const key = FIELD_ORDER.find((field) => found[field]);
    if (!key) return;
    window.setTimeout(() => {
      const box = panelRef.current?.querySelector<HTMLElement>(`[data-field="${key}"]`);
      box?.scrollIntoView({ block: "center" });
      box?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    }, 0);
  };

  const save = async () => {
    setSubmitted(true);
    const found = quickVisitErrors(input);
    if (Object.keys(found).length) {
      setFormError("Popraw zaznaczone pola.");
      focusFirstError(found);
      return;
    }
    setBusy(true);
    const result = await quickVisit(mission.id, input);
    setBusy(false);
    if (!result.ok) {
      setServerErrors(result.errors ?? {});
      setFormError(result.reason ?? "Nie udało się zapisać wizyty.");
      if (result.errors) focusFirstError(result.errors);
      return;
    }
    onSaved();
  };

  const facts = mission.needs.filter((n) => n.status === "fact" && n.confirmed).map((n) => n.category);
  const recommended = form.category ? suggestVariant([...facts, form.category as NeedCategory], partner.segment) : null;
  const variant = mission.offerApproved && mission.selectedVariant ? mission.selectedVariant : recommended;
  const periodSet = isIsoDate(form.startAt) && isIsoDate(form.endAt) && form.endAt >= form.startAt;
  const agreement = periodSet ? defaultAgreementForm(form) : null;
  const preset = (months: number) => {
    const start = isIsoDate(form.startAt) ? form.startAt : defaultQuickPeriod().startAt;
    set({ startAt: start, endAt: periodEndIso(start, months) });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/30 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-visit-title"
        aria-describedby="quick-visit-intro"
        className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-[28px] sm:shadow-[0_24px_80px_rgba(9,12,155,0.22)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">Szybka wizyta</p>
            <h2 id="quick-visit-title" className="mt-0.5 truncate text-lg font-semibold">
              {partner.name}
            </h2>
            <p id="quick-visit-intro" className="mt-1 text-xs leading-5 text-muted">
              Jeden formularz po wizycie: zapisuje kontakt, rozmowę, warunki i zatwierdza wariant. Misja przejdzie do
              kroku Umowa.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij szybką wizytę"
            className="shrink-0 rounded-full p-2 text-muted hover:bg-surface hover:text-foreground"
          >
            <X size={18} />
          </button>
        </header>

        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            <Group title="Rozmowa">
              <div data-field="problem">
                <Field label="Problem partnera (1 zdanie)">
                  <textarea
                    ref={firstRef}
                    rows={2}
                    className={`${inputClass} min-h-[64px]`}
                    placeholder="W tygodniu po 16:00 sala stoi pusta."
                    value={form.problem}
                    aria-invalid={Boolean(errors.problem)}
                    onChange={(e) => set({ problem: e.target.value })}
                  />
                </Field>
                <ErrorText text={errors.problem} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div data-field="category">
                  <Field label="Kategoria potrzeby">
                    <select
                      className={inputClass}
                      value={form.category}
                      aria-invalid={Boolean(errors.category)}
                      onChange={(e) => set({ category: e.target.value as NeedCategory | "" })}
                    >
                      <option value="">Wybierz kategorię</option>
                      {NEED_CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <ErrorText text={errors.category} />
                </div>
                <div data-field="visitDate">
                  <Field label="Data wizyty">
                    <input
                      type="date"
                      className={inputClass}
                      max={toIsoDate(new Date())}
                      value={form.visitDate}
                      aria-invalid={Boolean(errors.visitDate)}
                      onChange={(e) => set({ visitDate: e.target.value })}
                    />
                  </Field>
                  <ErrorText text={errors.visitDate} />
                </div>
              </div>
              <Field label="Cytat partnera" optional>
                <input
                  className={inputClass}
                  placeholder="„Między 16 a 19 mamy pustki.”"
                  value={form.quote}
                  onChange={(e) => set({ quote: e.target.value })}
                />
              </Field>
              {variant ? (
                <p className="rounded-2xl bg-chip px-4 py-2 text-xs text-navy">
                  {mission.offerApproved && mission.selectedVariant ? "Zatwierdzony wariant" : "Wariant z rekomendacji"}:{" "}
                  <strong>
                    {variant}. {offerName(variant, partner.segment)}
                  </strong>
                </p>
              ) : null}
            </Group>

            <Group title="Decydent">
              <div data-field="maker">
                {partner.contacts.length ? (
                  <Pills
                    size="sm"
                    value={newMaker ? "new" : "card"}
                    onChange={(mode) => {
                      setNewMaker(mode === "new");
                      setServerErrors({});
                    }}
                    options={[
                      { id: "card", label: "Z karty partnera" },
                      { id: "new", label: "Nowa osoba" },
                    ]}
                  />
                ) : null}
                <div className="mt-3">
                  {newMaker ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Imię i nazwisko">
                        <input
                          className={inputClass}
                          placeholder="Anna Kowalska"
                          value={form.makerName}
                          aria-invalid={Boolean(errors.maker)}
                          onChange={(e) => set({ makerName: e.target.value })}
                        />
                      </Field>
                      <Field label="Rola" optional>
                        <input
                          className={inputClass}
                          placeholder="właścicielka"
                          value={form.makerRole}
                          onChange={(e) => set({ makerRole: e.target.value })}
                        />
                      </Field>
                    </div>
                  ) : (
                    <Field label="Osoba">
                      <select
                        className={inputClass}
                        value={form.makerId}
                        aria-invalid={Boolean(errors.maker)}
                        onChange={(e) => set({ makerId: e.target.value })}
                      >
                        <option value="">Wybierz osobę</option>
                        {partner.contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name}
                            {contact.role ? ` · ${contact.role}` : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
                <ErrorText text={errors.maker} />
              </div>
            </Group>

            <Group title="Zniżka dla ludzi z Lutry">
              <DiscountEditor
                value={form.discount}
                onChange={(patch) => set({ discount: { ...form.discount, ...patch } })}
                errors={errors}
              />
              <div data-field="space">
                <SpaceEditor
                  value={form.space}
                  onChange={(patch) => set({ space: { ...form.space, ...patch } })}
                  error={errors.space}
                />
              </div>
            </Group>

            <Group title="Okres współpracy">
              <div data-field="period">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Od">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.startAt}
                      aria-invalid={Boolean(errors.period)}
                      onChange={(e) => set({ startAt: e.target.value })}
                    />
                  </Field>
                  <Field label="Do">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.endAt}
                      aria-invalid={Boolean(errors.period)}
                      onChange={(e) => set({ endAt: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">Szybko:</span>
                  {[3, 6, 12].map((months) => (
                    <button
                      key={months}
                      type="button"
                      onClick={() => preset(months)}
                      className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-lutra hover:bg-chip"
                    >
                      {months} {months < 5 ? "miesiące" : "miesięcy"}
                    </button>
                  ))}
                </div>
                <ErrorText text={errors.period} />
                {agreement ? (
                  <p className="mt-2 text-xs text-navy">
                    {formatPlDate(form.startAt)} – {formatPlDate(form.endAt)} ·{" "}
                    <strong>
                      {agreement === "email"
                        ? `porozumienie mailowe (do ${SHORT_TERM_MONTHS} miesięcy)`
                        : "umowa z podpisami (dłużej niż 3 miesiące)"}
                    </strong>
                  </p>
                ) : null}
              </div>
            </Group>

            <Group title="Zgoda i notatka">
              <div>
                <CheckRow
                  checked={form.brandConsent}
                  label="Zgoda na nazwę i logo w aplikacji"
                  onChange={() => set({ brandConsent: !form.brandConsent })}
                />
                <p className="mt-1.5 text-xs text-muted">
                  Wymagana przed aktywacją. Jeśli jej nie ma, zaznaczysz ją później w kroku Umowa.
                </p>
              </div>
              <Field label="Notatka z wizyty" optional>
                <textarea
                  rows={3}
                  className={`${inputClass} min-h-[72px]`}
                  placeholder="Co jeszcze ustaliliście, co obiecałeś sprawdzić."
                  value={form.note}
                  onChange={(e) => set({ note: e.target.value })}
                />
              </Field>
            </Group>
          </div>

          <footer className="border-t border-line px-5 py-4 sm:px-6">
            {formError ? (
              <p role="alert" className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                {formError}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-lutra px-5 py-2.5 text-sm font-semibold text-white hover:bg-lutra-dark disabled:opacity-50"
              >
                {busy ? "Zapisuję…" : agreement === "contract" ? "Zapisz i przejdź do umowy" : "Zapisz i przejdź do porozumienia"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
