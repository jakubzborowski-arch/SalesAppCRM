"use client";

import { use } from "react";
import { MissionShell } from "@/components/mission/mission-shell";

export default function MissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <MissionShell partnerId={id} />;
}
