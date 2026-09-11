import { useMemo, useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { stageLocalFile, suggestFieldMappings, buildImportedDataset, type ImportWorkspace, type IngestionCompany } from "@/domain/ingestion";
import { useReportingDataController } from "@/app/providers/ReportingDataProvider";

const makeCompany = (): IngestionCompany => ({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), profile: { companyName: "New company", shortName: "New company", reportingCurrency: "AUD", currencySymbol: "$", locale: "en-AU", defaultScale: "millions", fiscalCalendar: { periodicity: "monthly", fiscalYearStartMonth: 1, fiscalYearLabel: "endYear" } } });

export function OnboardingPanel() {
  const { activateDataset, activateDefaultDataset } = useReportingDataController();
  const [company, setCompany] = useState<IngestionCompany>(makeCompany);
  const [workspace, setWorkspace] = useState<ImportWorkspace>({ company, sources: [], datasets: [], mappings: [], rules: [], customDimensions: [], scenarios: [], calendar: { fiscalYearStartMonth: 1, fiscalYearLabel: "endYear" }, issues: [], reconciliations: [] });
  const result = useMemo(() => buildImportedDataset({ ...workspace, company }), [workspace, company]);
  const upload = async (files: FileList | null) => { if (!files) return; const staged = await Promise.all([...files].map((file) => stageLocalFile(company.id, file))); setWorkspace((current) => ({ ...current, sources: [...current.sources, ...staged.map((item) => item.source)], datasets: [...current.datasets, ...staged.flatMap((item) => item.datasets)], mappings: [...current.mappings, ...staged.flatMap((item) => item.datasets.flatMap((dataset) => suggestFieldMappings(dataset.id, dataset.columns.map((column) => column.name))))] })); };
  const blocking = result.issues.filter((issue) => issue.severity === "error").length;
  const canActivate = workspace.datasets.length > 0 && !!result.dataset && blocking === 0;
  return <Panel>
    <PanelHeader title="Company onboarding" meta="Local-only staging → mapping → validation → reporting dataset" />
    <PanelBody>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-[11px] text-secondary">Company name<input className="mt-1 block h-8 w-48 rounded border border-subtle bg-canvas px-2 text-primary" value={company.profile.companyName} onChange={(event) => setCompany({ ...company, profile: { ...company.profile, companyName: event.target.value, shortName: event.target.value } })} /></label>
        <label className="text-[11px] text-secondary">Currency<input className="mt-1 block h-8 w-20 rounded border border-subtle bg-canvas px-2 text-primary" value={company.profile.reportingCurrency} onChange={(event) => setCompany({ ...company, profile: { ...company.profile, reportingCurrency: event.target.value } })} /></label>
        <label className="text-[11px] text-secondary">Fiscal year starts<input type="number" min="1" max="12" className="mt-1 block h-8 w-20 rounded border border-subtle bg-canvas px-2 text-primary" value={company.profile.fiscalCalendar.fiscalYearStartMonth} onChange={(event) => setCompany({ ...company, profile: { ...company.profile, fiscalCalendar: { ...company.profile.fiscalCalendar, fiscalYearStartMonth: Number(event.target.value) } } })} /></label>
        <label className="inline-flex h-8 items-center gap-2 rounded border border-subtle px-3 text-[12px] text-secondary cursor-pointer"><Upload size={14}/> Upload CSV / XLSX<input className="hidden" type="file" accept=".csv,.xlsx,.xls" multiple onChange={(event) => void upload(event.target.files)} /></label>
      </div>
      <div className="grid grid-cols-1 gap-2 text-[12px] md:grid-cols-3">
        <div className="rounded border border-subtle p-3"><div className="eyebrow">1 Upload</div><div className="mt-1 text-primary">{workspace.sources.length} files · {workspace.datasets.length} datasets</div></div>
        <div className="rounded border border-subtle p-3"><div className="eyebrow">2 Classify & map</div><div className="mt-1 text-primary">{workspace.datasets.filter((dataset) => dataset.inferred.type !== "unknown").length} classified · {workspace.mappings.filter((mapping) => mapping.status === "mapped").length} mapped</div></div>
        <div className="rounded border border-subtle p-3"><div className="eyebrow">3 Validate & activate</div><div className="mt-1 flex items-center gap-2 text-primary"><Badge tone={blocking ? "negative" : "positive"}>{blocking ? `${blocking} blocking` : "Ready"}</Badge>{result.reconciliations.length} reconciliations</div></div>
      </div>
      {workspace.datasets.length > 0 && <div className="mt-4 space-y-1">{workspace.datasets.map((dataset) => <div key={dataset.id} className="flex items-center justify-between text-[12px] text-secondary"><span>{dataset.sourceSheet} · {dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns</span><span><Badge tone={dataset.inferred.type === "unknown" ? "caution" : "neutral"}>{dataset.inferred.type} · {Math.round(dataset.inferred.confidence * 100)}%</Badge></span></div>)}</div>}
      <div className="mt-4 flex items-center gap-3"><button className="h-8 rounded bg-accent px-3 text-[12px] font-medium text-white disabled:opacity-40" disabled={!canActivate} onClick={() => result.dataset && activateDataset(result.dataset)}>Activate reporting dataset</button><button className="h-8 rounded border border-subtle px-3 text-[12px] text-secondary" onClick={activateDefaultDataset}>Switch to demo dataset</button>{canActivate && <span className="inline-flex items-center gap-1 text-[12px] text-positive"><CheckCircle2 size={14}/> Ready to activate</span>}</div>
    </PanelBody>
  </Panel>;
}
