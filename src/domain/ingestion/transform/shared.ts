import type { FieldMapping, StagedDataset } from "../types";
import { unpivotWideRows } from "../tableDetection";

export const text=(v:unknown)=>v==null?"":String(v).trim();
export const amount=(v:unknown)=>{const n=Number(String(v??"").replace(/[$,]/g,"").replace(/^\((.*)\)$/,"-$1"));return Number.isFinite(n)?n:NaN;};
export const key=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,"");
export const cell=(r:Record<string,unknown>,name:string)=>r[Object.keys(r).find(k=>key(k)===key(name))??""];
export const isFinance=(type:string)=>["finance_actual","budget","forecast"].includes(type);
export const prepareDatasetRows=(dataset:StagedDataset)=>dataset.wideUnpivot?unpivotWideRows(dataset.rows,dataset.wideUnpivot):[...dataset.rows];
export const fieldValue=(row:Record<string,unknown>, mappings:FieldMapping[], field:string)=>{const column=mappings.find(mapping=>mapping.canonicalField===field&&mapping.status!=="ignored")?.sourceColumn;return column?row[column]:(field==="period"?row.period:undefined);};
