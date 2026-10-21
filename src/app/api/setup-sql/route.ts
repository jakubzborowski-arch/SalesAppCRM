import { readFile } from "node:fs/promises";
import path from "node:path";

const TEXT = { headers: { "content-type": "text/plain; charset=utf-8" } };

export async function GET(request: Request) {
  const root = process.cwd();
  // Stałe ścieżki, żeby pliki SQL trafiły do paczki na Vercelu.
  const [v4, v5] = await Promise.all([
    readFile(path.join(root, "supabase/v4-team-timeline.sql"), "utf8"),
    readFile(path.join(root, "supabase/v5-company-data.sql"), "utf8"),
  ]);
  const part = new URL(request.url).searchParams.get("part");

  // Sama v5 — baza ma już v2, v3 i v4.
  if (part === "v5") return new Response(v5, TEXT);
  // v4 + v5 — baza ma v2 i v3. Oba skrypty można odpalać wielokrotnie.
  if (part === "v4") return new Response(`${v4}\n\n${v5}`, TEXT);

  const [v2, v3] = await Promise.all([
    readFile(path.join(root, "supabase/v2-partners-recordings.sql"), "utf8"),
    readFile(path.join(root, "supabase/v3-mission-core.sql"), "utf8"),
  ]);
  return new Response(`${v2}\n\n${v3}\n\n${v4}\n\n${v5}`, TEXT);
}
