import { createClient } from "@supabase/supabase-js";

export type SalesUser = { id: string; email: string; confirmed: boolean };

/** Zalogowany użytkownik CRM z tokenu w nagłówku Authorization (sprawdzany w Supabase). */
export async function salesUser(request: Request): Promise<SalesUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  const user = data.user as typeof data.user & { email_confirmed_at?: string | null; confirmed_at?: string | null };
  return {
    id: user.id,
    email: (user.email ?? "").toLowerCase(),
    // Bez potwierdzenia ktoś mógłby założyć konto na cudzy adres z listy (np. x@lutra.pl).
    confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
  };
}

function allowList(list = process.env.AI_ALLOWED_EMAILS) {
  return (list ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * AI_ALLOWED_EMAILS: lista adresów albo domen („kuba@firma.pl, @lutra.pl”). Pusta lista = każdy zalogowany,
 * ale tylko na własnym komputerze (npm run dev). Na produkcji pusta lista blokuje AI, chyba że AI_OPEN_TO_ALL=1.
 */
export function emailAllowed(email: string, list = process.env.AI_ALLOWED_EMAILS) {
  const entries = allowList(list);
  if (!entries.length) return !productionLocked();
  const address = email.trim().toLowerCase();
  if (!address) return false;
  return entries.some((entry) => (entry.startsWith("@") ? address.endsWith(entry) : address === entry));
}

/** Na produkcji (Vercel, next start) lista adresów jest obowiązkowa — otwarta rejestracja nie wyda pieniędzy na AI. */
export function aiAllowListRequired() {
  return productionLocked() && !allowList().length;
}

function productionLocked() {
  return process.env.NODE_ENV === "production" && process.env.AI_OPEN_TO_ALL !== "1";
}
