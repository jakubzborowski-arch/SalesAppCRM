/** Kolejność migracji CRM (v2–v3 zapisują się jako „v3”). */
export const MIGRATION_ORDER = ["v3", "v4", "v5", "v6", "v7", "v8"] as const;
export type MigrationVersion = (typeof MIGRATION_ORDER)[number];

export type MigrationRow = { version: string; applied_at: string };

export type MigrationDrift = {
  /** Migracja odpalona ponownie po nowszych. */
  rerun: MigrationVersion;
  /** Co trzeba odpalić jeszcze raz, po kolei. */
  repeat: MigrationVersion[];
};

/**
 * Starsza migracja odpalona po nowszej potrafi cofnąć uprawnienia albo funkcje (np. v2–v3 po v6).
 * Wtedy trzeba powtórzyć wszystkie kolejne. Zwraca najstarszą taką migrację albo null.
 */
export function migrationDrift(rows: MigrationRow[]): MigrationDrift | null {
  const at = new Map<MigrationVersion, number>();
  for (const row of rows) {
    if (!(MIGRATION_ORDER as readonly string[]).includes(row.version)) continue;
    const time = Date.parse(row.applied_at);
    if (Number.isFinite(time)) at.set(row.version as MigrationVersion, time);
  }
  for (let i = 0; i < MIGRATION_ORDER.length; i++) {
    const older = at.get(MIGRATION_ORDER[i]);
    if (older === undefined) continue;
    const later = MIGRATION_ORDER.slice(i + 1).filter((v) => {
      const time = at.get(v);
      return time !== undefined && time < older;
    });
    if (later.length) {
      return { rerun: MIGRATION_ORDER[i], repeat: MIGRATION_ORDER.slice(i + 1).filter((v) => v !== "v3") };
    }
  }
  return null;
}
