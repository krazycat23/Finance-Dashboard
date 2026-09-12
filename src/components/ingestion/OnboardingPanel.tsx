import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Upload } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { buildImportedDataset, stageLocalFile, suggestFieldMappings, type ImportWorkspace, type IngestionCompany } from "@/domain/ingestion";
import { useReportingDataController } from "@/app/providers/ReportingDataProvider";
import { HierarchyRoleReview } from "./HierarchyRoleReview";
import { DatasetReview } from "./DatasetReview";
import { restageWorkspaceRange, updateWorkspaceHierarchyRoles } from "./reviewState";
import { ActivationReview, activationBlockers } from "./ActivationReview";

const makeCompany=():IngestionCompany=>({id:crypto.randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),profile:{companyName:"New company",shortName:"New company",reportingCurrency:"AUD",currencySymbol:"$",locale:"en-AU",defaultScale:"millions",fiscalCalendar:{periodicity:"monthly",fiscalYearStartMonth:1,fiscalYearLabel:"endYear"}}});
const emptyWorkspace=(company:IngestionCompany):ImportWorkspace=>({company,sources:[],datasets:[],mappings:[],rules:[],hierarchyRoles:[],customDimensions:[],scenarios:[],calendar:{fiscalYearStartMonth:1,fiscalYearLabel:"endYear"},issues:[],reconciliations:[]});

export function OnboardingPanel(){
  const {activateWorkspace,activateDefaultDataset,workspace:activeWorkspace,store,companies,refreshCompanies}=useReportingDataController();
  const navigate=useNavigate();
  const initial=companies.find(item=>item.company.id===activeWorkspace?.company.id)??activeWorkspace??companies.at(-1);
  const [company,setCompany]=useState(()=>initial?.company??makeCompany());
  const [workspace,setWorkspace]=useState<ImportWorkspace>(()=>initial??emptyWorkspace(company));
  const [error,setError]=useState<string>();
  const [busy,setBusy]=useState(false);
  const saved=companies;
  useEffect(()=>{void store.save({...workspace,company}).then(refreshCompanies).catch(cause=>setError(String(cause)));},[workspace,company,store]);
  const result=useMemo(()=>buildImportedDataset({...workspace,company}),[workspace,company]);
  const upload=async(files:FileList|null)=>{if(!files)return;const staged=await Promise.all([...files].map(file=>stageLocalFile(company.id,file)));setWorkspace(w=>({...w,sources:[...w.sources,...staged.map(x=>x.source)],datasets:[...w.datasets,...staged.flatMap(x=>x.datasets)],mappings:[...w.mappings,...staged.flatMap(x=>x.datasets.flatMap(d=>suggestFieldMappings(d.id,d.columns.map(c=>c.name))))]}));};
  const changeRange=(datasetId:string,field:"headerRow"|"startRow"|"endRow"|"startColumn"|"endColumn",value:number)=>setWorkspace(w=>restageWorkspaceRange(w,datasetId,field,value));
  const blockers=result.issues.filter(issue=>issue.severity==="error");
  return <Panel><PanelHeader title="Company onboarding" meta="Local staging · review · validation · activation"/><PanelBody>
    <div className="mb-4 flex flex-wrap items-end gap-3"><label className="text-[11px] text-secondary">Company<input className="mt-1 block h-8 w-48 rounded border border-subtle bg-canvas px-2 text-primary" value={company.profile.companyName} onChange={e=>setCompany({...company,profile:{...company.profile,companyName:e.target.value,shortName:e.target.value}})}/></label><label className="inline-flex h-8 items-center gap-2 rounded border border-subtle px-3 text-[12px] text-secondary cursor-pointer"><Upload size={14}/> Upload CSV / XLSX<input className="hidden" type="file" accept=".csv,.xlsx,.xls" multiple onChange={e=>void upload(e.target.files)}/></label><button className="h-8 rounded border border-subtle px-3 text-[12px]" onClick={()=>{const fresh=makeCompany();setCompany(fresh);setWorkspace(emptyWorkspace(fresh));}}>New company</button></div>
    {saved.length>0&&<div className="mb-3 text-[12px] text-secondary">Reopen workspace: {saved.map(item=><button key={item.company.id} className="ml-2 rounded border border-subtle px-2 py-1" onClick={()=>{void store.load(item.company.id).then(latest=>{if(latest){setCompany(latest.company);setWorkspace(latest);}}).catch(cause=>setError(String(cause)));}}>{item.company.profile.companyName}{item.activatedDataset?" · Activated":" · Draft"}</button>)}</div>}
    <div className="mb-3 grid gap-2 text-[12px] md:grid-cols-3"><div className="rounded border border-subtle p-2">{workspace.sources.length} files · {workspace.datasets.length} datasets</div><div className="rounded border border-subtle p-2">{workspace.mappings.filter(m=>m.status==="mapped").length} confirmed field mappings</div><div className="rounded border border-subtle p-2"><Badge tone={blockers.length?"negative":"positive"}>{blockers.length?`${blockers.length} blocking`:"Ready"}</Badge> · {result.reconciliations.length} checks</div></div>
    {workspace.datasets.map(dataset=><div id={`review-${dataset.id}`} key={dataset.id}><DatasetReview dataset={dataset} workspace={workspace} onChange={setWorkspace} onRangeChange={(field,value)=>changeRange(dataset.id,field,value)}/></div>)}
    {workspace.datasets.some(d=>d.wideUnpivot)&&<div className="mb-3 rounded border border-subtle p-3 text-[12px]">Wide-table identifier/value selection is retained in workspace configuration.</div>}
    <div id="hierarchy-review"><HierarchyRoleReview workspace={workspace} onChange={hierarchyRoles=>setWorkspace(current=>updateWorkspaceHierarchyRoles(current,hierarchyRoles))}/></div>
    <ActivationReview workspace={{...workspace,company}} result={result}/>
    {blockers.length>0&&<div className="mt-3 rounded border border-negative p-3 text-[12px] text-negative">{blockers.map(issue=><div key={issue.id}>{issue.message}</div>)}</div>}
    {error&&<p role="alert" className="mt-3 text-xs text-negative">{error}</p>}
    <div className="mt-4 flex gap-2"><button className="h-8 rounded bg-accent px-3 text-[12px] text-white disabled:opacity-40" disabled={busy||activationBlockers(result).length>0} onClick={()=>{setBusy(true);void activateWorkspace({...workspace,company}).then(()=>navigate("/")).catch(cause=>setError(String(cause))).finally(()=>setBusy(false));}}><CheckCircle2 className="mr-1 inline" size={14}/>Activate reporting dataset</button><button className="h-8 rounded border border-subtle px-3 text-[12px]" onClick={()=>void activateDefaultDataset().catch(cause=>setError(String(cause)))}>Switch to demo</button></div>
  </PanelBody></Panel>;
}
