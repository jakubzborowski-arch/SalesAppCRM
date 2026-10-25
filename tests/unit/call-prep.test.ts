import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CRM_SOURCE,
  callPrepOf,
  discoveryGaps,
  hasPromise,
  instagramUrl,
  normalizePrep,
  PREP_SCHEMA,
  prepContext,
  prepUserMessage,
  publicUrl,
  researchUserMessage,
  sanitizePrepContext,
  similarDeals,
} from "@/lib/call-prep";
import { claudeResearch, researchSources } from "@/lib/claude-api";
import { offerPatch } from "@/components/mission/call-prep-card";
import { emptyCompany } from "@/lib/company";
import { emptyMission } from "@/lib/seed";
import { emptyDiscount } from "@/lib/terms";
import type { Mission, Partner } from "@/lib/types";

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => null,
  isMissingCrmTable: () => false,
}));

function partner(id: string, over: Partial<Partner> = {}): Partner {
  return {
    id, name: `Lokal ${id}`, segment: "venue", capacity: null, city: "Wrocław", address: "", category: "kawiarnia",
    subcategory: "", website: "", instagram: "", facebook: "", socialOther: "", priority: "", priorityReason: "", source: "",
    dnc: false, company: emptyCompany(), contacts: [], consents: [], ...over,
  };
}

function wonMission(partnerId: string, percent: number, over: Partial<Mission> = {}): Mission {
  const m = emptyMission(partnerId, `m-${partnerId}`);
  return {
    ...m,
    status: "won",
    outcome: "won",
    currentStage: "activation",
    terms: { ...m.terms, discount: { ...emptyDiscount(), percent, days: ["mon", "tue"], hoursFrom: "16:00", hoursTo: "19:00" } },
    ...over,
  };
}

const target = partner("t", { name: "Ziarno i Filiżanka", website: "ziarno.pl", instagram: "@ziarno_wro" });

