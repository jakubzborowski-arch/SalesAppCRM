import type { SupabaseClient } from "@supabase/supabase-js";

/** Supabase (PostgREST) oddaje domyślnie najwyżej 1000 wierszy na zapytanie. */
const PAGE = 1000;
/** Długa lista id w `.in()` nie mieści się w adresie zapytania — dzielimy ją na paczki. */
const IN_CHUNK = 150;

type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string };
type Select = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

/**
 * Czyta wszystkie wiersze stronami. `order` musi dawać stałą kolejność (np. po id).
 * Zapytanie powinno prosić o `count: "exact"` — wtedy czytamy do pełnej liczby wierszy,
 * nawet gdy projekt ma ustawiony limit „Max rows” mniejszy niż 1000.
 */
export async function fetchAll(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: DbError | null; count?: number | null }>,
): Promise<{ data: Row[]; error: DbError | null }> {
  const rows: Row[] = [];
  let total: number | null = null;
  for (let from = 0; ; ) {
    const { data, error, count } = await build(from, from + PAGE - 1);
    if (error) return { data: rows, error };
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (typeof count === "number") total = count;
    if (!page.length) break;
    if (total !== null ? rows.length >= total : page.length < PAGE) break;
    from += page.length;
  }
  return { data: rows, error: null };
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
      (sb.from(table).select("*", { count: "exact" }).in(column, chunk) as Select)
        .order(key, { ascending: true })
        .range(from, to),
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
