import { CheckRow } from "@/components/ui";
import { PARTNER_PRIORITIES } from "@/lib/partner-priority";

export function PriorityChecks({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {PARTNER_PRIORITIES.map((item) => (
        <CheckRow
          key={item}
          checked={value === item}
          label={item}
          onChange={() => onChange(value === item ? "" : item)}
        />
      ))}
    </div>
  );
}
