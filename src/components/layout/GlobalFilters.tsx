import { useMemo } from "react";
import { useFilters } from "@/app/providers/FilterProvider";
import type { PeriodBasis } from "@/domain/models";
import { Select } from "@/components/ui/Select";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";

/**
 * GLOBAL FILTERS
 * ---------------------------------------------------------------------------
 * Entity, basis and period, applied across every page.
 *
 * Set as chips on the control bar so the four global filters read as one line
 * of reporting context. Each still carries its label inline: an unlabelled
 * dropdown reading "Group" is a noun, not a filter.
 */

const BASIS_OPTIONS: { value: PeriodBasis; label: string }[] = [
  { value: "MTD", label: "Month to date" },
  { value: "QTD", label: "Quarter to date" },
  { value: "YTD", label: "Year to date" },
  { value: "FY", label: "Full year" },
  { value: "R12", label: "Rolling 12 months" },
];

export function GlobalFilters() {
  const dataset = useReportingDataset();
  const {
    entityId, setEntityId, basis, setBasis, periodId, setPeriodId, availablePeriods,
  } = useFilters();

  const entityOptions = useMemo(
    () =>
      dataset.dimensions.entities.map((entity) => ({
        value: entity.id,
        // Indentation communicates the hierarchy without a tree widget.
        label: entity.level > 0 ? `  ${entity.name}` : entity.name,
      })),
    [],
  );

  const periodOptions = useMemo(
    () => availablePeriods.map((period) => ({ value: period.id, label: period.label })),
    [availablePeriods],
  );

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Select variant="chip" label="Entity" value={entityId} options={entityOptions} onChange={setEntityId} />
      <Select
        variant="chip"
        label="Basis"
        value={basis}
        options={BASIS_OPTIONS}
        onChange={(value) => setBasis(value as PeriodBasis)}
      />
      <Select variant="chip" label="Period" value={periodId} options={periodOptions} onChange={setPeriodId} />
    </div>
  );
}
