"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, Check, FileUp, MessageSquareText, Sparkles, X } from "lucide-react";
import { authHeaders } from "@/lib/api-auth";
import { cn } from "@/lib/cn";
import { formatPlDate, toIsoDate } from "@/lib/dates";
import {
  appendToNote,
  channelName,
  extractionContext,
  hasMaterial,
  manualPrompt,
  normalizeExtraction,
  parseLooseJson,
  readyTranscripts,
  sourceOf,
  firstDateOf,
  MAX_SOURCE_CHARS,
  type DiscoveryExtraction,
  type ExtractionContext,
  type ProposalRow,
} from "@/lib/discovery-extract";
import { buildMissionProposal, GROUPS, planMission, type MissionProposal } from "@/lib/mission-extract";
import { activityChannelLabel, activityOutcomeLabel } from "@/lib/playbook";
import { useStore } from "@/lib/store";
import { cleanTranscript, MAX_TRANSCRIPT_CHARS, TRANSCRIPT_FILE_ACCEPT, wordsLabel } from "@/lib/transcript";
import type { Activity, CallRecord, Channel, Mission, Partner, StageId } from "@/lib/types";

export const OPEN_TALK_EVENT = "lutra:open-talk";
type Focus = "note" | "transcript" | "fill";

/** Otwiera bąbelek „Notatka z rozmowy” (np. z kroku Discovery) na wybranej części. */
export function openTalk(focus: Focus = "note") {
  window.dispatchEvent(new CustomEvent(OPEN_TALK_EVENT, { detail: { focus } }));
}

/** Skrót w nagłówku kroku: uzupełnij ten krok z rozmowy (otwiera bąbelek na podglądzie). */
export function FromTalkButton({ mission }: { mission: Mission }) {
  const has =
    readyTranscripts(mission).length > 0 || mission.conversationNote.trim().length >= 80;
  if (!has) return null;
  return (
    <button
      type="button"
      onClick={() => openTalk("fill")}
      className="flex items-center gap-1.5 rounded-full border border-chip-strong px-3 py-1 text-xs font-semibold text-navy hover:border-blue"
    >
      <Sparkles size={13} aria-hidden /> Uzupełnij z rozmowy
    </button>
  );
}

/** Od kontaktu wzwyż: notatka powstaje w kroku Kontakt, korzystamy z niej w Discovery i dalej. */
const SHOW_ON: StageId[] = ["contact", "discovery", "needs", "offer", "negotiation", "contract", "activation"];

const MAX_FILE_BYTES = 2_000_000;

function localNow() {
  const date = new Date();
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatPlDate(toIsoDate(date));
}

function itemsLabel(count: number) {
  if (count === 1) return "1 pozycję";
  const last = count % 10;
  const lastTwo = count % 100;
  return `${count} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "pozycje" : "pozycji"}`;
}

function transcriptCountLabel(count: number) {
  if (count === 1) return "1 transkrypt";
  const last = count % 10;
  const lastTwo = count % 100;
  return `${count} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "transkrypty" : "transkryptów"}`;
}

