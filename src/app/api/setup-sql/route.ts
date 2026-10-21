import { readFile } from "node:fs/promises";
import path from "node:path";

const TEXT = { headers: { "content-type": "text/plain; charset=utf-8" } };

export async function GET(request: Request) {
  const root = process.cwd();
  // Stałe ścieżki, żeby pliki SQL trafiły do paczki na Vercelu.
  const v4 = await readFile(path.join(root, "supabase/v4-team-timeline.sql"), "utf8");

  // Sama migracja v4 — dla bazy, która ma już v2 i v3.
  if (new URL(request.url).searchParams.get("part") === "v4") {
    return new Response(v4, TEXT);
  }

  const [v2, v3] = await Promise.all([
    readFile(path.join(root, "supabase/v2-partners-recordings.sql"), "utf8"),
    readFile(path.join(root, "supabase/v3-mission-core.sql"), "utf8"),
  ]);
  return new Response(`${v2}\n\n${v3}\n\n${v4}`, TEXT);
}
