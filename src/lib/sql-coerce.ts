export function dateOrNull(value?: string | null) {
  const match = (value ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function uuidOrNull(value?: string | null) {
  const v = (value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}

const needIdAlias = new Map<string, string>();

export function persistNeedId(id: string) {
  const valid = uuidOrNull(id);
  if (valid) return valid;
  const existing = needIdAlias.get(id);
  if (existing) return existing;
  const next = crypto.randomUUID();
  needIdAlias.set(id, next);
  return next;
}
