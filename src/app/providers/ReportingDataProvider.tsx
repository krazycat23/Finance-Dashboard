import { createContext, useContext, useMemo, type ReactNode } from "react";
import { setReportingDataset, type ReportingDataAdapter, type ReportingDataset } from "@/domain/data";

const ReportingDataContext = createContext<ReportingDataset | null>(null);

/** Loads one canonical dataset for the application and exposes it to UI state. */
export function ReportingDataProvider({ adapter, children }: { adapter: ReportingDataAdapter; children: ReactNode }) {
  const dataset = useMemo(() => adapter.load(), [adapter]);
  setReportingDataset(dataset);
  return <ReportingDataContext.Provider value={dataset}>{children}</ReportingDataContext.Provider>;
}

export function useReportingDataset(): ReportingDataset {
  const dataset = useContext(ReportingDataContext);
  if (!dataset) throw new Error("useReportingDataset must be used inside ReportingDataProvider");
  return dataset;
}
