"use client";

import { addDaysIso, isIsoDate, toIsoDate } from "@/lib/dates";
import {
  addMonthsIso,
  CYCLE_FREQUENCIES,
  DISCOUNT_RANGE,
  discountSummary,
  isShortTerm,
  REDEMPTION_METHODS,
  SHORT_TERM_MONTHS,
  spaceSummary,
} from "@/lib/terms";
import { useStore } from "@/lib/store";
import type { Mission, MissionTerms, Partner, PartnerSegment } from "@/lib/types";
import { CheckRow, Field, inputClass, Note, NumberInput, Pills, WeekdayPicker } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Koniec okresu: start + N miesięcy − 1 dzień (1.11 + 3 mies. → 31.01). */
export function periodEnd(start: string, months: number) {
  const end = addMonthsIso(start, months);
  const [y, m, d] = end.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d - 1));
}

const PERIOD_PRESETS = [1, 3, 6, 12];

/** Okres współpracy = daty porozumienia / umowy. Od niego zależy forma (mail do 3 mies., dłużej umowa). */
export function PeriodFields({ mission }: { mission: Mission }) {
  const { updateContract } = useStore();
  const c = mission.contract;
  const short = isShortTerm(c.startAt, c.endAt);
  const reversed = isIsoDate(c.startAt) && isIsoDate(c.endAt) && c.endAt < c.startAt;

  const preset = (months: number) => {
    const start = isIsoDate(c.startAt) ? c.startAt : addDaysIso(1);
    updateContract(mission.id, { startAt: start, endAt: periodEnd(start, months) });
  };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Od">
          <input
            type="date"
            className={inputClass}
            value={c.startAt}
            onChange={(e) => updateContract(mission.id, { startAt: e.target.value })}
          />
        </Field>
        <Field label="Do">
          <input
            type="date"
            className={inputClass}
            value={c.endAt}
            onChange={(e) => updateContract(mission.id, { endAt: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Szybko:</span>
        {PERIOD_PRESETS.map((months) => (
          <button
            key={months}
            type="button"
            onClick={() => preset(months)}
            className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-lutra hover:bg-chip"
          >
            {months} {months === 1 ? "miesiąc" : months < 5 ? "miesiące" : "miesięcy"}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {reversed ? (
          <Note tone="warn">Koniec okresu jest przed początkiem — popraw daty.</Note>
        ) : short === null ? (
          <p className="text-xs text-muted">
            Ustaw obie daty. Do {SHORT_TERM_MONTHS} miesięcy wystarczy porozumienie mailowe, dłużej — umowa z podpisami.
          </p>
        ) : short ? (
          <Note>
            <strong>Krótka współpraca (do {SHORT_TERM_MONTHS} miesięcy).</strong> Wystarczy porozumienie mailowe. Partner
            może zakończyć zniżkę w każdej chwili, ale honoruje ją dla wydarzeń już utworzonych w aplikacji (do 7 dni).
          </Note>
        ) : (
          <Note>
            <strong>Dłuższa współpraca.</strong> Potrzebna umowa w PDF z podpisami obu stron. Zmianę albo wycofanie
            zniżki partner zgłasza z 7-dniowym wyprzedzeniem.
          </Note>
        )}
      </div>
    </div>
  );
}

function DiscountFields({ mission }: { mission: Mission }) {
  const { updateTerms } = useStore();
  const d = mission.terms.discount;
  const set = (patch: Partial<MissionTerms["discount"]>) => updateTerms(mission.id, "discount", patch);
  const method = REDEMPTION_METHODS.find((m) => m.id === d.redemption);
  const outOfRange = d.kind === "percent" && d.percent !== null && (d.percent < DISCOUNT_RANGE.min || d.percent > DISCOUNT_RANGE.max);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">Forma zniżki</p>
        <Pills
          value={d.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { id: "percent", label: "Rabat %" },
            { id: "freebie", label: "Gratis do zamówienia" },
          ]}
        />
      </div>

      {d.kind === "percent" ? (
        <div>
          <Field label="Wysokość rabatu">
            <NumberInput
              value={d.percent}
              min={1}
              max={100}
              placeholder={`${DISCOUNT_RANGE.min}–${DISCOUNT_RANGE.max}`}
              suffix="%"
              className="max-w-[220px]"
              onChange={(percent) => set({ percent: percent === null ? null : Math.max(0, Math.min(100, Math.round(percent))) })}
            />
          </Field>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[10, 12, 15].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => set({ percent: value })}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  d.percent === value ? "bg-lutra text-white" : "bg-surface text-lutra hover:bg-chip",
                )}
              >
                {value}%
              </button>
            ))}
            <span className={cn("text-xs", outOfRange ? "text-amber-700" : "text-muted")}>
              Zwykle {DISCOUNT_RANGE.min}–{DISCOUNT_RANGE.max}%.
            </span>
          </div>
        </div>
      ) : (
        <Field label="Co gratis">
          <input
            className={inputClass}
            placeholder="np. kawa do deseru, pierwsza godzina gry gratis"
            value={d.freebie}
            onChange={(e) => set({ freebie: e.target.value })}
          />
        </Field>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
          Kiedy obowiązuje <span className="font-medium normal-case tracking-normal text-muted">— np. godziny martwe</span>
        </p>
        <WeekdayPicker value={d.days} onChange={(days) => set({ days })} />
        <div className="mt-2 grid max-w-md grid-cols-2 gap-3">
          <Field label="Od godziny" optional>
            <input type="time" className={inputClass} value={d.hoursFrom} onChange={(e) => set({ hoursFrom: e.target.value })} />
          </Field>
          <Field label="Do godziny" optional>
            <input type="time" className={inputClass} value={d.hoursTo} onChange={(e) => set({ hoursTo: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Field label="Minimalna grupa" optional>
            <NumberInput
              value={d.minGroup}
              min={1}
              max={100}
              placeholder="np. 3"
              suffix="osób"
              onChange={(minGroup) => set({ minGroup: minGroup === null ? null : Math.max(1, Math.round(minGroup)) })}
            />
          </Field>
          <button
            type="button"
            onClick={() => set({ minGroup: d.minGroup === 3 ? null : 3 })}
            className={cn(
              "mt-2 rounded-full px-3 py-1 text-xs font-semibold",
              d.minGroup === 3 ? "bg-lutra text-white" : "bg-surface text-lutra hover:bg-chip",
            )}
          >
            Grupa 3+
          </button>
        </div>
        <Field label="Wyłączenia" optional>
          <input
            className={inputClass}
            placeholder="np. bez alkoholu, bez weekendów"
            value={d.exclusions}
            onChange={(e) => set({ exclusions: e.target.value })}
          />
        </Field>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">Jak gość realizuje zniżkę</p>
        <Pills
          value={d.redemption}
          onChange={(redemption) => set({ redemption })}
          options={REDEMPTION_METHODS.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))}
        />
        {method ? <p className="mt-2 text-xs leading-5 text-muted">{method.hint}</p> : null}
        {d.redemption === "password" ? (
          <div className="mt-3 max-w-md">
            <Field label="Hasło dla obsługi">
              <input
                className={inputClass}
                placeholder="np. LUTRA-ŚRODA"
                value={d.password}
                onChange={(e) => set({ password: e.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </div>

      {discountSummary(d) ? (
        <p className="rounded-2xl bg-surface px-4 py-2 text-xs text-navy">
          <span className="font-semibold">Podsumowanie:</span> {discountSummary(d)}
        </p>
      ) : null}
    </div>
  );
}

function SpaceFields({ mission }: { mission: Mission }) {
  const { updateTerms } = useStore();
  const s = mission.terms.space;
  const set = (patch: Partial<MissionTerms["space"]>) => updateTerms(mission.id, "space", patch);
  return (
    <div>
      <CheckRow
        checked={s.offered}
        label="Lokal daje też miejsce na wydarzenia (stolik albo przestrzeń w ustalonych godzinach)"
        onChange={() => set({ offered: !s.offered })}
      />
      {s.offered ? (
        <div className="mt-3 space-y-3 rounded-2xl bg-surface px-4 py-3">
          <WeekdayPicker value={s.days} onChange={(days) => set({ days })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Od godziny" optional>
              <input type="time" className={inputClass} value={s.hoursFrom} onChange={(e) => set({ hoursFrom: e.target.value })} />
            </Field>
            <Field label="Do godziny" optional>
              <input type="time" className={inputClass} value={s.hoursTo} onChange={(e) => set({ hoursTo: e.target.value })} />
            </Field>
            <Field label="Miejsc" optional>
              <NumberInput
                value={s.seats}
                min={1}
                max={1000}
                suffix="osób"
                onChange={(seats) => set({ seats: seats === null ? null : Math.max(1, Math.round(seats)) })}
              />
            </Field>
          </div>
          <Field label="Uwagi" optional>
            <input
              className={inputClass}
              placeholder="np. sala na piętrze, rezerwacja dzień wcześniej"
              value={s.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </Field>
          {spaceSummary(s) ? <p className="text-xs text-navy">{spaceSummary(s)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function CycleFields({ mission }: { mission: Mission }) {
  const { updateTerms } = useStore();
  const c = mission.terms.cycle;
  const set = (patch: Partial<MissionTerms["cycle"]>) => updateTerms(mission.id, "cycle", patch);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ile wydarzeń w cyklu">
          <NumberInput
            value={c.events}
            min={1}
            max={100}
            placeholder="np. 3"
            suffix="wydarzeń"
            onChange={(events) => set({ events: events === null ? null : Math.max(1, Math.round(events)) })}
          />
        </Field>
        <Field label="Pierwsze wydarzenie">
          <input type="date" className={inputClass} value={c.firstEventAt} onChange={(e) => set({ firstEventAt: e.target.value })} />
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">Jak często</p>
        <Pills value={c.frequency || null} onChange={(frequency) => set({ frequency })} options={CYCLE_FREQUENCIES} />
      </div>
      <p className="text-xs text-muted">Umawiamy cykl, nie pojedyncze wydarzenie — jednorazowe testy nie budują nawyku.</p>
    </div>
  );
}

function PilotFields({ mission }: { mission: Mission }) {
  const { updateTerms } = useStore();
  const p = mission.terms.pilot;
  const set = (patch: Partial<MissionTerms["pilot"]>) => updateTerms(mission.id, "pilot", patch);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Zespół pilotażowy">
        <input
          className={inputClass}
          placeholder="np. zespół backend"
          value={p.team}
          onChange={(e) => set({ team: e.target.value })}
        />
      </Field>
      <Field label="Liczba osób">
        <NumberInput
          value={p.people}
          min={1}
          max={10000}
          suffix="osób"
          onChange={(people) => set({ people: people === null ? null : Math.max(1, Math.round(people)) })}
        />
      </Field>
      <Field label="Termin feedbacku">
        <input type="date" className={inputClass} value={p.feedbackAt} onChange={(e) => set({ feedbackAt: e.target.value })} />
      </Field>
    </div>
  );
}

/** Warunki współpracy zależnie od typu partnera. */
export function TermsFields({ mission, segment }: { mission: Mission; segment: PartnerSegment }) {
  if (segment === "community") return <CycleFields mission={mission} />;
  if (segment === "company") return <PilotFields mission={mission} />;
  return (
    <div className="space-y-5">
      <DiscountFields mission={mission} />
      <SpaceFields mission={mission} />
    </div>
  );
}

export function termsIntro(segment: Partner["segment"]) {
  if (segment === "community") return "Cykl wydarzeń prowadzony w Lutrze: ile, jak często i kiedy pierwsze.";
  if (segment === "company") return "Pilotaż na jednym zespole: kto, ile osób i kiedy feedback.";
  return "Zniżka dla ludzi z Lutry jest warunkiem obecności w aplikacji. Ustal wysokość, kiedy obowiązuje i jak gość ją realizuje.";
}

const FREQUENCY_DAYS = { weekly: 7, biweekly: 14, monthly: 30 } as const;

/**
 * Proponowana data przeglądu po pierwszym cyklu. Firma: termin feedbacku z pilotażu. Społeczność: dzień po
 * ostatnim wydarzeniu cyklu. Lokal: 30 dni od dziś (pierwszy miesiąc wydarzeń).
 */
export function suggestedReviewDate(mission: Mission, segment: PartnerSegment, today = new Date()) {
  const t = mission.terms;
  if (segment === "company" && isIsoDate(t.pilot.feedbackAt)) return t.pilot.feedbackAt;
  if (segment === "community" && isIsoDate(t.cycle.firstEventAt) && t.cycle.events && t.cycle.frequency) {
    const [y, m, d] = t.cycle.firstEventAt.split("-").map(Number);
    const last = new Date(y, m - 1, d + (t.cycle.events - 1) * FREQUENCY_DAYS[t.cycle.frequency] + 1);
    return toIsoDate(last);
  }
  return addDaysIso(30, today);
}
