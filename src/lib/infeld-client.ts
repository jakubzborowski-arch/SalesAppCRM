import type { KnowledgeHint } from "./infeld-suggest";
import type { Mission, Partner } from "./types";

export type InfeldSuggestResult = {
  ok: boolean;
  query?: string;
  hints: KnowledgeHint[];
  preview?: string;
  label?: string;
  voice?: string;
  voiceError?: string;
  composer?: "cursor" | "playbook" | "needs-key" | "cursor-error" | "mcp";
  empty?: boolean;
  error?: string;
};

export async function fetchInfeldSuggest(
  partner: Partner,
  mission: Mission,
  query?: string,
): Promise<InfeldSuggestResult> {
  try {
    const res = await fetch("/api/infeld/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner, mission, query }),
    });
    const data = (await res.json()) as InfeldSuggestResult;
    if (!res.ok) {
      return {
        ok: false,
        hints: [],
        query: data.query,
        preview: data.preview,
        error: data.error ?? `Infeld HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      query: data.query,
      hints: data.hints ?? [],
      preview: data.preview,
      label: data.label,
      voice: data.voice,
      voiceError: data.voiceError,
      composer: data.composer,
      error: data.voice ? undefined : data.error || "Infeld nic nie znalazł w knowledge base.",
    };
  } catch (err) {
    return {
      ok: false,
      hints: [],
      error: err instanceof Error ? err.message : "Nie udało się zapytać Infelda.",
    };
  }
}