export function TalkBubble({
  partner,
  mission,
  stage,
  editable,
}: {
  partner: Partner;
  mission: Mission;
  stage: StageId;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Szuflada zostaje w drzewie po zamknięciu, żeby nie zgubić wklejonego tekstu ani podglądu.
  const [mounted, setMounted] = useState(false);
  const [focus, setFocus] = useState<{ part: Focus; at: number }>({ part: "note", at: 0 });

  useEffect(() => {
    const onOpen = (event: Event) => {
      const part = (event as CustomEvent<{ focus?: Focus }>).detail?.focus ?? "note";
      setFocus({ part, at: Date.now() });
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_TALK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TALK_EVENT, onOpen);
  }, []);

  const visible = SHOW_ON.includes(stage);
  if (!visible && !mounted) return null;
  const transcripts = readyTranscripts(mission);

  return (
    <>
      {open || !visible ? null : (
        <button
          type="button"
          onClick={() => {
            setFocus({ part: "note", at: Date.now() });
            setMounted(true);
            setOpen(true);
          }}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-navy py-3 pl-4 pr-5 text-sm font-medium text-white shadow-[0_12px_32px_rgba(9,12,155,0.28)] transition hover:bg-ink"
        >
          <MessageSquareText size={16} aria-hidden />
          Notatka z rozmowy
          {transcripts.length ? (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
              {transcriptCountLabel(transcripts.length)}
            </span>
          ) : mission.conversationNote.trim() ? (
            <span className="h-2 w-2 rounded-full bg-emerald-300" aria-label="jest notatka" />
          ) : null}
        </button>
      )}
      {mounted ? (
        <TalkDrawer
          open={open}
          focus={focus}
          partner={partner}
          mission={mission}
          editable={editable}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function TalkDrawer({
  open,
  focus,
  partner,
  mission,
  editable,
  onClose,
}: {
  open: boolean;
  focus: { part: Focus; at: number };
  partner: Partner;
  mission: Mission;
  editable: boolean;
  onClose: () => void;
}) {
  const noteRef = useRef<HTMLElement>(null);
  // Po zapisaniu transkryptu analiza rusza sama (gdy AI jest podłączone).
  const [autoRun, setAutoRun] = useState(0);
  const transcriptRef = useRef<HTMLElement>(null);
  const fillRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const target = focus.part === "fill" ? fillRef : focus.part === "transcript" ? transcriptRef : noteRef;
    target.current?.scrollIntoView({ block: "start" });
  }, [open, focus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={cn("fixed inset-0 z-50 justify-end bg-ink/20", open ? "flex" : "hidden")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="talk-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-[-12px_0_48px_rgba(9,12,155,0.18)]">
        <header className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">Notatka z rozmowy</p>
            <h2 id="talk-title" className="mt-0.5 text-lg font-semibold">
              {partner.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij notatkę"
            className="rounded-full p-2 text-muted hover:bg-surface hover:text-foreground"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 space-y-8 overflow-y-auto px-6 py-5">
          <section ref={noteRef} className="scroll-mt-4">
            <NoteBlock mission={mission} editable={editable} />
          </section>
          <section ref={transcriptRef} className="scroll-mt-4">
            <TranscriptBlock
              mission={mission}
              editable={editable}
              openedAt={focus.at}
              onSaved={() => setAutoRun((count) => count + 1)}
            />
          </section>
          <section ref={fillRef} className="scroll-mt-4">
            <FillBlock mission={mission} partner={partner} editable={editable} active={open} autoRun={autoRun} />
          </section>
        </div>
      </aside>
    </div>
  );
}

function BlockTitle({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {aside ? <span className="text-xs text-muted">{aside}</span> : null}
    </div>
  );
}

function NoteBlock({ mission, editable }: { mission: Mission; editable: boolean }) {
  const { setRecording } = useStore();
  return (
    <div>
      <BlockTitle title="Notatka i wnioski" aside="ta sama co w kroku Kontakt" />
      <textarea
        className="mt-2 min-h-[150px] w-full rounded-2xl border border-chip-mid bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-blue read-only:bg-surface"
        placeholder="Wnioski z rozmowy, ustalenia, co obiecałeś sprawdzić…"
        aria-label="Notatka z rozmowy"
        value={mission.conversationNote}
        readOnly={!editable}
        onChange={(event) => setRecording(mission.id, { conversationNote: event.target.value })}
      />
    </div>
  );
}

/** Wyniki, po których nie ma rozmowy do spisania (nie odebrał, odmowa, sama wysyłka). */
const NO_TALK = new Set(["no_answer", "refused", "sent"]);

/** Rozmowy z dziennika, do których można dopiąć transkrypt (telefon albo spotkanie z ostatnich 30 dni). */
function attachTargets(mission: Mission, now: number) {
  const since = now - 30 * 86_400_000;
  return mission.activities
    .filter(
      (activity) =>
        (activity.channel === "phone" || activity.channel === "in_person") &&
        !activity.hasTranscript &&
        !(activity.outcome && NO_TALK.has(activity.outcome)) &&
        new Date(activity.occurredAt).getTime() >= since,
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 8);
}

function targetLabel(activity: Activity) {
  const what = activity.subject.trim() || activity.summary.trim().slice(0, 48);
  const outcome = activity.outcome ? activityOutcomeLabel(activity.channel, activity.outcome) : "";
  return [dayLabel(activity.occurredAt), activityChannelLabel(activity.channel), outcome, what].filter(Boolean).join(" · ");
}

function TranscriptBlock({
  mission,
  editable,
  openedAt,
  onSaved,
}: {
  mission: Mission;
  editable: boolean;
  openedAt: number;
  onSaved: () => void;
}) {
  const transcripts = readyTranscripts(mission);
  const [adding, setAdding] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const showForm = editable && (adding || transcripts.length === 0);
  return (
    <div>
      <BlockTitle
        title="Transkrypt rozmowy"
        aside={transcripts.length ? transcriptCountLabel(transcripts.length) : "Spinach, Zoom, Meet, Teams"}
      />
      {transcripts.length ? (
        <ul className="mt-2 space-y-2">
          {transcripts.map((call) => (
            <TranscriptRow key={call.id} mission={mission} call={call} editable={editable} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted">
          Jeszcze nic. Wklej transkrypt ze Spinach — AI odczyta z niego pola misji, a Ty je sprawdzisz.
        </p>
      )}
      {justSaved && !showForm ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
          <Check size={14} aria-hidden /> Transkrypt zapisany.
          <button type="button" onClick={() => openTalk("fill")} className="font-semibold text-lutra">
            Uzupełnij misję z rozmowy ↓
          </button>
        </p>
      ) : null}
      {showForm ? (
        <AddTranscriptForm
          mission={mission}
          openedAt={openedAt}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setJustSaved(true);
            onSaved();
          }}
          canCancel={transcripts.length > 0}
        />
      ) : editable ? (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setJustSaved(false);
          }}
          className="mt-3 text-xs font-semibold text-lutra"
        >
          + Dodaj kolejny transkrypt
        </button>
      ) : null}
    </div>
  );
}

function TranscriptRow({ mission, call, editable }: { mission: Mission; call: CallRecord; editable: boolean }) {
  const { saveTranscript, removeTranscript } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(call.transcriptText ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = call.transcriptText ?? "";

  const save = async () => {
    const clean = cleanTranscript(draft);
    if (clean.length < 20) {
      setError("Transkrypt jest pusty albo za krótki (co najmniej 20 znaków).");
      return;
    }
    setBusy(true);
    const result = await saveTranscript(call.id, clean);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Nie udało się zapisać.");
      return;
    }
    setError(null);
    setEditing(false);
  };

  const remove = async () => {
    setBusy(true);
    const result = await removeTranscript(mission.id, call.id);
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Nie udało się usunąć.");
  };

  return (
    <li className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {dayLabel(call.createdAt)} · {channelName(call.channel)}
          <span className="ml-2 text-xs font-normal text-muted">{wordsLabel(text)}</span>
        </p>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <button type="button" onClick={() => setOpen((value) => !value)} className="text-lutra">
            {open ? "Zwiń" : "Pokaż"}
          </button>
          {editable && !editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft(text);
                setEditing(true);
                setOpen(true);
              }}
              className="text-lutra"
            >
              Popraw
            </button>
          ) : null}
          {editable ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-muted hover:text-rose-700">
              Usuń
            </button>
          ) : null}
        </div>
      </div>
      {confirmDelete ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <span>Usunąć ten transkrypt? Wpis w dzienniku zostaje.</span>
          <button type="button" disabled={busy} onClick={() => void remove()} className="font-semibold text-rose-700">
            Usuń transkrypt
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted">
            Anuluj
          </button>
        </div>
      ) : null}
      {open && editing ? (
        <div className="mt-2">
          <textarea
            className="min-h-[220px] w-full rounded-xl border border-chip-mid bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-blue"
            value={draft}
            aria-label="Treść transkryptu"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-full bg-lutra px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Zapis…" : "Zapisz poprawki"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted">
              Anuluj
            </button>
          </div>
        </div>
      ) : open ? (
        <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-sm leading-6 text-foreground">
          {text}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </li>
  );
}

function AddTranscriptForm({
  mission,
  openedAt,
  onCancel,
  onSaved,
  canCancel,
}: {
  mission: Mission;
  /** Chwila otwarcia szuflady — od niej liczymy „ostatnie rozmowy” (bez Date.now() w renderze). */
  openedAt: number;
  onCancel: () => void;
  onSaved: () => void;
  canCancel: boolean;
}) {
  const { addTranscript } = useStore();
  const targets = useMemo(() => attachTargets(mission, openedAt), [mission, openedAt]);
  const recent = targets.find((activity) => openedAt - new Date(activity.occurredAt).getTime() <= 2 * 86_400_000);
  const [text, setText] = useState("");
  // null = jeszcze nie wybrano: domyślnie ostatnia rozmowa z dziennika (liczona przy każdym otwarciu).
  const [attachChoice, setAttachChoice] = useState<string | null>(null);
  const attachTo =
    attachChoice !== null && (attachChoice === "" || targets.some((activity) => activity.id === attachChoice))
      ? attachChoice
      : (recent?.id ?? "");
  const [channel, setChannel] = useState<Channel>("in_person");
  const [occurredAt, setOccurredAt] = useState(localNow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (/\.(docx?|pdf|rtf|odt)$/i.test(file.name)) {
      setError("Tego pliku nie odczytam. Otwórz go, zaznacz cały tekst (Ctrl+A), skopiuj i wklej tutaj.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Plik jest za duży (ponad 2 MB). Wklej sam tekst rozmowy.");
      return;
    }
    const raw = await file.text();
    setText(cleanTranscript(raw, file.name));
    setError(null);
  };

  const save = async () => {
    const clean = cleanTranscript(text);
    if (clean.length < 20) {
      setError(
        clean
          ? `To za mało na transkrypt (${clean.length} znaków, potrzeba co najmniej 20). Wklej całą rozmowę ze Spinach.`
          : "Wklej transkrypt albo wczytaj plik.",
      );
      return;
    }
    const when = occurredAt ? new Date(occurredAt) : new Date();
    if (!attachTo && Number.isNaN(when.getTime())) {
      setError("Podaj, kiedy była rozmowa.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await addTranscript(mission.id, {
        text: clean,
        channel,
        occurredAt: Number.isNaN(when.getTime()) ? new Date().toISOString() : when.toISOString(),
        attachTo: attachTo || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Nie udało się zapisać transkryptu.");
        return;
      }
      setText("");
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const tooLong = text.length > MAX_TRANSCRIPT_CHARS;

  return (
    <div className="mt-3 rounded-2xl border border-dashed border-chip-strong px-4 py-4">
      <textarea
        className="min-h-[180px] w-full rounded-xl border border-chip-mid bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-blue"
        placeholder={"Wklej transkrypt ze Spinach, np.\nAnna Kowalska: W środy po 16 mamy pusto…\nKuba: …"}
        aria-label="Nowy transkrypt"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 font-semibold text-lutra"
        >
          <FileUp size={14} aria-hidden /> Wczytaj z pliku (.txt, .vtt, .srt, .md)
        </button>
        <span className={cn("text-muted", tooLong && "text-rose-600")}>{text ? wordsLabel(text) : ""}</span>
        <input
          ref={fileRef}
          type="file"
          accept={TRANSCRIPT_FILE_ACCEPT}
          className="hidden"
          aria-label="Plik z transkryptem"
          onChange={(event) => void onFile(event)}
        />
      </div>

      <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
        Rozmowa
        <select
          className="mt-1 w-full rounded-xl border border-chip-mid bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-blue"
          value={attachTo}
          onChange={(event) => setAttachChoice(event.target.value)}
        >
          <option value="">Nowy wpis w dzienniku kontaktów</option>
          {targets.map((activity) => (
            <option key={activity.id} value={activity.id}>
              Do wpisu: {targetLabel(activity)}
            </option>
          ))}
        </select>
      </label>
      {attachTo ? null : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
            Kanał
            <select
              className="mt-1 w-full rounded-xl border border-chip-mid bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-blue"
              value={channel}
              onChange={(event) => setChannel(event.target.value as Channel)}
            >
              <option value="in_person">Spotkanie (online albo na miejscu)</option>
              <option value="phone">Telefon</option>
            </select>
          </label>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
            Kiedy
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-chip-mid bg-white px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-blue"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !text.trim() || tooLong}
          onClick={() => void save()}
          className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Zapisuję…" : "Zapisz transkrypt"}
        </button>
        {canCancel ? (
          <button type="button" onClick={onCancel} className="text-xs text-muted">
            Anuluj
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <p className="mt-3 text-xs leading-5 text-muted">
        W Spinach: Recordings → spotkanie → pobierz albo skopiuj transkrypt. Telefony, maile i NIP-y nie idą do AI.
        {attachTo ? "" : " Nowy wpis trafi do dziennika kontaktów."}
      </p>
    </div>
  );
}

type EngineInfo = {
  enabled: boolean;
  engine: "claude" | "mac" | "zen" | null;
  model: string | null;
  /** Ile znaków rozmów przyjmie silnik (dłuższe: początek i koniec). */
  limit?: number;
  /** Dlaczego wyłączone: brak silnika albo logowania. */
  reason?: string;
};

/** Wynik odczytu rozmowy. Podgląd liczymy z niego na bieżąco względem aktualnej misji. */
type Reading = {
  extraction: DiscoveryExtraction;
  source: string;
  callDate: string;
  fromDate: string;
  origin: string;
  clipped: boolean;
};

/** Ręczne zaznaczenie wiąże się z treścią wiersza: gdy zmieni się obecna wartość, wraca domyślny wybór. */
function rowId(row: ProposalRow) {
  return `${row.key}|${row.current}|${row.value}`;
}

function engineLabel(info: EngineInfo) {
  if (info.engine === "claude") return `Claude${info.model ? ` (${info.model})` : ""}`;
  if (info.engine === "mac") return "Qwen na tym komputerze";
  if (info.engine === "zen") return "OpenCode Zen";
  return "";
}

/** Dlaczego automat jest wyłączony — po ludzku, z podpowiedzią, co zrobić. */
const DISABLED_TEXT: Record<string, string> = {
  oauth_token:
    "W .env.local jest token z „claude setup-token” (sk-ant-oat…) — to dostęp do Claude Code w ramach subskrypcji, CRM go nie użyje. Utwórz klucz API w Claude Console (sk-ant-api…) albo zrób to przez Claude poniżej.",
  admin_key:
    "W .env.local jest klucz administracyjny (sk-ant-admin…). Potrzebny jest zwykły klucz API z Claude Console — albo zrób to przez Claude poniżej.",
  login: "Automat jest wyłączony — sesja wygasła. Zaloguj się ponownie albo zrób to przez Claude poniżej.",
  not_allowed: "Twoje konto nie ma dostępu do automatu (AI_ALLOWED_EMAILS). Możesz to zrobić przez Claude poniżej.",
  offline: "Nie mogę sprawdzić serwera CRM. Możesz to zrobić przez Claude poniżej.",
  no_engine:
    "Automat jest wyłączony — na serwerze CRM nie ma klucza Claude API. Możesz to zrobić przez Claude poniżej (bez dodatkowych kosztów w ramach Twojego planu) albo dodać ANTHROPIC_API_KEY do .env.local i uruchomić CRM ponownie.",
};

function privacyLine(info: EngineInfo) {
  if (info.engine === "mac") return "Rozmowa nie wychodzi z tego komputera.";
  if (info.engine === "zen") return "Transkrypt i notatka (bez telefonów, maili i NIP-ów) idą na serwer OpenCode Zen.";
  return "Transkrypt i notatka (bez telefonów, maili i NIP-ów) idą do Claude API (Anthropic).";
}

function FillBlock({
  mission,
  partner,
  editable,
  active,
  autoRun,
}: {
  mission: Mission;
  partner: Partner;
  editable: boolean;
  active: boolean;
  /** Rośnie po każdym zapisanym transkrypcie. */
  autoRun: number;
}) {
  const store = useStore();
  const {
    updateDiscovery,
    updateDecision,
    setNextStepAt,
    upsertNeed,
    addPartnerContact,
    setRecording,
    updateTerms,
    updateContract,
    updateActivation,
    updatePartner,
    setChecklistItem,
    toggleObjection,
  } = store;
  const seller = store.state.user.name;
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<string | null>(null);

  // Podgląd zawsze względem obecnej misji: jeśli w międzyczasie coś wpiszesz ręcznie, wiersz pokaże „Teraz: …”
  // i nie będzie zaznaczony domyślnie — stara odpowiedź nie nadpisze nowszych zmian.
  const proposal = useMemo(
    () =>
      reading
        ? buildMissionProposal(reading.extraction, {
            mission,
            partner,
            source: reading.source,
            callDate: reading.callDate,
            fromDate: reading.fromDate,
          })
        : null,
    [reading, mission, partner],
  );
  const selected = useMemo(
    () => new Set((proposal?.rows ?? []).filter((row) => overrides[rowId(row)] ?? row.checked).map((row) => row.key)),
    [proposal, overrides],
  );

  useEffect(() => {
    if (!active || engine) return;
    let cancelled = false;
    void authHeaders()
      .then((headers) => fetch("/api/discovery-extract", { headers }))
      .then((res) => res.json())
      .then((data: Partial<EngineInfo>) => {
        if (cancelled) return;
        setEngine({
          enabled: Boolean(data.enabled),
          engine: data.engine ?? null,
          model: data.model ?? null,
          limit: typeof data.limit === "number" ? data.limit : undefined,
          reason: data.reason,
        });
      })
      .catch(() => {
        if (!cancelled) setEngine({ enabled: false, engine: null, model: null, reason: "offline" });
      });
    return () => {
      cancelled = true;
    };
  }, [active, engine]);

  const limit = engine?.limit ?? MAX_SOURCE_CHARS;
  const context = (max = MAX_SOURCE_CHARS): ExtractionContext => extractionContext(mission, partner, seller, max);
  // Tani test na każdy render; pełny kontekst (z wycinaniem telefonów) liczymy dopiero przy wysyłce.
  const transcripts = readyTranscripts(mission);
  const ready =
    transcripts.some((call) => (call.transcriptText ?? "").trim().length >= 80) ||
    mission.conversationNote.trim().length >= 80;
  const totalChars = transcripts.reduce((sum, call) => sum + (call.transcriptText ?? "").length, 0);

  const show = (raw: unknown, ctx: ExtractionContext, origin: string, clipped = false) => {
    setReading({
      extraction: normalizeExtraction(raw),
      source: sourceOf(ctx),
      callDate: ctx.callDate,
      fromDate: firstDateOf(ctx),
      origin,
      clipped: clipped || Boolean(ctx.clipped),
    });
    setOverrides({});
    setDone(null);
  };

  const run = async () => {
    const ctx = context(limit);
    if (!hasMaterial(ctx)) {
      setError("Najpierw wklej transkrypt albo dopisz notatkę z rozmowy.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/discovery-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ context: ctx }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: unknown;
        error?: string;
        engine?: EngineInfo["engine"];
        model?: string | null;
        clipped?: boolean;
      };
      if (!res.ok || !data.data) throw new Error(data.error ?? "Nie udało się odczytać rozmowy.");
      show(
        data.data,
        ctx,
        engineLabel({ enabled: true, engine: data.engine ?? null, model: data.model ?? null }),
        Boolean(data.clipped),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message && !/fetch|network/i.test(message) ? message : "Brak połączenia z serwerem CRM.");
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    const ctx = context();
    if (!hasMaterial(ctx)) {
      setError("Najpierw wklej transkrypt albo dopisz notatkę z rozmowy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(manualPrompt(ctx));
      setCopied(true);
      setError(null);
    } catch {
      setError("Przeglądarka nie pozwoliła skopiować. Spróbuj jeszcze raz.");
    }
  };

  const readAnswer = () => {
    const raw = parseLooseJson(answer);
    if (!raw || typeof raw !== "object") {
      setError("Nie widzę odpowiedzi w formacie JSON. Skopiuj całą odpowiedź Claude i wklej ją tutaj.");
      return;
    }
    setError(null);
    show(raw, context(), "Odpowiedź wklejona z Claude");
  };

  // Najnowsza wersja run() dla efektu auto-startu (bez odpalania przy każdym renderze).
  const runRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    runRef.current = run;
  });
  const lastAuto = useRef(autoRun);
  useEffect(() => {
    if (autoRun === lastAuto.current) return;
    lastAuto.current = autoRun;
    if (!engine?.enabled || !editable || busy) return;
    openTalk("fill");
    void runRef.current();
  }, [autoRun, engine, editable, busy]);

  const toggle = (row: ProposalRow) =>
    setOverrides((prev) => ({ ...prev, [rowId(row)]: !(prev[rowId(row)] ?? row.checked) }));

  const apply = async () => {
    if (!proposal) return;
    const plan = planMission(proposal, selected, mission);
    setBusy(true);
    let makerId = plan.maker?.id;
    let makerError = "";
    if (plan.maker && !makerId) {
      const added = await addPartnerContact(partner.id, {
        name: plan.maker.name,
        role: plan.maker.role,
        isDecisionMaker: true,
      });
      if (added.ok && added.id) makerId = added.id;
      else makerError = added.error ?? "Nie udało się dodać decydenta.";
    }
    const discovery = { ...plan.discovery, ...(makerId ? { decisionMakerId: makerId } : {}) };
    if (Object.keys(discovery).length) updateDiscovery(mission.id, discovery);
    if (Object.keys(plan.decision).length) updateDecision(mission.id, plan.decision);
    if (plan.nextStepAt) setNextStepAt(mission.id, plan.nextStepAt);
    for (const need of plan.needs) upsertNeed(mission.id, need);
    // Oferta i warunki.
    if (plan.terms.discount) updateTerms(mission.id, "discount", plan.terms.discount);
    if (plan.terms.space) updateTerms(mission.id, "space", plan.terms.space);
    if (plan.terms.cycle) updateTerms(mission.id, "cycle", plan.terms.cycle);
    if (plan.terms.pilot) updateTerms(mission.id, "pilot", plan.terms.pilot);
    // Obiekcje: tylko zaznaczamy to, czego jeszcze nie ma (przełącznik w sklepie).
    for (const item of plan.objections) {
      const state = mission.objections.find((o) => o.key === item.key);
      if (!state?.checked) toggleObjection(mission.id, item.key, "checked");
      if (item.worked && !state?.argumentWorked) toggleObjection(mission.id, item.key, "argumentWorked");
    }
    // Porozumienie / umowa i aktywacja.
    if (Object.keys(plan.contract).length) updateContract(mission.id, plan.contract);
    if (Object.keys(plan.activation).length) updateActivation(mission.id, plan.activation);
    if (plan.partner.hours) updatePartner(partner.id, { hours: plan.partner.hours });
    for (const [key, value] of Object.entries(plan.checklist)) setChecklistItem(mission.id, key, value);
    if (plan.noteAppend) {
      setRecording(mission.id, { conversationNote: appendToNote(mission.conversationNote, plan.noteAppend) });
    }
    setBusy(false);
    const count = selected.size - (makerError && plan.maker ? 1 : 0);
    setReading(null);
    setOverrides({});
    setAnswer("");
    setDone(
      `Wstawiono ${itemsLabel(count)}. Sprawdź kroki misji, a na ekranie Discovery kliknij „Potwierdź jako fakt”, gdy wszystko się zgadza.${
        makerError ? ` Decydenta nie dodałem: ${makerError}` : ""
      }`,
    );
  };

  const enabled = Boolean(engine?.enabled);

  return (
    <div>
      <BlockTitle title="Uzupełnij misję z rozmowy" aside={enabled && engine ? engineLabel(engine) : undefined} />
      <p className="mt-1 text-xs leading-5 text-muted">
        AI czyta transkrypt i notatkę i proponuje pola wszystkich kroków: rozmowę i potrzeby, ustalone warunki, obiekcje,
        dane do porozumienia i aktywacji. Niczego nie wstawia bez Twojego zaznaczenia, a fakt potwierdzasz sam. Po
        kolejnej rozmowie uruchom ponownie — dojdzie tylko to, czego jeszcze nie ma.
      </p>

      {!editable ? (
        <p className="mt-3 rounded-2xl bg-chip px-4 py-3 text-xs text-navy">Tylko podgląd — pola wypełnia osoba, która prowadzi misję.</p>
      ) : (
        <>
          {enabled ? (
            <div className="mt-3">
              <button
                type="button"
                disabled={busy || !ready}
                onClick={() => void run()}
                className="flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Sparkles size={15} aria-hidden />
                {busy ? "Czytam rozmowę… (do minuty)" : "Wypełnij pola z rozmowy"}
              </button>
              <p className="mt-2 text-xs leading-5 text-muted">{engine ? privacyLine(engine) : ""}</p>
            </div>
          ) : engine ? (
            <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-xs leading-5 text-muted">
              {DISABLED_TEXT[engine.reason ?? ""] ?? DISABLED_TEXT.no_engine}
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted">Sprawdzam, czy AI jest podłączone…</p>
          )}
          {!ready ? (
            <p className="mt-2 text-xs text-amber-700">Najpierw wklej transkrypt albo dopisz notatkę z rozmowy.</p>
          ) : totalChars > limit ? (
            <p className="mt-2 text-xs leading-5 text-muted">
              Rozmowy mają razem {totalChars.toLocaleString("pl-PL")} znaków — do AI pójdą najnowsze, a z bardzo długiej
              rozmowy początek i koniec (limit {limit.toLocaleString("pl-PL")}).
            </p>
          ) : null}

          <div className="mt-4 rounded-2xl border border-line">
            <button
              type="button"
              onClick={() => setManualOpen((value) => !value)}
              aria-expanded={manualOpen || (engine !== null && !enabled)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
            >
              Przez Claude (bez klucza API)
              <span className="text-xs text-lutra">{manualOpen || (engine !== null && !enabled) ? "Zwiń" : "Pokaż"}</span>
            </button>
            {manualOpen || (engine !== null && !enabled) ? (
              <div className="space-y-3 border-t border-line px-4 py-4 text-xs leading-5">
                <p className="text-muted">
                  1. Skopiuj polecenie z rozmową i wklej je w Claude (claude.ai albo Cowork). Masz skill „Discovery do
                  CRM”? Wtedy wystarczy wkleić w Claude sam transkrypt.
                </p>
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => void copyPrompt()}
                  className="rounded-full border border-lutra px-4 py-1.5 text-xs font-semibold text-lutra disabled:opacity-50"
                >
                  {copied ? "Skopiowane ✓" : "Kopiuj polecenie z rozmową"}
                </button>
                <p className="text-muted">2. Wklej tutaj odpowiedź Claude (JSON) i obejrzyj podgląd.</p>
                <textarea
                  className="min-h-[110px] w-full rounded-xl border border-chip-mid bg-white px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-blue"
                  placeholder='{"cytat": "…", "problem": "…", …}'
                  aria-label="Odpowiedź Claude"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                />
                <button
                  type="button"
                  disabled={!answer.trim()}
                  onClick={readAnswer}
                  className="rounded-full bg-lutra px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Pokaż podgląd
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}
      {done ? (
        <p className="mt-3 flex gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
          <Check size={14} className="mt-0.5 shrink-0" aria-hidden /> {done}
        </p>
      ) : null}

      {proposal && reading && editable ? (
        <ProposalPreview
          proposal={proposal}
          origin={reading.origin}
          clipped={reading.clipped}
          selected={selected}
          busy={busy}
          onToggle={toggle}
          onApply={() => void apply()}
          onDiscard={() => {
            setReading(null);
            setOverrides({});
          }}
        />
      ) : null}
    </div>
  );
}

function ProposalPreview({
  proposal,
  origin,
  clipped,
  selected,
  busy,
  onToggle,
  onApply,
  onDiscard,
}: {
  proposal: MissionProposal;
  origin: string;
  clipped: boolean;
  selected: Set<string>;
  busy: boolean;
  onToggle: (row: ProposalRow) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { rows, missing } = proposal;
  return (
    <div className="mt-5 rounded-2xl border border-chip-mid bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-sm font-semibold">Podgląd — zaznacz, co wstawić</p>
        <span className="text-[11px] text-muted">{origin}</span>
      </div>
      {clipped ? (
        <p className="border-b border-line bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-900">
          Rozmowa była za długa na jedno zapytanie — AI dostało początek i koniec (bez środka) albo tylko nowsze rozmowy.
        </p>
      ) : null}
      {missing.length ? (
        <p className="border-b border-line bg-surface px-4 py-2 text-xs leading-5 text-muted">
          W rozmowie nie znalazłem: {missing.join(", ")}. Uzupełnisz to ręcznie albo po następnej rozmowie.
        </p>
      ) : null}
      {rows.length ? (
        <div>
          {Object.values(GROUPS)
            .map((group) => ({ group, items: rows.filter((row) => (row.group ?? GROUPS.talk) === group) }))
            .filter((section) => section.items.length)
            .map((section) => (
              <div key={section.group}>
                <p className="border-b border-line bg-surface px-4 py-1.5 text-[11px] font-semibold text-muted">
                  {section.group}
                </p>
                <ul className="divide-y divide-line">
                  {section.items.map((row) => {
                    const checked = selected.has(row.key);
                    return (
                      <li key={row.key}>
                        <label className="flex cursor-pointer gap-3 px-4 py-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 shrink-0 accent-[var(--blue)]"
                            checked={checked}
                            onChange={() => onToggle(row)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
                              {row.label}
                            </span>
                            <span className="mt-0.5 block whitespace-pre-wrap text-sm leading-6 text-foreground">
                              {row.value}
                            </span>
                            {row.current ? (
                              <span className="mt-0.5 block text-xs text-muted">
                                Teraz: {row.current}
                                {checked ? (row.merge ? " — nowe dopiszę obok" : " — zostanie zastąpione") : ""}
                              </span>
                            ) : null}
                            {row.hint ? <span className="mt-0.5 block text-xs text-muted">{row.hint}</span> : null}
                            {row.warning ? (
                              <span className="mt-1 flex gap-1.5 text-xs text-amber-800">
                                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> {row.warning}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-muted">Rozmowa nie wnosi nic nowego — pola są już wypełnione tak samo.</p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={onApply}
          className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Wstawiam…" : `Wstaw zaznaczone (${selected.size})`}
        </button>
        <button type="button" onClick={onDiscard} className="text-xs text-muted">
          Odrzuć
        </button>
      </div>
    </div>
  );
}
