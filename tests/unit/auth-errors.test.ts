import { describe, expect, it } from "vitest";
import { authErrorText } from "@/lib/store";

describe("komunikaty logowania po polsku", () => {
  it("tłumaczy typowe błędy Supabase Auth, zostawia komunikat hooka", () => {
    expect(authErrorText("Signups not allowed for this instance")).toMatch(/Allow new users to sign up/);
    expect(authErrorText("Invalid login credentials")).toBe("Nieprawidłowy e-mail albo hasło.");
    expect(authErrorText("Email not confirmed")).toMatch(/potwierdź adres/);
    expect(authErrorText("Konto w tym CRM zakłada się z linku zaproszenia do zespołu.")).toMatch(/zaproszenia/);
    expect(authErrorText("Coś innego")).toBe("Coś innego");
  });
});
