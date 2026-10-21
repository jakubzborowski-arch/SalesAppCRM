/** Ref projektu z adresu Supabase z .env („https://<ref>.supabase.co”). */
export function projectRef(url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") {
  return url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i)?.[1] ?? null;
}

/** SQL Editor właśnie tego projektu, z którym łączy się CRM. */
export const SQL_EDITOR_URL = projectRef()
  ? `https://supabase.com/dashboard/project/${projectRef()}/sql/new`
  : "https://supabase.com/dashboard/projects";
