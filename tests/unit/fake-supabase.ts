// Atrapa klienta Supabase w pamięci: tylko to, czego używa db.ts / mission-core.ts.
type Row = Record<string, unknown>;

const PRIMARY: Record<string, string[]> = {
  decision_context: ["mission_id"],
};

let seq = 0;
let clock = 0;
/** Jak trigger w bazie: każda zmiana misji dostaje nową wersję updated_at. */
function touch(table: string, row: Row) {
  if (table !== "missions") return;
  clock += 1;
  row.updated_at = new Date(Date.UTC(2026, 0, 1) + clock).toISOString();
}
function uuid() {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

export class FakeDb {
  tables = new Map<string, Row[]>();
  calls: Array<{ table: string; op: string; ids?: unknown[] }> = [];
  rpcHandlers: Record<string, (args: Record<string, unknown>) => unknown> = {};
  failNext: { table: string; op: string; error: { code?: string; message: string } } | null = null;
  /** Jak ustawienie „Max rows” w Supabase: najwyżej tyle wierszy na odpowiedź. */
  maxRows = 1000;

  rows(table: string) {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(name: string, args: Record<string, unknown> = {}) {
    const handler = this.rpcHandlers[name];
    if (!handler) {
      return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    }
    try {
      return Promise.resolve({ data: handler(args), error: null });
    } catch (err) {
      return Promise.resolve({ data: null, error: { message: String((err as Error).message) } });
    }
  }
}

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private filters: Array<(row: Row) => boolean> = [];
  private payload: Row | Row[] | null = null;
  private conflict: string[] | null = null;
  private orders: Array<{ col: string; asc: boolean; nullsFirst?: boolean }> = [];
  private max: number | null = null;
  private window: [number, number] | null = null;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  private wantCount = false;
  select(_cols?: string, opts?: { count?: string }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }
  private eqIds: unknown[] = [];
  eq(col: string, value: unknown) {
    if (col === "id" || col === "mission_id") this.eqIds.push(value);
    this.filters.push((row) => row[col] === value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[col]));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst });
    return this;
  }
  range(from: number, to: number) {
    this.window = [from, to];
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = payload;
    this.conflict = opts?.onConflict ? opts.onConflict.split(",").map((c) => c.trim()) : null;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private match(row: Row) {
    return this.filters.every((f) => f(row));
  }

  private run(): { data: unknown; error: unknown } {
    const ids = [
      ...(this.payload
        ? (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item) => item.id ?? item.mission_id)
        : []),
      ...this.eqIds,
    ];
    this.db.calls.push({ table: this.table, op: this.op, ids });
    const fail = this.db.failNext;
    if (fail && fail.table === this.table && fail.op === this.op) {
      this.db.failNext = null;
      return { data: null, error: fail.error };
    }
    const rows = this.db.rows(this.table);
    let result: Row[] = [];
    if (this.op === "select") {
      result = rows.filter((r) => this.match(r)).map((r) => ({ ...r }));
    } else if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      result = list.map((item) => {
        const row = { id: uuid(), ...item };
        touch(this.table, row);
        rows.push(row);
        return { ...row };
      });
    } else if (this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const keys = this.conflict ?? PRIMARY[this.table] ?? ["id"];
      result = list.map((item) => {
        const existing = rows.find((r) => keys.every((k) => r[k] === item[k]));
        if (existing) {
          Object.assign(existing, item);
          touch(this.table, existing);
          return { ...existing };
        }
        const row = { id: uuid(), ...item };
        touch(this.table, row);
        rows.push(row);
        return { ...row };
      });
    } else if (this.op === "update") {
      result = rows.filter((r) => this.match(r));
      for (const row of result) {
        Object.assign(row, this.payload);
        touch(this.table, row);
      }
      result = result.map((r) => ({ ...r }));
    } else if (this.op === "delete") {
      const keep = rows.filter((r) => !this.match(r));
      result = rows.filter((r) => this.match(r));
      this.db.tables.set(this.table, keep);
    }
    if (this.orders.length) {
      result.sort((a, b) => {
        for (const { col, asc, nullsFirst } of this.orders) {
          const av = a[col] as string | null | undefined;
          const bv = b[col] as string | null | undefined;
          if (av == null && bv == null) continue;
          if (av == null) return nullsFirst ? -1 : 1;
          if (bv == null) return nullsFirst ? 1 : -1;
          const cmp = String(av).localeCompare(String(bv));
          if (cmp !== 0) return asc ? cmp : -cmp;
        }
        return 0;
      });
    }
    const total = result.length;
    if (this.window) result = result.slice(this.window[0], this.window[1] + 1);
    if (this.max !== null) result = result.slice(0, this.max);
    if (this.op === "select") result = result.slice(0, this.db.maxRows);
    if (this.mode === "single") {
      if (result.length !== 1) return { data: null, error: { code: "PGRST116", message: "not single" } };
      return { data: result[0], error: null };
    }
    if (this.mode === "maybe") return { data: result[0] ?? null, error: null };
    return { data: result, error: null, count: this.wantCount ? total : null };
  }

  then<T1 = { data: unknown; error: unknown }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}
