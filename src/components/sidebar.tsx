"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  Columns3,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useMemo } from "react";
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
];

export function Sidebar() {
  const pathname = usePathname();
  const { state, authEmail } = useStore();
  const dueCount = useMemo(() => agendaCount(agenda(state)), [state]);

  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col border-r border-line bg-white">
      <div className="px-6 pb-4 pt-6">
        <Link href="/pulpit" className="font-brand text-[26px] tracking-tight text-navy">
          lutra
        </Link>
      </div>

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
        Tryb prowadzenia CRM pomaga handlowcowi prowadzić tylko jedną najpilniejszą misję naraz.
      </div>

      <div className="mt-auto border-t border-line px-5 py-4 text-xs text-muted">
        {state.user.name}
        <div className="mt-0.5 text-[11px]">{state.user.role} · {state.workspace.name}</div>
        {authEmail ? (
          <div className="mt-0.5 truncate text-[11px] text-muted-soft">{authEmail}</div>
        ) : null}
      </div>
    </aside>
  );
}
