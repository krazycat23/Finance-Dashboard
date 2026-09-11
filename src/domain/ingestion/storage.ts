import type { ImportWorkspace } from "./types";

export interface ImportWorkspaceStore { save(workspace: ImportWorkspace): Promise<void>; load(companyId: string): Promise<ImportWorkspace | undefined>; list(): Promise<ImportWorkspace[]>; }
export class MemoryImportWorkspaceStore implements ImportWorkspaceStore { private readonly values = new Map<string, ImportWorkspace>(); async save(workspace: ImportWorkspace) { this.values.set(workspace.company.id, structuredClone(workspace)); } async load(companyId: string) { const value=this.values.get(companyId); return value && structuredClone(value); } async list() { return [...this.values.values()].map((value)=>structuredClone(value)); } }
/** Browser persistence adapter. Raw data stays in IndexedDB and never leaves the browser. */
export class IndexedDbImportWorkspaceStore implements ImportWorkspaceStore {
  private readonly dbName = "finance-dashboard-imports";
  private async db(): Promise<IDBDatabase> { return new Promise((resolve,reject)=>{const request=indexedDB.open(this.dbName,1);request.onupgradeneeded=()=>request.result.createObjectStore("workspaces",{keyPath:"company.id"});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
  async save(workspace: ImportWorkspace) { const db=await this.db(); await new Promise<void>((resolve,reject)=>{const tx=db.transaction("workspaces","readwrite");tx.objectStore("workspaces").put(workspace);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); }
  async load(companyId: string) { const db=await this.db(); return new Promise<ImportWorkspace|undefined>((resolve,reject)=>{const request=db.transaction("workspaces").objectStore("workspaces").get(companyId);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
  async list() { const db=await this.db(); return new Promise<ImportWorkspace[]>((resolve,reject)=>{const request=db.transaction("workspaces").objectStore("workspaces").getAll();request.onsuccess=()=>resolve(request.result??[]);request.onerror=()=>reject(request.error);}); }
}
