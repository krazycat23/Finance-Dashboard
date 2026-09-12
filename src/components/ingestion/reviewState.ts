import { restageDatasetRange, statementLineForRole, suggestFieldMappings, type CanonicalField, type HierarchyRoleMapping, type ImportWorkspace } from "@/domain/ingestion";

export type EditableRangeField="headerRow"|"startRow"|"endRow"|"startColumn"|"endColumn";
export function restageWorkspaceRange(workspace:ImportWorkspace,datasetId:string,field:EditableRangeField,value:number):ImportWorkspace{
  const prior=workspace.datasets.find(dataset=>dataset.id===datasetId); if(!prior?.tableRange)return workspace;
  const rebuilt=restageDatasetRange(prior,{...prior.tableRange,[field]:value,requiresConfirmation:true});
  const names=new Set(rebuilt.columns.map(column=>column.name)); const existing=workspace.mappings.filter(mapping=>mapping.datasetId===datasetId);
  const surviving=existing.filter(mapping=>names.has(mapping.sourceColumn));
  const suggestions=suggestFieldMappings(datasetId,rebuilt.columns.map(column=>column.name)).filter(mapping=>!surviving.some(item=>item.sourceColumn===mapping.sourceColumn));
  const removed=existing.filter(mapping=>!names.has(mapping.sourceColumn)).map(mapping=>({...mapping,status:"review" as const}));
  return {...workspace,datasets:workspace.datasets.map(dataset=>dataset.id===datasetId?{...rebuilt,rangeConfirmed:false}:dataset),mappings:[...workspace.mappings.filter(mapping=>mapping.datasetId!==datasetId),...surviving,...removed,...suggestions]};
}
export function updateWorkspaceFieldMapping(workspace:ImportWorkspace,id:string,canonicalField:CanonicalField):ImportWorkspace{return{...workspace,mappings:workspace.mappings.map(mapping=>mapping.id===id?{...mapping,canonicalField,status:canonicalField==="ignore"?"ignored":"mapped"}:mapping)}};
export function updateWorkspaceHierarchyRoles(workspace:ImportWorkspace,roles:HierarchyRoleMapping[]):ImportWorkspace{return{...workspace,hierarchyRoles:roles};}
export function setHierarchyNodeRole(roles:HierarchyRoleMapping[],companyId:string,node:{p1?:string;p2?:string;p3?:string},role:string):HierarchyRoleMapping[]{const id=`${node.p1??""}|${node.p2??""}|${node.p3??""}`;const retained=roles.filter(mapping=>`${mapping.p1??""}|${mapping.p2??""}|${mapping.p3??""}`!==id);if(!role)return retained;return [...retained,{id:`hierarchy:${id}`,companyId,p1:node.p1,p2:node.p2,p3:node.p3,calculationRole:role as HierarchyRoleMapping["calculationRole"],line:statementLineForRole(role),status:"Manually Confirmed",provenance:"hierarchy_node"}];}
