"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  Columns3,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { agenda, agendaCount } from "@/lib/agenda";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/pulpit", label: "Pulpit", icon: LayoutDashboard },
  { href: "/partners", label: "Partnerzy", icon: Users },
  { href: "/tablica", label: "Tablica", icon: Columns3 },
  { href: "/zadania", label: "Zadania", icon: BriefcaseBusiness },
  { href: "/oferty", label: "Oferty", icon: FileText },
  { href: "/raporty", label: "Raporty", icon: BarChart3 },
  { href: "/ustawienia", label: "Ustawienia", icon: Settings },
  { href: "/pomoc", label: "Pomoc", icon: LifeBuoy },
];

/** Zawartość menu: ta sama na komputerze (stała kolumna) i na telefonie (wysuwany panel). */
function SidebarNav({ dueCount, onNavigate }: { dueCount: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { state, authEmail } = useStore();

  return (
    <>
      <p className="px-6 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        Workspace
      </p>
      <nav className="flex flex-col gap-1 px-3">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-chip text-navy"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              <Icon size={18} />
              {item.label}
              {item.href === "/zadania" && dueCount ? (
                <span
                  className="ml-auto rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white"
                  aria-label={`${dueCount} na dziś`}
                >
                  {dueCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 mt-8 rounded-2xl border border-line bg-surface px-4 py-4 text-[12px] leading-5 text-muted">
        Prowadź jedną najpilniejszą misję naraz. Każdy krok pokazuje, czego jeszcze brakuje.
        <Link href="/pomoc" onClick={onNavigate} className="mt-2 block font-semibold text-lutra">
          Jak to działa →
        </Link>
      </div>

      <div className="mt-auto border-t border-line px-5 py-4 text-xs text-muted">
        {state.user.name}
        <div className="mt-0.5 text-[11px]">{state.user.role} · {state.workspace.name}</div>
        {authEmail ? (
          <div className="mt-0.5 truncate text-[11px] text-muted-soft">{authEmail}</div>
        ) : null}
      </div>
    </>
  );
}

/**
 * Poniżej `lg`: górny pasek (logo, licznik „na dziś”, przycisk Menu) i wysuwany panel z pełnym menu.
 * Panel zamyka się po przejściu na inną stronę, kliknięciu w tło i klawiszem Escape.
 */
function MobileNav({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();
  // Panel jest otwarty tylko na stronie, na której go otwarto — zmiana adresu zamyka go sama.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenAt(null);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpenAt(null);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6 lg:hidden">
        <Link href="/pulpit" className="font-brand text-[24px] tracking-tight text-navy">
          lutra
        </Link>
        <div className="flex items-center gap-2">
          {dueCount ? (
            <Link
              href="/zadania"
              className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white"
              aria-label={`${dueCount} na dziś`}
            >
              {dueCount}
            </Link>
          ) : null}
          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpenAt(pathname)}
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="flex h-10 w-10 items-center justify-center rounded-full text-navy hover:bg-surface"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" aria-hidden onClick={close} />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="relative flex h-full w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-white pb-6 shadow-[12px_0_48px_rgba(9,12,155,0.18)]"
          >
            <div className="flex items-center justify-between px-6 pb-4 pt-5">
              <Link href="/pulpit" onClick={close} className="font-brand text-[26px] tracking-tight text-navy">
                lutra
              </Link>
              <button
                ref={closeButton}
                type="button"
                onClick={() => {
                  close();
                  menuButton.current?.focus();
                }}
                aria-label="Zamknij menu"
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>
            <SidebarNav dueCount={dueCount} onNavigate={close} />
          </div>
        </div>
      ) : null}
    </>
  );
}

export function Sidebar() {
  const { state } = useStore();
  const dueCount = useMemo(() => agendaCount(agenda(state)), [state]);

  return (
    <>
      <aside className="hidden h-full w-[232px] shrink-0 flex-col border-r border-line bg-white pb-16 lg:flex">
        <div className="px-6 pb-4 pt-6">
          <Link href="/pulpit" className="font-brand text-[26px] tracking-tight text-navy">
            lutra
          </Link>
        </div>
        <SidebarNav dueCount={dueCount} />
      </aside>
      <MobileNav dueCount={dueCount} />
    </>
  );
}