describe("podobni partnerzy i luki (bez AI)", () => {
  it("tylko ten sam typ, z ustalonymi warunkami; najpierw ta sama kategoria i miasto", () => {
    const partners = [
      target,
      partner("a", { category: "bar / pub", city: "Kraków" }),
      partner("b"),
      partner("c", { segment: "community" }),
      partner("d"),
    ];
    const missions = [
      wonMission("a", 15),
      wonMission("b", 10),
      wonMission("c", 20),
      { ...emptyMission("d", "m-d"), terms: wonMission("d", 12).terms }, // bez zgody — pomijamy
    ];
    const list = similarDeals(target, partners, missions);
    expect(list.map((s) => s.name)).toEqual(["Lokal b", "Lokal a"]);
    expect(list[0]).toMatchObject({ sameCategory: true, sameCity: true, percent: 10 });
    expect(list[0].terms).toMatch(/10% rabatu/);
  });

  it("luki: problem, decydent, termin, martwe godziny, godziny, realizacja", () => {
    const gaps = discoveryGaps(emptyMission("t", "m"), target);
    expect(gaps.join(" | ")).toMatch(/problem partnera/);
    expect(gaps.join(" | ")).toMatch(/kto decyduje/);
    expect(gaps.join(" | ")).toMatch(/martwe godziny/);
    expect(gaps.join(" | ")).toMatch(/godziny otwarcia/);
    expect(gaps.join(" | ")).toMatch(/QR, kod w kasie/);
  });

  it("kontekst bez nazw innych partnerów, bez telefonów; adresy tylko http(s)", () => {
    const m = { ...emptyMission("t", "m"), conversationNote: "Właścicielka: Anna, tel. 601 223 884" };
    const ctx = prepContext(m, target, [target, partner("b")], [wonMission("b", 10)], new Date(2026, 9, 25));
    expect(ctx.partner.website).toBe("https://ziarno.pl/");
    expect(ctx.partner.instagram).toBe("https://www.instagram.com/ziarno_wro/");
    expect(JSON.stringify(ctx)).not.toMatch(/601 223 884/);
    expect(JSON.stringify(ctx.similar)).not.toMatch(/Lokal b/);
    expect(ctx.today).toBe("2026-10-25");
    expect(publicUrl("http://127.0.0.1:3000/x")).toBe("");
    expect(publicUrl("https://user:pass@example.com")).toBe("");
    expect(publicUrl("javascript:alert(1)")).toBe("");
    expect(instagramUrl("@kawa.ok")).toBe("https://www.instagram.com/kawa.ok/");
  });

  it("serwer czyści kontekst: zły typ, za długie pola, lokalne adresy", () => {
    expect(sanitizePrepContext({ partner: {} })).toBeNull();
    const ctx = sanitizePrepContext({
      partner: { name: "X".repeat(500), segmentId: "hack", website: "http://localhost/admin", capacity: -4 },
      similar: [{ terms: "10%", category: "kawiarnia" }, { terms: "" }],
      gaps: ["a", 5],
      today: "zła data",
    })!;
    expect(ctx.partner.name).toHaveLength(160);
    expect(ctx.partner.segmentId).toBe("venue");
    expect(ctx.partner.website).toBe("");
    expect(ctx.partner.capacity).toBeNull();
    expect(ctx.similar).toHaveLength(1);
    expect(ctx.gaps).toEqual(["a"]);
    expect(ctx.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(researchUserMessage(ctx)).toMatch(/Strona: brak/);
    expect(prepUserMessage(ctx, "")).toMatch(/Brak — wyszukiwanie niedostępne/);
  });
});

describe("odpowiedź modelu → przygotowanie", () => {
  const sources = [{ url: "https://ziarno.pl/menu", title: "Menu — Ziarno" }, { url: "https://www.facebook.com/ziarno", title: "" }];
  const extra = {
    engine: "claude",
    model: "claude-sonnet-5-5",
    searched: true,
    sources,
    similar: [],
    partnerUrls: ["https://ziarno.pl/"],
    segment: "venue" as const,
    now: new Date("2026-10-25T10:00:00Z"),
  };

  it("fakty tylko ze źródłem, które padło; oferta przycięta do poprawnych wartości", () => {
    const prep = normalizePrep(
      {
        podsumowanie: "Kawiarnia przy polibudzie.",
        fakty: [
          { tekst: "Czynne do 21:00", zrodlo: "https://ziarno.pl/menu/" },
          { tekst: "Wieczory planszówek w czwartki", zrodlo: "https://ziarno.pl/wydarzenia" }, // ta sama domena
          { tekst: "Kawiarnia roku 2025", zrodlo: "https://zmyslone.example.com/ranking" }, // źródło spoza wyników
          { tekst: "Kontakt przez Instagram", zrodlo: "karta partnera" },
          { tekst: "Bez źródła", zrodlo: "" },
        ],
        oferta: { opis: "Zniżka w puste wieczory.", znizka_procent: 12, dni: ["mon", "TUE", "xyz"], godziny_od: "17", godziny_do: "21:00", min_grupa: 4, realizacja: "CODE", uzasadnienie: "Podobne lokale." },
        pytania: ["Kiedy jest najluźniej?", ""],
        obiekcje: [{ klucz: "how_many", odpowiedz: "Na początek 1–2 wyjścia w tygodniu, liczby pokażemy po miesiącu." }, { klucz: "nieznana", odpowiedz: "x" }],
        unikaj: ["Porównań do Groupona"],
      },
      extra,
    );
    expect(prep.facts.map((f) => f.text)).toEqual(["Czynne do 21:00", "Wieczory planszówek w czwartki", "Kontakt przez Instagram"]);
    expect(prep.facts[0].source).toBe("https://ziarno.pl/menu");
    expect(prep.facts[2].source).toBe(CRM_SOURCE);
    expect(prep.offer).toMatchObject({ percent: 12, days: ["mon", "tue"], hoursFrom: "17:00", hoursTo: "21:00", minGroup: 4, redemption: "code" });
    expect(prep.questions).toEqual(["Kiedy jest najluźniej?"]);
    expect(prep.objections.map((o) => o.key)).toEqual(["how_many"]);
    expect(prep.createdAt).toBe("2026-10-25T10:00:00.000Z");
    expect(callPrepOf(JSON.parse(JSON.stringify(prep)))).toEqual(prep);
    expect(callPrepOf({})).toBeNull();
  });

  it("obietnice z listy „czego nie obiecywać” wypadają", () => {
    expect(hasPromise("Gwarantujemy 20 gości tygodniowo")).toBe(true);
    expect(hasPromise("Przyprowadzimy 15 osób")).toBe(true);
    expect(hasPromise("Dajemy wyłączność w okolicy")).toBe(true);
    expect(hasPromise("Na start celujemy w jedno, dwa wyjścia w tygodniu, bez obietnic liczb.")).toBe(false);
    const prep = normalizePrep(
      { otwarcie: "Gwarantujemy pełną salę we wtorki!", obiekcje: [{ klucz: "how_many", odpowiedz: "Przyprowadzimy 30 osób miesięcznie." }] },
      extra,
    );
    expect(prep.opener).toBe("");
    expect(prep.objections).toEqual([]);
    expect(prep.dropped).toBe(2);
  });

  it("dla społeczności i firm bez liczb zniżki", () => {
    const prep = normalizePrep({ oferta: { opis: "Pilot 2 wydarzeń", znizka_procent: 15, dni: ["mon"] } }, { ...extra, segment: "community" });
    expect(prep.offer).toMatchObject({ summary: "Pilot 2 wydarzeń", percent: null, days: [] });
  });

  it("schemat płaski: bez enumów i opisów, każdy obiekt zamknięty", () => {
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const o = node as Record<string, unknown>;
      expect(o).not.toHaveProperty("enum");
      expect(o).not.toHaveProperty("description");
      if (o.type === "object") {
        expect(o.additionalProperties).toBe(false);
        expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const value of Object.values(o)) visit(value);
    };
    visit(PREP_SCHEMA);
  });
});

