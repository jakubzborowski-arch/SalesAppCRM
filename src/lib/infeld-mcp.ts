/** Klient HTTP MCP Infelda — search knowledge (hosted: api.infeld.ai). */

export const INFELD_MCP_URL =
  process.env.INFELD_MCP_URL?.trim() || "https://api.infeld.ai/mcp";

type JsonRpc = {
  result?: unknown;
  error?: { message?: string; tag?: string };
};

export type InfeldMcpConfig = {
  apiKey: string;
  projectUuid?: string;
  mcpUrl: string;
};

export function resolveInfeldMcpConfig():
  | InfeldMcpConfig
  | { error: string; code: "missing_key" } {
  const apiKey = process.env.INFELD_API_KEY?.trim() || "";
  if (!apiKey) {
    return {
      error: "Brak INFELD_API_KEY. Dodaj klucz w .env.local albo w Vercel Env.",
      code: "missing_key",
    };
  }
  return {
    apiKey,
    projectUuid: process.env.INFELD_PROJECT_UUID?.trim() || undefined,
    mcpUrl: INFELD_MCP_URL,
  };
}

function parseMcpBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("data:")) {
    const payloads: unknown[] = [];
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        payloads.push(JSON.parse(data));
      } catch {
        /* ignore */
      }
    }
    const withResult = payloads.find((p) => p && typeof p === "object" && "result" in p);
    if (withResult) return withResult;
    const withError = payloads.find((p) => p && typeof p === "object" && "error" in p);
    return withError ?? payloads.at(-1) ?? null;
  }
  return JSON.parse(trimmed);
}

async function mcpRequest(
  config: InfeldMcpConfig,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string | null,
  opts?: { notification?: boolean },
): Promise<{ body: unknown; sessionId: string | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const payload: Record<string, unknown> = { jsonrpc: "2.0", method, params };
  if (!opts?.notification) payload.id = crypto.randomUUID();

  const res = await fetch(config.mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const nextSession =
    res.headers.get("mcp-session-id") || res.headers.get("Mcp-Session-Id") || sessionId || null;
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Infeld MCP HTTP ${res.status}: ${raw.slice(0, 280)}`);
  }
  if (opts?.notification) return { body: null, sessionId: nextSession };

  const body = parseMcpBody(raw) as JsonRpc;
  if (body?.error) {
    throw new Error(body.error.message || body.error.tag || "Infeld MCP zwrócił błąd.");
  }
  return { body, sessionId: nextSession };
}

async function withSession<T>(
  config: InfeldMcpConfig,
  fn: (sessionId: string | null) => Promise<T>,
): Promise<T> {
  const init = await mcpRequest(
    config,
    "initialize",
    {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "lutra-crm", version: "0.1.0" },
    },
    null,
  );
  try {
    await mcpRequest(config, "notifications/initialized", {}, init.sessionId, {
      notification: true,
    });
  } catch {
    /* część serwerów nie wymaga */
  }
  return fn(init.sessionId);
}

function toolText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as { content?: Array<{ type?: string; text?: string }> };
  if (!Array.isArray(r.content)) return typeof result === "string" ? result : JSON.stringify(result);
  return r.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

export async function infeldSearch(
  config: InfeldMcpConfig,
  query: string,
  limit = 6,
) {
  const args: Record<string, unknown> = { query, limit };
  if (config.projectUuid) args.projectUuid = config.projectUuid;

  return withSession(config, async (sessionId) => {
    const { body } = await mcpRequest(
      config,
      "tools/call",
      { name: "infeld.search", arguments: args },
      sessionId,
    );
    const result = (body as JsonRpc).result;
    return { text: toolText(result), raw: result };
  });
}
