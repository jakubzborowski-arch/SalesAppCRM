import { getSupabase } from "./supabase";

/** Nagłówek z tokenem sesji Supabase dla własnych tras API (serwer sprawdza, kto pyta). */
export async function authHeaders(): Promise<Record<string, string>> {
  const sb = getSupabase();
  const session = sb ? (await sb.auth.getSession()).data.session : null;
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
