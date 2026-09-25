"use client";

import { CallRecorder } from "@/components/mission/call-recorder";
import { CONTACT_CHANNELS, CONTACT_SCRIPT, RECORDING_DISCLOSURE } from "@/lib/playbook";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";

export function ContactStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { setChannel, setRecording, setConsent } = useStore();

  return (
    <div>
      <h2 className="text-lg font-semibold">Pierwszy kontakt</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Celem pierwszego kontaktu jest rozmowa discovery, a nie sprzedaż ogólnej oferty.
      </p>

      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
        Wybierz kanał
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {CONTACT_CHANNELS.map((channel) => {
          const consent = partner.consents.find(
            (c) => c.channel === channel.id && c.purpose === "contact",
          );
          const selected = mission.selectedChannel === channel.id;
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => setChannel(mission.id, channel.id)}
              className={cn(
                "rounded-2xl border px-4 py-4 text-left transition",
                selected
                  ? "border-lutra bg-chip"
                  : "border-chip-mid bg-surface hover:border-blue",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{channel.label}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    consent?.status === "granted" && "bg-emerald-50 text-emerald-700",
                    consent?.status === "denied" && "bg-rose-50 text-rose-700",
                    (!consent || consent.status === "unknown") && "bg-white text-muted",
                  )}
                >
                  {consent?.status === "granted"
                    ? "zgoda"
                    : consent?.status === "denied"
                      ? "brak zgody"
                      : "brak statusu"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{channel.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-chip-mid bg-surface px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Proponowana rozmowa
        </p>
        <p className="mt-2 text-sm leading-6 text-foreground">{CONTACT_SCRIPT}</p>
      </div>

      <div className="mt-4 rounded-2xl border border-line px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
          Nagranie i zgoda
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">{RECORDING_DISCLOSURE}</p>
        <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={mission.disclosureShown}
            onChange={(e) =>
              setRecording(mission.id, { disclosureShown: e.target.checked })
            }
          />
          Poinformowałem rozmówcę
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!mission.disclosureShown}
            onClick={() => setRecording(mission.id, { recordingConsent: "granted" })}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium",
              mission.recordingConsent === "granted"
                ? "bg-emerald-500 text-white"
                : "bg-chip text-lutra disabled:opacity-40",
            )}
          >
            Zgoda na nagranie
          </button>
          <button
            type="button"
            onClick={() => setRecording(mission.id, { recordingConsent: "denied" })}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium",
              mission.recordingConsent === "denied"
                ? "bg-ink text-white"
                : "bg-surface text-muted",
            )}
          >
            Rozmowa bez nagrania
          </button>
        </div>
        <textarea
          className="mt-3 w-full rounded-2xl border border-chip-mid bg-white px-4 py-3 text-sm outline-none"
          rows={3}
          placeholder="Notatka z kontaktu…"
          value={mission.conversationNote}
          onChange={(e) => setRecording(mission.id, { conversationNote: e.target.value })}
        />
        {mission.selectedChannel ? (
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-lutra"
            onClick={() =>
              setConsent(partner.id, mission.selectedChannel!, "granted")
            }
          >
            Oznacz zgodę na wybrany kanał
          </button>
        ) : null}
        <CallRecorder mission={mission} partner={partner} />
      </div>
    </div>
  );
}
