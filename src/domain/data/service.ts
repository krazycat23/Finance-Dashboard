import type { ReportingDataset } from "./reportingDataset";

let activeDataset: ReportingDataset | undefined;

export function setReportingDataset(dataset: ReportingDataset): void {
  activeDataset = dataset;
}

export function getReportingDataset(): ReportingDataset {
  if (!activeDataset) throw new Error("Reporting data has not been initialised.");
  return activeDataset;
}
