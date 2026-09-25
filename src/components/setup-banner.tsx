"use client";

import { useState } from "react";
import { SQL_EDITOR_URL } from "@/lib/bootstrap-sql";
import { useStore } from "@/lib/store";

export function SetupBanner() {
  const { dbStatus, dbError, retryCloud } = useStore();
  const [copied, setCopied] = useState(false);
  if (dbStatus !== "need-sql" && dbStatus !== "error") return null;

  const copy = async () => {
    const res = await fetch("/api/setup-sql");
    const sql = await res.text();
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-8 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
      <p className="font-semibold">
        {dbStatus === "need-sql"
          ? "Brakuje tabel CRM. Odpal skrypt v2+v3 w SQL Editorze."
          : `Błąd bazy: ${dbError}`}
      </p>
      <p className="mt-1 text-amber-900/80">
        To nowy skrypt (nie bootstrap crm_state). Wklej v2 i v3 razem, Run, potem Sprawdź ponownie.
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
          onClick={() => void copy()}
          className="rounded-full bg-lutra px-4 py-2 text-xs font-semibold text-white"
        >
          {copied ? "Skopiowano" : "Kopiuj SQL v2+v3"}
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
  );
}
