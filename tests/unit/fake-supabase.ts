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

type DbError = { code?: string; message: string };

class FakeDbError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Klucz konfliktu tabel misji — jak w `save_mission_bundle`. */
const BUNDLE_CONFLICT: Record<string, string[]> = {
  decision_context: ["mission_id"],
  needs: ["id"],
  mission_checklist_items: ["mission_id", "stage", "item_key"],
  mission_objections: ["mission_id", "library_key"],
  offers: ["mission_id"],
  contracts: ["mission_id"],
  activations: ["mission_id"],
  tasks: ["id"],
};

type BundleOpArg = {
  table: string;
  op: string;
  rows?: Row[];
  set?: Row;
  ids?: string[];
  refs?: Record<string, string>;
  optional?: string[];
  key?: string;
  single?: boolean;
};

export class FakeDb {
  tables = new Map<string, Row[]>();
  calls: Array<{ table: string; op: string; ids?: unknown[] }> = [];
  rpcHandlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    save_mission_bundle: (args) => this.saveMissionBundle(args),
  };
  failNext: { table: string; op: string; error: DbError } | null = null;
  /** Jak ustawienie „Max rows” w Supabase: najwyżej tyle wierszy na odpowiedź. */
  maxRows = 1000;
  /** Kolumny, których „nie ma” w bazie (starsza migracja). */
  missingColumns: Record<string, string[]> = {};
  /** Usunięte pliki ze Storage (bucket/ścieżka). */
  removedFiles: string[] = [];
  storage = {
    from: (bucket: string) => ({
      remove: async (paths: string[]) => {
        this.removedFiles.push(...paths.map((p) => `${bucket}/${p}`));
        return { data: paths.map((name) => ({ name })), error: null };
      },
    }),
  };

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
      const e = err as { code?: string; message?: string };
      return Promise.resolve({ data: null, error: { code: e.code, message: String(e.message) } });
    }
  }

  /** Jak `failNext` przy zapisie przez PostgREST — ten sam mechanizm działa w środku funkcji. */
  takeFailure(table: string, op: string): DbError | null {
    const fail = this.failNext;
    if (fail && fail.table === table && fail.op === op) {
      this.failNext = null;
      return fail.error;
    }
    return null;
  }

  missingColumnIn(table: string, payload: Row[]) {
    const missing = this.missingColumns[table] ?? [];
    return missing.find((col) => payload.some((row) => col in row)) ?? null;
  }

  /**
   * Atrapa `save_mission_bundle`: wersja misji sprawdzana w środku, operacje po kolei na tabelach misji,
   * wszystko albo nic (przy błędzie tabele wracają do stanu sprzed wywołania).
   */
  saveMissionBundle(args: Record<string, unknown>) {
    // Kopia stanu; przy wycofaniu wracają te same tablice i obiekty wierszy (testy trzymają do nich odwołania).
    const before = [...this.tables].map(([name, rows]) => ({
      name,
      rows,
      items: [...rows],
      copies: rows.map((row) => JSON.parse(JSON.stringify(row)) as Row),
    }));
    try {
      return this.applyMissionBundle(args);
    } catch (err) {
      this.tables.clear();
      for (const { name, rows, items, copies } of before) {
        items.forEach((item, i) => {
          for (const key of Object.keys(item)) delete item[key];
          Object.assign(item, copies[i]);
        });
        rows.length = 0;
        rows.push(...items);
        this.tables.set(name, rows);
      }
      throw err;
    }
  }

  private applyMissionBundle(args: Record<string, unknown>) {
    const missionId = args.p_mission_id as string;
    const expected = (args.p_expected_version as string | null) ?? null;
    const changes = { ...(args.p_mission as Row) };
    delete changes.id;
    delete changes.updated_at;
    const fail = (table: string, op: string, ids: unknown[]) => {
      this.calls.push({ table, op, ids });
      const error = this.takeFailure(table, op);
      if (error) throw new FakeDbError(error.code ?? "XX000", error.message);
    };
    const missions = this.rows("missions");
    let mission = missions.find((m) => m.id === missionId);
    if (expected !== null) {
      fail("missions", "update", [missionId]);
      if (!mission || mission.updated_at !== expected) throw new FakeDbError("P0001", "mission_conflict");
      Object.assign(mission, changes);
      touch("missions", mission);
    } else {
      fail("missions", "insert", [missionId]);
      if (mission) throw new FakeDbError("P0001", "mission_conflict");
      mission = { id: missionId, ...changes };
      touch("missions", mission);
      missions.push(mission);
    }
    const workspaceId = mission.workspace_id;
    const returned: Record<string, Row[]> = {};

    for (const op of (args.p_ops ?? []) as BundleOpArg[]) {
      const conflict = BUNDLE_CONFLICT[op.table];
      if (!conflict) throw new FakeDbError("42501", `Tabela ${op.table} nie należy do zapisu misji.`);
      const table = this.rows(op.table);
      const missing = this.missingColumns[op.table] ?? [];
      const known = (row: Row) => {
        const unknown = Object.keys(row).find((col) => missing.includes(col) && !(op.optional ?? []).includes(col));
        if (unknown) throw new FakeDbError("42703", `column "${unknown}" of relation "${op.table}" does not exist`);
        return Object.fromEntries(Object.entries(row).filter(([col]) => !missing.includes(col)));
      };
      const mine = (row: Row) => row.mission_id === missionId && (op.table !== "tasks" || row.workspace_id === workspaceId);
      let out: Row[] = [];
      if (op.op === "upsert" || op.op === "insert") {
        let rows = op.rows ?? [];
        if (!rows.length) continue;
        for (const [col, refTable] of Object.entries(op.refs ?? {})) {
          const ref = this.rows(refTable).find((r) => r.mission_id === missionId);
          rows = rows.map((row) => ({ ...row, [col]: ref?.id ?? null }));
        }
        if (!rows.every(mine)) throw new FakeDbError("42501", `Wiersz ${op.table} nie należy do tej misji.`);
        rows = rows.map(known);
        fail(op.table, op.op, rows.map((row) => row.id ?? row.mission_id));
        out = rows.map((row) => {
          const existing = op.op === "upsert" ? table.find((r) => conflict.every((k) => r[k] === row[k])) : undefined;
          if (existing) {
            if (existing.mission_id !== missionId) throw new FakeDbError("42501", `Wiersz ${op.table} należy do innej misji.`);
            Object.assign(existing, row);
            return { ...existing };
          }
          const created = { id: uuid(), ...row };
          table.push(created);
          return { ...created };
        });
      } else if (op.op === "update" || op.op === "delete") {
        const ids = op.ids ?? [];
        if (!ids.length) continue;
        fail(op.table, op.op, ids);
        const hit = table.filter((r) => ids.includes(r.id as string) && mine(r));
        if (op.op === "update") {
          const set = op.set ?? {};
          if (["id", "mission_id", "workspace_id"].some((col) => col in set)) {
            throw new FakeDbError("22023", `Nieprawidłowa zmiana dla ${op.table}.`);
          }
          const clean = known(set);
          for (const row of hit) Object.assign(row, clean);
        } else {
          this.tables.set(op.table, table.filter((r) => !hit.includes(r)));
        }
        out = hit.map((r) => ({ ...r }));
      } else {
        throw new FakeDbError("22023", `Nieznana operacja zapisu misji: ${op.op}.`);
      }
      if (op.single && out.length !== 1) {
        throw new FakeDbError("P0002", `Oczekiwano jednego wiersza ${op.table} (jest ${out.length}).`);
      }
      if (op.key) returned[op.key] = [...(returned[op.key] ?? []), ...out];
    }
    return { version: mission.updated_at, returned };
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
    const fail = this.db.takeFailure(this.table, this.op);
    if (fail) return { data: null, error: fail };
    if (this.payload) {
      const missing = this.db.missingColumnIn(this.table, Array.isArray(this.payload) ? this.payload : [this.payload]);
      if (missing) {
        return {
          data: null,
          error: { code: "PGRST204", message: `Could not find the '${missing}' column of '${this.table}' in the schema cache` },
        };
      }
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
