export type SocialKind = "instagram" | "facebook" | "other";

export function socialUrl(kind: SocialKind, raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  if (kind === "instagram") {
    const handle = value
      .replace(/^@/, "")
      .replace(/^(www\.)?instagram\.com\//i, "")
      .replace(/\/.*$/, "");
    return handle ? `https://instagram.com/${handle}` : "";
  }

  if (kind === "facebook") {
    const handle = value
      .replace(/^(www\.)?(facebook|fb)\.com\//i, "")
      .replace(/\/$/, "");
    return handle ? `https://facebook.com/${handle}` : "";
  }

  if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) return `https://${value}`;
  return value;
}
