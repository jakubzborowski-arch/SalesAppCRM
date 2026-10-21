import type { SupabaseClient } from "@supabase/supabase-js";

/** Supabase (PostgREST) oddaje domyślnie najwyżej 1000 wierszy na zapytanie. */
const PAGE = 1000;
/** Długa lista id w `.in()` nie mieści się w adresie zapytania — dzielimy ją na paczki. */
const IN_CHUNK = 150;

type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string };
type Select = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

/** Czyta wszystkie wiersze stronami. `order` musi dawać stałą kolejność (np. po id). */
export async function fetchAll(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: DbError | null }>,
): Promise<{ data: Row[]; error: DbError | null }> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { data: rows, error };
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return { data: rows, error: null };
  }
}

/** `select * where column in (ids)` w paczkach i stronami, posortowane po kolumnie klucza. */
export async function selectIn(
  sb: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
  key = "id",
): Promise<{ data: Row[]; error: DbError | null }> {
  const rows: Row[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    const { data, error } = await fetchAll((from, to) =>
      (sb.from(table).select("*").in(column, chunk) as Select).order(key, { ascending: true }).range(from, to),
    );
    if (error) return { data: rows, error };
    rows.push(...data);
  }
  return { data: rows, error: null };
}

export function groupBy(rows: Row[], column: string) {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row[column]);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}
