"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { duplicateIndex, duplicateKeys, type DuplicateProbe } from "@/lib/duplicates";
import type { NewPartnerInput, PartnerSegment } from "@/lib/types";
import { SEGMENTS, segmentLabel } from "@/lib/playbook";
import { Pills } from "@/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, GripVertical, Upload, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { type CsvTable } from "@/lib/csv";
import { readImportFile } from "@/lib/spreadsheet";
import {
  PARTNER_IMPORT_FIELDS,
  SAMPLE_CSV,
  rowToPartnerInput,
  suggestMapping,
  type ColumnMapping,
  type PartnerImportField,
} from "@/lib/partner-import";
import { useStore } from "@/lib/store";

const DRAG_TYPE = "application/x-lutra-csv-col";

type ImportResult = {
  created: number;
  skippedEmpty: number;
  skippedDup: number;
  failed: { name: string; error: string }[];
};


function inputProbe(input: NewPartnerInput): DuplicateProbe {
  return {
    name: input.name,
    city: input.city,
    nip: input.nip,
    phones: [input.contactPhone],
    emails: [input.contactEmail],
  };
}

function sampleFor(table: CsvTable, column: number) {
  return table.rows.map((row) => row[column] ?? "").find((value) => value.trim()) ?? "";
}

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "partnerzy-przyklad.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function CsvImport() {
  const router = useRouter();
  const { addPartners, state } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [picked, setPicked] = useState<number | null>(null);
  const [overField, setOverField] = useState<PartnerImportField | "tray" | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const [defaultSegment, setDefaultSegment] = useState<PartnerSegment>("venue");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const mappedColumns = useMemo(() => new Set(Object.values(mapping)), [mapping]);
  const unmapped = table
    ? table.headers.map((_, i) => i).filter((i) => !mappedColumns.has(i))
    : [];

  const preview = useMemo(() => {
    if (!table) return [];
    return table.rows.slice(0, 6).map((row) => rowToPartnerInput(row, mapping, defaultSegment));
  }, [table, mapping, defaultSegment]);

  const readyCount = useMemo(() => {
    if (!table) return 0;
    return table.rows.filter((row) => rowToPartnerInput(row, mapping)).length;
  }, [table, mapping]);

  const existingKeys = useMemo(() => new Set(duplicateIndex(state.partners).keys()), [state.partners]);

  /** Wiersze, które wyglądają na partnera już zapisanego albo powtórzonego w pliku. */
  const duplicateRows = useMemo(() => {
    if (!table) return 0;
    const seen = new Set(existingKeys);
    let count = 0;
    for (const row of table.rows) {
      const input = rowToPartnerInput(row, mapping, defaultSegment);
      if (!input) continue;
      const keys = duplicateKeys(inputProbe(input)).map((k) => k.key);
      if (keys.some((k) => seen.has(k))) count += 1;
      keys.forEach((k) => seen.add(k));
    }
    return count;
  }, [table, mapping, existingKeys, defaultSegment]);

  const assign = (field: PartnerImportField, column: number) => {
    setMapping((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next) as PartnerImportField[]) {
        if (next[key] === column) delete next[key];
      }
      next[field] = column;
      return next;
    });
    setPicked(null);
  };

  const unmap = (field: PartnerImportField) => {
    setMapping((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const unmapColumn = (column: number) => {
    setMapping((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next) as PartnerImportField[]) {
        if (next[key] === column) delete next[key];
      }
      return next;
    });
    setPicked(null);
  };

  const loadFile = async (file: File) => {
    setError(null);
    setResult(null);
    const name = file.name.toLowerCase();
    const spreadsheet =
      /\.(xlsx|xlsm|xls)$/i.test(name) ||
      file.type.includes("spreadsheet") ||
      file.type.includes("excel");
    const csv =
      /\.(csv|txt|tsv)$/i.test(name) ||
      !file.type ||
      file.type.includes("csv") ||
      file.type.includes("text");
    if (!spreadsheet && !csv) {
      setError("Wybierz plik Excel (.xlsx) albo CSV.");
      return;
    }
    try {
      const parsed = await readImportFile(file);
      if (!parsed.headers.length) {
        setError("Plik jest pusty albo nie da się go odczytać.");
        return;
      }
      setFileName(file.name);
      setTable(parsed);
      setMapping(suggestMapping(parsed.headers));
      setPicked(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się wczytać pliku.";
      setError(message);
    }
  };

  const onDropFile = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  const startColumnDrag = (event: DragEvent, column: number) => {
    event.dataTransfer.setData(DRAG_TYPE, String(column));
    event.dataTransfer.setData("text/plain", String(column));
    event.dataTransfer.effectAllowed = "move";
  };

  const readColumn = (event: DragEvent) => {
    const raw = event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData("text/plain");
    const column = Number(raw);
    return Number.isInteger(column) ? column : null;
  };

  const importRows = async () => {
    if (!table || mapping.name == null) {
      setError("Przeciągnij kolumnę z nazwą partnera na pole Nazwa.");
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);

    const inputs = [];
    let skippedEmpty = 0;
    let skippedDup = 0;
    const seen = new Set(existingKeys);

    for (const row of table.rows) {
      const input = rowToPartnerInput(row, mapping, defaultSegment);
      if (!input) {
        skippedEmpty += 1;
        continue;
      }
      const keys = duplicateKeys(inputProbe(input)).map((k) => k.key);
      if (skipDup && keys.some((k) => seen.has(k))) {
        skippedDup += 1;
        continue;
      }
      keys.forEach((k) => seen.add(k));
      inputs.push(input);
    }

    const outcome = await addPartners(inputs, (done, total) => setProgress({ done, total }));
    setPending(false);
    setProgress(null);
    if (!outcome.ok && !outcome.created) {
      setError(outcome.error ?? "Nie udało się zaimportować partnerów.");
      return;
    }
    setResult({
      created: outcome.created,
      skippedEmpty,
      skippedDup,
      failed: outcome.failed,
    });
  };

  if (result) {
    return (
      <div className="max-w-3xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
          Import z pliku
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Gotowe</h1>
        <div className="mt-6 space-y-3 rounded-[28px] border border-line bg-white p-4 sm:p-6 text-sm">
          <p>
            Zapisano <span className="font-semibold text-foreground">{result.created}</span> partnerów.
          </p>
          {result.skippedEmpty ? (
            <p className="text-muted">Pominięto {result.skippedEmpty} wierszy bez nazwy.</p>
          ) : null}
          {result.skippedDup ? (
            <p className="text-muted">Pominięto {result.skippedDup} duplikatów nazwy.</p>
          ) : null}
          {result.failed.length ? (
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-700">
              <p className="font-medium">Nie zapisano {result.failed.length} wierszy</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {result.failed.slice(0, 8).map((item, i) => (
                  <li key={`${item.name}-${i}`}>
                    {item.name}: {item.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/partners")}
            className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white"
          >
            Lista partnerów
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setTable(null);
              setFileName(null);
              setMapping({});
            }}
            className="rounded-full px-5 py-2.5 text-sm text-muted"
          >
            Importuj kolejny plik
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy">
        Portfolio
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Import partnerów</h1>
          <p className="mt-2 text-sm text-muted">
            Wgraj Excel albo CSV, potem przeciągnij kolumny na pola CRM. Nic nie zapisze się, dopóki nie
            potwierdzisz.
          </p>
        </div>
        <Link href="/partners" className="rounded-full px-5 py-2.5 text-sm text-muted">
          Anuluj
        </Link>
      </div>

      {!table ? (
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDropFile}
          className="mt-6 flex flex-col items-center rounded-[28px] border border-dashed border-chip-strong bg-white px-6 py-16 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lutra-soft text-lutra">
            <Upload size={22} />
          </span>
          <p className="mt-4 font-semibold">Upuść Excel albo CSV albo wybierz z dysku</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            .xlsx z Excela wchodzi wprost. CSV: przecinek, średnik albo tabulacja, pierwszy wiersz to
            nagłówki.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white"
            >
              Wybierz plik
            </button>
            <button
              type="button"
              onClick={downloadSample}
              className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-muted"
            >
              Pobierz przykład
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
              event.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-line bg-white px-5 py-4">
            <div className="flex items-center gap-3 text-sm">
              <FileSpreadsheet className="text-lutra" size={18} />
              <div>
                <p className="font-medium text-foreground">{fileName}</p>
                <p className="text-xs text-muted">
                  {table.headers.length} kolumn · {table.rows.length} wierszy
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setTable(null);
                setFileName(null);
                setMapping({});
                setError(null);
              }}
              className="text-sm text-muted"
            >
              Inny plik
            </button>
          </div>

          <section
            onDragOver={(event) => {
              event.preventDefault();
              setOverField("tray");
            }}
            onDragLeave={() => setOverField((current) => (current === "tray" ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setOverField(null);
              const column = readColumn(event);
              if (column != null) unmapColumn(column);
            }}
            className={cn(
              "rounded-[28px] border bg-white p-5 transition",
              overField === "tray" ? "border-lutra bg-surface" : "border-line",
            )}
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-semibold">Kolumny z pliku</h2>
                <p className="mt-1 text-sm text-muted">
                  Przeciągnij na pole po prawej. Możesz też kliknąć kolumnę, a potem pole.
                </p>
              </div>
              {picked != null ? (
                <p className="text-xs font-medium text-lutra">
                  Wybrano: {table.headers[picked]}. Kliknij pole docelowe.
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex min-h-[72px] flex-wrap gap-2">
              {unmapped.length === 0 ? (
                <p className="text-sm text-muted">Wszystkie kolumny są przypisane.</p>
              ) : (
                unmapped.map((column) => (
                  <ColumnChip
                    key={column}
                    label={table.headers[column]}
                    sample={sampleFor(table, column)}
                    selected={picked === column}
                    onDragStart={(event) => startColumnDrag(event, column)}
                    onClick={() => setPicked((current) => (current === column ? null : column))}
                  />
                ))
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-line bg-white p-5">
            <h2 className="font-semibold">Typ partnerów w pliku</h2>
            <p className="mt-1 text-sm text-muted">
              {mapping.segment != null
                ? "Typ bierzemy z kolumny. Wiersze z pustym albo nieznanym typem dostaną ten poniżej."
                : "Plik nie ma kolumny z typem — wszyscy dostaną ten poniżej. Zmienisz go potem na karcie."}
            </p>
            <div className="mt-3">
              <Pills
                value={defaultSegment}
                onChange={setDefaultSegment}
                options={SEGMENTS.map((item) => ({ id: item.id, label: item.label, hint: item.who }))}
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-line bg-white p-5">
            <h2 className="font-semibold">Pola partnera</h2>
            <p className="mt-1 text-sm text-muted">
              Upuść kolumnę z pliku na kartę. Możesz przerzucać między polami.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PARTNER_IMPORT_FIELDS.map((field) => {
                const column = mapping[field.key];
                const filled = column != null && table.headers[column] != null;
                return (
                  <div
                    key={field.key}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setOverField(field.key);
                    }}
                    onDragLeave={() =>
                      setOverField((current) => (current === field.key ? null : current))
                    }
                    onDrop={(event) => {
                      event.preventDefault();
                      setOverField(null);
                      const dropped = readColumn(event);
                      if (dropped != null) assign(field.key, dropped);
                    }}
                    onClick={() => {
                      if (picked != null) assign(field.key, picked);
                    }}
                    className={cn(
                      "min-h-[108px] rounded-2xl border px-4 py-3 transition",
                      overField === field.key
                        ? "border-lutra bg-lutra-soft"
                        : filled
                          ? "border-chip-mid bg-surface"
                          : "border-dashed border-chip-strong bg-white",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
                          {field.label}
                          {"required" in field && field.required ? " *" : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">{field.hint}</p>
                      </div>
                      {filled ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            unmap(field.key);
                          }}
                          className="rounded-full p-1 text-muted hover:bg-white hover:text-foreground"
                          aria-label={`Usuń mapowanie ${field.label}`}
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      {filled && column != null ? (
                        <ColumnChip
                          label={table.headers[column]}
                          sample={sampleFor(table, column)}
                          compact
                          onDragStart={(event) => startColumnDrag(event, column)}
                        />
                      ) : (
                        <p className="rounded-xl border border-dashed border-chip-mid px-3 py-2 text-xs text-muted">
                          Upuść kolumnę
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-line bg-white">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-semibold">Podgląd</h2>
              <p className="mt-1 text-sm text-muted">
                Pierwsze wiersze po mapowaniu. Wiersze bez nazwy nie wejdą do CRM.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-surface text-[10px] font-semibold uppercase tracking-[0.12em] text-navy">
                  <tr>
                    <th className="px-5 py-3">Nazwa</th>
                    <th className="px-5 py-3">Typ</th>
                    <th className="px-5 py-3">Adres</th>
                    <th className="px-5 py-3">Priorytet</th>
                    <th className="px-5 py-3">www</th>
                    <th className="px-5 py-3">Kontakt</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-5 py-3 font-medium text-foreground">
                        {row?.name ?? <span className="font-normal text-rose-400">brak nazwy</span>}
                      </td>
                      <td className="px-5 py-3 text-muted">{row ? segmentLabel(row.segment) : "—"}</td>
                      <td className="px-5 py-3 text-muted">{row?.address || row?.city || "—"}</td>
                      <td className="px-5 py-3 text-muted">{row?.priority || "—"}</td>
                      <td className="px-5 py-3 text-muted">{row?.website || "—"}</td>
                      <td className="px-5 py-3 text-muted">
                        {row?.contactName || row?.contactPhone || row?.contactEmail || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={skipDup}
                onChange={(event) => setSkipDup(event.target.checked)}
                className="h-4 w-4 accent-blue"
              />
              Pomiń duplikaty — ta sama nazwa w mieście, NIP, telefon albo e-mail
              {duplicateRows ? ` (${duplicateRows})` : ""}
            </label>
            <button
              type="button"
              disabled={pending || mapping.name == null || readyCount === 0}
              onClick={() => void importRows()}
              className="rounded-full bg-lutra px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending && progress
                ? `Zapisuję ${progress.done}/${progress.total}…`
                : `Importuj ${readyCount} partnerów`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnChip({
  label,
  sample,
  selected,
  compact,
  onDragStart,
  onClick,
}: {
  label: string;
  sample: string;
  selected?: boolean;
  compact?: boolean;
  onDragStart: (event: DragEvent) => void;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "flex max-w-full cursor-grab items-center gap-2 rounded-2xl border px-3 py-2 text-left active:cursor-grabbing",
        selected
          ? "border-lutra bg-lutra text-white"
          : "border-chip-mid bg-lutra-soft text-foreground",
        compact && "w-full",
      )}
    >
      <GripVertical size={14} className={selected ? "text-white/80" : "text-lutra"} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        {sample ? (
          <span className={cn("block truncate text-[11px]", selected ? "text-white/80" : "text-muted")}>
            np. {sample}
          </span>
        ) : null}
      </span>
    </button>
  );
}
