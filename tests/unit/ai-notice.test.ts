import { describe, expect, it } from "vitest";
import { aiNoticeGiven, withAiNotice } from "@/lib/ai-notice";
import type { Consent } from "@/lib/types";

describe("informacja o AI dla partnera", () => {
  it("zapis i cofnięcie w zgodach, bez ruszania zgód kontaktowych", () => {
    const contact: Consent = { channel: "phone", purpose: "contact", status: "granted" };
    const partner = { consents: [contact] };
    expect(aiNoticeGiven(partner)).toBe(false);
    const informed = { consents: withAiNotice(partner, true) };
    expect(aiNoticeGiven(informed)).toBe(true);
    expect(informed.consents).toEqual([contact, { channel: "other", purpose: "ai_analysis", status: "granted" }]);
    const withdrawn = { consents: withAiNotice(informed, false) };
    expect(aiNoticeGiven(withdrawn)).toBe(false);
    expect(withdrawn.consents).toHaveLength(2);
  });
});
