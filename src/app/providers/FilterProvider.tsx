import {
  createContext, useContext, useMemo, useState, type ReactNode,
} from "react";
import type { Period, PeriodBasis, PeriodSelection } from "@/domain/models";
import { useReportingDataset } from "./ReportingDataProvider";

interface FilterContextValue extends PeriodSelection {
  setEntityId: (entityId: string) => void;
  setBasis: (basis: PeriodBasis) => void;
  setPeriodId: (periodId: string) => void;
  /** The selection object, stable across renders with the same values. */
  selection: PeriodSelection;
  /** Periods a user may report on: closed periods only. */
  availablePeriods: Period[];
  currentPeriod: Period;
}

const FilterContext = createContext<FilterContextValue | null>(null);

/**
 * Global filters are application state, not page state: an executive changes
 * entity once and expects every page to follow. Holding them here also means a
 * page cannot quietly report a different period from its neighbours.
 */
export function FilterProvider({ children }: { children: ReactNode }) {
  const dataset = useReportingDataset();
  const [entityId, setEntityId] = useState(dataset.defaultEntityId);
  const [basis, setBasis] = useState<PeriodBasis>("YTD");
  const [periodId, setPeriodId] = useState(dataset.currentPeriodId);

  // Only closed periods are selectable. Offering an open period as a reporting
  // date invites a screen full of zeroes.
  const availablePeriods = useMemo(
    () => dataset.periods.filter((p) => p.isActual).slice().reverse(),
    [],
  );

  const currentPeriod = useMemo(
    () => dataset.periods.find((p) => p.id === periodId) ?? availablePeriods[0],
    [periodId, availablePeriods],
  );

  const selection = useMemo<PeriodSelection>(
    () => ({ entityId, basis, periodId }),
    [entityId, basis, periodId],
  );

  const value = useMemo<FilterContextValue>(
    () => ({
      entityId, basis, periodId, selection, availablePeriods, currentPeriod,
      setEntityId: (id: string) => setEntityId(id),
      setBasis: (b: PeriodBasis) => setBasis(b),
      setPeriodId: (id: string) => setPeriodId(id),
    }),
    [entityId, basis, periodId, selection, availablePeriods, currentPeriod],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) throw new Error("useFilters must be used inside FilterProvider");
  return context;
}

/** Convenience hook for the common case: just the selection. */
export function useSelection(): PeriodSelection {
  return useFilters().selection;
}
