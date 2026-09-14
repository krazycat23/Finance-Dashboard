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
  const { dataset, workspace, companies, switchCompany } = useReportingDataController();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const options = [
    { value: "demo", label: "Northpoint Demo" },
    ...companies
      .filter((company) => company.activatedDataset && company.activationSchemaVersion === 1)
      .map((company) => ({
        value: company.company.id,
        label: company.company.profile.companyName,
      })),
  ];

  return (
    <div className="flex items-end gap-3 min-w-0">
      <Select
        label="Reporting company"
        value={workspace?.company.id ?? "demo"}
        options={options}
        width="w-[196px]"
        disabled={busy}
        onChange={(value) => {
          setBusy(true);
          void switchCompany(value)
            .catch((cause) => setError(String(cause)))
            .finally(() => setBusy(false));
        }}
      />
      <span className="type-caption pb-[7px] whitespace-nowrap">
        {dataset.profile.reportingCurrency} · {dataset.profile.companyName}
      </span>
      {error && (
        <span role="alert" className="type-caption pb-[7px] text-negative">
          {error}
        </span>
      )}
    </div>
  );
}
