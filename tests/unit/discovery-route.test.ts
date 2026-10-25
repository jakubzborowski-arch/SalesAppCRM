import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flags = { supabase: false };
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => flags.supabase,
  getSupabase: () => null,
  isMissingCrmTable: () => false,
}));
// Sprawdzenie tokenu w Supabase: „good-*” to zalogowany użytkownik (e-mail po myślniku).
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) =>
        token.startsWith("good-")
          ? {
              data: { user: { id: `user-${token}`, email: `${token.slice(5)}`, email_confirmed_at: "2026-10-01T10:00:00Z" } },
              error: null,
            }
          : token.startsWith("new-")
            ? { data: { user: { id: `user-${token}`, email: `${token.slice(4)}`, email_confirmed_at: null } }, error: null }
            : { data: { user: null }, error: { message: "invalid token" } },
    },
  }),
}));

const { GET, POST } = await import("@/app/api/discovery-extract/route");
const { claudeKeyProblem, forgetRejectedSchemas, resolveClaude, supportsEffort } = await import("@/lib/claude-api");

const KEY = "sk-ant-test-0123456789abcdefghij";
const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_EFFORT",
  "LOCAL_LLM_URL",
  "HOSTED_LLM_API_KEY",
  "AI_ALLOW_WITHOUT_LOGIN",
  "AI_ALLOWED_EMAILS",
  "ANTHROPIC_WORKSPACE_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;
const saved: Record<string, string | undefined> = {};

const CONTEXT = {
  partner: { name: "Kawiarnia Nova", segment: "Miejsce", city: "Kraków", category: "kawiarnia" },
  contacts: [{ name: "Anna Kowalska", role: "właścicielka" }],
  seller: "Kuba",
  callDate: "2026-10-21",
  note: "Spotkanie w lokalu.",
  transcripts: [
    {
      date: "2026-10-21",
      channel: "spotkanie",
      text: "Anna Kowalska: Środy po 16 jest pusto. Od sześciu osób zaczyna się to liczyć. Mój numer 500 100 200.",
    },
  ],
};

const ANSWER = {
  cytat: "Środy po 16 jest pusto.",
  problem: "Puste środy po 16.",
  kategoria: "off_peak",
  priorytet: 4,
  rezultat: "",
  ograniczenia: ["Od 6 osób"],
  decydent: "Anna Kowalska",
  rola_decydenta: "właścicielka",
  termin_decyzji: "",
  termin_decyzji_data: "",
  wczesniejsze_proby: "",
  nastepny_krok: "",
  data_nastepnego_kroku: "",
  potrzeby: [],
  wnioski: ["Środy są puste"],
};

