import { createClient } from "@supabase/supabase-js";

/** Zalogowany użytkownik CRM z tokenu w nagłówku Authorization (sprawdzany w Supabase). */
export async function salesUser(request: Request): Promise<{ id: string; email: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: (data.user.email ?? "").toLowerCase() };
}

export async function loggedInSalesUser(request: Request) {
  return Boolean(await salesUser(request));
}

/**
 * AI_ALLOWED_EMAILS: lista adresów albo domen („kuba@firma.pl, @lutra.pl”). Pusta = każdy zalogowany w CRM.
 * Chroni płatny klucz, gdy rejestracja w CRM jest otwarta.
 */
export function emailAllowed(email: string, list = process.env.AI_ALLOWED_EMAILS) {
  const entries = (list ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!entries.length) return true;
  const address = email.trim().toLowerCase();
  if (!address) return false;
  return entries.some((entry) => (entry.startsWith("@") ? address.endsWith(entry) : address === entry));
}
