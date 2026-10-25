"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AGENDA_LABEL, agenda, type AgendaItem } from "@/lib/agenda";
import { cn } from "@/lib/cn";
import { formatPlDate, relativeDeadline, toIsoDate } from "@/lib/dates";
import { useStore } from "@/lib/store";

const ENABLED_KEY = "lutra-notify";
const SENT_KEY = "lutra-notify-sent";
const CHECK_EVERY_MS = 5 * 60 * 1000;

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Prywatne okno albo zablokowane dane — przypomnienia działają dalej w CRM, tylko bez pamięci.
  }
}

function supported() {
  return typeof window !== "undefined" && "Notification" in window;
}

function when(item: AgendaItem) {
  if (item.kind === "contract_end") return `${formatPlDate(item.due)} · ${relativeDeadline(item.due)}`;
  return item.days < 0 ? `zaległe od ${formatPlDate(item.due)}` : "dziś";
}

/** Szybka akcja przy pozycji „Na dziś” (mail po kontakcie, potwierdzenie warunków). */
function QuickAction({ item }: { item: AgendaItem }) {
  const { state, logFollowUpMail, confirmTerms, canEditMission, closeMission } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mission = state.missions.find((m) => m.id === item.missionId);
  if (!mission || !canEditMission(mission)) return null;
  if (item.kind === "follow_up" && item.activityId) {
    return (
      <>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await logFollowUpMail(item.missionId, item.activityId!);
            setBusy(false);
            if (!result.ok) setError(result.error ?? "Nie udało się zapisać maila.");
          }}
          className="mt-1 rounded-full bg-lutra px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Zapisuję…" : "Mail wysłany"}
        </button>
        {error ? <span className="mt-1 max-w-[220px] text-right text-[11px] text-rose-600">{error}</span> : null}
      </>
    );
  }
  if (item.kind === "no_response") {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            const result = closeMission(item.missionId, {
              status: "lost",
              reason: "Brak kontaktu — nie odbiera",
              note: "Zamknięte po kolejnych próbach kontaktu bez odpowiedzi.",
              returnAt: "",
            });
            if (!result.ok) setError(result.reason ?? "Nie udało się zamknąć misji.");
          }}
          className="mt-1 rounded-full border border-line px-3 py-1 text-[11px] font-semibold text-navy"
        >
          Zamknij: brak kontaktu
        </button>
        {error ? <span className="mt-1 max-w-[220px] text-right text-[11px] text-rose-600">{error}</span> : null}
      </>
    );
  }
  if (item.kind === "terms") {
    return (
      <button
        type="button"
        onClick={() => confirmTerms(item.missionId)}
        className="mt-1 rounded-full bg-lutra px-3 py-1 text-[11px] font-semibold text-white"
      >
        Potwierdzone
      </button>
    );
  }
  return null;
}

/** Lista „Na dziś” na pulpicie. */
export function AgendaList({ limit = 8 }: { limit?: number }) {
  const { state } = useStore();
  const [all, setAll] = useState(false);
  const items = useMemo(() => agenda(state, !all), [state, all]);
  const team = state.team.length > 1;

  return (
    <section className="mt-6 max-w-3xl rounded-[28px] border border-line bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-navy">Na dziś</h2>
          <p className="mt-1 text-xs text-muted">
            Zadania, terminy decyzji, maile po kontakcie, podpisy, opieka nad aktywnymi partnerami i końce umów.
          </p>
        </div>
        {team ? (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-semibold text-lutra">
            {all ? "Tylko moje" : "Cały zespół"}
          </button>
        ) : null}
      </div>
      {items.length ? (
        <ul className="mt-4 space-y-2">
          {items.slice(0, limit).map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/partners/${item.partnerId}/mission`} className="font-semibold text-lutra">
                  {item.partnerName}
                </Link>
                <p className="mt-0.5 text-muted">
                  <span className="font-medium text-navy">{AGENDA_LABEL[item.kind]}:</span> {item.title}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    item.days < 0 && item.kind !== "contract_end" ? "text-rose-600" : "text-navy",
                  )}
                >
                  {when(item)}
                </span>
                <QuickAction item={item} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Na dziś nic zaległego. Prowadź najpilniejszą misję albo dodaj partnerów do researchu.
        </p>
      )}
      {items.length > limit ? (
        <Link href="/zadania" className="mt-3 inline-flex text-xs font-semibold text-lutra">
          i {items.length - limit} więcej w Zadaniach
        </Link>
      ) : null}
    </section>
  );
}

/**
 * Powiadomienia systemowe, gdy CRM jest otwarty: raz dziennie na każdą pozycję z „Na dziś”.
 * Bez serwera — działa tylko w otwartej karcie przeglądarki.
 */
export function ReminderNotifier() {
  const { state, dbStatus } = useStore();

  useEffect(() => {
    if (!supported() || dbStatus !== "ok") return;
    const check = () => {
      if (read(ENABLED_KEY) !== "1" || Notification.permission !== "granted") return;
      const today = toIsoDate(new Date());
      let sent: { day: string; keys: string[] } = { day: today, keys: [] };
      try {
        const parsed = JSON.parse(read(SENT_KEY) ?? "null");
        if (parsed?.day === today && Array.isArray(parsed.keys)) sent = parsed;
      } catch {
        // Uszkodzony zapis — zaczynamy dzień od nowa.
      }
      const fresh = agenda(state).filter((item) => !sent.keys.includes(item.key));
      if (!fresh.length) return;
      const body = fresh
        .slice(0, 4)
        .map((item) => `${item.partnerName}: ${item.title}`)
        .join("\n");
      try {
        new Notification(fresh.length === 1 ? "Lutra CRM — na dziś" : `Lutra CRM — ${fresh.length} rzeczy na dziś`, {
          body: fresh.length > 4 ? `${body}\n…` : body,
          tag: "lutra-agenda",
        });
      } catch {
        return;
      }
      write(SENT_KEY, JSON.stringify({ day: today, keys: [...sent.keys, ...fresh.map((item) => item.key)] }));
    };
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [state, dbStatus]);

  return null;
}

/** Ustawienia: włączenie powiadomień w tej przeglądarce. */
export function RemindersSection() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    supported() ? Notification.permission : "unsupported",
  );
  const [enabled, setEnabled] = useState(() => supported() && read(ENABLED_KEY) === "1");

  const enable = async () => {
    if (!supported()) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      write(ENABLED_KEY, "1");
      setEnabled(true);
    }
  };
  const disable = () => {
    write(ENABLED_KEY, "0");
    setEnabled(false);
  };

  return (
    <section className="mt-4 rounded-[28px] border border-line bg-white p-6">
      <h2 className="font-semibold">Przypomnienia</h2>
      <p className="mt-1 text-sm text-muted">
        Pulpit pokazuje „Na dziś”, a menu — licznik przy Zadaniach. Powiadomienie systemowe wychodzi raz dziennie na
        pozycję, gdy CRM jest otwarty w tej przeglądarce.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {permission === "unsupported" ? (
          <span className="text-muted">Ta przeglądarka nie obsługuje powiadomień.</span>
        ) : permission === "denied" ? (
          <span className="text-amber-700">Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony.</span>
        ) : enabled && permission === "granted" ? (
          <>
            <span className="text-emerald-700">Powiadomienia włączone.</span>
            <button type="button" onClick={disable} className="text-xs font-semibold text-muted">
              Wyłącz
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void enable()}
            className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white"
          >
            Włącz powiadomienia
          </button>
        )}
      </div>
    </section>
  );
}
