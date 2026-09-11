import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { setReportingDataset, type ReportingDataAdapter, type ReportingDataset } from "@/domain/data";

interface ReportingDataContextValue { dataset: ReportingDataset; activateDataset: (dataset: ReportingDataset) => void; activateDefaultDataset: () => void; }
const ReportingDataContext = createContext<ReportingDataContextValue | null>(null);

/** Loads one canonical dataset for the application and exposes it to UI state. */
export function ReportingDataProvider({ adapter, children }: { adapter: ReportingDataAdapter; children: ReactNode }) {
  const [dataset, activateDataset] = useState<ReportingDataset>(() => adapter.load());
  // Selectors are synchronous pure functions used during render. Activating the
  // immutable dataset here makes their service view match this context; the
  // keyed subtree below remounts all reporting state when it changes.
  setReportingDataset(dataset);
  const activateDefaultDataset = () => activateDataset(adapter.load());
  const value = useMemo(() => ({ dataset, activateDataset, activateDefaultDataset }), [dataset, adapter]);
  return <ReportingDataContext.Provider value={value}><div key={dataset.id}>{children}</div></ReportingDataContext.Provider>;
}

export function useReportingDataset(): ReportingDataset {
  const dataset = useContext(ReportingDataContext);
  if (!dataset) throw new Error("useReportingDataset must be used inside ReportingDataProvider");
  return dataset.dataset;
}

export function useReportingDataController(): ReportingDataContextValue {
  const context = useContext(ReportingDataContext);
  if (!context) throw new Error("useReportingDataController must be used inside ReportingDataProvider");
  return context;
}
