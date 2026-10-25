import { describe, expect, it } from "vitest";
import { migrationDrift } from "@/lib/migrations";

const row = (version: string, minute: number) => ({ version, applied_at: `2026-10-25T10:${String(minute).padStart(2, "0")}:00Z` });

describe("kolejność migracji", () => {
  it("po kolei = bez uwag; brak znaczników = bez uwag", () => {
    expect(migrationDrift([row("v3", 1), row("v4", 2), row("v6", 3), row("v8", 4)])).toBeNull();
    expect(migrationDrift([])).toBeNull();
  });

  it("v2–v3 odpalone po v6: trzeba powtórzyć v4–v8", () => {
    expect(migrationDrift([row("v4", 2), row("v6", 3), row("v8", 4), row("v3", 9)])).toEqual({
      rerun: "v3",
      repeat: ["v4", "v5", "v6", "v7", "v8"],
    });
  });

  it("v4 po v7: powtórzyć v5–v8; po powtórce wszystko w porządku", () => {
    expect(migrationDrift([row("v3", 1), row("v7", 3), row("v4", 5)])?.repeat).toEqual(["v5", "v6", "v7", "v8"]);
    expect(migrationDrift([row("v3", 1), row("v4", 5), row("v5", 6), row("v6", 7), row("v7", 8), row("v8", 9)])).toBeNull();
  });
});
