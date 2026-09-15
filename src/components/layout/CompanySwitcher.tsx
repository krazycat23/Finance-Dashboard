import { useState } from "react";
import { useReportingDataController } from "@/app/providers/ReportingDataProvider";
import { Select } from "@/components/ui/Select";

/**
 * COMPANY SWITCHER
 * ---------------------------------------------------------------------------
 * Presentation only: the switch itself is still the controller's `switchCompany`,
 * and the option set is still "demo plus every activated company at the current
 * activation schema version".
 */
export function CompanySwitcher() {
  const { workspace, companies, switchCompany, defaultCompanyLabel } = useReportingDataController();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const options = [
    // Named by the active adapter, not by the demo configuration: the built-in
    // option is whatever company the adapter actually supplies.
    { value: "demo", label: defaultCompanyLabel },
    ...companies
      .filter((company) => company.activatedDataset && company.activationSchemaVersion === 1)
      .map((company) => ({
        value: company.company.id,
        label: company.company.profile.companyName,
      })),
  ];

  return (
    <div className="flex items-center gap-3 min-w-0 shrink-0">
      <Select
        variant="chip"
        label="Reporting company"
        displayLabel="Company"
        value={workspace?.company.id ?? "demo"}
        options={options}
        disabled={busy}
        onChange={(value) => {
          setBusy(true);
          void switchCompany(value)
            .catch((cause) => setError(String(cause)))
            .finally(() => setBusy(false));
        }}
      />
      {error && (
        <span role="alert" className="type-caption text-negative">
          {error}
        </span>
      )}
    </div>
  );
}
