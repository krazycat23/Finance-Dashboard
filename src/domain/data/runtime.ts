import type { ReportingDataAdapter, ReportingDataset } from "./reportingDataset";
import { setReportingDataset } from "./service";
import { buildImportedDataset } from "@/domain/ingestion/transform";
import type { ImportWorkspace } from "@/domain/ingestion/types";
import type { ImportWorkspaceStore } from "@/domain/ingestion/storage";

export interface ReportingRuntimeState { dataset: ReportingDataset; workspace?: ImportWorkspace; revision: number; }
export function activationBlockers(result: ReturnType<typeof buildImportedDataset>): string[] {
  const blockers = result.issues.filter(issue => issue.severity === "error").map(issue => issue.message);
  if (result.dataset) {
    if (!result.dataset.periods.some(period => period.id === result.dataset?.currentPeriodId)) blockers.push("Configure a valid monthly reporting period before activation.");
    if (!result.dataset.dimensions.entities.some(entity => entity.id === result.dataset?.defaultEntityId)) blockers.push("Configure a valid reporting entity before activation.");
  } else if (!blockers.length) blockers.push("No reporting dataset is available for activation.");
  return blockers;
}

/** Shared by the React provider and lifecycle verification; no alternate test activation path. */
/**
 * Resolve an adapter's dataset, giving it the chance to fetch its own sources
 * first. Both call sites are already asynchronous, so this costs nothing and
 * keeps `load` synchronous for adapters that need no preparation.
 */
async function loadAdapterDataset(adapter: ReportingDataAdapter): Promise<ReportingDataset> {
  const prepare = (adapter as { prepare?: () => Promise<unknown> }).prepare;
  const input = typeof prepare === "function" ? await prepare.call(adapter) : undefined;
  return (adapter as { load: (input?: unknown) => ReportingDataset }).load(input);
}

export class ReportingRuntime {
  private revision = 0;
  readonly store: ImportWorkspaceStore;
  private readonly demo: ReportingDataAdapter;
  constructor(store: ImportWorkspaceStore, demo: ReportingDataAdapter) { this.store = store; this.demo = demo; }
  private publish(dataset: ReportingDataset, workspace?: ImportWorkspace): ReportingRuntimeState {
    setReportingDataset(dataset);
    return { dataset, workspace, revision: ++this.revision };
  }
  async restore(): Promise<ReportingRuntimeState> {
    const active = await this.store.getActiveCompany();
    if (active && active !== "demo") return this.switchCompany(active);
    return this.publish(await loadAdapterDataset(this.demo));
  }
  async activate(workspace: ImportWorkspace): Promise<ReportingRuntimeState> {
    const result = buildImportedDataset(workspace);
    const blockers = activationBlockers(result);
    if (!result.dataset || blockers.length) throw new Error(blockers.join("\n") || "Activation is blocked.");
    const dataset = result.dataset;
    const saved: ImportWorkspace = { ...workspace, activatedDataset: dataset, activationSchemaVersion: 1 };
    await this.store.save(saved);
    await this.store.setActiveCompany(saved.company.id);
    return this.publish(dataset, saved);
  }
  async switchCompany(id: string): Promise<ReportingRuntimeState> {
    if (id === "demo") { await this.store.setActiveCompany("demo"); return this.publish(await loadAdapterDataset(this.demo)); }
    const workspace = await this.store.load(id);
    if (!workspace?.activatedDataset) throw new Error("This company has no activated dataset. Complete its onboarding review first.");
    if (workspace.activationSchemaVersion !== 1) throw new Error("This saved activation needs review and reactivation before it can be reopened.");
    await this.store.setActiveCompany(id);
    return this.publish(workspace.activatedDataset, workspace);
  }
}
