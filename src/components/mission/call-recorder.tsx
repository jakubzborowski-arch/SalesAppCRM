"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { factDraftPrompt, partnerFirstName } from "@/lib/infeld";
import { browserSpeechAvailable, startBrowserTranscription } from "@/lib/speech";
import { cn } from "@/lib/cn";
import type { Mission, Partner } from "@/lib/types";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallRecorder({ mission, partner }: { mission: Mission; partner?: Partner }) {
  const { saveCall, saveTranscript, updateDiscovery, upsertNeed } = useStore();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [speaker, setSpeaker] = useState<"seller" | "partner">("seller");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const mediaRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<ReturnType<typeof startBrowserTranscription>>(null);
  const liveTextRef = useRef("");
  const speakerRef = useRef<"seller" | "partner">("seller");
  const chunksRef = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timerRef = useRef<number | null>(null);
  const speechOk = browserSpeechAvailable();
  const partnerLabel = partner ? partnerFirstName(partner, mission) : "Partner";

  const allowed = mission.disclosureShown && mission.recordingConsent === "granted";
  const speakerName = (who: "seller" | "partner") => (who === "seller" ? "Handlowiec" : partnerLabel);

  const pickSpeaker = (who: "seller" | "partner") => {
    speakerRef.current = who;
    setSpeaker(who);
  };

  const stopTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    speakerRef.current = speaker;
  }, [speaker]);

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "1") {
        event.preventDefault();
        pickSpeaker("seller");
      }
      if (event.key === "2") {
        event.preventDefault();
        pickSpeaker("partner");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, partnerLabel]);

  const start = async () => {
    setError(null);
    setHint(null);
    setLiveText("");
    pickSpeaker("seller");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const fromSpeech = speechRef.current?.stop() ?? "";
        speechRef.current = null;
        const spoken = (fromSpeech || liveTextRef.current).trim();
        liveTextRef.current = "";
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const duration = (Date.now() - startedAt.current) / 1000;
        setBusy(true);
        const result = await saveCall(mission.id, blob, duration, spoken);
        setBusy(false);
        setLiveText("");
        if (!result.ok) setError(result.error ?? "Nie udało się zapisać nagrania.");
      };
      mediaRef.current = recorder;
      startedAt.current = Date.now();
      setElapsed(0);
      recorder.start();
      setRecording(true);
      speechRef.current = startBrowserTranscription({
        speaker: () => speakerName(speakerRef.current),
        onUpdate: (text) => {
          liveTextRef.current = text;
          setLiveText(text);
        },
      });
      if (!speechRef.current) {
        setHint(
          speechOk
            ? "Rozpoznawanie mowy nie wystartowało — po Stopie dopisz transkrypt z etykietami ręcznie."
            : "Ta przeglądarka nie ma darmowego STT (użyj Chrome albo Edge). Po Stopie dopisz transkrypt ręcznie.",
        );
      } else {
        setHint(`Klawisz 1 = Handlowiec, 2 = ${partnerLabel}. Przełącz zanim druga osoba skończy zdanie.`);
      }
      timerRef.current = window.setInterval(() => {
        setElapsed((Date.now() - startedAt.current) / 1000);
      }, 250);
    } catch {
      setError("Brak dostępu do mikrofonu.");
    }
  };

  const stop = () => {
    stopTimer();
    mediaRef.current?.stop();
    setRecording(false);
  };

  const copyDraftPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(factDraftPrompt(text));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Nie udało się skopiować promptu.");
    }
  };

  const addQuoteObservation = (text: string) => {
    const quote = text.trim();
    if (!quote) return;
    const category = mission.discovery.category || "off_peak";
    upsertNeed(mission.id, {
      id: crypto.randomUUID(),
      category,
      title: "Cytat z rozmowy",
      description: quote.slice(0, 220),
      priority: null,
      quote,
      status: "observation",
      confirmed: false,
    });
  };

  return (
    <div className="mt-4 rounded-2xl border border-chip-mid bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
        Nagranie obu stron
      </p>
      <p className="mt-2 text-sm leading-5 text-muted">
        Chrome / Edge słuchają mikrofonu za darmo. Telefon na głośniku. Kto mówi oznaczasz Ty — Infeld sam głosów nie rozdzieli.
      </p>
      {!allowed ? (
        <p className="mt-2 text-sm text-muted">
          Recorder włącza się dopiero po poinformowaniu rozmówcy i zgodzie na nagranie.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {recording ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white"
            >
              Stop · {formatTime(elapsed)}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void start()}
              className="rounded-full bg-lutra px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Zapis nagrania…" : "Start nagrania"}
            </button>
          )}
          {recording ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => pickSpeaker("seller")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  speaker === "seller" ? "bg-lutra text-white" : "bg-chip text-lutra",
                )}
              >
                1 · Handlowiec
              </button>
              <button
                type="button"
                onClick={() => pickSpeaker("partner")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  speaker === "partner" ? "bg-lutra text-white" : "bg-chip text-lutra",
                )}
              >
                2 · {partnerLabel}
              </button>
            </div>
          ) : null}
        </div>
      )}
      {recording && liveText ? (
        <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-surface px-3 py-2 font-sans text-sm text-foreground">
          {liveText}
        </pre>
      ) : null}
      {hint ? <p className="mt-2 text-sm text-amber-700">{hint}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

      {(mission.calls ?? []).length ? (
        <ul className="mt-4 space-y-3">
          {(mission.calls ?? []).map((call) => {
            const text = drafts[call.id] ?? call.transcriptText ?? "";
            return (
              <li key={call.id} className="rounded-2xl bg-surface px-4 py-3 text-sm">
                <p className="font-medium text-foreground">
                  {call.channel} · {new Date(call.createdAt).toLocaleString("pl-PL")}
                  {call.durationSec ? ` · ${formatTime(call.durationSec)}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {call.storagePath
                    ? `Nagranie w bazie. Popraw etykiety ${partnerLabel}: / Handlowiec: jeśli Chrome coś zgubił.`
                    : "Notatka kontaktu w bazie, bez nagrania"}
                </p>
                <textarea
                  className="mt-2 w-full rounded-2xl border border-chip-mid bg-white px-3 py-2 font-sans text-sm text-foreground outline-none"
                  rows={8}
                  placeholder={`Handlowiec: Dzień dobry…\n${partnerLabel}: W środy jest pusto…`}
                  value={text}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [call.id]: e.target.value }))}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-lutra"
                    onClick={() => void saveTranscript(call.id, text)}
                  >
                    Zapisz transkrypt
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-lutra"
                    onClick={() => void copyDraftPrompt(text)}
                  >
                    {copied ? "Prompt skopiowany" : "Szkic faktów → Infeld"}
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-lutra"
                    onClick={() => addQuoteObservation(text)}
                  >
                    Cytat jako obserwacja
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-lutra"
                    onClick={() => updateDiscovery(mission.id, { quote: text.trim() })}
                  >
                    Jako cytat discovery
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