describe("wstawianie propozycji", () => {
  const offer = { summary: "", percent: 12, days: ["mon" as const], hoursFrom: "17:00", hoursTo: "21:00", minGroup: 4, redemption: "code" as const, why: "" };
  it("wypełnia tylko puste pola zniżki", () => {
    expect(offerPatch(emptyDiscount(), offer)).toEqual({ kind: "percent", percent: 12, days: ["mon"], hoursFrom: "17:00", hoursTo: "21:00", minGroup: 4, redemption: "code" });
    const filled = { ...emptyDiscount(), percent: 10, days: ["wed" as const], redemption: "qr" as const };
    expect(offerPatch(filled, offer)).toEqual({ hoursFrom: "17:00", hoursTo: "21:00", minGroup: 4 });
  });
});

describe("research z wyszukiwarką (Claude API)", () => {
  const config = { apiKey: "sk-ant-test-0123456789abcdefghij", model: "claude-sonnet-5-5", effort: "low" as const };
  const reply = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

  it("źródła z cytowań i wyników; pause_turn odsyłany bez zmian", async () => {
    const first = {
      stop_reason: "pause_turn",
      content: [
        { type: "server_tool_use", id: "srv1", name: "web_search", input: { query: "Ziarno Wrocław" } },
        { type: "web_search_tool_result", tool_use_id: "srv1", content: [{ type: "web_search_result", url: "https://ziarno.pl/", title: "Ziarno" }] },
      ],
      usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 1 } },
    };
    const second = {
      stop_reason: "end_turn",
      content: [
        { type: "text", text: "- Czynne do 21:00 [https://ziarno.pl/godziny]", citations: [{ type: "web_search_result_location", url: "https://ziarno.pl/godziny", title: "Godziny" }] },
      ],
      usage: { input_tokens: 200, output_tokens: 50 },
    };
    const fetcher = vi.fn().mockResolvedValueOnce(reply(first)).mockResolvedValueOnce(reply(second));
    const res = await claudeResearch(config, { system: "s", user: "u" }, fetcher as unknown as typeof fetch);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.text).toMatch(/Czynne do 21:00/);
    expect(res.sources.map((s) => s.url)).toEqual(["https://ziarno.pl/", "https://ziarno.pl/godziny"]);
    expect(res.searches).toBe(1);
    expect(res.usage).toEqual({ input: 300, output: 60 });
    const body2 = JSON.parse(String((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(body2.messages).toHaveLength(2);
    expect(body2.messages[1]).toEqual({ role: "assistant", content: first.content });
    expect(body2.tools.map((t: { name: string }) => t.name)).toEqual(["web_search", "web_fetch"]);
  });

  it("web_fetch niedostępny → próba z nagłówkiem beta → sama wyszukiwarka; wszystko wyłączone → disabled", async () => {
    const denied = reply({ type: "error", error: { type: "invalid_request_error", message: "web_fetch is not enabled for this organization" } }, 400);
    const ok = reply({ stop_reason: "end_turn", content: [{ type: "text", text: "- fakt [https://a.pl]" }], usage: {} });
    const fetcher = vi.fn().mockResolvedValueOnce(denied).mockResolvedValueOnce(denied.clone()).mockResolvedValueOnce(ok);
    const res = await claudeResearch(config, { system: "s", user: "u" }, fetcher as unknown as typeof fetch);
    expect(res.ok && res.tools).toEqual(["web_search"]);
    const headers2 = (fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers2["anthropic-beta"]).toBe("web-fetch-2025-09-10");

    const off = vi.fn(async () => reply({ type: "error", error: { message: "Web search is not enabled. Enable it in Console settings." } }, 400));
    const res2 = await claudeResearch(config, { system: "s", user: "u" }, off as unknown as typeof fetch);
    expect(res2).toMatchObject({ ok: false, disabled: true });
    expect(off).toHaveBeenCalledTimes(3);

    const credit = vi.fn(async () => reply({ type: "error", error: { message: "Your credit balance is too low" } }, 400));
    const res3 = await claudeResearch(config, { system: "s", user: "u" }, credit as unknown as typeof fetch);
    expect(res3).toMatchObject({ ok: false });
    expect(credit).toHaveBeenCalledTimes(1);
  });

  it("źródła bez duplikatów i tylko http(s)", () => {
    expect(
      researchSources([
        { type: "text", citations: [{ url: "https://a.pl", title: "A" }, { url: "javascript:x" }] },
        { type: "web_fetch_tool_result", content: { url: "https://a.pl", content: { title: "A2" } } },
      ]),
    ).toEqual([{ url: "https://a.pl", title: "A" }]);
  });
});

