import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const dev = process.env.NODE_ENV !== "production";

/**
 * Adres i klucz publiczny Supabase. Na Vercelu można je podać bez przedrostka (SUPABASE_URL, SUPABASE_ANON_KEY),
 * gdy panel nie pozwala zapisać zmiennej NEXT_PUBLIC_ — wtedy wpisujemy je do strony tutaj, w czasie budowania.
 */
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();

/** Do przeglądarki wolno dać tylko klucz anon / publishable — nigdy service_role / secret. */
function supabaseKeyRole(key: string): string | null {
  if (!key) return null;
  if (key.startsWith("sb_secret_")) return "service_role";
  if (key.startsWith("sb_publishable_")) return "anon";
  const payload = key.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      role?: unknown;
    };
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}
if (supabaseKeyRole(supabaseAnonKey) === "service_role") {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY to klucz service_role (sekretny). Wklej klucz anon / publishable z Supabase → Project Settings → API.",
  );
}
if (supabaseUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
if (supabaseAnonKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey;

/** Adres Supabase z .env (w trybie demo — dowolny projekt *.supabase.co). */
function supabaseOrigins() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return [url.origin, `wss://${url.host}`];
  } catch {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
}

/**
 * Content Security Policy: strona ładuje skrypty tylko z siebie, łączy się tylko z sobą i z Supabase,
 * nie da się jej osadzić w ramce. 'unsafe-inline' dla skryptów jest potrzebne Next.js bez nonce
 * (proxy z nonce = osobny krok); i tak blokujemy skrypty i połączenia z obcych domen.
 */
function contentSecurityPolicy() {
  const supabase = supabaseOrigins();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${supabase[0]}`,
    `connect-src 'self' ${supabase.join(" ")}${dev ? " ws: http://127.0.0.1:* http://localhost:*" : ""}`,
    `frame-src 'self' blob: ${supabase[0]}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Mikrofon tylko dla tej strony (transkrypcja w przeglądarce); reszta wyłączona.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  env: {
    ...(supabaseUrl ? { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl } : {}),
    ...(supabaseAnonKey ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey } : {}),
  },
  turbopack: {
    root: projectRoot,
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
