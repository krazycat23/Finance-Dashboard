import type { ImportWorkspace, MappingRule, StagedDataset } from "../types";

/** Immutable, typed inputs shared by all ingestion transformation stages. */
export interface ImportTransformationContext {
  workspace: ImportWorkspace;
  datasets: readonly StagedDataset[];
  financeDatasets: readonly StagedDataset[];
  mappingRules: readonly MappingRule[];
}

export function createTransformationContext(workspace: ImportWorkspace, mappingRules: MappingRule[]): ImportTransformationContext {
  const datasets = workspace.datasets.filter(dataset => (dataset.confirmedType ?? dataset.inferred.type) !== "ignored");
  return { workspace, datasets, financeDatasets: datasets.filter(dataset => ["finance_actual", "budget", "forecast"].includes(dataset.confirmedType ?? dataset.inferred.type)), mappingRules };
}
