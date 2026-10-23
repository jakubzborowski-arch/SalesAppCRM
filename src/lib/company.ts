import type { CompanyData, Partner } from "./types";

export function emptyCompany(): CompanyData {
  return { legalName: "", nip: "", regon: "", legalAddress: "", mailingAddress: "", billingEmail: "" };
}

/** Same cyfry. „PL 123-456-78-90” → „1234567890”. */
export function normalizeNip(value: string) {
  return value.replace(/^\s*PL/i, "").replace(/\D/g, "");
}

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

/** NIP: 10 cyfr i poprawna cyfra kontrolna. */
export function isValidNip(value: string) {
  const nip = normalizeNip(value);
  if (!/^\d{10}$/.test(nip)) return false;
  const sum = NIP_WEIGHTS.reduce((acc, w, i) => acc + w * Number(nip[i]), 0);
  const check = sum % 11;
  return check !== 10 && check === Number(nip[9]);
}

export function formatNip(value: string) {
  const nip = normalizeNip(value);
  if (nip.length !== 10) return value.trim();
  return `${nip.slice(0, 3)}-${nip.slice(3, 6)}-${nip.slice(6, 8)}-${nip.slice(8)}`;
}

const REGON9 = [8, 9, 2, 3, 4, 5, 6, 7];
const REGON14 = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8];

/** REGON: 9 albo 14 cyfr z poprawną cyfrą kontrolną. */
export function isValidRegon(value: string) {
  const regon = value.replace(/\D/g, "");
  const weights = regon.length === 9 ? REGON9 : regon.length === 14 ? REGON14 : null;
  if (!weights) return false;
  const sum = weights.reduce((acc, w, i) => acc + w * Number(regon[i]), 0);
  const check = sum % 11 === 10 ? 0 : sum % 11;
  return check === Number(regon[regon.length - 1]);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Błędy formatu (puste pola są OK — to nie jest bramka umowy). */
export function companyErrors(company: CompanyData) {
  const errors: Partial<Record<keyof CompanyData, string>> = {};
  if (company.nip.trim() && !isValidNip(company.nip)) errors.nip = "NIP ma 10 cyfr i poprawną cyfrę kontrolną.";
  if (company.regon.trim() && !isValidRegon(company.regon)) errors.regon = "REGON ma 9 albo 14 cyfr.";
  if (company.billingEmail.trim() && !isValidEmail(company.billingEmail)) errors.billingEmail = "Niepoprawny e-mail.";
  return errors;
}

/** Dane wymagane do umowy, których brakuje na karcie partnera. */
export function companyMissing(company: CompanyData) {
  const missing: string[] = [];
  if (!company.legalName.trim()) missing.push("nazwa firmy");
  if (!isValidNip(company.nip)) missing.push("NIP");
  if (!company.legalAddress.trim()) missing.push("adres siedziby");
  return missing;
}

/** Postać do zapisu: NIP i REGON jako cyfry, reszta przycięta. */
export function cleanCompany(company: CompanyData): CompanyData {
  return {
    legalName: company.legalName.trim(),
    nip: normalizeNip(company.nip),
    regon: company.regon.replace(/\D/g, ""),
    legalAddress: company.legalAddress.trim(),
    mailingAddress: company.mailingAddress.trim(),
    billingEmail: company.billingEmail.trim(),
  };
}

/** Pola umowy uzupełnione z karty partnera — tylko te, które w umowie są puste. */
export function contractFromCompany(
  contract: { companyName: string; nip: string; address: string },
  partner: Pick<Partner, "name" | "address" | "company">,
) {
  const c = partner.company;
  return {
    companyName: contract.companyName.trim() || c.legalName || partner.name,
    nip: contract.nip.trim() || (c.nip ? formatNip(c.nip) : ""),
    address: contract.address.trim() || c.legalAddress || c.mailingAddress || partner.address,
  };
}
