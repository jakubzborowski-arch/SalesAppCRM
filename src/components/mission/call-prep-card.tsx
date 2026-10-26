"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Search, Sparkles } from "lucide-react";
import { authHeaders } from "@/lib/api-auth";
import {
  CRM_SOURCE,
  instagramUrl,
  normalizePrep,
  objectionLabel,
  offerHasTerms,
  prepContext,
  publicUrl,
  similarDeals,
  type CallPrep,
  type CallPrepOffer,
  type CallPrepSource,
} from "@/lib/call-prep";
import { cn } from "@/lib/cn";
import { formatPlDate } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { plural } from "@/lib/text";
import { discountSummary, emptyDiscount } from "@/lib/terms";
import type { DiscountTerms, Mission, Partner, StageId } from "@/lib/types";

type Engine = { enabled: boolean; engine?: string; search?: boolean; reason?: string };

const DISABLED: Record<string, string> = {
  login: "Zaloguj się ponownie, żeby użyć AI.",
  unconfirmed: "AI działa po potwierdzeniu adresu e-mail.",
  not_allowed: "Twoje konto nie ma dostępu do AI (AI_ALLOWED_EMAILS).",
  no_allowlist: "Na serwerze nie ustawiono AI_ALLOWED_EMAILS.",
  oauth_token: "W .env.local jest token Claude Code zamiast klucza API.",
  admin_key: "W .env.local jest klucz administracyjny zamiast zwykłego klucza API.",
  no_engine: "AI nie jest podłączone — dodaj ANTHROPIC_API_KEY do .env.local i uruchom CRM ponownie.",
};

/** Proponowane warunki jako zmiany tylko w pustych polach zniżki (nic nie nadpisujemy). */
export function offerPatch(current: DiscountTerms, offer: CallPrepOffer): Partial<DiscountTerms> {
  const patch: Partial<DiscountTerms> = {};
  const emptyValue = current.kind === "percent" ? !current.percent : !current.freebie.trim();
  if (offer.percent && emptyValue) {
    patch.kind = "percent";
    patch.percent = offer.percent;
  }
  if (offer.days.length && !current.days.length) patch.days = offer.days;
  if (offer.hoursFrom && !current.hoursFrom) patch.hoursFrom = offer.hoursFrom;
  if (offer.hoursTo && !current.hoursTo) patch.hoursTo = offer.hoursTo;
  if (offer.minGroup && !current.minGroup) patch.minGroup = offer.minGroup;
  if (offer.redemption && !current.redemption) patch.redemption = offer.redemption;
  return patch;
}

function sourceLabel(source: string, sources: CallPrepSource[]) {
  if (source === CRM_SOURCE) return CRM_SOURCE;
  const title = sources.find((s) => s.url === source)?.title;
  try {
    return title?.trim() || new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return source;
  }
}

