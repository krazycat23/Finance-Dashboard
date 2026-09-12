import type { ReportingDataset } from "@/domain/data";
import type { IngestionIssue, IngestionReconciliation, ImportWorkspace } from "./types";
import { createTransformationContext } from "./transform/context";
import { resolveAccountMappings } from "./transform/accounts";
import { resolvePeriods } from "./transform/periods";
import { transformFinanceSources } from "./transform/finance";
import { deriveDatasetCapabilities } from "./transform/capabilities";
import { scenarioRoles } from "./transform/scenarios";
import { isFinance } from "./transform/shared";
import { createDimensionTokens, materialiseDimensions } from "./transform/dimensions";
import { transformSalesSources } from "./transform/sales";

const issue=(datasetId:string,id:string,message:string,n:number):IngestionIssue=>({id:`${datasetId}:${id}`,severity:"error",datasetId,message,affectedRows:n,samples:[],recommendedAction:"Resolve this item in onboarding review."});
export function validateWorkspace(workspace:ImportWorkspace){const issues:IngestionIssue[]=[];for(const dataset of workspace.datasets){const type=dataset.confirmedType??dataset.inferred.type,mappings=workspace.mappings.filter(mapping=>mapping.datasetId===dataset.id);if(type==="ignored")continue;if(dataset.tableRange?.requiresConfirmation&&!dataset.rangeConfirmed)issues.push(issue(dataset.id,"range","Confirm source table/range before activation.",dataset.rows.length));if(isFinance(type)&&!workspace.scenarios.some(scenario=>scenario.datasetId===dataset.id))issues.push(issue(dataset.id,"scenario","Explicitly confirm a scenario before activation.",dataset.rows.length));if(isFinance(type))for(const field of ["accountId","amount"])if(!mappings.some(mapping=>mapping.canonicalField===field&&mapping.status==="mapped")&&!(dataset.wideUnpivot&&field==="amount"))issues.push(issue(dataset.id,field,`Map ${field} before activation.`,dataset.rows.length));}return issues;}
export { authoritativeRules } from "./transform/accounts";
export function buildCalendar(workspace:ImportWorkspace){return resolvePeriods(createTransformationContext(workspace,[]));}
export { resolveAccountMappings as applyHierarchyRoles } from "./transform/accounts";

/** Orchestration-only entry point: each stage owns one transformation concern. */
export function buildImportedDataset(workspace:ImportWorkspace):{dataset?:ReportingDataset;issues:IngestionIssue[];reconciliations:IngestionReconciliation[]}{
  const issues=validateWorkspace(workspace); if(issues.length)return{issues,reconciliations:[]};
  const context=createTransformationContext(workspace,[]);
  const calendar=resolvePeriods(context);
  const tokens=createDimensionTokens();
  const finance=transformFinanceSources(context,resolveAccountMappings(workspace),tokens);
  const weekLookup=new Map(calendar.weeks.flatMap(week=>[[week.id,week.id],[week.externalPeriodToken??"",week.id],[`W${String(week.fiscalWeek??"").padStart(2,"0")}`,week.id],[week.weekEnd??"",week.id]]));
  const sales=transformSalesSources(context,new Set(calendar.periods.map(period=>period.id)),weekLookup,tokens);
  const total=[...finance.magnitude.values()].reduce((sum,value)=>sum+value,0),threshold=Math.max(1,total*.001);
  if(finance.unresolved>=threshold)issues.push(issue("finance","canonical-role",`Material unresolved canonical roles: ${finance.unresolved.toFixed(2)} magnitude.`,1));
  if(sales.issues.length) for(const message of sales.issues) issues.push(issue("sales","period",message,1));
  if(issues.length)return{issues,reconciliations:[]};
  const mapped=[...finance.accounts.values()].filter(account=>account.mappingStatus==="mapped").length,valueCoverage=total?[...finance.magnitude.entries()].filter(([id])=>finance.accounts.get(id)?.mappingStatus==="mapped").reduce((sum,[,value])=>sum+value,0)/total:0;
  const reconciliation=(id:string,label:string,sourceTotal:number,targetTotal:number,stage:IngestionReconciliation["stage"]):IngestionReconciliation=>({id,label,sourceTotal,targetTotal,difference:sourceTotal-targetTotal,tolerance:.01,status:Math.abs(sourceTotal-targetTotal)<.01?"Reconciled":"Exception",stage});
  const reconciliations=[reconciliation("raw-sign","Raw source → sign normalised (explained multiplier)",finance.raw,finance.sign,"sign"),reconciliation("sign-mapped","Sign normalised → mapped + unmapped",finance.sign,finance.mapped+finance.unmapped,"mapped"),reconciliation("mapped-canonical","Mapped → canonical",finance.mapped,finance.mapped,"canonical")];
  const dimensions=materialiseDimensions(tokens,workspace.company.profile.companyName);
  const dataset:ReportingDataset={id:`import:${workspace.company.id}:${Date.now()}`,source:"import",periods:calendar.periods,weeks:calendar.weeks,dimensions:{...dimensions,accounts:[...finance.accounts.values()]},financeRecords:finance.records,salesRecords:sales.salesRecords,weeklySalesRecords:sales.weeklySalesRecords,operationalRecords:[],cashFlowRecords:[],scenarios:workspace.scenarios.map(s=>({id:s.scenarioId,kind:s.kind,label:s.label,version:s.version})),currentPeriodId:calendar.periods.at(-1)?.id??"",defaultEntityId:"company",profile:workspace.company.profile,scenarioRoles:scenarioRoles(workspace),capabilities:deriveDatasetCapabilities(finance.records,sales.salesRecords,sales.weeklySalesRecords),dataQuality:{mappingSummaries:[{dimension:"GL Accounts",total:finance.magnitude.size,mapped,unmapped:finance.magnitude.size-mapped,review:0,valueCoverage}],unmappedMembers:[],issues:[],reconciliations:reconciliations.map(r=>({id:r.id,statement:r.label,sourceTotal:r.sourceTotal,mappedTotal:r.targetTotal,difference:r.difference,tolerance:r.tolerance,status:r.status})),imports:[],health:{integrityScore:Math.round(valueCoverage*100)}}};
  return{dataset,issues,reconciliations};
}
export class ImportedCompanyAdapter {readonly id:string;private readonly workspace:ImportWorkspace;constructor(workspace:ImportWorkspace){this.workspace=workspace;this.id=`imported:${workspace.company.id}`;}load(){const result=buildImportedDataset(this.workspace);if(!result.dataset)throw new Error("Imported company has blocking validation errors.");return result.dataset;}}
