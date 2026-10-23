"use client";

import { useState } from "react";
import { SQL_EDITOR_URL } from "@/lib/bootstrap-sql";
import { useStore } from "@/lib/store";

function NoticeBanner() {
  const { notice, dismissNotice } = useStore();
  if (!notice) return null;
  return (
    <div
      className={`mx-8 mt-4 flex items-start justify-between gap-4 rounded-2xl border px-5 py-3 text-sm ${
        notice.kind === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-rose-200 bg-rose-50 text-rose-900"
      }`}
    >
      <p>{notice.text}</p>
      <button type="button" onClick={dismissNotice} className="text-xs font-semibold">
        Zamknij
      </button>
    </div>
  );
}

const INVITE_STATUS: Record<string, string> = {
  missing: "Ten link zaproszenia nie działa. Sprawdź, czy skopiowałeś go w całości.",
  revoked: "To zaproszenie zostało cofnięte.",
  used: "To zaproszenie zostało już użyte przez kogoś innego.",
  accepted: "Już dołączyłeś przez to zaproszenie.",
  expired: "Zaproszenie wygasło. Poproś o nowy link.",
};

/** Zaproszenie do zespołu czeka na decyzję. Nic się nie dzieje bez kliknięcia „Dołącz”. */
function InviteBanner() {
  const { invite, confirmInvite, dismissInvite, state } = useStore();
  if (!invite) return null;
  const box = "mx-8 mt-4 rounded-2xl border px-5 py-4 text-sm";

  if (invite.loading) {
    return <div className={`${box} border-line bg-white text-muted`}>Sprawdzam zaproszenie do zespołu…</div>;
  }
  const info = invite.info;
  if (!info || info.status !== "ok") {
    const text = !info
      ? (invite.error ?? "Nie udało się sprawdzić zaproszenia.")
      : info.status === "email_mismatch"
        ? `To zaproszenie jest na adres ${info.inviteEmail ?? "innego konta"}. Zaloguj się tym kontem.`
        : info.status === "same_workspace"
          ? `Jesteś już w workspace „${info.workspaceName ?? state.workspace.name}”. Link nie został użyty.`
          : (INVITE_STATUS[info.status] ?? "Nie da się użyć tego zaproszenia.");
    return (
      <div className={`${box} flex items-start justify-between gap-4 border-amber-200 bg-amber-50 text-amber-950`}>
        <p>{text}</p>
        <button type="button" onClick={dismissInvite} className="text-xs font-semibold">
          Zamknij
        </button>
      </div>
    );
  }

  const owned = info.ownPartners + info.ownMissions > 0;
  return (
    <div className={`${box} border-blue/30 bg-chip text-navy`}>
      <p className="font-semibold">
        Zaproszenie od {info.invitedBy ?? "zespołu"} do workspace „{info.workspaceName ?? "Lutra"}”.
      </p>
      <p className="mt-1">
        {info.alone
          ? owned
            ? `Twoi partnerzy (${info.ownPartners}) i misje (${info.ownMissions}) przejdą razem z Tobą do tego zespołu.`
            : "Twój obecny workspace jest pusty — nic nie przenosimy."
          : `Opuścisz obecny workspace „${state.workspace.name}”. Jego partnerzy i misje zostaną tam, a Ty stracisz do nich dostęp.`}
      </p>
      <p className="mt-1 text-xs text-navy/70">
        Dołączaj tylko do zespołu, który znasz. Wyjść możesz tylko przez administratora tamtego zespołu.
      </p>
      {invite.error ? <p className="mt-2 text-sm text-rose-600">{invite.error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={invite.busy}
          onClick={() => void confirmInvite()}
          className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {invite.busy ? "Dołączam…" : "Dołącz do zespołu"}
        </button>
        <button
          type="button"
          disabled={invite.busy}
          onClick={dismissInvite}
          className="rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-muted"
        >
          Odrzuć
        </button>
      </div>
    </div>
  );
}

const MIGRATION_INFO = {
  v4: "zespół, dziennik kontaktów, historia etapów",
  v5: "dane firmy partnera (nazwa, NIP, REGON, adresy)",
  v6: "kto co edytuje, przekazywanie misji, obieg podpisu i szablon umowy",
  v7: "typ partnera (miejsce / społeczność / firma), pojemność miejsca i porozumienie mailowe",
} as const;

type MigrationId = keyof typeof MIGRATION_INFO;

export function SetupBanner() {
  const { dbStatus, dbError, retryCloud, schemaV4, schemaV5, schemaV6, schemaV7 } = useStore();
  const [copied, setCopied] = useState<string | null>(null);
  const flags: [MigrationId, boolean | null][] = [
    ["v4", schemaV4],
    ["v5", schemaV5],
    ["v6", schemaV6],
    ["v7", schemaV7],
  ];
  const firstMissing = dbStatus === "ok" ? flags.find(([, has]) => has === false)?.[0] : undefined;
  const pending = firstMissing ? flags.slice(flags.findIndex(([id]) => id === firstMissing)).map(([id]) => id) : [];

  const copy = async (from: MigrationId | "all") => {
    const res = await fetch(from === "all" ? "/api/setup-sql" : `/api/setup-sql?from=${from}`);
    const sql = await res.text();
    await navigator.clipboard.writeText(sql);
    setCopied(from);
    window.setTimeout(() => setCopied(null), 2000);
  };

  if (firstMissing) {
    const label = pending.join("+");
    return (
      <>
        <NoticeBanner />
        <InviteBanner />
        <div className="mx-8 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="font-semibold">
            Baza czeka na migrację {label}: {pending.map((id) => MIGRATION_INFO[id]).join("; ")}.
          </p>
          <p className="mt-1 text-amber-900/80">
            CRM działa, ale bez tych funkcji. Skopiuj SQL, wklej w SQL Editorze, Run, potem Sprawdź ponownie. Skrypty
            można uruchamiać wielokrotnie.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={SQL_EDITOR_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-lutra"
            >
              Otwórz SQL Editor
            </a>
            <button
              type="button"
              onClick={() => void copy(firstMissing)}
              className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white"
            >
              {copied === firstMissing ? "Skopiowano" : `Kopiuj SQL ${label}`}
            </button>
            <button
              type="button"
              onClick={() => void retryCloud()}
              className="rounded-full border border-amber-300 px-4 py-2 text-xs font-semibold"
            >
              Sprawdź ponownie
            </button>
          </div>
        </div>
      </>
    );
  }

  if (dbStatus !== "need-sql" && dbStatus !== "error") {
    return (
      <>
        <NoticeBanner />
        <InviteBanner />
      </>
    );
  }

  return (
    <>
      <NoticeBanner />
      <InviteBanner />
      <div className="mx-8 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        <p className="font-semibold">
          {dbStatus === "need-sql" ? "Brakuje tabel CRM. Odpal skrypt v2–v7 w SQL Editorze." : `Błąd bazy: ${dbError}`}
        </p>
        <p className="mt-1 text-amber-900/80">
          To nowy skrypt (nie bootstrap crm_state). Wklej całość, Run, potem Sprawdź ponownie.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={SQL_EDITOR_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-lutra"
          >
            Otwórz SQL Editor
          </a>
          <button
            type="button"
            onClick={() => void copy("all")}
            className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white"
          >
            {copied === "all" ? "Skopiowano" : "Kopiuj SQL v2–v7"}
          </button>
          <button
            type="button"
            onClick={() => void retryCloud()}
            className="rounded-full border border-amber-300 px-4 py-2 text-xs font-semibold"
          >
            Sprawdź ponownie
          </button>
        </div>
      </div>
    </>
  );
}
