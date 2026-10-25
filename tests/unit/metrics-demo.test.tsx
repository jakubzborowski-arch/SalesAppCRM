// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => null,
  isSupabaseConfigured: () => false,
  isMissingCrmTable: () => false,
}));

const { StoreProvider, useStore } = await import("@/lib/store");
type StoreApi = ReturnType<typeof useStore>;

function Grab({ onStore }: { onStore: (store: StoreApi) => void }) {
  onStore(useStore());
  return null;
}

async function mount() {
  const out: { store: StoreApi | null } = { store: null };
  const view = render(
    <StoreProvider>
      <Grab onStore={(store) => { out.store = store; }} />
    </StoreProvider>,
  );
  await waitFor(() => expect(out.store?.ready).toBe(true));
  return { out, view };
}

describe("tryb demo: metryki i dopasowanie w przeglądarce", () => {
  beforeEach(() => window.localStorage.clear());

  it("metryki i wynik dopasowania przeżywają odświeżenie", async () => {
    const { out, view } = await mount();
    let result = { ok: false } as { ok: boolean; error?: string };
    await act(async () => {
      result = await out.store!.savePartnerMetrics("partner-nova", "2026-09", { events: 3, attendees: 24, redemptions: 9, notes: "" });
    });
    expect(result.ok).toBe(true);
    await act(async () => {
      result = await out.store!.savePartnerMetrics("partner-nova", "2026-09", { events: 3, attendees: 24, redemptions: 11, notes: "" });
    });
    act(() => out.store!.updatePartner("partner-nova", { fit: { deadHours: 2, capacity: 1, area: 2 } }));
    expect(out.store!.state.metrics).toHaveLength(1);
    await waitFor(() => expect(window.localStorage.getItem("lutra-crm-v1")).toContain("\"redemptions\":11"));
    view.unmount();

    const again = await mount();
    await waitFor(() => expect(again.out.store!.state.metrics).toEqual([expect.objectContaining({ month: "2026-09", redemptions: 11 })]));
    expect(again.out.store!.partnerById("partner-nova")?.fit).toEqual({ deadHours: 2, capacity: 1, area: 2 });
  });

  it("ujemne liczby i nieznany partner odrzucone", async () => {
    const { out } = await mount();
    let result = { ok: true } as { ok: boolean; error?: string };
    await act(async () => {
      result = await out.store!.savePartnerMetrics("partner-nova", "2026-09", { events: -1, attendees: null, redemptions: null, notes: "" });
    });
    expect(result).toEqual({ ok: false, error: "Liczby nie mogą być ujemne." });
    await act(async () => {
      result = await out.store!.savePartnerMetrics("nie-ma", "2026-09", { events: 1, attendees: null, redemptions: null, notes: "" });
    });
    expect(result.ok).toBe(false);
  });
});
