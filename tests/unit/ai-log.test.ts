import { describe, expect, it } from "vitest";
import { aiQuality, costUsd, fieldKey, PROMPT_VERSION, suggestionRows, type AiSuggestion } from "@/lib/ai-log";
import type { ProposalRow } from "@/lib/discovery-extract";

const row = (key: string, checked: boolean, warning?: string): ProposalRow => ({
  key, label: key, value: "x", current: "", checked, warning, group: "Oferta i warunki",
});

const run = (outcome: AiSuggestion["outcome"], rows: ProposalRow[], selected: string[], extra: Partial<AiSuggestion> = {}): AiSuggestion => ({
  id: Math.random().toString(16), missionId: "m-1", createdAt: "2026-10-25T10:00:00Z", outcome, engine: "claude",
  model: "claude-sonnet-5-5", promptVersion: PROMPT_VERSION, inputTokens: 10_000, outputTokens: 2_000, durationMs: 12_000,
  speakersKnown: true, rows: suggestionRows(rows, new Set(selected)), ...extra,
});

describe("jakość podpowiedzi AI", () => {
  it("wersja polecenia jest stała dla tego samego tekstu", () => {
    expect(PROMPT_VERSION).toMatch(/^p-[0-9a-f]{8}$/);
  });

  it("liczy akceptację per pole (potrzeby razem), odrzucenia mimo zaznaczenia i dodane ręcznie", () => {
    const rows = [row("terms:value", true), row("deal:company", false, "Brak dowodu"), row("need:0", true), row("need:1", true)];
    const q = aiQuality([
      run("applied", rows, ["terms:value", "deal:company", "need:0"]),
      run("applied", rows, ["need:0", "need:1"]),
      run("discarded", rows, [], { speakersKnown: false, model: null, inputTokens: null, outputTokens: null, durationMs: null }),
    ]);
    expect(q).toMatchObject({ runs: 3, applied: 2, discarded: 1, speakersUnknown: 1, avgSeconds: 12 });
    const field = (key: string) => q.fields.find((f) => f.key === key)!;
    expect(field("need")).toMatchObject({ proposed: 6, accepted: 3, rejectedSuggested: 1 });
    expect(field("terms:value")).toMatchObject({ proposed: 3, accepted: 1, agreed: 1, rejectedSuggested: 1 });
    expect(field("deal:company")).toMatchObject({ accepted: 1, addedUnsuggested: 1 });
    expect(q.costUsd).toBeCloseTo(2 * costUsd("claude-sonnet-5-5", 10_000, 2_000)!, 6);
    expect(fieldKey("need:12")).toBe("need");
  });

  it("koszt według modelu; nieznany model bez kosztu", () => {
    expect(costUsd("claude-haiku-5-5", 1_000_000, 1_000_000)).toBeCloseTo(0.6);
    expect(costUsd("claude-sonnet-5-5", 1_000_000, 0)).toBe(2);
    expect(costUsd(null, 100, 100)).toBeNull();
  });
});
