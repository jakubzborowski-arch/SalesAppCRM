"use client";

import { CsvImport } from "@/components/partners/csv-import";
import { useStore } from "@/lib/store";

export default function PartnerImportPage() {
  const { state } = useStore();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end px-4 py-4 text-sm text-muted sm:px-6 lg:px-8 lg:py-6">
        CRM / Partnerzy / Import · {state.user.initials}
      </div>
      <div className="px-4 pb-12 sm:px-6 lg:px-8">
        <CsvImport />
      </div>
    </div>
  );
}
