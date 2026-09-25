import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const root = process.cwd();
  const [v2, v3] = await Promise.all([
    readFile(path.join(root, "supabase/v2-partners-recordings.sql"), "utf8"),
    readFile(path.join(root, "supabase/v3-mission-core.sql"), "utf8"),
  ]);
  return new Response(`${v2}\n\n${v3}`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