export function CallPrepCard({
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
  const store = useStore();
  const prep = mission.callPrep ?? null;
  const early = stage === "research" || stage === "contact";
  const [open, setOpen] = useState(early);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inserted, setInserted] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/call-prep", { headers: await authHeaders() });
        const data = (await res.json()) as Engine;
        if (!cancelled) setEngine(data);
      } catch {
        if (!cancelled) setEngine({ enabled: false, reason: "offline" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const similar = useMemo(
    () => similarDeals(partner, store.state.partners, store.state.missions),
    [partner, store.state.partners, store.state.missions],
  );

  if (!early && !prep) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    setInserted(null);
    try {
      const context = prepContext(mission, partner, store.state.partners, store.state.missions);
      const res = await fetch("/api/call-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ context }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: unknown;
        engine?: string;
        model?: string | null;
        searched?: boolean;
        searchNote?: string;
        sources?: CallPrepSource[];
      };
      if (!res.ok || !body.data) throw new Error(body.error || "Nie udało się przygotować rozmowy.");
      const next = normalizePrep(body.data, {
        engine: body.engine ?? "claude",
        model: body.model ?? null,
        searched: Boolean(body.searched),
        searchNote: body.searchNote ?? "",
        sources: Array.isArray(body.sources) ? body.sources : [],
        similar,
        partnerUrls: [publicUrl(partner.website), instagramUrl(partner.instagram), publicUrl(partner.facebook)].filter(Boolean),
        segment: partner.segment,
      });
      store.saveCallPrep(mission.id, next);
      setOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message && !/fetch|network/i.test(message) ? message : "Brak połączenia z serwerem CRM.");
    } finally {
      setBusy(false);
    }
  };

  const insertOffer = () => {
    if (!prep) return;
    const patch = offerPatch(mission.terms.discount, prep.offer);
    if (!Object.keys(patch).length) {
      setInserted("Warunki w misji są już wypełnione — nic nie zmieniłem.");
      return;
    }
    store.updateTerms(mission.id, "discount", patch);
    setInserted(`Wstawione jako szkic: ${discountSummary({ ...emptyDiscount(), ...mission.terms.discount, ...patch })}. Potwierdzisz je w rozmowie.`);
  };

  const canRun = editable && engine?.enabled;
  return (
    <section className="mt-6 rounded-3xl border border-chip-mid bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-lutra" aria-hidden />
          <span className="text-sm font-semibold">Przygotowanie do rozmowy</span>
          {prep ? (
            <span className="text-xs text-muted">
              z {formatPlDate(prep.createdAt.slice(0, 10))}
              {prep.searched ? " · z internetu" : " · tylko z CRM"}
            </span>
          ) : null}
        </span>
        <ChevronDown size={16} className={cn("text-muted transition", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div className="border-t border-line px-5 pb-5 pt-4">
          {!prep ? (
            <p className="max-w-xl text-sm leading-6 text-muted">
              AI sprawdzi stronę partnera i internet (godziny, menu, wydarzenia, promocje, Instagram), zaproponuje warunki na
              podstawie partnerów, którzy już się zgodzili, i ułoży pytania na to, czego jeszcze nie wiesz. Wynik zapisze się w
              misji. Partner nic nie dostaje — to tylko dla Ciebie.
            </p>
          ) : (
            <PrepView prep={prep} />
          )}

          {prep && partner.segment === "venue" && offerHasTerms(prep.offer) && editable ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={insertOffer}
                className="rounded-full border border-lutra px-4 py-2 text-sm font-medium text-lutra hover:bg-lutra-soft"
              >
                Wstaw propozycję jako szkic warunków
              </button>
              <span className="text-xs text-muted">Tylko puste pola zniżki — niczego nie nadpisuje.</span>
            </div>
          ) : null}
          {inserted ? <p className="mt-2 text-xs text-emerald-700">{inserted}</p> : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {canRun ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run()}
                className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                <Search size={15} aria-hidden />
                {busy ? "Sprawdzam partnera…" : prep ? "Przygotuj od nowa" : "Przygotuj rozmowę"}
              </button>
            ) : engine && !engine.enabled ? (
              <p className="text-xs text-muted">{DISABLED[engine.reason ?? ""] ?? "AI jest teraz niedostępne."}</p>
            ) : null}
            {prep && editable ? (
              <button type="button" onClick={() => store.saveCallPrep(mission.id, null)} className="text-xs text-muted hover:text-rose-600">
                Usuń przygotowanie
              </button>
            ) : null}
          </div>
          {busy ? (
            <p className="mt-2 text-xs text-muted">
              {engine?.search ? "Szukam w internecie i układam przygotowanie — zwykle 30–90 s." : "Układam przygotowanie…"}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">{title}</p>
      <div className="mt-1.5 text-sm leading-6 text-foreground">{children}</div>
    </div>
  );
}

export function PrepView({ prep }: { prep: CallPrep }) {
  const offerTerms = discountSummary({
    ...emptyDiscount(),
    percent: prep.offer.percent,
    days: prep.offer.days,
    hoursFrom: prep.offer.hoursFrom,
    hoursTo: prep.offer.hoursTo,
    minGroup: prep.offer.minGroup,
    redemption: prep.offer.redemption,
  });
  return (
    <div>
      {!prep.searched && prep.searchNote ? (
        <p className="mb-3 rounded-2xl bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-900">{prep.searchNote}</p>
      ) : null}
      {prep.summary ? <p className="text-sm leading-6">{prep.summary}</p> : null}

      {prep.facts.length ? (
        <Block title="Fakty ze źródeł">
          <ul className="space-y-1.5">
            {prep.facts.map((fact, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span>• {fact.text}</span>
                {fact.source === CRM_SOURCE ? (
                  <span className="text-xs text-muted">({CRM_SOURCE})</span>
                ) : (
                  <a
                    href={fact.source}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-xs text-lutra hover:underline"
                  >
                    {sourceLabel(fact.source, prep.sources)} <ExternalLink size={11} aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {prep.hypothesis ? (
        <Block title="Hipoteza do sprawdzenia w rozmowie">
          <p className="text-muted">{prep.hypothesis}</p>
        </Block>
      ) : null}

      {prep.opener ? (
        <Block title="Jak zacząć">
          <p>„{prep.opener}”</p>
        </Block>
      ) : null}

      {prep.offer.summary || offerTerms ? (
        <Block title="Co zaproponować na start">
          {offerTerms ? <p className="font-medium">{offerTerms}</p> : null}
          {prep.offer.summary ? <p>{prep.offer.summary}</p> : null}
          {prep.offer.why ? <p className="mt-1 text-xs leading-5 text-muted">Dlaczego: {prep.offer.why}</p> : null}
        </Block>
      ) : null}

      {prep.similar.length ? (
        <Block title="Podobni partnerzy, którzy się zgodzili">
          <ul className="space-y-1 text-[13px]">
            {prep.similar.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.name}</span>
                <span className="text-muted">{[s.category, s.city].filter(Boolean).length ? ` (${[s.category, s.city].filter(Boolean).join(", ")})` : ""}</span>
                : {s.terms}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {prep.questions.length ? (
        <Block title="Pytania na to, czego jeszcze nie wiesz">
          <ol className="list-decimal space-y-1 pl-5">
            {prep.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </Block>
      ) : null}

      {prep.objections.length ? (
        <Block title="Prawdopodobne obiekcje">
          <ul className="space-y-2">
            {prep.objections.map((o) => (
              <li key={o.key}>
                <p className="font-medium">{objectionLabel(o.key)}</p>
                <p className="text-muted">{o.answer}</p>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {prep.avoid.length ? (
        <Block title="Lepiej nie mówić">
          <ul className="space-y-1">
            {prep.avoid.map((a, i) => (
              <li key={i}>• {a}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      <p className="mt-4 text-[11px] leading-5 text-muted">
        {prep.engine === "claude" ? `Claude${prep.model ? ` (${prep.model})` : ""}` : prep.engine}
        {prep.sources.length ? ` · ${prep.sources.length} ${plural(prep.sources.length, "źródło", "źródła", "źródeł")}` : ""}
        {prep.dropped ? ` · pominąłem ${prep.dropped} podpowiedzi z obietnicami, których Lutra nie składa` : ""}. Fakty z
        internetu sprawdź przed rozmową — mogą być nieaktualne.
      </p>
    </div>
  );
}
