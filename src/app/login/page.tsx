"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parseInviteToken, rememberInvite, useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { dbStatus, signIn, signUp } = useStore();
  // Kod z linku zaproszenia (`/login?invite=…`). Pokazujemy go dopiero po zamontowaniu.
  const [invite] = useState(() =>
    typeof window === "undefined" ? "" : parseInviteToken(window.location.search),
  );
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Zaproszenie czeka w tej karcie do zalogowania — przyjmie je wczytanie workspace.
    if (invite) rememberInvite(invite);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form after mount avoids password-manager hydration mismatch
    setMounted(true);
  }, [invite]);

  useEffect(() => {
    // Zaproszenie czeka w tej karcie. Po zalogowaniu CRM pokaże je do potwierdzenia.
    if (dbStatus === "ok" || dbStatus === "need-sql") router.replace("/pulpit");
  }, [dbStatus, router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result =
      mode === "signup"
        ? await signUp(email, password, name || email.split("@")[0])
        : await signIn(email, password);
    setPending(false);
    if (!result.ok) setError(result.error ?? "Nie udało się zalogować.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md rounded-[28px] border border-line bg-white p-8">
        <p className="font-brand text-[26px] tracking-tight text-navy">lutra</p>
        <h1 className="mt-3 text-2xl font-semibold">CRM partnerów</h1>
        <p className="mt-2 text-sm text-muted">
          {mode === "signup"
            ? "Załóż konto handlowca. Misje zapiszą się w Twoim projekcie Supabase."
            : "Zaloguj się, żeby wrócić do misji."}
        </p>
        {mounted && invite ? (
          <p className="mt-4 rounded-2xl bg-chip px-4 py-3 text-sm text-navy">
            Masz zaproszenie do zespołu. Załóż konto albo zaloguj się — potem potwierdzisz dołączenie.
          </p>
        ) : null}

        {mounted ? (
        <form className="mt-6 space-y-3" onSubmit={submit}>
          {mode === "signup" ? (
            <input
              className="w-full rounded-2xl border border-chip-mid bg-surface px-4 py-3 text-sm outline-none focus:border-blue"
              placeholder="Imię i nazwisko"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          ) : null}
          <input
            type="email"
            required
            className="w-full rounded-2xl border border-chip-mid bg-surface px-4 py-3 text-sm outline-none focus:border-blue"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            minLength={6}
            className="w-full rounded-2xl border border-chip-mid bg-surface px-4 py-3 text-sm outline-none focus:border-blue"
            placeholder="Hasło (min. 6 znaków)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-lutra py-3 text-sm font-medium text-white hover:bg-lutra-dark disabled:opacity-50"
          >
            {pending ? "Chwila…" : mode === "signup" ? "Utwórz konto" : "Zaloguj"}
          </button>
        </form>
        ) : (
          <div className="mt-6 h-48 rounded-2xl bg-surface" />
        )}

        <button
          type="button"
          className="mt-4 text-sm font-medium text-blue"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError(null);
          }}
        >
          {mode === "signup" ? "Mam już konto" : "Nie mam konta — załóż"}
        </button>

        <p className="mt-6 text-xs leading-5 text-muted-soft">
          Jeśli po rejestracji Supabase wymaga potwierdzenia maila, wyłącz Confirm email w Authentication
          → Providers. To tylko na czas developmentu.
        </p>
      </div>
    </div>
  );
}
