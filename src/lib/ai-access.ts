import { isLocalCrmRequest } from "@/lib/local-llm";
import { aiAllowListRequired, emailAllowed, salesUser } from "@/lib/sales-session";
import { isSupabaseConfigured } from "@/lib/supabase";

/** Gdzie liczy model: płatny Claude, płatny OpenCode Zen albo darmowy Qwen na tym komputerze. */
export type AiPlace = "claude" | "zen" | "mac";

export type AiDenied = "login" | "unconfirmed" | "not_allowed" | "no_allowlist" | "local_only";
export type AiAccess = { ok: true; who: string } | { ok: false; reason: AiDenied };

/**
 * Jedna brama do płatnych modeli dla wszystkich tras AI.
 * - Qwen na tym komputerze: tylko zapytania z localhost.
 * - Z Supabase: zalogowany handlowiec z potwierdzonym mailem i z listy AI_ALLOWED_EMAILS
 *   (na produkcji lista jest obowiązkowa).
 * - Bez Supabase (demo): płatny klucz tylko po jawnym AI_ALLOW_WITHOUT_LOGIN=1 i z localhost.
 */
export async function aiAccess(request: Request, place: AiPlace): Promise<AiAccess> {
  if (place === "mac") return isLocalCrmRequest(request) ? { ok: true, who: "local" } : { ok: false, reason: "local_only" };
  if (isSupabaseConfigured()) {
    const user = await salesUser(request);
    if (!user) return { ok: false, reason: "login" };
    if (!user.confirmed) return { ok: false, reason: "unconfirmed" };
    if (!emailAllowed(user.email)) return { ok: false, reason: aiAllowListRequired() ? "no_allowlist" : "not_allowed" };
    return { ok: true, who: user.id };
  }
  const demo = process.env.AI_ALLOW_WITHOUT_LOGIN === "1" && isLocalCrmRequest(request);
  return demo ? { ok: true, who: "demo" } : { ok: false, reason: "local_only" };
}

export const AI_DENIED: Record<AiDenied, string> = {
  login: "Zaloguj się ponownie, żeby skorzystać z AI.",
  unconfirmed: "Potwierdź adres e-mail (link w mailu z rejestracji), żeby korzystać z AI.",
  not_allowed: "Twoje konto nie ma dostępu do AI w tym CRM (AI_ALLOWED_EMAILS).",
  no_allowlist: "AI jest wyłączone: na serwerze nie ustawiono listy AI_ALLOWED_EMAILS.",
  local_only: "AI działa tu tylko z logowaniem do CRM.",
};

export type QuotaKind = "extract" | "draft";

/** Limity na osobę i godzinę: chronią saldo przed pętlą albo nadużyciem. */
export const AI_QUOTA: Record<QuotaKind, { limit: number; windowMs: number; label: string }> = {
  extract: { limit: 30, windowMs: 60 * 60 * 1000, label: "odczytów rozmów" },
  draft: { limit: 60, windowMs: 60 * 60 * 1000, label: "szkiców" },
};

const memory = new Map<string, number[]>();

/** Licznik w pamięci procesu — zapas, gdy baza jest niedostępna albo to tryb demo. */
export function takeMemoryQuota(who: string, kind: QuotaKind, now = Date.now()) {
  const { limit, windowMs } = AI_QUOTA[kind];
  const key = `${kind}:${who}`;
  const recent = (memory.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    memory.set(key, recent);
    return false;
  }
  recent.push(now);
  memory.set(key, recent);
  return true;
}

export function quotaMessage(kind: QuotaKind) {
  const { limit, label } = AI_QUOTA[kind];
  return `Limit ${limit} ${label} na godzinę. Spróbuj później.`;
}
