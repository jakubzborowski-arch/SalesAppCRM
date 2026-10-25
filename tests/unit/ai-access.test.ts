import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flags = { supabase: true };
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => flags.supabase,
  getSupabase: () => null,
  isMissingCrmTable: () => false,
}));
const quota = { answer: true as boolean | "error", calls: 0 };
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (name: string) => {
      quota.calls += 1;
      if (name !== "take_ai_quota") return { data: null, error: { message: "unknown" } };
      return quota.answer === "error"
        ? { data: null, error: { message: "Could not find the function public.take_ai_quota" } }
        : { data: quota.answer, error: null };
    },
    auth: {
      getUser: async (token: string) => {
        const [kind, email] = token.split(":");
        if (kind === "ok") return { data: { user: { id: `u-${email}`, email, email_confirmed_at: "2026-10-01" } }, error: null };
        if (kind === "new") return { data: { user: { id: `u-${email}`, email, email_confirmed_at: null } }, error: null };
        return { data: { user: null }, error: { message: "invalid" } };
      },
    },
  }),
}));

const { aiAccess, takeAiQuota, takeMemoryQuota, AI_QUOTA } = await import("@/lib/ai-access");
const { emailAllowed } = await import("@/lib/sales-session");
const draftRoute = await import("@/app/api/local-llm/route");

const env = process.env as Record<string, string | undefined>;
const KEYS = ["NODE_ENV", "AI_ALLOWED_EMAILS", "AI_OPEN_TO_ALL", "HOSTED_LLM_API_KEY", "LOCAL_LLM_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const saved: Record<string, string | undefined> = {};

function req(token?: string, host = "crm.example.com", method = "GET", body?: unknown) {
  const headers: Record<string, string> = { host };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers["content-type"] = "application/json";
  return new Request(`https://${host}/api/x`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

beforeEach(() => {
  for (const key of KEYS) saved[key] = env[key];
  env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  delete env.AI_ALLOWED_EMAILS;
  delete env.AI_OPEN_TO_ALL;
  delete env.LOCAL_LLM_URL;
  flags.supabase = true;
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe("brama AI", () => {
  it("na produkcji pusta lista adresów blokuje AI; lokalnie (dev/test) wpuszcza zalogowanych", async () => {
    expect(emailAllowed("ktos@gmail.com", "")).toBe(true);
    env.NODE_ENV = "production";
    expect(emailAllowed("ktos@gmail.com", "")).toBe(false);
    expect(await aiAccess(req("ok:ktos@gmail.com"), "claude")).toEqual({ ok: false, reason: "no_allowlist" });
    env.AI_OPEN_TO_ALL = "1";
    expect((await aiAccess(req("ok:ktos@gmail.com"), "claude")).ok).toBe(true);
    delete env.AI_OPEN_TO_ALL;
    env.AI_ALLOWED_EMAILS = "@lutra.pl";
    expect(await aiAccess(req("ok:ktos@gmail.com"), "claude")).toEqual({ ok: false, reason: "not_allowed" });
    expect((await aiAccess(req("ok:kuba@lutra.pl"), "zen")).ok).toBe(true);
  });

  it("niepotwierdzony mail nie dostaje płatnego modelu, nawet z adresem z listy", async () => {
    env.AI_ALLOWED_EMAILS = "@lutra.pl";
    expect(await aiAccess(req("new:x@lutra.pl"), "claude")).toEqual({ ok: false, reason: "unconfirmed" });
    expect(await aiAccess(req(), "zen")).toEqual({ ok: false, reason: "login" });
  });

  it("Qwen na tym komputerze tylko z localhost", async () => {
    expect((await aiAccess(req(undefined, "localhost:3001"), "mac")).ok).toBe(true);
    expect(await aiAccess(req(undefined, "crm.example.com"), "mac")).toEqual({ ok: false, reason: "local_only" });
  });

  it("limit w pamięci liczy osobno rodzaj i osobę", () => {
    const now = 1_000_000;
    for (let i = 0; i < AI_QUOTA.draft.limit; i++) expect(takeMemoryQuota("u1", "draft", now)).toBe(true);
    expect(takeMemoryQuota("u1", "draft", now)).toBe(false);
    expect(takeMemoryQuota("u1", "extract", now)).toBe(true);
    expect(takeMemoryQuota("u2", "draft", now)).toBe(true);
    expect(takeMemoryQuota("u1", "draft", now + AI_QUOTA.draft.windowMs + 1)).toBe(true);
  });
});

describe("szkice przez OpenCode Zen", () => {
  it("wymagają listy adresów, potwierdzonego maila i limitu; za duże zapytanie odrzucone", async () => {
    env.HOSTED_LLM_API_KEY = "zen-test-key-123456";
    env.AI_ALLOWED_EMAILS = "@lutra.pl";
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: "Dzień dobry." } }] }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await draftRoute.POST(req(undefined, "crm.example.com", "POST", { mode: "mail" }))).status).toBe(401);
    expect((await draftRoute.POST(req("ok:obcy@gmail.com", "crm.example.com", "POST", { mode: "mail" }))).status).toBe(403);
    expect((await draftRoute.POST(req("new:x@lutra.pl", "crm.example.com", "POST", { mode: "mail" }))).status).toBe(403);
    expect(await (await draftRoute.GET(req("ok:obcy@gmail.com"))).json()).toEqual({ enabled: false });

    const big = { mode: "mail", padding: "x".repeat(250_000) };
    expect((await draftRoute.POST(req("ok:kuba@lutra.pl", "crm.example.com", "POST", big))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("limit AI w bazie", () => {
  it("z Supabase pyta bazę (wspólny licznik); błąd albo brak v8 → licznik w pamięci", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    quota.calls = 0;
    quota.answer = false;
    expect(await takeAiQuota(req("ok:kuba@lutra.pl"), "u-db", "extract")).toBe(false);
    quota.answer = true;
    expect(await takeAiQuota(req("ok:kuba@lutra.pl"), "u-db", "extract")).toBe(true);
    expect(quota.calls).toBe(2);
    quota.answer = "error";
    expect(await takeAiQuota(req("ok:kuba@lutra.pl"), "u-db2", "extract")).toBe(true);
    flags.supabase = false;
    expect(await takeAiQuota(req(), "demo", "extract")).toBe(true);
    expect(quota.calls).toBe(3);
  });
});
