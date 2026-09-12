import { useState } from "react";
import { useReportingDataController } from "@/app/providers/ReportingDataProvider";

export function CompanySwitcher() {
  const { dataset, workspace, companies, switchCompany } = useReportingDataController();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return <div className="mb-5 flex flex-wrap items-center gap-3 text-xs text-secondary">
    <label>Reporting company <select aria-label="Reporting company" className="ml-2 rounded border border-subtle bg-canvas p-2" disabled={busy} value={workspace?.company.id ?? "demo"} onChange={event => { setBusy(true); void switchCompany(event.target.value).catch(cause => setError(String(cause))).finally(() => setBusy(false)); }}>
      <option value="demo">Northpoint Demo</option>
      {companies.filter(company => company.activatedDataset && company.activationSchemaVersion === 1).map(company => <option key={company.company.id} value={company.company.id}>{company.company.profile.companyName}</option>)}
    </select></label><span>{dataset.profile.reportingCurrency} · {dataset.profile.companyName}</span>
    {error && <span role="alert" className="text-negative">{error}</span>}
  </div>;
}
