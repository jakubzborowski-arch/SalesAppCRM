"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { SetupBanner } from "@/components/setup-banner";
import { useStore } from "@/lib/store";

export default function CrmLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { dbStatus, ready } = useStore();

  useEffect(() => {
    if (dbStatus === "need-login") router.replace("/login");
  }, [dbStatus, router]);

  if (!ready || dbStatus === "loading" || dbStatus === "need-login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-muted">
        Łączenie z workspace…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <SetupBanner />
        {children}
      </div>
    </div>
  );
}