function request(method: "GET" | "POST", body?: unknown, host = "127.0.0.1:3000", headers: Record<string, string> = {}) {
  return new Request(`http://${host}/api/discovery-extract`, {
    method,
    headers: { host, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function claudeReply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

describe("/api/discovery-extract", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    flags.supabase = false;
    forgetRejectedSchemas();
  });
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.unstubAllGlobals();
  });

  it("bez klucza i bez lokalnego modelu: wyłączone", async () => {
    expect(await (await GET(request("GET"))).json()).toEqual({ enabled: false, reason: "no_engine" });
    const res = await POST(request("POST", { context: CONTEXT }));
    expect(res.status).toBe(404);
  });

  it("Claude API: structured output, model domyślny, bez temperature, telefon wycięty", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    const fetchMock = vi.fn(async () =>
      claudeReply({
        model: "claude-sonnet-5-5",
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(ANSWER) }],
        usage: { input_tokens: 1200, output_tokens: 300 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await (await GET(request("GET"))).json()).toEqual({
      enabled: true,
      engine: "claude",
      model: "claude-sonnet-5-5",
      limit: 150_000,
    });

    const res = await POST(request("POST", { context: CONTEXT }));
    const body = (await res.json()) as { ok: boolean; engine: string; data: unknown; usage: unknown };
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, engine: "claude", data: ANSWER, usage: { input: 1200, output: 300 } });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown> & {
      output_config: { format: { type: string; schema: { required: string[] } }; effort?: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(sent.model).toBe("claude-sonnet-5-5");
    expect(sent).not.toHaveProperty("temperature");
    expect(sent).not.toHaveProperty("tool_choice");
    expect(sent.output_config.format.type).toBe("json_schema");
    expect(sent.output_config.format.schema.required).toContain("wczesniejsze_proby");
    expect(sent.output_config.effort).toBe("low");
    expect(sent.system).toMatch(/Lutry/);
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0].role).toBe("user");
    expect(sent.messages[0].content).toMatch(/Środy po 16 jest pusto/);
    expect(sent.messages[0].content).not.toMatch(/500 100 200/);
  });

  it("schemat za duży dla Claude API („compiled grammar is too large”): ponowienie z JSON w poleceniu, potem od razu", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    const tooLarge = {
      type: "error",
      error: {
        type: "invalid_request_error",
        message:
          "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.",
      },
    };
    const ok = () =>
      claudeReply({
        model: "claude-sonnet-5-5",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "```json\n" + JSON.stringify(ANSWER) + "\n```" }],
        usage: { input_tokens: 1300, output_tokens: 320 },
      });
    const fetchMock = vi.fn().mockResolvedValueOnce(claudeReply(tooLarge, 400)).mockImplementation(async () => ok());
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request("POST", { context: CONTEXT }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, engine: "claude", data: ANSWER });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = (i: number) => JSON.parse(String((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body));
    expect(body(0).output_config.format.type).toBe("json_schema");
    expect(body(1).output_config).not.toHaveProperty("format");
    expect(body(1).output_config.effort).toBe("low");
    expect(body(1).system).toMatch(/Odpowiedz wyłącznie jednym obiektem JSON/);

    // Następne odczyty nie tracą czasu na odrzucany schemat.
    await POST(request("POST", { context: CONTEXT }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(body(2).output_config).not.toHaveProperty("format");
  });

  it("inne błędy 400 nie wywołują ponowienia", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    const fetchMock = vi.fn(async () => claudeReply({ type: "error", error: { message: "messages: text content blocks must be non-empty" } }, 400));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(request("POST", { context: CONTEXT }));
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("błędy Claude API po polsku: zły klucz, odmowa, ucięta odpowiedź", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => claudeReply({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401)),
    );
    let res = await POST(request("POST", { context: CONTEXT }));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/ANTHROPIC_API_KEY/);

    vi.stubGlobal("fetch", vi.fn(async () => claudeReply({ stop_reason: "refusal", content: [] })));
    res = await POST(request("POST", { context: CONTEXT }));
    expect(res.status).toBe(422);

    vi.stubGlobal("fetch", vi.fn(async () => claudeReply({ stop_reason: "max_tokens", content: [{ type: "text", text: "{\"cytat\": \"Śr" }] })));
    res = await POST(request("POST", { context: CONTEXT }));
    expect(((await res.json()) as { error: string }).error).toMatch(/ucięta/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => claudeReply({ type: "error", error: { message: "Your credit balance is too low to access the Anthropic API." } }, 400)),
    );
    res = await POST(request("POST", { context: CONTEXT }));
    expect(((await res.json()) as { error: string }).error).toMatch(/Brak środków/);
  });

  it("pusta karta: 400, bez zapytania do Claude", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(request("POST", { context: { ...CONTEXT, note: "", transcripts: [] } }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("z Supabase trzeba być zalogowanym; bez Supabase płatny klucz tylko po AI_ALLOW_WITHOUT_LOGIN=1 i na tym komputerze", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    flags.supabase = true;
    expect(await (await GET(request("GET"))).json()).toEqual({ enabled: false, reason: "login" });
    expect((await POST(request("POST", { context: CONTEXT }))).status).toBe(401);
    const bad = { authorization: "Bearer zly-token" };
    expect((await POST(request("POST", { context: CONTEXT }, "crm.example.com", bad))).status).toBe(401);
    flags.supabase = false;
    // Demo bez flagi: nawet „localhost” nie wystarczy (nagłówek Host da się podrobić w sieci lokalnej).
    expect(await (await GET(request("GET"))).json()).toEqual({ enabled: false, reason: "local_only" });
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    expect(await (await GET(request("GET", undefined, "crm.example.com"))).json()).toEqual({ enabled: false, reason: "local_only" });
    expect((await POST(request("POST", { context: CONTEXT }, "crm.example.com"))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AI_ALLOWED_EMAILS: tylko wskazane adresy albo domeny; limit zapytań na osobę", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.AI_ALLOWED_EMAILS = "szef@lutra.pl, @brandpixel.de";
    flags.supabase = true;
    const fetchMock = vi.fn(async () =>
      claudeReply({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(ANSWER) }], usage: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const as = (email: string) => ({ authorization: `Bearer good-${email}` });
    expect(await (await GET(request("GET", undefined, "crm.example.com", as("obcy@gmail.com")))).json()).toEqual({
      enabled: false,
      reason: "not_allowed",
    });
    expect((await POST(request("POST", { context: CONTEXT }, "crm.example.com", as("obcy@gmail.com")))).status).toBe(403);
    // Konto założone na adres z listy, ale bez potwierdzenia maila — bez AI.
    const fresh = { authorization: "Bearer new-ktos@lutra.pl" };
    process.env.AI_ALLOWED_EMAILS = "szef@lutra.pl, @lutra.pl, @brandpixel.de";
    expect(await (await GET(request("GET", undefined, "crm.example.com", fresh))).json()).toEqual({
      enabled: false,
      reason: "unconfirmed",
    });
    expect((await POST(request("POST", { context: CONTEXT }, "crm.example.com", fresh))).status).toBe(403);
    process.env.AI_ALLOWED_EMAILS = "szef@lutra.pl, @brandpixel.de";
    expect((await (await GET(request("GET", undefined, "crm.example.com", as("szef@lutra.pl")))).json()).enabled).toBe(true);

    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await POST(request("POST", { context: CONTEXT }, "crm.example.com", as("kuba@brandpixel.de")))).status);
    }
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(30);
    // Inna osoba ma własny limit.
    expect((await POST(request("POST", { context: CONTEXT }, "crm.example.com", as("szef@lutra.pl")))).status).toBe(200);
  });

  it("za duże zapytanie odrzucone przed czytaniem", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    const res = await POST(request("POST", { context: CONTEXT }, "127.0.0.1:3000", { "content-length": "900000" }));
    expect(res.status).toBe(413);
  });

  it("token z „claude setup-token” zamiast klucza API: wyłączone z jasnym powodem, bez zapytania do Claude", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz0123456789";
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(claudeKeyProblem()).toBe("oauth_token");
    expect(resolveClaude()).toBeNull();
    expect(await (await GET(request("GET"))).json()).toEqual({ enabled: false, reason: "oauth_token" });
    const res = await POST(request("POST", { context: CONTEXT }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(/setup-token.*Claude Console/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(claudeKeyProblem({ ANTHROPIC_API_KEY: "sk-ant-admin01-xyz" })).toBe("admin_key");
    expect(claudeKeyProblem({ ANTHROPIC_API_KEY: KEY })).toBeNull();
  });

  it("klucz bez workspace'u: nagłówek anthropic-workspace-id z env, czytelny błąd, gdy go brakuje", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ";
    const fetchMock = vi.fn(async () =>
      claudeReply({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(ANSWER) }], usage: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request("POST", { context: CONTEXT }))).status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["anthropic-workspace-id"]).toBe("wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ");

    delete process.env.ANTHROPIC_WORKSPACE_ID;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        claudeReply({ type: "error", error: { type: "invalid_request_error", message: "anthropic-workspace-id header is required for this API key" } }, 400),
      ),
    );
    const res = await POST(request("POST", { context: CONTEXT }));
    expect(((await res.json()) as { error: string }).error).toMatch(/ANTHROPIC_WORKSPACE_ID/);
    expect(resolveClaude({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_WORKSPACE_ID: "zly id" })?.workspaceId).toBeUndefined();
  });

  it("konfiguracja: model i effort z env, starsze modele bez effort, śmieci w kluczu odrzucone", () => {
    expect(resolveClaude({ ANTHROPIC_API_KEY: "krótki" })).toBeNull();
    expect(resolveClaude({ ANTHROPIC_API_KEY: `${KEY} spacja` })).toBeNull();
    expect(resolveClaude({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: "gpt-5" })).toBeNull();
    expect(resolveClaude({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: "claude-haiku-5-5", ANTHROPIC_EFFORT: "medium" })).toEqual({
      apiKey: KEY,
      model: "claude-haiku-5-5",
      effort: "medium",
    });
    expect(resolveClaude({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: "claude-sonnet-4-5" })?.effort).toBeNull();
    expect(supportsEffort("claude-fable-5-1")).toBe(true);
    expect(supportsEffort("claude-3-5-haiku-latest")).toBe(false);
  });
});
