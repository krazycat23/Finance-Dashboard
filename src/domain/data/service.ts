import type { ReportingDataset } from "./reportingDataset";

let activeDataset: ReportingDataset | undefined;
let datasetRevision = 0;

export function setReportingDataset(dataset: ReportingDataset): void {
  if (activeDataset !== dataset) datasetRevision += 1;
  activeDataset = dataset;
}

export function getReportingDatasetRevision(): number { return datasetRevision; }

export function getReportingDataset(): ReportingDataset {
  if (!activeDataset) throw new Error("Reporting data has not been initialised.");
  return activeDataset;
}
