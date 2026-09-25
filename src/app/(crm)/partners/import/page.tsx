"use client";

import { CsvImport } from "@/components/partners/csv-import";
import { useStore } from "@/lib/store";

export default function PartnerImportPage() {
  const { state } = useStore();

  return (
    <div>
      <div className="flex items-center justify-end px-8 py-6 text-sm text-muted">
        CRM / Partnerzy / Import · {state.user.initials}
      </div>
      <div className="px-8 pb-12">
        <CsvImport />
      </div>
    </div>
  );
}