describe("/api/call-prep", () => {
  const KEY = "sk-ant-test-0123456789abcdefghij";
  const saved: Record<string, string | undefined> = {};
  const ENV = ["ANTHROPIC_API_KEY", "AI_ALLOW_WITHOUT_LOGIN", "LOCAL_LLM_URL", "HOSTED_LLM_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "AI_ALLOWED_EMAILS"];
  beforeEach(() => {
    for (const k of ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
  });
  const req = (method: string, body?: unknown) =>
    new Request("http://127.0.0.1:3001/api/call-prep", {
      method,
      headers: { host: "127.0.0.1:3001", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const context = prepContext(emptyMission("t", "m"), target, [target], []);

  it("research nieudany → przygotowanie i tak powstaje, z informacją; bez klucza — 404", async () => {
    const { GET, POST } = await import("@/app/api/call-prep/route");
    expect((await POST(req("POST", { context }))).status).toBe(404);

    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.AI_ALLOW_WITHOUT_LOGIN = "1";
    const answer = { podsumowanie: "Kawiarnia.", fakty: [], hipoteza: "", otwarcie: "", oferta: {}, pytania: ["Kiedy jest pusto?"], obiekcje: [], unikaj: [] };
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.tools) {
        return new Response(JSON.stringify({ type: "error", error: { message: "Web search is not enabled for your organization" } }), { status: 400 });
      }
      return new Response(JSON.stringify({ model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(answer) }], usage: { input_tokens: 900, output_tokens: 200 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await GET(req("GET"))).json()).toMatchObject({ enabled: true, search: true });
    const res = await POST(req("POST", { context }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, searched: false, data: answer });
    expect(body.searchNote).toMatch(/Capabilities/);
    const structured = fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body))).find((b) => !b.tools);
    expect(structured.output_config.format.type).toBe("json_schema");
    expect(structured.messages[0].content).toMatch(/Ziarno i Filiżanka/);
    expect((await POST(req("POST", { context: { partner: {} } }))).status).toBe(400);
  });
});
