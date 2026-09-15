import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setReportingDataset, type ReportingDataAdapter, type ReportingDataset } from "@/domain/data";
import { ReportingRuntime, type ReportingRuntimeState } from "@/domain/data/runtime";
import { IndexedDbImportWorkspaceStore, type ImportWorkspaceStore } from "@/domain/ingestion/storage";
import type { ImportWorkspace } from "@/domain/ingestion/types";
import { resolveCompanyAdapter } from "@/adapters";

interface ReportingDataContextValue extends ReportingRuntimeState {
  store: ImportWorkspaceStore;
  companies: ImportWorkspace[];
  refreshCompanies: () => Promise<void>;
  activateWorkspace: (workspace: ImportWorkspace) => Promise<void>;
  switchCompany: (id: string) => Promise<void>;
  activateDefaultDataset: () => Promise<void>;
}

const ReportingDataContext = createContext<ReportingDataContextValue | null>(null);
type AdapterSelection = ReportingDataAdapter | string;

export function ReportingDataProvider({ adapter, children, store }: { adapter?: AdapterSelection; children: ReactNode; store?: ImportWorkspaceStore }) {
  const [resolvedAdapter] = useState(() => typeof adapter === "string" ? resolveCompanyAdapter(adapter) : adapter ?? resolveCompanyAdapter());
  const [runtime] = useState(() => new ReportingRuntime(store ?? new IndexedDbImportWorkspaceStore(), resolvedAdapter));
  const [state, setState] = useState<ReportingRuntimeState>();
  const [companies, setCompanies] = useState<ImportWorkspace[]>([]);
  const [error, setError] = useState<string>();
  const refreshCompanies = async () => setCompanies(await runtime.store.list());

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const restored = await runtime.restore();
        const saved = await runtime.store.list();
        if (mounted) {
          setState(restored);
          setCompanies(saved);
        }
      } catch (cause) {
        if (mounted) setError(String(cause));
      }
    })();
    return () => { mounted = false; };
  }, [runtime]);

  const switchCompany = async (id: string) => {
    const next = await runtime.switchCompany(id);
    setState(next);
    setError(undefined);
  };

  if (!state) return <div className="p-8 text-sm" role="status">{error ? <>Saved company could not be restored: {error}<button className="ml-3 underline" onClick={() => void switchCompany("demo").catch(cause => setError(String(cause)))}>Open demo explicitly</button></> : "Restoring reporting workspace…"}</div>;

  setReportingDataset(state.dataset);
  const value: ReportingDataContextValue = {
    ...state,
    store: runtime.store,
    companies,
    refreshCompanies,
    switchCompany,
    activateDefaultDataset: () => switchCompany("demo"),
    activateWorkspace: async workspace => {
      const next = await runtime.activate(workspace);
      await refreshCompanies();
      setState(next);
    },
  };

  return <ReportingDataContext.Provider value={value}><div key={state.revision}>{children}</div></ReportingDataContext.Provider>;
}

export function useReportingDataController(): ReportingDataContextValue {
  const context = useContext(ReportingDataContext);
  if (!context) throw new Error("Reporting data hooks require ReportingDataProvider");
  return context;
}

export function useReportingDataset(): ReportingDataset {
  return useReportingDataController().dataset;
}
