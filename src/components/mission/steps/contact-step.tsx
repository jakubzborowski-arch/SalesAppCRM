"use client";

import { CONTACT_CHANNELS } from "@/lib/playbook";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";

export function ContactStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { setChannel, setRecording, setConsent } = useStore();
  const selectedConsent = partner.consents.find(
    (c) => c.channel === mission.selectedChannel && c.purpose === "contact",
  );

  return (
    <div>
      <h2 className="text-lg font-semibold">Pierwszy kontakt</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Cel: umówić discovery. Oferty nie sprzedajesz na pierwszym sygnale. Zgodę na kanał
        zaznaczasz tutaj, nie w researchu.
      </p>

      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
        Kanał
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
                selected ? "border-lutra bg-chip" : "border-chip-mid bg-surface hover:border-blue",
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

      {mission.selectedChannel ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConsent(partner.id, mission.selectedChannel!, "granted")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium",
              selectedConsent?.status === "granted" ? "bg-emerald-500 text-white" : "bg-chip text-lutra",
            )}
          >
            Zgoda na ten kanał
          </button>
          <button
            type="button"
            onClick={() => setConsent(partner.id, mission.selectedChannel!, "denied")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium",
              selectedConsent?.status === "denied" ? "bg-ink text-white" : "bg-surface text-muted",
            )}
          >
            Brak zgody
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Wybierz kanał, potem zaznacz zgodę.</p>
      )}

      <p className="mt-4 text-xs text-muted">
        Wybierz kanał — po prawej skrypt pod telefon, mail, LinkedIn albo wizytę. Nie ten sam tekst na każdy kanał.
      </p>

      <textarea
        className="mt-4 w-full rounded-2xl border border-chip-mid bg-white px-4 py-3 text-sm outline-none"
        rows={3}
        placeholder="Notatka z kontaktu…"
        value={mission.conversationNote}
        onChange={(e) => setRecording(mission.id, { conversationNote: e.target.value })}
      />
    </div>
  );
}
