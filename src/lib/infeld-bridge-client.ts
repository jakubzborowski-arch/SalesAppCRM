import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const bridgePath =
  process.env.INFELD_MCP_BRIDGE?.trim() ||
  join(homedir(), ".cursor", "infeld-mcp-bridge.mjs");

type Rpc = {
  id?: number;
  result?: { content?: Array<{ text?: string }> };
  error?: { message?: string };
};

/** Lokalny most MCP (OAuth, tylko CRM-SalesApp). Na Vercelu go nie ma. */
export function cursorInfeldBridgeAvailable() {
  return !process.env.VERCEL && existsSync(bridgePath);
}

export async function searchViaCursorBridge(query: string, limit = 4, timeoutMs = 20_000) {
  if (!cursorInfeldBridgeAvailable()) return "";

  return new Promise<string>((resolve) => {
    const child = spawn(process.execPath, ["--use-system-ca", bridgePath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let buf = "";
    const pending = new Map<number, (message: Rpc) => void>();
    const finish = (text: string) => {
      clearTimeout(timer);
      child.kill();
      resolve(text);
    };
    const timer = setTimeout(() => finish(""), timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl = buf.indexOf("\n");
      while (nl >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        nl = buf.indexOf("\n");
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as Rpc;
          if (message.id == null) continue;
          const waiter = pending.get(message.id);
          if (!waiter) continue;
          pending.delete(message.id);
          waiter(message);
        } catch {
          /* fragment linii */
        }
      }
    });
    child.on("error", () => finish(""));
    child.on("exit", () => {
      if (pending.size) finish("");
    });

    const rpc = (id: number, method: string, params: unknown) =>
      new Promise<Rpc>((respond) => {
        pending.set(id, respond);
        child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });

    void (async () => {
      try {
        const init = await rpc(1, "initialize", {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "lutra-crm", version: "0.1.0" },
        });
        if (init.error) {
          finish("");
          return;
        }
        child.stdin?.write(
          `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
        );
        const found = await rpc(2, "tools/call", {
          name: "infeld.search",
          arguments: { query, limit },
        });
        const text = (found.result?.content ?? [])
          .map((part) => part.text ?? "")
          .filter(Boolean)
          .join("\n");
        finish(text);
      } catch {
        finish("");
      }
    })();
  });
}
