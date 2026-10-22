"use client";

import { CONTACT_CHANNELS } from "@/lib/playbook";
import { cn } from "@/lib/cn";
import { hasContactConsent } from "@/lib/gates";
import { useStore } from "@/lib/store";
import type { Mission, Partner } from "@/lib/types";
import { HelpLink, Requirements } from "@/components/ui";

export function ContactStep({ mission, partner }: { mission: Mission; partner: Partner }) {
  const { setChannel, setRecording, setConsent } = useStore();
  const selectedConsent = partner.consents.find(
    (c) => c.channel === mission.selectedChannel && c.purpose === "contact",
  );

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Pierwszy kontakt</h2>
        <HelpLink anchor="proces">Jak wygląda cały proces?</HelpLink>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Cel: umówić discovery. Oferty nie sprzedajesz na pierwszym sygnale. Zgodę na kanał
        zaznaczasz tutaj, nie w researchu.
      </p>
      <div className="mt-4">
        <Requirements
          title="Do rozmowy brakuje"
          doneText="Jest zgoda na kontakt — możesz iść do rozmowy."
          checks={[
            { key: "channel", label: "wybrany kanał kontaktu", done: Boolean(mission.selectedChannel) || hasContactConsent(partner) },
            { key: "consent", label: "zgoda na kontakt (telefon, mail, LinkedIn albo wizyta)", done: hasContactConsent(partner) },
          ]}
        />
      </div>

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
        Cel kontaktu to krótka rozmowa (ok. 15 minut) o tym, co u partnera nie działa — bez oferty. Dopasuj wiadomość do
        kanału: inaczej piszesz maila, inaczej dzwonisz.{" "}
        {mission.selectedChannel === "phone"
          ? "Po rozmowie telefonicznej wyślij krótki mail z follow-upem."
          : mission.selectedChannel === "in_person"
            ? "Po spotkaniu wyślij mail z ustaleniami tego samego dnia."
            : ""}
      </p>

      <textarea
        className="mt-4 w-full rounded-2xl border border-chip-mid bg-white px-4 py-3 text-sm outline-none"
        rows={3}
        placeholder="Notatka z kontaktu…"
        value={mission.conversationNote}
        onChange={(e) => setRecording(mission.id, { conversationNote: e.target.value })}
      />
      <p className="mt-2 text-xs text-muted">
        To jedna wspólna notatka misji. Każdą próbę kontaktu (nie odebrał, mail wysłany, oddzwonić) zapisz
        osobno w Dzienniku kontaktów pod spodem.
      </p>
    </div>
  );
}
