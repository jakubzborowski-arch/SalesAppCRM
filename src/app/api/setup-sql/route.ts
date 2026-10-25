import { readFile } from "node:fs/promises";
import path from "node:path";

const TEXT = { headers: { "content-type": "text/plain; charset=utf-8" } };

// Stałe ścieżki, żeby pliki SQL trafiły do paczki na Vercelu.
const MIGRATIONS = [
  { id: "v4", file: "supabase/migrations/20261001000004_v4_team_timeline.sql" },
  { id: "v5", file: "supabase/migrations/20261001000005_v5_company_data.sql" },
  { id: "v6", file: "supabase/migrations/20261001000006_v6_roles_contracts.sql" },
  { id: "v7", file: "supabase/migrations/20261001000007_v7_partner_types.sql" },
  { id: "v8", file: "supabase/migrations/20261025000008_v8_quality_care.sql" },
] as const;

export async function GET(request: Request) {
  const root = process.cwd();
  const params = new URL(request.url).searchParams;
  // ?from=v5 — migracje od v5 w górę (wszystkie można odpalać wielokrotnie). ?part= — stara nazwa.
  const from = params.get("from") ?? params.get("part");
  const start = MIGRATIONS.findIndex((m) => m.id === from);
  const parts = await Promise.all(
    MIGRATIONS.slice(start >= 0 ? start : 0).map((m) => readFile(path.join(root, m.file), "utf8")),
  );
  if (start >= 0) return new Response(parts.join("\n\n"), TEXT);

  const [v2, v3] = await Promise.all([
    readFile(path.join(root, "supabase/v2-partners-recordings.sql"), "utf8"),
    readFile(path.join(root, "supabase/v3-mission-core.sql"), "utf8"),
  ]);
  return new Response([v2, v3, ...parts].join("\n\n"), TEXT);
}
