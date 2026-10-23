import {
  draftBreaksRules,
  isLocalCrmRequest,
  redactPrivate,
  resolveHostedLlm,
  resolveLocalLlm,
  stripModelNoise,
  type HostedLlm,
} from "@/lib/local-llm";

export function resolveDraftBackend(request: Request) {
  const local = resolveLocalLlm();
  if (local && isLocalCrmRequest(request)) return { place: "mac" as const, local };
  const hosted = resolveHostedLlm();
  if (hosted) return { place: "zen" as const, hosted };
  return null;
}

function readDraft(payload: unknown, wire: HostedLlm["wire"]) {
  if (wire === "anthropic") {
    const content = (payload as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
    return content
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n");
  }
  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
  return choices?.[0]?.message?.content ?? "";
}

export function uniqueSentences(text: string) {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of text.split(/(?<=[.!?])\s+/)) {
    const key = part.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(part.trim());
  }
  return kept.join(" ");
}

type RawInput = {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Ollama: wymuś JSON w odpowiedzi. */
  json?: boolean;
  /** Ollama: okno kontekstu w tokenach (domyślne bywa za małe na transkrypt). */
  numCtx?: number;
};
type RawResult = { ok: true; text: string; place: "mac" | "zen" } | { ok: false; error: string; status: number };

/** Surowa odpowiedź lokalnego Qwena (Ollama) albo OpenCode Zen — bez obróbki szkicu. */
export async function completeRaw(request: Request, input: RawInput): Promise<RawResult> {
  const backend = resolveDraftBackend(request);
  if (!backend) return { ok: false, error: "Szkice są wyłączone na tym hoście.", status: 404 };

  const maxTokens = input.maxTokens ?? 420;
  const timeoutMs = input.timeoutMs ?? (backend.place === "mac" ? 90_000 : 45_000);
  let response: Response;
  try {
    response =
      backend.place === "mac"
        ? await fetch(`${backend.local.baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify({
              model: backend.local.model,
              stream: false,
              think: false,
              ...(input.json ? { format: "json" } : {}),
              messages: [
                { role: "system", content: input.system },
                { role: "user", content: input.user },
              ],
              options: { temperature: 0.2, num_predict: maxTokens, ...(input.numCtx ? { num_ctx: input.numCtx } : {}) },
            }),
          })
        : await fetch(backend.hosted.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${backend.hosted.apiKey}`,
            },
            signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify(
              backend.hosted.wire === "anthropic"
                ? {
                    model: backend.hosted.model,
                    max_tokens: maxTokens,
                    temperature: 0.2,
                    system: input.system,
                    messages: [{ role: "user", content: input.user }],
                  }
                : {
                    model: backend.hosted.model,
                    temperature: 0.2,
                    max_tokens: maxTokens,
                    messages: [
                      { role: "system", content: input.system },
                      { role: "user", content: input.user },
                    ],
                  },
            ),
          });
  } catch {
    return {
      ok: false,
      status: 503,
      error:
        backend.place === "mac"
          ? "Ollama nie odpowiada na tym Macu. W terminalu: ollama pull qwen3.5:4b"
          : "OpenCode Zen nie odpowiedział. Sprawdź saldo i klucz.",
    };
  }

  if (!response.ok) {
    const status = response.status === 401 || response.status === 402 ? response.status : 502;
    const error =
      backend.place === "mac"
        ? "Ollama odrzuciła zapytanie. Sprawdź, czy model qwen3.5:4b jest pobrany."
        : response.status === 401
          ? "Klucz OpenCode Zen został odrzucony."
          : response.status === 402
            ? "Brak środków na OpenCode Zen."
            : "OpenCode Zen odrzucił zapytanie.";
    return { ok: false, error, status };
  }

  const payload = (await response.json()) as { message?: { content?: string } };
  const raw = backend.place === "mac" ? (payload.message?.content ?? "") : readDraft(payload, backend.hosted.wire);
  return { ok: true, text: raw, place: backend.place };
}

export async function completeDraftText(
  request: Request,
  input: { system: string; user: string; source: string; maxTokens?: number; timeoutMs?: number; minLength?: number },
): Promise<{ ok: true; text: string; place: "mac" | "zen" } | { ok: false; error: string; status: number }> {
  const done = await completeRaw(request, input);
  if (!done.ok) return done;
  const text = uniqueSentences(redactPrivate(stripModelNoise(done.text)));
  if (text.length < (input.minLength ?? 40)) {
    return { ok: false, error: "Model oddał pusty szkic. Spróbuj jeszcze raz.", status: 502 };
  }
  if (draftBreaksRules(text, input.source)) {
    return {
      ok: false,
      error: "Szkic zawiera obietnicę spoza faktów (rabat, liczba gości, wyłączność). Nie pokazuję go.",
      status: 422,
    };
  }
  return { ok: true, text, place: done.place };
}
