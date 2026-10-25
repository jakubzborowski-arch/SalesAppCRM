import { cn } from "@/lib/cn";
import { HEALTH_LABEL, type PartnerHealth } from "@/lib/health";

const TONE: Record<PartnerHealth["level"], { box: string; dot: string }> = {
  green: { box: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  yellow: { box: "bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  red: { box: "bg-rose-50 text-rose-800", dot: "bg-rose-500" },
  unknown: { box: "bg-surface text-muted", dot: "bg-chip-mid" },
};

/** Wskaźnik zdrowia partnera: kolor + krótki powód (w wersji `compact` powód w podpowiedzi). */
export function HealthBadge({ health, compact = false, className }: { health: PartnerHealth; compact?: boolean; className?: string }) {
  const tone = TONE[health.level];
  return (
    <span
      title={`Zdrowie partnera: ${HEALTH_LABEL[health.level]}. ${health.reason}`}
      data-health={health.level}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold normal-case tracking-normal",
        tone.box,
        className,
      )}
    >
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
      <span className="truncate">
        {HEALTH_LABEL[health.level]}
        {compact ? "" : ` · ${health.reason}`}
      </span>
    </span>
  );
}
