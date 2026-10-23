import { isValidNip, normalizeNip } from "./company";
import type { Partner } from "./types";

/** Dane, po których rozpoznajemy ten sam lokal. */
export type DuplicateProbe = {
  name: string;
  city?: string;
  nip?: string;
  phones?: (string | undefined)[];
  emails?: (string | undefined)[];
};

const GENERIC = /\b(kawiarnia|cafe|caffe|kafejka|restauracja|bistro|bar|pub|klub|hotel|pizzeria|piekarnia|cukiernia|lokal)\b/g;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** „Kawiarnia Nova” i „Nova Cafe” → „nova”. */
export function nameKey(name: string) {
  const core = fold(name).replace(GENERIC, " ").replace(/\s+/g, " ").trim();
  return core || fold(name);
}

function phoneKey(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

export function duplicateKeys(probe: DuplicateProbe) {
  const keys: { key: string; reason: string }[] = [];
  if (probe.nip && isValidNip(probe.nip)) keys.push({ key: `nip:${normalizeNip(probe.nip)}`, reason: "ten sam NIP" });
  for (const phone of probe.phones ?? []) {
    const k = phone ? phoneKey(phone) : "";
    if (k) keys.push({ key: `tel:${k}`, reason: "ten sam telefon" });
  }
  for (const email of probe.emails ?? []) {
    const k = email?.trim().toLowerCase();
    if (k && k.includes("@")) keys.push({ key: `mail:${k}`, reason: "ten sam e-mail" });
  }
  const name = nameKey(probe.name);
  if (name) keys.push({ key: `name:${name}|${fold(probe.city ?? "")}`, reason: "ta sama nazwa w tym mieście" });
  return keys;
}

export function partnerProbe(partner: Partner): DuplicateProbe {
  return {
    name: partner.name,
    city: partner.city,
    nip: partner.company?.nip,
    phones: partner.contacts.map((c) => c.phone),
    emails: partner.contacts.map((c) => c.email),
  };
}

/** Indeks istniejących partnerów po kluczach duplikatów. */
export function duplicateIndex(partners: Partner[]) {
  const index = new Map<string, Partner>();
  for (const partner of partners) {
    for (const { key } of duplicateKeys(partnerProbe(partner))) if (!index.has(key)) index.set(key, partner);
  }
  return index;
}

/** Istniejący partnerzy, którzy wyglądają na ten sam lokal, z powodem. */
export function findDuplicates(probe: DuplicateProbe, partners: Partner[]) {
  const index = duplicateIndex(partners);
  const found = new Map<string, { partner: Partner; reasons: string[] }>();
  for (const { key, reason } of duplicateKeys(probe)) {
    const partner = index.get(key);
    if (!partner) continue;
    const entry = found.get(partner.id) ?? { partner, reasons: [] };
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    found.set(partner.id, entry);
  }
  return [...found.values()];
}
