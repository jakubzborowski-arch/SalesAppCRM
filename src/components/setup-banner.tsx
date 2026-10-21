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

export function SetupBanner() {
  const { dbStatus, dbError, retryCloud, schemaV4 } = useStore();
  const [copied, setCopied] = useState<"all" | "v4" | null>(null);
  const needsV4 = dbStatus === "ok" && schemaV4 === false;

  const copy = async (part: "all" | "v4") => {
    const res = await fetch(part === "v4" ? "/api/setup-sql?part=v4" : "/api/setup-sql");
    const sql = await res.text();
    await navigator.clipboard.writeText(sql);
    setCopied(part);
    window.setTimeout(() => setCopied(null), 2000);
  };

  if (needsV4) {
    return (
      <>
        <NoticeBanner />
        <div className="mx-8 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="font-semibold">Baza czeka na migrację v4: zespół, dziennik kontaktów, historia etapów.</p>
          <p className="mt-1 text-amber-900/80">
            CRM działa jak dotąd, ale bez wspólnego workspace i dziennika. Skopiuj SQL v4, wklej w SQL Editorze,
            Run, potem Sprawdź ponownie.
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
              onClick={() => void copy("v4")}
              className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white"
            >
              {copied === "v4" ? "Skopiowano" : "Kopiuj SQL v4"}
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

  if (dbStatus !== "need-sql" && dbStatus !== "error") return <NoticeBanner />;

  return (
    <>
      <NoticeBanner />
      <div className="mx-8 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        <p className="font-semibold">
          {dbStatus === "need-sql"
            ? "Brakuje tabel CRM. Odpal skrypt v2+v3+v4 w SQL Editorze."
            : `Błąd bazy: ${dbError}`}
        </p>
        <p className="mt-1 text-amber-900/80">
          To nowy skrypt (nie bootstrap crm_state). Wklej v2, v3 i v4 razem, Run, potem Sprawdź ponownie.
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
            {copied === "all" ? "Skopiowano" : "Kopiuj SQL v2+v3+v4"}
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
