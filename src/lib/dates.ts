function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Pełne dni kalendarzowe od daty do dziś. `null` dla pustej albo złej daty. */
export function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);
}

export function relativeDay(iso: string | null | undefined) {
  const days = daysSince(iso);
  if (days === null) return "";
  if (days <= 0) return "dziś";
  if (days === 1) return "wczoraj";
  return `${days} dni temu`;
}
